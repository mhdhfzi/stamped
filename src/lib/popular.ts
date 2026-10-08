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
  // + tourist destination, fort, fortification, bridge, street, historic district
  landmarks: ['Q570116', 'Q2319498', 'Q4989906', 'Q1440300', 'Q12518', 'Q1440476', 'Q6017969', 'Q174782', 'Q16560', 'Q23413', 'Q92026', 'Q1081138', 'Q839954', 'Q1208212', 'Q1200957', 'Q1785071', 'Q57821', 'Q12280', 'Q79007', 'Q15243209'],
  // neighbourhood (Gion, Arashiyama, Shibuya…)
  areas: ['Q123705'],
  // Shinto shrine, Buddhist temple, cathedral, church building, mosque, temple, Hindu temple, monastery, abbey
  religious: ['Q845945', 'Q5393308', 'Q2977', 'Q16970', 'Q32815', 'Q44539', 'Q842402', 'Q44613', 'Q160742'],
  // museum, art museum, theatre
  museums: ['Q33506', 'Q207694', 'Q24354'],
  // park, urban park, garden, Japanese garden, botanical garden, beach, waterfall, bamboo grove, mountain,
  // + national park, nature reserve, island, lake, volcano, cave
  nature: ['Q22698', 'Q22746', 'Q1107656', 'Q1195942', 'Q167346', 'Q40080', 'Q34038', 'Q11599236', 'Q8502', 'Q46169', 'Q179049', 'Q23442', 'Q23397', 'Q8072', 'Q35509'],
  // zoo, aquarium, amusement park, theme park
  fun: ['Q43501', 'Q2281788', 'Q194195', 'Q2416723'],
  // market, shopping centre, food market, shopping arcade (Japan), fish market
  shopping: ['Q37654', 'Q11315', 'Q28142754', 'Q96288605', 'Q1188480'],
};

/** Common types need more fame to count: every city has neighbourhoods, streets, bridges, hills and lakes. */
const MIN_LINKS: Record<string, number> = { Q123705: 20, Q8502: 20, Q79007: 15, Q12280: 15, Q23442: 10, Q23397: 10, Q179049: 10, Q57821: 10 };

/**
 * Searches go wider and less strict until there's enough: big cities fill the first step;
 * small towns, islands and less-covered countries reach the later ones.
 */
const STEPS = [
  { radius: 12, minLinks: 5 },
  { radius: 30, minLinks: 3 },
  { radius: 60, minLinks: 2 },
];
const ENOUGH = 15;
/** Labels: English first, then the local languages travellers meet most (so places without an English name still show). */
const LABEL_LANGS = 'en,mul,ms,id,th,vi,ja,zh,ko,tl,hi,ar,tr,fr,es,pt,it,de,nl,ru,el';

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

function query(c: LatLng, radiusKm: number, minLinks: number) {
  // Per-type minimums ease off in the same proportion as the general one.
  const values = [...CATEGORY_OF.keys()].map((id) => `(wd:${id} ${Math.max(minLinks, Math.round(((MIN_LINKS[id] ?? 5) * minLinks) / 5))})`).join(' ');
  // Narrow to well-known places first (sitelinks), then check their type — much faster than the reverse.
  return `SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?links ?type ?image WHERE {
  hint:Query hint:optimizer "None".
  SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${c.lng.toFixed(4)} ${c.lat.toFixed(4)})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "${radiusKm}". }
  ?item wikibase:sitelinks ?links.
  FILTER(?links >= ${minLinks})
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
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LABEL_LANGS}". }
} ORDER BY DESC(?links) LIMIT 120`;
}

const MAX_AGE = 30 * 24 * 3600 * 1000;
const memo = new Map<string, Attraction[]>();
const inflight = new Map<string, Promise<Attraction[]>>();

