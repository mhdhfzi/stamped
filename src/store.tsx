import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Expense, Photo, Stop, Trip } from './types';
import { getRepo, type Repo } from './lib/db';
import { blobToDataURL, compressImage, dataURLToBlob } from './lib/image';
import { readPhotoMeta } from './lib/exif';
import { releasePhotoSrc } from './lib/photoSrc';
import { dayCount, uid } from './lib/utils';
import { countryName } from './data/countries';
import { guessHomeCurrency } from './data/currencies';

// Older versions filled a new device with four sample trips (Tokyo, Seoul, Bali, Rome) whose
// cover photos came from this address. Everyone now starts empty, so remove those once.
const SAMPLE_PHOTO_HOST = 'https://images.higgs.ai/';

async function removeSampleTrips(repo: Repo) {
  const { trips, photos } = await repo.loadAll();
  const sampleTrips = new Set(photos.filter((p) => p.url?.startsWith(SAMPLE_PHOTO_HOST)).map((p) => p.tripId));
  for (const t of trips) if (sampleTrips.has(t.id) && !t.groupId) await repo.deleteTrip(t.id);
}

// Shared so concurrent mounts (e.g. React StrictMode) don't run the cleanup twice.
let initPromise: Promise<Repo> | null = null;
function initRepo() {
  initPromise ??= (async () => {
    const repo = await getRepo();
    if (!(await repo.getMeta('samplesRemoved'))) {
      await removeSampleTrips(repo);
      await repo.setMeta('samplesRemoved', true);
    }
    return repo;
  })();
  return initPromise;
}

/** A local edit to something a shared trip syncs (its places or its details). */
export type LocalChange = { kind: 'stops'; tripId: string; upserts: Stop[]; deletes: string[] } | { kind: 'trip'; trip: Trip; patch: Partial<Trip> };

// Set by the cloud sync (loaded only when a trip is shared), so plain local use stays dependency-free.
let localChangeHook: ((c: LocalChange) => void) | null = null;
export function setLocalChangeHook(fn: ((c: LocalChange) => void) | null) {
  localChangeHook = fn;
}
function emitLocalChange(c: LocalChange) {
  try {
    localChangeHook?.(c);
  } catch (e) {
    console.error(e);
  }
}

interface StoreValue {
  ready: boolean;
  storageMode: Repo['kind'];
  trips: Trip[];
  photos: Photo[];
  stops: Stop[];
  expenses: Expense[];
  profileName: string;
  /** Currency totals are shown in (ISO 4217). */
  homeCurrency: string;
  toast: string | null;
  notify(msg: string): void;
  photosOf(tripId: string): Photo[];
  coverOf(trip: Trip): Photo | undefined;
  /** `extra`: more fields set in the same write (e.g. a joined trip's groupId and dates). */
  addTrip(countryCode: string, title: string, planned?: boolean, extra?: Partial<Trip>): Promise<Trip>;
  updateTrip(id: string, patch: Partial<Trip>): Promise<void>;
  deleteTrip(id: string): Promise<void>;
  addPhotos(tripId: string, files: File[], onProgress?: (done: number, total: number) => void): Promise<number>;
  updatePhoto(id: string, patch: Partial<Photo>): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  stopsOf(tripId: string): Stop[];
  addStop(stop: Omit<Stop, 'id' | 'order' | 'createdAt'>): Promise<Stop>;
  updateStop(id: string, patch: Partial<Stop>): Promise<void>;
  deleteStop(id: string): Promise<void>;
  /** Moves many stops at once (optimise, auto-arrange, undo). */
  arrangeStops(layout: Pick<Stop, 'id' | 'day' | 'order'>[]): Promise<void>;
  /** Saves a new order for one day's stops (ids in their new order). */
  reorderDay(tripId: string, day: number, ids: string[]): Promise<void>;
  /** Sets trip dates; stops on days past the new end move to the last day. */
  setTripDates(tripId: string, startDate: string, endDate: string): Promise<void>;
  expensesOf(tripId: string): Expense[];
  saveExpense(e: Omit<Expense, 'id' | 'createdAt'> & { id?: string }): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;
  setHomeCurrency(code: string): Promise<void>;
  /** Applies changes that came from a shared trip's group (not re-broadcast). */
  applyRemote(tripId: string, change: { upserts?: Stop[]; deletes?: string[]; trip?: Partial<Trip> }): Promise<void>;
  setProfileName(name: string): Promise<void>;
  /** Small square-ish picture (data URL) shown on the Account page, or null for the initial. */
  profilePhoto: string | null;
  /** A new picture from the gallery or camera, or null to remove it. */
  setProfilePhoto(file: File | null): Promise<void>;
  exportBackup(): Promise<Blob>;
  importBackup(file: File): Promise<number>;
  resetAll(): Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const repoRef = useRef<Repo | null>(null);
  const [ready, setReady] = useState(false);
  const [storageMode, setStorageMode] = useState<Repo['kind']>('indexeddb');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [homeCurrency, setHome] = useState(guessHomeCurrency);
  const [profileName, setName] = useState('Traveler');
  const [profilePhoto, setPhoto] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tripsRef = useRef(trips);
  const photosRef = useRef(photos);
  tripsRef.current = trips;
  photosRef.current = photos;
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const toastTimer = useRef<number>();

