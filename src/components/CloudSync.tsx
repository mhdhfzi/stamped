import { useEffect, useRef } from 'react';
import type { Photo, Stop, Trip } from '../types';
import { setLocalChangeHook, useStore, type LocalChange } from '../store';
import {
  SYNCED_TRIP_KEYS,
  deleteSharedPhoto,
  downloadPhoto,
  postActivity,
  pushToGroup,
  subscribeGroup,
  subscribeMessages,
  subscribePhotos,
  subscribeStops,
  updateSharedTrip,
  uploadPhoto,
  useCloudUser,
  writeStops,
  type SharedTrip,
} from '../lib/cloud';
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
  const { trips, stops, photos, applyRemote, applyRemotePhotos, updatePhoto, notify, switchAccount } = useStore();
  const user = useCloudUser();
  const tripsRef = useRef(trips);
  const stopsRef = useRef(stops);
  const photosRef = useRef(photos);
  tripsRef.current = trips;
  stopsRef.current = stops;
  photosRef.current = photos;
  /** groupId → ids of places the group already has (to spot newly added ones). */
  const remoteIds = useRef(new Map<string, Set<string>>());
  /** groupId → ids of photos the group has. */
  const remotePhotoIds = useRef(new Map<string, Set<string>>());
  /** Photos being uploaded or downloaded right now (so two triggers don't do it twice). */
  const busy = useRef(new Set<string>());

  /** Uploads your photos to a group, then tells everyone. */
  async function sharePhotos(gid: string, list: Photo[], fresh: boolean) {
    if (!user) return;
    let sent = 0;
    let tooBig = 0;
    for (const p of list) {
      if (busy.current.has(p.id) || !p.blob) continue;
      busy.current.add(p.id);
      try {
        if (await uploadPhoto(gid, user, p)) {
          remotePhotoIds.current.get(gid)?.add(p.id);
          await updatePhoto(p.id, { synced: true, addedBy: user.uid });
          sent++;
        } else tooBig++;
      } catch (e) {
        console.error('Photo upload failed', e);
      } finally {
        busy.current.delete(p.id);
      }
    }
    if (tooBig) notify(`${tooBig} photo${tooBig === 1 ? '' : 's'} couldn’t be shared (format not supported)`);
    if (!sent) return;
    const what = `${fresh ? 'added' : 'shared'} ${sent} photo${sent === 1 ? '' : 's'} 📸`;
    postActivity(gid, user, what);
    if (fresh) pushToGroup(gid, user, what);
  }
  const shareRef = useRef(sharePhotos);
  shareRef.current = sharePhotos;

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
        subscribePhotos(gid, async (remote, fromCache) => {
          // Only act on answers from the server: a stale offline copy could look like "deleted".
          if (fromCache) return;
          const ids = new Set(remote.map((r) => r.id));
          remotePhotoIds.current.set(gid, ids);
          const local = photosRef.current.filter((p) => p.tripId === tripId);
          const localIds = new Set(local.map((p) => p.id));

          // Friends' new photos → download once and keep on this phone.
          const added: Photo[] = [];
          for (const r of remote.filter((r) => !localIds.has(r.id) && !busy.current.has(r.id))) {
            busy.current.add(r.id);
            try {
              const blob = await downloadPhoto(gid, r.id);
              if (blob) added.push({ id: r.id, tripId, blob, takenAt: r.takenAt, createdAt: r.createdAt, lat: r.lat, lng: r.lng, place: r.place, caption: r.caption, synced: true, addedBy: r.addedBy });
            } catch (e) {
              console.error('Photo download failed', e);
            } finally {
              busy.current.delete(r.id);
            }
          }
          // Photos someone removed from the group.
          const deleted = local.filter((p) => p.synced && !ids.has(p.id) && !busy.current.has(p.id)).map((p) => p.id);
          if (added.length || deleted.length) await applyRemotePhotos(tripId, added, deleted);

          // Already in the group but not marked yet (e.g. the app closed mid-upload).
          for (const p of local.filter((p) => !p.synced && ids.has(p.id))) await updatePhoto(p.id, { synced: true });
          // Yours that the group doesn't have yet — including ones added before friends joined.
          const mine = local.filter((p) => !p.synced && !ids.has(p.id));
          if (mine.length) await shareRef.current(gid, mine, false);
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

  // Each account has its own trips on this phone: show the signed-in account's (or the no-account ones after signing out).
  useEffect(() => {
    if (user !== undefined) switchAccount(user?.uid ?? null);
  }, [user, switchAccount]);

  // Keep this phone's notification address current (only if notifications are on).
  useEffect(() => {
    if (user) import('../lib/push').then((m) => m.refreshPush(user)).catch(() => undefined);
  }, [user]);

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
      } else if (c.kind === 'photos') {
        const gid = tripsRef.current.find((t) => t.id === c.tripId)?.groupId;
        if (!gid) return;
        if (c.added.length) shareRef.current(gid, c.added, true);
        for (const p of c.deleted) if (p.synced) deleteSharedPhoto(gid, p.id).catch(console.error);
      } else if (c.trip.groupId) {
        const changed = SYNCED_TRIP_KEYS.filter((k) => k in c.patch);
        if (changed.length) updateSharedTrip(c.trip.groupId, Object.fromEntries(changed.map((k) => [k, c.trip[k]]))).catch(console.error);
      }
    });
    return () => setLocalChangeHook(null);
  }, [user]);

  return null;
}