/** ~1 km grid key, so nearby centres share a cache entry. */
const keyOf = (c: LatLng) => `popular5:${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;

async function wikidata(center: LatLng, radiusKm: number, minLinks: number): Promise<Attraction[]> {
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query(center, radiusKm, minLinks))}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) throw new Error(`Popular places unavailable (${res.status})`);
  return parse(await res.json(), center);
}

/** Wikidata first (wider and less strict until there's enough), then OpenStreetMap if it's still thin. */
async function search(center: LatLng): Promise<Attraction[]> {
  const found = new Map<string, Attraction>();
  let lastError: unknown = null;
  // "Enough" counts places you'd realistically visit from here (within 25 km).
  const near = () => [...found.values()].filter((a) => a.distance <= NEAR_M).length;
  for (const step of STEPS) {
    try {
      for (const a of await wikidata(center, step.radius, step.minLinks)) if (!found.has(a.id)) found.set(a.id, a);
    } catch (e) {
      lastError = e;
    }
    if (near() >= ENOUGH) break;
  }
  if (near() < ENOUGH) {
    try {
      const have = [...found.values()];
      for (const a of await openStreetMap(center, 25)) {
        if (!have.some((h) => h.id === a.id || (haversine(h, a) < 250 && h.name.toLowerCase() === a.name.toLowerCase()))) found.set(a.id, a);
      }
    } catch (e) {
      lastError ??= e;
    }
  }
  if (!found.size && lastError) throw lastError;
  return [...found.values()].sort((a, b) => score(b) - score(a));
}

const NEAR_M = 25_000;
/** Fame, discounted with distance: a famous place 50 km away ranks below a well-known one 3 km away. */
const score = (a: Attraction) => (a.links + 1) / (1 + (a.distance / 15_000) ** 2);

export function popularNear(center: LatLng, _radiusKm = 12, signal?: AbortSignal): Promise<Attraction[]> {
  const key = keyOf(center);
  const hit = memo.get(key);
  if (hit) return Promise.resolve(hit);
  if (!inflight.has(key)) {
    inflight.set(
      key,
      (async () => {
        const repo = await getRepo(null);
        const cached = (await repo.getMeta(key)) as { at: number; items: Attraction[] } | undefined;
        if (cached && cached.items.length && Date.now() - cached.at < MAX_AGE) return cached.items;
        const items = await search(center);
        // An empty answer isn't kept — the next look tries again.
        if (items.length) await repo.setMeta(key, { at: Date.now(), items });
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

// ───────────── OpenStreetMap (second source) ─────────────

const OSM_CATEGORY: Record<string, PopularCategory> = {
  museum: 'museums',
  gallery: 'museums',
  zoo: 'fun',
  aquarium: 'fun',
  theme_park: 'fun',
  viewpoint: 'nature',
  attraction: 'landmarks',
  castle: 'landmarks',
  fort: 'landmarks',
  monument: 'landmarks',
  ruins: 'landmarks',
  archaeological_site: 'landmarks',
  memorial: 'landmarks',
};

/**
 * Tourist attractions mapped in OpenStreetMap (Overpass API, free). Covers places Wikipedia knows
 * little about. Ranked below Wikidata results; ones with a Wikipedia link come first.
 */
async function openStreetMap(center: LatLng, radiusKm: number): Promise<Attraction[]> {
  const around = `(around:${radiusKm * 1000},${center.lat.toFixed(5)},${center.lng.toFixed(5)})`;
  const q = `[out:json][timeout:25];(
  nwr${around}["tourism"~"^(attraction|museum|gallery|viewpoint|theme_park|zoo|aquarium)$"]["name"];
  nwr${around}["historic"~"^(castle|fort|monument|ruins|archaeological_site)$"]["name"]["wikidata"];
);out center tags 200;`;
  // The public server is often busy for a moment (429/504): try once more after a short pause.
  let res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
  if (!res.ok) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
  }
  if (!res.ok) throw new Error(`OpenStreetMap unavailable (${res.status})`);
  const json = await res.json();
  const out: Attraction[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of json?.elements ?? ([] as any[])) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const name = t['name:en'] || t.name;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const kind = t.tourism && t.tourism !== 'attraction' ? t.tourism : t.historic || t.tourism;
    const famous = t.wikipedia || t.wikidata ? 1 : 0;
    out.push({
      // Same id as Wikidata when OSM links to it, so the two sources don't double up.
      id: t.wikidata || `osm:${e.type}/${e.id}`,
      name,
      description: t.description,
      lat,
      lng,
      category: OSM_CATEGORY[kind] ?? 'landmarks',
      links: famous,
      distance: haversine(center, { lat, lng }),
    });
  }
  const seen = new Set<string>();
  return out
    .filter((a) => (seen.has(a.name.toLowerCase()) ? false : seen.add(a.name.toLowerCase())))
    .sort((a, b) => b.links - a.links || a.distance - b.distance)
    .slice(0, 60);
}

/** A country's capital (for trips named after a whole country): the middle of a country is rarely where the sights are. */
export async function capitalOf(countryCode: string): Promise<{ name: string; lat: number; lng: number } | null> {
  const repo = await getRepo(null);
  const key = `capital1:${countryCode}`;
  const cached = (await repo.getMeta(key)) as { name: string; lat: number; lng: number } | undefined;
  if (cached) return cached;
  const q = `SELECT ?capLabel ?lat ?lon WHERE {
  ?c wdt:P297 "${countryCode.toUpperCase().replace(/[^A-Z]/g, '')}"; wdt:P36 ?cap.
  ?cap p:P625/psv:P625 [ wikibase:geoLatitude ?lat; wikibase:geoLongitude ?lon ].
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} LIMIT 1`;
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) return null;
  const b = (await res.json())?.results?.bindings?.[0];
  if (!b) return null;
  const cap = { name: String(b.capLabel?.value ?? ''), lat: Number(b.lat?.value), lng: Number(b.lon?.value) };
  if (!cap.name || !Number.isFinite(cap.lat)) return null;
  await repo.setMeta(key, cap);
  return cap;
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