  useEffect(() => {
    (async () => {
      const repo = await initRepo();
      repoRef.current = repo;
      setStorageMode(repo.kind);
      const all = await repo.loadAll();
      setTrips(all.trips);
      setPhotos(all.photos);
      setStops(all.stops);
      setExpenses(all.expenses);
      const hc = await repo.getMeta('homeCurrency');
      if (typeof hc === 'string' && hc) setHome(hc);
      const n = await repo.getMeta('profileName');
      if (typeof n === 'string' && n) setName(n);
      const pp = await repo.getMeta('profilePhoto');
      if (typeof pp === 'string' && pp) setPhoto(pp);
      setReady(true);
      navigator.storage?.persist?.().catch(() => undefined);
    })();
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const byTrip = useMemo(() => {
    const m = new Map<string, Photo[]>();
    for (const p of photos) {
      const arr = m.get(p.tripId);
      if (arr) arr.push(p);
      else m.set(p.tripId, [p]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.takenAt - b.takenAt);
    return m;
  }, [photos]);

  const photosOf = useCallback((tripId: string) => byTrip.get(tripId) ?? [], [byTrip]);

  const coverOf = useCallback(
    (trip: Trip) => {
      const list = byTrip.get(trip.id) ?? [];
      return list.find((p) => p.id === trip.coverPhotoId) ?? list[list.length - 1];
    },
    [byTrip],
  );

  const addTrip = useCallback(async (countryCode: string, title: string, planned?: boolean, extra?: Partial<Trip>) => {
    const t: Trip = { ...extra, id: uid(), countryCode, title: title.trim() || countryName(countryCode), createdAt: Date.now(), ...(planned ? { planned: true } : {}) };
    await repoRef.current!.putTrip(t);
    // Update the ref now (not on the next render) so an immediate updateTrip/addStop can find the new trip.
    tripsRef.current = [t, ...tripsRef.current];
    setTrips((s) => [t, ...s]);
    return t;
  }, []);

  const updateTrip = useCallback(async (id: string, patch: Partial<Trip>) => {
    const t = tripsRef.current.find((x) => x.id === id);
    if (!t) return;
    const next = { ...t, ...patch };
    await repoRef.current!.putTrip(next);
    setTrips((s) => s.map((x) => (x.id === id ? next : x)));
    emitLocalChange({ kind: 'trip', trip: next, patch });
  }, []);

  const deleteTrip = useCallback(async (id: string) => {
    await repoRef.current!.deleteTrip(id);
    photosRef.current.filter((p) => p.tripId === id).forEach((p) => releasePhotoSrc(p.id));
    setTrips((s) => s.filter((t) => t.id !== id));
    setPhotos((s) => s.filter((p) => p.tripId !== id));
    setStops((s) => s.filter((x) => x.tripId !== id));
    setExpenses((s) => s.filter((x) => x.tripId !== id));
  }, []);

  const addPhotos = useCallback(
    async (tripId: string, files: File[], onProgress?: (done: number, total: number) => void) => {
      const out: Photo[] = [];
      let done = 0;
      for (const f of files) {
        if (f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)) {
          // Read EXIF first: compression drops it.
          const [meta, blob] = await Promise.all([readPhotoMeta(f), compressImage(f)]);
          out.push({ id: uid(), tripId, blob, takenAt: meta.takenAt ?? (f.lastModified || Date.now()), lat: meta.lat, lng: meta.lng, createdAt: Date.now() });
        }
        onProgress?.(++done, files.length);
      }
      if (!out.length) return 0;
      await repoRef.current!.putPhotos(out);
      setPhotos((s) => [...s, ...out]);
      const trip = tripsRef.current.find((t) => t.id === tripId);
      if (trip && !trip.coverPhotoId) await updateTrip(tripId, { coverPhotoId: out[0].id });
      return out.length;
    },
    [updateTrip],
  );

  const updatePhoto = useCallback(async (id: string, patch: Partial<Photo>) => {
    const p = photosRef.current.find((x) => x.id === id);
    if (!p) return;
    const next = { ...p, ...patch };
    await repoRef.current!.putPhotos([next]);
    setPhotos((s) => s.map((x) => (x.id === id ? next : x)));
  }, []);

  const deletePhoto = useCallback(
    async (id: string) => {
      await repoRef.current!.deletePhoto(id);
      releasePhotoSrc(id);
      setPhotos((s) => s.filter((p) => p.id !== id));
      const t = tripsRef.current.find((x) => x.coverPhotoId === id);
      if (t) await updateTrip(t.id, { coverPhotoId: undefined });
    },
    [updateTrip],
  );

  const stopsByTrip = useMemo(() => {
    const m = new Map<string, Stop[]>();
    for (const x of stops) m.set(x.tripId, [...(m.get(x.tripId) ?? []), x]);
    for (const arr of m.values()) arr.sort((a, b) => a.day - b.day || a.order - b.order);
    return m;
  }, [stops]);

  const stopsOf = useCallback((tripId: string) => stopsByTrip.get(tripId) ?? [], [stopsByTrip]);

  const saveStops = useCallback(async (changed: Stop[]) => {
    if (!changed.length) return;
    await repoRef.current!.putStops(changed);
    const byId = new Map(changed.map((x) => [x.id, x]));
    setStops((s) => [...s.filter((x) => !byId.has(x.id)), ...changed]);
    emitLocalChange({ kind: 'stops', tripId: changed[0].tripId, upserts: changed, deletes: [] });
  }, []);

  const addStop = useCallback(
    async (input: Omit<Stop, 'id' | 'order' | 'createdAt'>) => {
      const sameDay = stopsRef.current.filter((x) => x.tripId === input.tripId && x.day === input.day);
      const stop: Stop = { ...input, id: uid(), order: Math.max(-1, ...sameDay.map((x) => x.order)) + 1, createdAt: Date.now() };
      await saveStops([stop]);
      return stop;
    },
    [saveStops],
  );

  const updateStop = useCallback(
    async (id: string, patch: Partial<Stop>) => {
      const cur = stopsRef.current.find((x) => x.id === id);
      if (!cur) return;
      const next = { ...cur, ...patch };
      // Moving to another day puts the stop at the end of that day.
      if (patch.day != null && patch.day !== cur.day) {
        const target = stopsRef.current.filter((x) => x.tripId === cur.tripId && x.day === patch.day);
        next.order = Math.max(-1, ...target.map((x) => x.order)) + 1;
      }
      await saveStops([next]);
    },
    [saveStops],
  );

  const deleteStop = useCallback(async (id: string) => {
    const tripId = stopsRef.current.find((x) => x.id === id)?.tripId;
    await repoRef.current!.deleteStop(id);
    setStops((s) => s.filter((x) => x.id !== id));
    if (tripId) emitLocalChange({ kind: 'stops', tripId, upserts: [], deletes: [id] });
  }, []);

  /** Applies a friend's changes from a shared trip — saved locally without being sent back. */
  const applyRemote = useCallback(async (tripId: string, change: { upserts?: Stop[]; deletes?: string[]; trip?: Partial<Trip> }) => {
    const repo = repoRef.current!;
    if (change.upserts?.length) await repo.putStops(change.upserts);
    for (const id of change.deletes ?? []) await repo.deleteStop(id);
    if (change.upserts?.length || change.deletes?.length) {
      const up = new Map((change.upserts ?? []).map((x) => [x.id, x]));
      const del = new Set(change.deletes ?? []);
      setStops((s) => [...s.filter((x) => !up.has(x.id) && !del.has(x.id)), ...up.values()]);
    }
    if (change.trip) {
      const t = tripsRef.current.find((x) => x.id === tripId);
      if (t) {
        const next = { ...t, ...change.trip };
        await repo.putTrip(next);
        setTrips((s) => s.map((x) => (x.id === tripId ? next : x)));
      }
    }
  }, []);

  const arrangeStops = useCallback(
    async (layout: Pick<Stop, 'id' | 'day' | 'order'>[]) => {
      const changed = layout
        .map(({ id, day, order }) => {
          const x = stopsRef.current.find((s) => s.id === id);
          return x && (x.day !== day || x.order !== order) ? { ...x, day, order } : null;
        })
        .filter((x): x is Stop => !!x);
      await saveStops(changed);
    },
    [saveStops],
  );

  const reorderDay = useCallback(
    async (tripId: string, day: number, ids: string[]) => {
      const changed = ids
        .map((id, order) => {
          const x = stopsRef.current.find((s) => s.id === id && s.tripId === tripId && s.day === day);
          return x && x.order !== order ? { ...x, order } : null;
        })
        .filter((x): x is Stop => !!x);
      await saveStops(changed);
    },
    [saveStops],
  );

  const setTripDates = useCallback(
    async (tripId: string, startDate: string, endDate: string) => {
      const last = dayCount(startDate, endDate) - 1;
      // A longer trip: the stay that covered the old last night now runs to the new end.
      const t = tripsRef.current.find((x) => x.id === tripId);
      const oldLast = t?.startDate && t.endDate ? dayCount(t.startDate, t.endDate) - 1 : -1;
      const stays = t?.stays && last > oldLast ? t.stays.map((s) => (s.to === oldLast ? { ...s, to: last } : s)) : t?.stays;
      await updateTrip(tripId, { startDate, endDate, stays });
      const overflow = stopsRef.current
        .filter((x) => x.tripId === tripId && x.day > last)
        .sort((a, b) => a.day - b.day || a.order - b.order);
      if (!overflow.length) return;
      const base = Math.max(-1, ...stopsRef.current.filter((x) => x.tripId === tripId && x.day === last).map((x) => x.order)) + 1;
      await saveStops(overflow.map((x, i) => ({ ...x, day: last, order: base + i })));
    },
    [updateTrip, saveStops],
  );

  const expensesByTrip = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of expenses) m.set(e.tripId, [...(m.get(e.tripId) ?? []), e]);
    // Newest day first; within a day, most recently added first.
    for (const arr of m.values()) arr.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    return m;
  }, [expenses]);

  const expensesOf = useCallback((tripId: string) => expensesByTrip.get(tripId) ?? [], [expensesByTrip]);

  const saveExpense = useCallback(async (input: Omit<Expense, 'id' | 'createdAt'> & { id?: string }) => {
    const prev = input.id ? expensesRef.current.find((x) => x.id === input.id) : undefined;
    const e: Expense = { ...input, id: input.id ?? uid(), createdAt: prev?.createdAt ?? Date.now() };
    await repoRef.current!.putExpenses([e]);
    setExpenses((s) => [...s.filter((x) => x.id !== e.id), e]);
    return e;
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    await repoRef.current!.deleteExpense(id);
    setExpenses((s) => s.filter((x) => x.id !== id));
  }, []);

  const setHomeCurrency = useCallback(async (code: string) => {
    await repoRef.current!.setMeta('homeCurrency', code);
    setHome(code);
  }, []);

  const setProfileName = useCallback(async (name: string) => {
    const n = name.trim() || 'Traveler';
    await repoRef.current!.setMeta('profileName', n);
    setName(n);
  }, []);

  const setProfilePhoto = useCallback(async (file: File | null) => {
    // Shrunk to 400px so it stays tiny in storage and backups.
    const url = file ? await blobToDataURL(await compressImage(file, 400, 0.85)) : null;
    await repoRef.current!.setMeta('profilePhoto', url);
    setPhoto(url);
  }, []);

  const exportBackup = useCallback(async () => {
    const data = {
      app: 'stamped',
      version: 3,
      exportedAt: new Date().toISOString(),
      profileName,
      profilePhoto,
      trips: tripsRef.current,
      stops: stopsRef.current,
      expenses: expensesRef.current,
      homeCurrency,
      photos: await Promise.all(
        photosRef.current.map(async ({ blob, ...rest }) => ({ ...rest, data: blob ? await blobToDataURL(blob) : undefined })),
      ),
    };
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  }, [profileName, profilePhoto, homeCurrency]);

  const importBackup = useCallback(async (file: File) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = JSON.parse(await file.text());
    if (json?.app !== 'stamped' || !Array.isArray(json.trips) || !Array.isArray(json.photos)) {
      throw new Error('This file is not a Stamped backup.');
    }
    const repo = repoRef.current!;
    const ps: Photo[] = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json.photos.map(async ({ data, ...rest }: any) => ({ ...rest, blob: data ? await dataURLToBlob(data) : undefined }) as Photo),
    );
    for (const t of json.trips as Trip[]) await repo.putTrip(t);
    await repo.putPhotos(ps);
    if (Array.isArray(json.stops)) await repo.putStops(json.stops as Stop[]);
    if (Array.isArray(json.expenses)) await repo.putExpenses(json.expenses as Expense[]);
    if (typeof json.homeCurrency === 'string') await repo.setMeta('homeCurrency', json.homeCurrency);
    if (typeof json.profileName === 'string') await repo.setMeta('profileName', json.profileName);
    if (typeof json.profilePhoto === 'string') await repo.setMeta('profilePhoto', json.profilePhoto);
    const all = await repo.loadAll();
    setTrips(all.trips);
    setPhotos(all.photos);
    setStops(all.stops);
    setExpenses(all.expenses);
    if (typeof json.homeCurrency === 'string') setHome(json.homeCurrency);
    if (typeof json.profileName === 'string') setName(json.profileName);
    if (typeof json.profilePhoto === 'string') setPhoto(json.profilePhoto);
    return ps.length;
  }, []);

  const resetAll = useCallback(async () => {
    const repo = repoRef.current!;
    await repo.clear();
    await repo.setMeta('samplesRemoved', true);
    photosRef.current.forEach((p) => releasePhotoSrc(p.id));
    setTrips([]);
    setPhotos([]);
    setStops([]);
    setExpenses([]);
    setName('Traveler');
    setPhoto(null);
  }, []);

  const value: StoreValue = {
    ready, storageMode, trips, photos, stops, expenses, homeCurrency, profileName, toast, notify, photosOf, coverOf,
    addTrip, updateTrip, deleteTrip, addPhotos, updatePhoto, deletePhoto,
    stopsOf, addStop, updateStop, deleteStop, arrangeStops, reorderDay, setTripDates,
    expensesOf, saveExpense, deleteExpense, setHomeCurrency, applyRemote, setProfileName, profilePhoto, setProfilePhoto,
    exportBackup, importBackup, resetAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}
