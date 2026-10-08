import type { TravelMode } from '../types';
import { haversine, type LatLng } from './geo';

/**
 * Route optimisation for the planner. Everything here runs on the device;
 * only the travel-time matrix comes from the network (with an offline fallback).
 */

/** Travel cost (seconds) between every pair of points: m[i][j]. */
export type Matrix = number[][];

const MAX_TABLE = 90; // keep well under the public server's coordinate limit

export async function travelMatrix(points: LatLng[], mode: TravelMode, signal?: AbortSignal): Promise<{ m: Matrix; approximate: boolean }> {
  if (points.length <= MAX_TABLE) {
    try {
      const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
      const profile = mode === 'car' ? 'routed-car' : 'routed-foot';
      const res = await fetch(`https://routing.openstreetmap.de/${profile}/table/v1/driving/${coords}?annotations=duration`, { signal });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = await res.json();
      const d: (number | null)[][] | undefined = json?.durations;
      if (json?.code === 'Ok' && d?.length === points.length) {
        // Unreachable pairs come back as null — treat them as a straight-line estimate.
        const est = straightMatrix(points, mode);
        return { m: d.map((row, i) => row.map((v, j) => (v == null ? est[i][j] : v))), approximate: false };
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return { m: straightMatrix(points, mode), approximate: true };
}

function straightMatrix(points: LatLng[], mode: TravelMode): Matrix {
  const speed = mode === 'car' ? 30 / 3.6 : 4.5 / 3.6;
  const detour = mode === 'car' ? 1.4 : 1.3;
  return points.map((a) => points.map((b) => (haversine(a, b) * detour) / speed));
}

/**
 * Fixed endpoints of a path, as indices into the matrix (not among the nodes being ordered):
 * e.g. start = hotel or the last place already visited, end = hotel.
 * Missing endpoints are free.
 */
export interface Ends {
  start?: number;
  end?: number;
}

/**
 * Best visiting order for `nodes` (indices into `m`).
 * Exact for up to 12 places (Held–Karp), heuristic (nearest neighbour + 2-opt) above.
 */
export function bestOrder(nodes: number[], m: Matrix, ends: Ends = {}): number[] {
  if (nodes.length <= 1) return [...nodes];
  return nodes.length <= 12 ? heldKarp(nodes, m, ends) : twoOpt(nearestNeighbour(nodes, m, ends), m, ends);
}

/** Total cost of visiting `order`, including travel from `start` and to `end`. */
export function pathCost(order: number[], m: Matrix, { start, end }: Ends = {}): number {
  if (!order.length) return start != null && end != null ? m[start][end] : 0;
  let c = 0;
  for (let i = 1; i < order.length; i++) c += m[order[i - 1]][order[i]];
  if (start != null) c += m[start][order[0]];
  if (end != null) c += m[order[order.length - 1]][end];
  return c;
}

function heldKarp(nodes: number[], m: Matrix, { start, end: endNode }: Ends): number[] {
  const n = nodes.length;
  const full = (1 << n) - 1;
  const dp = Array.from({ length: 1 << n }, () => new Float64Array(n).fill(Infinity));
  const parent = Array.from({ length: 1 << n }, () => new Int8Array(n).fill(-1));
  for (let j = 0; j < n; j++) dp[1 << j][j] = start == null ? 0 : m[start][nodes[j]];
  for (let mask = 1; mask <= full; mask++) {
    for (let j = 0; j < n; j++) {
      const cur = dp[mask][j];
      if (!(mask & (1 << j)) || cur === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const next = mask | (1 << k);
        const c = cur + m[nodes[j]][nodes[k]];
        if (c < dp[next][k]) {
          dp[next][k] = c;
          parent[next][k] = j;
        }
      }
    }
  }
  let end = 0;
  let best = Infinity;
  for (let j = 0; j < n; j++) {
    const c = dp[full][j] + (endNode == null ? 0 : m[nodes[j]][endNode]);
    if (c < best) {
      best = c;
      end = j;
    }
  }
  const out: number[] = [];
  let mask = full;
  let j = end;
  while (j !== -1) {
    out.push(nodes[j]);
    const p = parent[mask][j];
    mask &= ~(1 << j);
    j = p;
  }
  return out.reverse();
}

function nearestNeighbour(nodes: number[], m: Matrix, ends: Ends): number[] {
  // Without a fixed start, try every place as the first one and keep the cheapest.
  const starts = ends.start == null ? nodes : [undefined];
  let best: number[] = [];
  let bestCost = Infinity;
  for (const s of starts) {
    const left = new Set(nodes);
    const out: number[] = [];
    let cur = s ?? ends.start!;
    if (s != null) {
      out.push(s);
      left.delete(s);
    }
    while (left.size) {
      let pick = -1;
      let d = Infinity;
      for (const k of left) if (m[cur][k] < d) [d, pick] = [m[cur][k], k];
      out.push(pick);
      left.delete(pick);
      cur = pick;
    }
    const c = pathCost(out, m, ends);
    if (c < bestCost) [bestCost, best] = [c, out];
  }
  return best;
}

function twoOpt(order: number[], m: Matrix, ends: Ends): number[] {
  let best = [...order];
  let bestCost = pathCost(best, m, ends);
  for (let improved = true, rounds = 0; improved && rounds < 50; rounds++) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const c = pathCost(cand, m, ends);
        if (c + 1e-6 < bestCost) [best, bestCost, improved] = [cand, c, true];
      }
    }
  }
  return best;
}

