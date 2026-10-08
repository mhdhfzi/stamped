import type { TravelMode } from '../types';

/**
 * Free OpenStreetMap services, no API keys:
 * - Nominatim for place search (usage policy: max 1 request/s, no search-as-you-type,
 *   so we only search when the user submits).
 * - FOSSGIS OSRM (the router behind openstreetmap.org) for walking/driving routes.
 */

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Human-readable type, e.g. "hotel", "museum", "city". */
  kind: string;
  /** Raw OSM class/type, e.g. tourism / hotel, boundary / administrative. */
  category: string;
  type: string;
  /** [south, north, west, east] */
  bbox?: [number, number, number, number];
  stars?: string;
  website?: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPlace(r: any, fallbackName: string): PlaceResult {
  const parts = String(r.display_name ?? '').split(', ');
  const name = r.namedetails?.['name:en'] || r.name || parts[0] || fallbackName;
  const bb = Array.isArray(r.boundingbox) ? r.boundingbox.map(Number) : null;
  return {
    id: String(r.place_id),
    name,
    address: parts.filter((p) => p !== name && p !== r.name).slice(0, 4).join(', '),
    lat: Number(r.lat),
    lng: Number(r.lon),
    // OSM uses "yes" for untyped features (e.g. building=yes); fall back to the category.
    // Boundaries/places are clearer by their address type ("city", "suburb") than "administrative".
    kind: String(r.type === 'yes' ? r.category ?? '' : ['boundary', 'place'].includes(r.category) && r.addresstype ? r.addresstype : r.type ?? '').replace(/_/g, ' '),
    category: String(r.category ?? ''),
    type: String(r.type ?? ''),
    bbox: bb && bb.length === 4 && bb.every(Number.isFinite) ? (bb as [number, number, number, number]) : undefined,
    stars: r.extratags?.stars || undefined,
    website: r.extratags?.website || r.extratags?.['contact:website'] || undefined,
  };
}

/** `near`: places already in the plan; results around them are ranked first (not a hard filter). */
export async function searchPlaces(query: string, countryCode?: string, near: LatLng[] = [], signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ format: 'jsonv2', q: query, limit: '10', 'accept-language': 'en' });
  if (countryCode) params.set('countrycodes', countryCode.toLowerCase());
  if (near.length) {
    const pad = 0.15; // ~15 km
    const lats = near.map((p) => p.lat);
    const lngs = near.map((p) => p.lng);
    params.set('viewbox', [Math.min(...lngs) - pad, Math.max(...lats) + pad, Math.max(...lngs) + pad, Math.min(...lats) - pad].map((n) => n.toFixed(4)).join(','));
  }
  const res = await fetch(`${NOMINATIM}?${params}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await res.json();
  return rows.map((r) => toPlace(r, query));
}

export type StayType = 'hotel' | 'hostel' | 'guest_house' | 'apartment' | 'motel';
const STAY_TYPES = new Set<string>(['hotel', 'hostel', 'guest_house', 'apartment', 'motel', 'chalet']);

/** A search result that is itself somewhere to sleep (vs an area or landmark). */
export const isStay = (r: Pick<PlaceResult, 'category' | 'type'>) => r.category === 'tourism' && STAY_TYPES.has(r.type);

export interface Stay extends PlaceResult {
  /** Metres from the searched centre. */
  distance: number;
}

/**
 * Places to stay around a point, from OpenStreetMap via Nominatim's category search.
 * Runs one query per kind, 1.1 s apart (Nominatim allows 1 request/second),
 * and reports each batch as it arrives so the list fills in progressively.
 */
export async function searchStays(center: LatLng, radius: number, onBatch: (all: Stay[]) => void, signal?: AbortSignal): Promise<Stay[]> {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const viewbox = [center.lng - dLng, center.lat + dLat, center.lng + dLng, center.lat - dLat].map((n) => n.toFixed(5)).join(',');
  const byId = new Map<string, Stay>();
  const queries = ['hotel', 'hostel', 'guest house'];
  for (const [i, q] of queries.entries()) {
    if (i) await sleep(1100, signal);
    const params = new URLSearchParams({ format: 'jsonv2', q, limit: '40', bounded: '1', viewbox, extratags: '1', namedetails: '1', 'accept-language': 'en' });
    const res = await fetch(`${NOMINATIM}?${params}`, { signal });
    if (!res.ok) {
      if (i === 0) throw new Error(`Search failed (${res.status})`);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await res.json();
    for (const r of rows) {
      const p = toPlace(r, q);
      if (!isStay(p) || !r.name) continue;
      byId.set(p.id, { ...p, distance: haversine(center, p) });
    }
    onBatch(dedupeStays(byId));
  }
  return dedupeStays(byId);
}

/** OSM sometimes maps one hotel twice (a point and a building outline): same name within 150 m → keep one. */
function dedupeStays(byId: Map<string, Stay>): Stay[] {
  const out: Stay[] = [];
  for (const s of [...byId.values()].sort((a, b) => a.distance - b.distance)) {
    const key = s.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!out.some((o) => o.name.toLowerCase().replace(/\s+/g, ' ').trim() === key && haversine(o, s) < 150)) out.push(s);
  }
  return out;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/** Search radius for an area result: about half its size, kept between 800 m and 3 km. */
export function areaRadius(r: Pick<PlaceResult, 'bbox' | 'lat' | 'lng'>): number {
  if (!r.bbox) return 1500;
  const [s, n, w, e] = r.bbox;
  const half = Math.min(haversine({ lat: s, lng: r.lng }, { lat: n, lng: r.lng }), haversine({ lat: r.lat, lng: w }, { lat: r.lat, lng: e })) / 2;
  return Math.min(3000, Math.max(800, half));
}

/** Search links for listings that aren't in open data (Airbnb etc.), pre-filled with the area and dates. */
export function stayLinks(area: string, checkin?: string, checkout?: string) {
  const q = encodeURIComponent(area);
  const dates = (a: string, b: string) => (checkin && checkout ? `&${a}=${checkin}&${b}=${checkout}` : '');
  return [
    { label: 'Airbnb', url: `https://www.airbnb.com/s/${q}/homes?query=${q}${dates('checkin', 'checkout')}` },
    { label: 'Booking.com', url: `https://www.booking.com/searchresults.html?ss=${q}${dates('checkin', 'checkout')}` },
    { label: 'Google Hotels', url: `https://www.google.com/travel/search?q=${encodeURIComponent(`hotels in ${area}`)}` },
  ];
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Route {
  /** [lat, lng] pairs for drawing. */
  line: [number, number][];
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** One entry per hop between consecutive stops. */
  legs: { distance: number; duration: number }[];
  /** True when routing failed and we fell back to straight lines. */
  approximate: boolean;
}

