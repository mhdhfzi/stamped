import { useEffect, useRef } from 'react';
import type { Stop, Trip } from '../types';
import { setLocalChangeHook, useStore, type LocalChange } from '../store';
import { SYNCED_TRIP_KEYS, postActivity, subscribeGroup, subscribeMessages, subscribeStops, updateSharedTrip, useCloudUser, writeStops, type SharedTrip } from '../lib/cloud';
import { setLatestMessage } from '../lib/groupBadge';

const STOP_KEYS: (keyof Stop)[] = ['day', 'order', 'name', 'address', 'lat', 'lng', 'time', 'note', 'done'];
const sameStop = (a: Partial<Stop>, b: Partial<Stop>) => STOP_KEYS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Keeps shared trips in sync while signed in: friends' plan changes flow into the local
 * store, local edits flow up to the group, and new chat messages light the unread badge.
 * Renders nothing; mounted once by the app when sharing is configured.
 */
export default function CloudSync() {
  const { trips, stops, applyRemote } = useStore();
  const user = useCloudUser();
  const tripsRef = useRef(trips);
  const stopsRef = useRef(stops);
  tripsRef.current = trips;
  stopsRef.current = stops;
  /** groupId → ids of places the group already has (to spot newly added ones). */
  const remoteIds = useRef(new Map<string, Set<string>>());

  const shared = trips.filter((t) => t.groupId);
  const key = shared.map((t) => `${t.id}:${t.groupId}`).join('|');

  // Friends → me
  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    for (const { id: tripId, groupId } of shared) {
      const gid = groupId!;
      const tripNow = () => tripsRef.current.find((t) => t.id === tripId) as Trip | undefined;

      unsubs.push(
        subscribeGroup(
          gid,
          (g) => {
            const t = tripNow();
            if (!g || !t) return;
            const patch: Partial<Trip> = {};
            for (const k of SYNCED_TRIP_KEYS) if (!same(t[k], g.trip?.[k as keyof SharedTrip])) (patch as Record<string, unknown>)[k] = g.trip?.[k as keyof SharedTrip];
            if (Object.keys(patch).length) applyRemote(tripId, { trip: patch });
          },
          () => undefined, // removed from the group or offline: keep the local copy as it is
        ),
      );

      unsubs.push(
        subscribeStops(gid, (remote, fromCache) => {
          // An empty first answer from the cache means "not loaded yet", not "everything was deleted".
          if (fromCache && !remote.length) return;
          remoteIds.current.set(gid, new Set(remote.map((r) => r.id)));
          const local = stopsRef.current.filter((s) => s.tripId === tripId);
          const localById = new Map(local.map((s) => [s.id, s]));
          const upserts = remote.filter((r) => !localById.has(r.id) || !sameStop(localById.get(r.id)!, r)).map((r) => ({ ...r, tripId }) as Stop);
          const deletes = local.filter((l) => !remoteIds.current.get(gid)!.has(l.id)).map((l) => l.id);
          if (upserts.length || deletes.length) applyRemote(tripId, { upserts, deletes });
        }),
      );

      unsubs.push(
        subscribeMessages(
          gid,
          (msgs) => {
            const fromOthers = msgs.filter((m) => m.uid !== user.uid && m.createdAt);
            const last = fromOthers[fromOthers.length - 1];
            if (last) setLatestMessage(gid, last.createdAt!.getTime());
          },
          20,
        ),
      );
    }
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, key]);

  // Me → friends
  useEffect(() => {
    if (!user) return setLocalChangeHook(null);
    setLocalChangeHook((c: LocalChange) => {
      if (c.kind === 'stops') {
        const gid = tripsRef.current.find((t) => t.id === c.tripId)?.groupId;
        if (!gid) return;
        const known = remoteIds.current.get(gid) ?? new Set<string>();
        const added = c.upserts.filter((s) => !known.has(s.id));
        added.forEach((s) => known.add(s.id));
        writeStops(gid, c.upserts, c.deletes).catch(console.error);
        if (added.length === 1) postActivity(gid, user, `added ${added[0].name} to Day ${added[0].day + 1}`);
        else if (added.length > 1) postActivity(gid, user, `added ${added.length} places to the plan`);
      } else if (c.trip.groupId) {
        const changed = SYNCED_TRIP_KEYS.filter((k) => k in c.patch);
        if (changed.length) updateSharedTrip(c.trip.groupId, Object.fromEntries(changed.map((k) => [k, c.trip[k]]))).catch(console.error);
      }
    });
    return () => setLocalChangeHook(null);
  }, [user]);

  return null;
}
