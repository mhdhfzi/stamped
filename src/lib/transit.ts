import { getRepo } from './db';
import type { LatLng } from './geo';

/**
 * Public transport (subway, train, bus, tram…) directions through our server (api/route.js),
 * which asks the Google Routes API. Plan legs are cached on the phone for a week.
 */

export interface TransitStep {
  mode: 'walk' | 'transit';
  /** Seconds. */
  duration: number;
  /** Metres. */
  distance: number;
  instruction?: string;
  /** SUBWAY, HEAVY_RAIL, COMMUTER_TRAIN, HIGH_SPEED_TRAIN, BUS, TRAM, LIGHT_RAIL, MONORAIL, FERRY, CABLE_CAR… */
  vehicle?: string;
  vehicleName?: string;
  /** Line name, e.g. "Ginza Line"; `short` e.g. "G". */
  line?: string;
  short?: string;
  /** Line colours (#rrggbb) and icon. */
  color?: string;
  textColor?: string;
  icon?: string;
  agency?: string;
  /** Direction shown on the train, e.g. "for Asakusa". */
  headsign?: string;
  from?: string;
  to?: string;
  /** Local clock times ("10:42") and exact times (ISO). */
  departTime?: string;
  arriveTime?: string;
  departAt?: string;
  arriveAt?: string;
  stops?: number;
  /** Seconds between trains. */
  headway?: number;
}

export interface TransitRoute {
  duration: number;
  distance: number;
  departTime?: string;
  arriveTime?: string;
  fare?: string;
  polyline?: string;
  steps: TransitStep[];
}

export class TransitError extends Error {
  constructor(public reason: 'not-setup' | 'offline' | 'failed' | 'none' | 'japan') {
    super(reason);
  }
}

/**
 * Japan's train and bus timetables are licensed to Google Maps only — Google's API returns no
 * transit routes there. Rough outline of Japan (main islands + Okinawa; leaves out Korea).
 */
export function inJapan(p: LatLng) {
  return (p.lat >= 30 && p.lat <= 46 && p.lng >= 129.5 && p.lng <= 149) || (p.lat >= 24 && p.lat < 30 && p.lng >= 122.9 && p.lng <= 131.5);
}

/** Asks the server. Throws TransitError. */
export async function transitRoutes(origin: LatLng, destination: LatLng, opts: { alternatives?: boolean; departureTime?: string; signal?: AbortSignal } = {}): Promise<TransitRoute[]> {
  if (inJapan(origin) && inJapan(destination)) throw new TransitError('japan');
  if (!navigator.onLine) throw new TransitError('offline');
  let res: Response;
  try {
    res = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: { lat: origin.lat, lng: origin.lng }, destination: { lat: destination.lat, lng: destination.lng }, alternatives: opts.alternatives, departureTime: opts.departureTime }),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new TransitError('offline');
  }
  const json = await res.json().catch(() => null);
  if (res.status === 503 || res.status === 404) throw new TransitError('not-setup');
  if (!res.ok || !json) throw new TransitError('failed');
  const routes = (json.routes ?? []) as TransitRoute[];
  if (!routes.length) throw new TransitError('none');
  return routes;
}

const WEEK = 7 * 24 * 3600 * 1000;
const memo = new Map<string, TransitRoute | null>();
const legKey = (a: LatLng, b: LatLng) => `transit1:${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

/**
 * The best transit route for one hop of a day plan (lines, stops, duration — no clock times,
 * since the trip may be another day). Cached on the phone for a week; null when there's none.
 */
export async function transitLeg(a: LatLng, b: LatLng, signal?: AbortSignal): Promise<TransitRoute | null> {
  const key = legKey(a, b);
  if (memo.has(key)) return memo.get(key)!;
  const repo = await getRepo(null);
  const cached = (await repo.getMeta(key)) as { at: number; route: TransitRoute | null } | undefined;
  if (cached && Date.now() - cached.at < WEEK) {
    memo.set(key, cached.route);
    return cached.route;
  }
  let route: TransitRoute | null;
  try {
    route = (await transitRoutes(a, b, { signal }))[0];
  } catch (e) {
    if (e instanceof TransitError && e.reason === 'none') route = null;
    else throw e;
  }
  memo.set(key, route);
  // Strip clock times before keeping it (they'd be wrong another day).
  const keep = route && { ...route, departTime: undefined, arriveTime: undefined, steps: route.steps.map((s) => ({ ...s, departTime: undefined, arriveTime: undefined, departAt: undefined, arriveAt: undefined })) };
  await repo.setMeta(key, { at: Date.now(), route: keep });
  return route;
}

/** Google's encoded polyline → [lat, lng] pairs. */
export function decodePolyline(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < s.length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = s.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < s.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

/** Emoji for a vehicle type. */
export function vehicleEmoji(v?: string) {
  switch (v) {
    case 'SUBWAY':
    case 'METRO_RAIL':
      return '🚇';
    case 'BUS':
    case 'INTERCITY_BUS':
    case 'TROLLEYBUS':
    case 'SHARE_TAXI':
      return '🚌';
    case 'TRAM':
    case 'LIGHT_RAIL':
      return '🚊';
    case 'MONORAIL':
      return '🚝';
    case 'HIGH_SPEED_TRAIN':
      return '🚄';
    case 'FERRY':
      return '⛴️';
    case 'CABLE_CAR':
    case 'GONDOLA_LIFT':
    case 'FUNICULAR':
      return '🚡';
    default:
      return '🚆';
  }
}

/** Plain-language reason transit isn't shown. */
export function transitErrorText(e: unknown): string {
  const r = e instanceof TransitError ? e.reason : 'failed';
  if (r === 'not-setup') return 'Transit directions aren’t set up yet (Google Routes key missing).';
  if (r === 'offline') return 'You’re offline — transit times need a connection.';
  if (r === 'none') return 'No public transport found for this trip.';
  if (r === 'japan') return 'Google only shows Japan’s train & bus times inside the Google Maps app.';
  return 'Couldn’t get transit directions right now.';
}