/**
 * Splits places into `days` geographic groups: one good tour through everything,
 * cut into consecutive chunks so each day's total (travel + time spent at places)
 * is as even as possible. Returns node indices per day, each already optimised.
 */
export function splitIntoDays(nodes: number[], days: number, m: Matrix, base?: number, visitSeconds = 75 * 60, dayExtra: number[] = []): number[][] {
  const ends: Ends = { start: base, end: base };
  if (days <= 1) return [bestOrder(nodes, m, ends)];
  const tour = bestOrder(nodes, m, ends);
  const n = tour.length;

  // Cost of a day covering tour[i..j] (empty when j < i): visits + travel inside it (+ to/from the hotel).
  const cost = (i: number, j: number) => {
    if (j < i) return 0;
    let c = (j - i + 1) * visitSeconds;
    for (let t = i + 1; t <= j; t++) c += m[tour[t - 1]][tour[t]];
    if (base != null) c += m[base][tour[i]] + m[tour[j]][base];
    return c;
  };

  // best[d][i]: tour[0..i-1] split into d days (empty days allowed), minimising the
  // longest day, then the sum of squared day lengths so ties go to the most even split.
  // dayExtra: time already taken on a day (e.g. travelling to a new city).
  type Score = [number, number];
  const better = (a: Score, b: Score) => a[0] < b[0] - 1e-6 || (Math.abs(a[0] - b[0]) <= 1e-6 && a[1] < b[1] - 1e-6);
  const best: Score[][] = Array.from({ length: days + 1 }, () => Array.from({ length: n + 1 }, (): Score => [Infinity, Infinity]));
  const cut = Array.from({ length: days + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0][0] = [0, 0];
  for (let d = 1; d <= days; d++) {
    for (let i = 0; i <= n; i++) {
      for (let s = 0; s <= i; s++) {
        const prev = best[d - 1][s];
        if (prev[0] === Infinity) continue;
        const len = cost(s, i - 1) + (dayExtra[d - 1] ?? 0);
        const v: Score = [Math.max(prev[0], len), prev[1] + len * len];
        if (better(v, best[d][i])) {
          best[d][i] = v;
          cut[d][i] = s;
        }
      }
    }
  }
  const groups: number[][] = [];
  for (let d = days, i = n; d > 0; d--) {
    const s = cut[d][i];
    groups.unshift(tour.slice(s, i));
    i = s;
  }
  return groups.map((g) => bestOrder(g, m, ends));
}

/**
 * Split across days for trips with a hotel per night (multi-city).
 * `nightHotel[d]` is the matrix index of the hotel for night d (undefined = no hotel).
 * Each place goes to the days of its nearest hotel (or to hotel-less days when it's far
 * from every hotel), is split evenly within those days, then each day is ordered from
 * the previous night's hotel to that night's hotel.
 */
const MOVING_DAY_SECONDS = 3 * 3600;

export function splitByStays(nodes: number[], nightHotel: (number | undefined)[], m: Matrix, points: LatLng[], farMeters = 30_000): number[][] {
  const groups = new Map<string, { hotel?: number; days: number[]; nodes: number[] }>();
  nightHotel.forEach((h, d) => {
    const k = h == null ? 'none' : String(h);
    if (!groups.has(k)) groups.set(k, { hotel: h, days: [], nodes: [] });
    groups.get(k)!.days.push(d);
  });
  const hotelGroups = [...groups.values()].filter((g) => g.hotel != null);
  const none = groups.get('none');
  for (const n of nodes) {
    let best: (typeof hotelGroups)[number] | undefined;
    let bestCost = Infinity;
    for (const g of hotelGroups) {
      const c = m[g.hotel!][n] + m[n][g.hotel!];
      if (c < bestCost) [bestCost, best] = [c, g];
    }
    const far = !best || haversine(points[n], points[best.hotel!]) > farMeters;
    ((far && none) || best || none)!.nodes.push(n);
  }
  const out: number[][] = nightHotel.map(() => []);
  for (const g of groups.values()) {
    // Moving days (hotel changes overnight) lose ~3 h to travel, so they get fewer places.
    const extra = g.days.map((d) => (d > 0 && nightHotel[d - 1] !== nightHotel[d] ? MOVING_DAY_SECONDS : 0));
    const parts = splitIntoDays(g.nodes, g.days.length, m, g.hotel, undefined, extra);
    g.days.forEach((d, i) => (out[d] = parts[i] ?? []));
  }
  return out.map((ns, d) => bestOrder(ns, m, { start: (d > 0 ? nightHotel[d - 1] : undefined) ?? nightHotel[d], end: nightHotel[d] }));
}