const routeCache = new Map<string, Route>();

export async function getRoute(points: LatLng[], mode: TravelMode, signal?: AbortSignal): Promise<Route | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const key = `${mode}|${coords}`;
  const hit = routeCache.get(key);
  if (hit) return hit;

  const profile = mode === 'car' ? 'routed-car' : 'routed-foot';
  try {
    const res = await fetch(`https://routing.openstreetmap.de/${profile}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    const r = json?.routes?.[0];
    if (json?.code !== 'Ok' || !r) throw new Error('No route');
    const route: Route = {
      line: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
      distance: r.distance,
      duration: r.duration,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      legs: r.legs.map((l: any) => ({ distance: l.distance, duration: l.duration })),
      approximate: false,
    };
    routeCache.set(key, route);
    return route;
  } catch (e) {
    if (signal?.aborted) throw e;
    return straightRoute(points, mode);
  }
}

/** Offline / failure fallback: straight lines with a rough time estimate. */
function straightRoute(points: LatLng[], mode: TravelMode): Route {
  const speed = mode === 'car' ? 30 / 3.6 : 4.5 / 3.6; // m/s, city averages
  const legs = points.slice(1).map((p, i) => {
    const distance = haversine(points[i], p) * (mode === 'car' ? 1.4 : 1.3); // streets aren't straight
    return { distance, duration: distance / speed };
  });
  return {
    line: points.map((p) => [p.lat, p.lng]),
    distance: legs.reduce((a, l) => a + l.distance, 0),
    duration: legs.reduce((a, l) => a + l.duration, 0),
    legs,
    approximate: true,
  };
}

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtDistance(m: number): string {
  return m < 995 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`;
}

export function fmtDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Google Maps allows an origin, a destination and up to 9 stops in between. */
export const GOOGLE_MAPS_MAX_POINTS = 11;

/** A Google Maps directions link (opens the app on phones). Uses coordinates so the pins are exact. */
export function googleMapsUrl(points: LatLng[], mode: TravelMode): string {
  const p = points.slice(0, GOOGLE_MAPS_MAX_POINTS).map((x) => `${x.lat.toFixed(6)},${x.lng.toFixed(6)}`);
  const params = new URLSearchParams({ api: '1', travelmode: mode === 'car' ? 'driving' : mode === 'transit' ? 'transit' : 'walking' });
  if (p.length === 1) {
    params.set('destination', p[0]);
  } else {
    params.set('origin', p[0]);
    params.set('destination', p[p.length - 1]);
    if (p.length > 2) params.set('waypoints', p.slice(1, -1).join('|'));
  }
  return `https://www.google.com/maps/dir/?${params}`;
}
