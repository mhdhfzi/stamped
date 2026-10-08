import { getRepo } from './db';
import { haversine, type LatLng } from './geo';

/**
 * Popular places to visit around a point, from Wikidata (free, no key).
 * Popularity = how many Wikipedia language editions cover the place ("sitelinks"),
 * which tracks global fame well (Colosseum, Kinkaku-ji, Tokyo Skytree…).
 * Results are cached on the device for 30 days — the query can take 5–15 s.
 */

export type PopularCategory = 'landmarks' | 'areas' | 'religious' | 'museums' | 'nature' | 'fun' | 'shopping';

export interface Attraction {
  /** Wikidata id, e.g. "Q131013". */
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  category: PopularCategory;
  /** Number of Wikipedia editions — the popularity score. */
  links: number;
  /** Small photo (Wikimedia Commons). */
  image?: string;
  /** Metres from the searched centre. */
  distance: number;
}

/** Wikidata "instance of" classes we treat as places to visit, by category. */
const TYPES: Record<PopularCategory, string[]> = {
  // tourist attraction, landmark, monument, observation tower, tower, lattice tower, viewpoint, square, palace, castle,
  // Japanese castle, historic site, archaeological site, pedestrian scramble (plain skyscrapers excluded: office towers rank too high)
  landmarks: ['Q570116', 'Q2319498', 'Q4989906', 'Q1440300', 'Q12518', 'Q1440476', 'Q6017969', 'Q174782', 'Q16560', 'Q23413', 'Q92026', 'Q1081138', 'Q839954', 'Q1208212'],
  // neighbourhood (Gion, Arashiyama, Shibuya…)
  areas: ['Q123705'],
  // Shinto shrine, Buddhist temple, cathedral, church building, mosque, temple, Hindu temple
  religious: ['Q845945', 'Q5393308', 'Q2977', 'Q16970', 'Q32815', 'Q44539', 'Q842402'],
  // museum, art museum, theatre
  museums: ['Q33506', 'Q207694', 'Q24354'],
  // park, urban park, garden, Japanese garden, botanical garden, beach, waterfall, bamboo grove, mountain
  nature: ['Q22698', 'Q22746', 'Q1107656', 'Q1195942', 'Q167346', 'Q40080', 'Q34038', 'Q11599236', 'Q8502'],
  // zoo, aquarium, amusement park, theme park
  fun: ['Q43501', 'Q2281788', 'Q194195', 'Q2416723'],
  // market, shopping centre, food market, shopping arcade (Japan), fish market
  shopping: ['Q37654', 'Q11315', 'Q28142754', 'Q96288605', 'Q1188480'],
};

/** Common types need more fame to count: every city has neighbourhoods, offices and hills. */
const MIN_LINKS: Record<string, number> = { Q123705: 20, Q8502: 20 };

export const POPULAR_CATEGORIES: { id: PopularCategory; label: string }[] = [
  { id: 'landmarks', label: 'Landmarks' },
  { id: 'areas', label: 'Areas to explore' },
  { id: 'religious', label: 'Temples & shrines' },
  { id: 'museums', label: 'Museums & arts' },
  { id: 'nature', label: 'Nature & parks' },
  { id: 'fun', label: 'Family fun' },
  { id: 'shopping', label: 'Shopping' },
];

const CATEGORY_OF = new Map(Object.entries(TYPES).flatMap(([cat, ids]) => ids.map((id) => [id, cat as PopularCategory])));

function query(c: LatLng, radiusKm: number) {
  const values = [...CATEGORY_OF.keys()].map((id) => `(wd:${id} ${MIN_LINKS[id] ?? 5})`).join(' ');
  // Narrow to well-known places first (sitelinks), then check their type — much faster than the reverse.
  return `SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?links ?type ?image WHERE {
  hint:Query hint:optimizer "None".
  SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${c.lng.toFixed(4)} ${c.lat.toFixed(4)})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "${radiusKm}". }
  ?item wikibase:sitelinks ?links.
  FILTER(?links >= 5)
  ?item wdt:P31 ?type.
  VALUES (?type ?min) { ${values} }
  FILTER(?links >= ?min)
  # Gone: dissolved/demolished, or typed as a destroyed structure.
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q19860854 }
  # Places with a population are wards/towns, not sights.
  FILTER NOT EXISTS { ?item wdt:P1082 [] }
  BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lon)
  OPTIONAL { ?item wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} ORDER BY DESC(?links) LIMIT 120`;
}

const MAX_AGE = 30 * 24 * 3600 * 1000;
const memo = new Map<string, Attraction[]>();
const inflight = new Map<string, Promise<Attraction[]>>();

/** ~1 km grid key, so nearby centres share a cache entry. */
const keyOf = (c: LatLng, r: number) => `popular4:${c.lat.toFixed(2)},${c.lng.toFixed(2)},${r}`;

export function popularNear(center: LatLng, radiusKm = 12, signal?: AbortSignal): Promise<Attraction[]> {
  const key = keyOf(center, radiusKm);
  const hit = memo.get(key);
  if (hit) return Promise.resolve(hit);
  if (!inflight.has(key)) {
    inflight.set(
      key,
      (async () => {
        const repo = await getRepo(null);
        const cached = (await repo.getMeta(key)) as { at: number; items: Attraction[] } | undefined;
        if (cached && Date.now() - cached.at < MAX_AGE) return cached.items;
        const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query(center, radiusKm))}`, {
          headers: { Accept: 'application/sparql-results+json' },
        });
        if (!res.ok) throw new Error(`Popular places unavailable (${res.status})`);
        const items = parse(await res.json(), center);
        await repo.setMeta(key, { at: Date.now(), items });
        return items;
      })()
        .then((items) => {
          memo.set(key, items);
          return items;
        })
        .finally(() => inflight.delete(key)),
    );
  }
  const p = inflight.get(key)!;
  // Aborting only stops waiting; the shared request still fills the cache.
  return signal ? Promise.race([p, new Promise<never>((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))))]) : p;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(json: any, center: LatLng): Attraction[] {
  const byId = new Map<string, Attraction>();
  for (const b of json?.results?.bindings ?? []) {
    const id = String(b.item?.value ?? '').split('/').pop()!;
    const type = String(b.type?.value ?? '').split('/').pop()!;
    const name = b.itemLabel?.value;
    // Unlabelled items come back as their Q-id.
    if (!id || byId.has(id) || !name || /^Q\d+$/.test(name)) continue;
    const lat = Number(b.lat?.value);
    const lng = Number(b.lon?.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    byId.set(id, {
      id,
      name,
      description: b.itemDescription?.value,
      lat,
      lng,
      category: CATEGORY_OF.get(type) ?? 'landmarks',
      links: Number(b.links?.value) || 0,
      image: b.image?.value ? `${String(b.image.value).replace(/^http:/, 'https:')}?width=320` : undefined,
      distance: haversine(center, { lat, lng }),
    });
  }
  return [...byId.values()].sort((a, b) => b.links - a.links);
}
