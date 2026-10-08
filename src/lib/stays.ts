import type { HotelStay, Place, Trip } from '../types';
import { uid } from './utils';

/**
 * Hotels per night. A day's route starts where you slept the night before and
 * ends where you sleep that night — so on a moving day (Shinjuku → Kyoto) the
 * route runs from one hotel to the other.
 */

/** The trip's stays, clamped to its length. Falls back to the old single `base` for every night. */
export function stayBlocks(trip: Trip, days: number): HotelStay[] {
  const raw = trip.stays ?? (trip.base ? [{ id: 'base', place: trip.base, from: 0, to: Math.max(0, days - 1) }] : []);
  return raw
    .filter((s) => s.from < days)
    .map((s) => ({ ...s, to: Math.min(s.to, days - 1) }))
    .sort((a, b) => a.from - b.from);
}

export const stayForNight = (blocks: HotelStay[], night: number): HotelStay | undefined => blocks.find((s) => s.from <= night && night <= s.to);

/** Where day `d` starts and ends. Day 1 starts at that night's hotel (you arrive and drop your bags). */
export function dayEnds(blocks: HotelStay[], d: number): { start?: Place; end?: Place; moving: boolean } {
  const end = stayForNight(blocks, d)?.place;
  const start = (d > 0 ? stayForNight(blocks, d - 1)?.place : undefined) ?? end;
  return { start, end, moving: !!start && !!end && !samePlace(start, end) };
}

export const samePlace = (a: Place, b: Place) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

/** Adds or replaces a stay. The new one wins: overlapping stays are trimmed or split around it. */
export function upsertStay(blocks: HotelStay[], next: HotelStay): HotelStay[] {
  const out: HotelStay[] = [];
  for (const b of blocks) {
    if (b.id === next.id) continue;
    if (b.to < next.from || b.from > next.to) {
      out.push(b);
      continue;
    }
    if (b.from < next.from) out.push({ ...b, to: next.from - 1 });
    if (b.to > next.to) out.push({ ...b, id: b.from < next.from ? uid() : b.id, from: next.to + 1 });
  }
  out.push(next);
  return out.sort((a, b) => a.from - b.from);
}

/** First run of nights without a hotel, or null when every night is covered. */
export function firstGap(blocks: HotelStay[], days: number): { from: number; to: number } | null {
  let from = -1;
  for (let d = 0; d < days; d++) {
    const covered = !!stayForNight(blocks, d);
    if (!covered && from < 0) from = d;
    if (covered && from >= 0) return { from, to: d - 1 };
  }
  return from >= 0 ? { from, to: days - 1 } : null;
}

/** Sensible days for a new stay: the first uncovered nights, or else the second half of the last stay. */
export function suggestNights(blocks: HotelStay[], days: number): { from: number; to: number } {
  const gap = firstGap(blocks, days);
  if (gap) return gap;
  const last = blocks[blocks.length - 1];
  if (!last || last.from === last.to) return { from: Math.max(0, days - 1), to: days - 1 };
  return { from: Math.ceil((last.from + last.to + 1) / 2), to: last.to };
}
