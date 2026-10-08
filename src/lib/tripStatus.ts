import type { Photo, Stop, Trip } from '../types';
import { haversine } from './geo';
import { dayCount, fromDateInput, toDateInput } from './utils';

/** A trip counts towards stamps/stats unless it's planned and has no moments yet. */
export const isVisited = (trip: Trip, momentCount: number) => !trip.planned || momentCount > 0;

export type Upcoming = { kind: 'soon'; days: number } | { kind: 'now'; day: number } | { kind: 'undated' } | { kind: 'past' };

/** Status of a planned trip without moments, for the card badge and sorting. */
export function upcomingStatus(trip: Trip, now = Date.now()): Upcoming {
  if (!trip.startDate || !trip.endDate) return { kind: 'undated' };
  const today = fromDateInput(toDateInput(now));
  const start = fromDateInput(trip.startDate);
  if (today < start) return { kind: 'soon', days: Math.round((start - today) / 86_400_000) };
  if (today <= fromDateInput(trip.endDate)) return { kind: 'now', day: Math.round((today - start) / 86_400_000) + 1 };
  return { kind: 'past' };
}

export function upcomingLabel(u: Upcoming): string {
  switch (u.kind) {
    case 'soon':
      return u.days === 0 ? 'Today' : u.days === 1 ? 'Tomorrow' : u.days < 60 ? `In ${u.days} days` : `In ${Math.round(u.days / 30)} months`;
    case 'now':
      return `Happening now · Day ${u.day}`;
    case 'undated':
      return 'Planning';
    case 'past':
      return 'Planned';
  }
}

/** 0-based plan day a photo was taken on, or null if outside the trip dates. */
export function photoDay(trip: Trip, photo: Pick<Photo, 'takenAt'>): number | null {
  if (!trip.startDate || !trip.endDate) return null;
  const d = Math.round((fromDateInput(toDateInput(photo.takenAt)) - fromDateInput(trip.startDate)) / 86_400_000);
  return d >= 0 && d < dayCount(trip.startDate, trip.endDate) ? d : null;
}

/** Within this distance a geotagged photo is considered taken at a planned place. */
const NEAR_STOP_M = 300;

/** The planned place (on the photo's day) nearest to where a geotagged photo was taken. */
export function stopForPhoto(trip: Trip, photo: Photo, stops: Stop[]): Stop | undefined {
  if (photo.lat == null || photo.lng == null) return undefined;
  const day = photoDay(trip, photo);
  if (day == null) return undefined;
  let best: Stop | undefined;
  let bestD = NEAR_STOP_M;
  for (const s of stops) {
    if (s.day !== day) continue;
    const d = haversine({ lat: photo.lat, lng: photo.lng }, s);
    if (d <= bestD) [bestD, best] = [d, s];
  }
  return best;
}
