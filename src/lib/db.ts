import { openDB, type DBSchema } from 'idb';
import type { Expense, Photo, Stop, Trip } from '../types';

interface StampedDB extends DBSchema {
  trips: { key: string; value: Trip };
  photos: { key: string; value: Photo; indexes: { 'by-trip': string } };
  stops: { key: string; value: Stop; indexes: { 'by-trip': string } };
  expenses: { key: string; value: Expense; indexes: { 'by-trip': string } };
  meta: { key: string; value: unknown };
}

export interface Repo {
  kind: 'indexeddb' | 'memory';
  loadAll(): Promise<{ trips: Trip[]; photos: Photo[]; stops: Stop[]; expenses: Expense[] }>;
  putTrip(t: Trip): Promise<void>;
  deleteTrip(id: string): Promise<void>;
  putPhotos(ps: Photo[]): Promise<void>;
  deletePhoto(id: string): Promise<void>;
  putStops(ss: Stop[]): Promise<void>;
  deleteStop(id: string): Promise<void>;
  putExpenses(es: Expense[]): Promise<void>;
  deleteExpense(id: string): Promise<void>;
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
  clear(): Promise<void>;
}

async function idbRepo(): Promise<Repo> {
  const db = await openDB<StampedDB>('stamped', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('trips', { keyPath: 'id' });
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('by-trip', 'tripId');
        db.createObjectStore('meta');
      }
      if (oldVersion < 2) {
        const stops = db.createObjectStore('stops', { keyPath: 'id' });
        stops.createIndex('by-trip', 'tripId');
      }
      if (oldVersion < 3) {
        const expenses = db.createObjectStore('expenses', { keyPath: 'id' });
        expenses.createIndex('by-trip', 'tripId');
      }
    },
  });

  return {
    kind: 'indexeddb',
    async loadAll() {
      const [trips, photos, stops, expenses] = await Promise.all([db.getAll('trips'), db.getAll('photos'), db.getAll('stops'), db.getAll('expenses')]);
      return { trips, photos, stops, expenses };
    },
    async putTrip(t) {
      await db.put('trips', t);
    },
    async deleteTrip(id) {
      const tx = db.transaction(['trips', 'photos', 'stops', 'expenses'], 'readwrite');
      const photos = tx.objectStore('photos');
      const stops = tx.objectStore('stops');
      const expenses = tx.objectStore('expenses');
      const [photoKeys, stopKeys, expenseKeys] = await Promise.all([
        photos.index('by-trip').getAllKeys(id),
        stops.index('by-trip').getAllKeys(id),
        expenses.index('by-trip').getAllKeys(id),
      ]);
      await Promise.all([
        tx.objectStore('trips').delete(id),
        ...photoKeys.map((k) => photos.delete(k)),
        ...stopKeys.map((k) => stops.delete(k)),
        ...expenseKeys.map((k) => expenses.delete(k)),
      ]);
      await tx.done;
    },
    async putPhotos(ps) {
      const tx = db.transaction('photos', 'readwrite');
      await Promise.all(ps.map((p) => tx.store.put(p)));
      await tx.done;
    },
    async deletePhoto(id) {
      await db.delete('photos', id);
    },
    async putStops(ss) {
      const tx = db.transaction('stops', 'readwrite');
      await Promise.all(ss.map((s) => tx.store.put(s)));
      await tx.done;
    },
    async deleteStop(id) {
      await db.delete('stops', id);
    },
    async putExpenses(es) {
      const tx = db.transaction('expenses', 'readwrite');
      await Promise.all(es.map((e) => tx.store.put(e)));
      await tx.done;
    },
    async deleteExpense(id) {
      await db.delete('expenses', id);
    },
    async getMeta(key) {
      return db.get('meta', key);
    },
    async setMeta(key, value) {
      await db.put('meta', value, key);
    },
    async clear() {
      const tx = db.transaction(['trips', 'photos', 'stops', 'expenses', 'meta'], 'readwrite');
      await Promise.all([
        tx.objectStore('trips').clear(),
        tx.objectStore('photos').clear(),
        tx.objectStore('stops').clear(),
        tx.objectStore('expenses').clear(),
        tx.objectStore('meta').clear(),
      ]);
      await tx.done;
    },
  };
}

/** Used when IndexedDB is unavailable (private mode, sandboxed previews). Data lasts until reload. */
function memoryRepo(): Repo {
  const trips = new Map<string, Trip>();
  const photos = new Map<string, Photo>();
  const stops = new Map<string, Stop>();
  const expenses = new Map<string, Expense>();
  const meta = new Map<string, unknown>();
  return {
    kind: 'memory',
    async loadAll() {
      return { trips: [...trips.values()], photos: [...photos.values()], stops: [...stops.values()], expenses: [...expenses.values()] };
    },
    async putTrip(t) {
      trips.set(t.id, t);
    },
    async deleteTrip(id) {
      trips.delete(id);
      for (const [k, p] of photos) if (p.tripId === id) photos.delete(k);
      for (const [k, s] of stops) if (s.tripId === id) stops.delete(k);
      for (const [k, e] of expenses) if (e.tripId === id) expenses.delete(k);
    },
    async putPhotos(ps) {
      ps.forEach((p) => photos.set(p.id, p));
    },
    async deletePhoto(id) {
      photos.delete(id);
    },
    async putStops(ss) {
      ss.forEach((s) => stops.set(s.id, s));
    },
    async deleteStop(id) {
      stops.delete(id);
    },
    async putExpenses(es) {
      es.forEach((e) => expenses.set(e.id, e));
    },
    async deleteExpense(id) {
      expenses.delete(id);
    },
    async getMeta(key) {
      return meta.get(key);
    },
    async setMeta(key, value) {
      meta.set(key, value);
    },
    async clear() {
      trips.clear();
      photos.clear();
      stops.clear();
      expenses.clear();
      meta.clear();
    },
  };
}

let repoPromise: Promise<Repo> | null = null;

export function getRepo(): Promise<Repo> {
  if (!repoPromise) {
    repoPromise = idbRepo()
      .then(async (r) => {
        await r.getMeta('probe');
        return r;
      })
      .catch(() => memoryRepo());
  }
  return repoPromise;
}
