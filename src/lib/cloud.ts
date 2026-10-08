/**
 * Firebase: accounts, shared trip groups, live plan sync, group chat and shared expenses.
 * Only imported lazily (by components that need it) so solo, offline use never downloads Firebase.
 *
 * Firestore layout (see firestore.rules):
 *   invites/{code}            → { groupId }
 *   groups/{groupId}          → Group (members, invite code, shared trip details)
 *   groups/{id}/stops/{stop}  → the shared plan (one doc per place)
 *   groups/{id}/messages/{m}  → chat (text, activity notes, plan cards)
 *   groups/{id}/expenses/{e}  → shared expenses (who paid, split between whom)
 *   groups/{id}/photos/{p}    → shared photo details; groups/{id}/photoData/{p} → the picture
 *   groups/{id}/media/{m}_{n} → pieces of photos & videos sent in the chat
 *   groups/{id}/status/{uid}  → when each member last read the chat / is typing
 *   users/{uid}               → push notification addresses (tokens) of your devices
 */
import { useEffect, useReducer, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  Bytes,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import type { ExpenseCategory, HotelStay, Photo, Stop, TravelMode, Trip } from '../types';
import { firebaseConfig, useEmulators } from './cloudConfig';
import { blobToDataURL, compressImage, dataURLToBlob } from './image';

const app = initializeApp(firebaseConfig!);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // Keep a local copy so chat and the shared plan open offline (same in emulator mode, so tests match real use).
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
if (useEmulators) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}

// ───────────────────────── Accounts ─────────────────────────

/** undefined while Firebase restores the session, then the user or null. */
export function useCloudUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(auth.currentUser ?? undefined);
  // The User object is mutated in place (e.g. a new display name), so also force a re-render.
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(
    () =>
      onIdTokenChanged(auth, (u) => {
        setUser(u);
        refresh();
      }),
    [],
  );
  return user;
}

export const displayName = (u: Pick<User, 'displayName' | 'email'>) => u.displayName || u.email?.split('@')[0] || 'Traveller';

const REDIRECT_KEY = 'stamped:google-redirect';

/**
 * Google sign-in. Phones (and home-screen apps) use a full-page redirect — pop-ups are unreliable
 * there; it works because sign-in is served from our own domain (see cloudConfig.authDomain).
 * Computers use a pop-up.
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const phone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(pointer: coarse)').matches;
  const redirect = () => {
    try {
      sessionStorage.setItem(REDIRECT_KEY, '1');
    } catch {
      /* private mode: we just won't show "Finishing sign-in…" */
    }
    return signInWithRedirect(auth, provider);
  };
  if (phone) return redirect();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/popup-blocked') await redirect();
    else throw e;
  }
}

/** True right after coming back from Google's sign-in page. */
export function returningFromGoogle() {
  try {
    return sessionStorage.getItem(REDIRECT_KEY) === '1';
  } catch {
    return false;
  }
}

let redirectOutcome: Promise<string | null> | null = null;
/** Completes a redirect sign-in: null if fine (or nothing to do), else a readable error. */
export function finishGoogleRedirect(): Promise<string | null> {
  redirectOutcome ??= getRedirectResult(auth)
    .then(
      () => null,
      (e) => {
        console.error('Google redirect sign-in failed', e);
        return authErrorMessage(e);
      },
    )
    .finally(() => {
      try {
        sessionStorage.removeItem(REDIRECT_KEY);
      } catch {
        /* ignore */
      }
    });
  return redirectOutcome;
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name.trim() || email.split('@')[0] });
  // updateProfile doesn't notify listeners; refreshing the token does, so the new name shows everywhere.
  await cred.user.reload();
  await cred.user.getIdToken(true);
  return cred.user;
}

export const signInWithEmail = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);
export const signOut = () => fbSignOut(auth);

/** Turns Firebase error codes into plain sentences. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email — create one instead.',
    'auth/email-already-in-use': 'That email already has an account — sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/invalid-email': 'That email doesn’t look right.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/network-request-failed': 'No connection — check your internet and try again.',
    'auth/operation-not-allowed': 'This sign-in method isn’t enabled in the Firebase project yet.',
    'auth/redirect-cancelled-by-user': 'Sign-in was cancelled.',
    'auth/web-storage-unsupported': 'This browser blocks the storage sign-in needs — turn off private mode, or use email.',
    'auth/missing-initial-state': 'Sign-in couldn’t finish in this browser. Please try again, or use email.',
    'auth/internal-error': 'Google sign-in isn’t fully set up yet (check the authorised redirect address). Use email for now.',
    'auth/unauthorized-domain':'This web address isn’t allowed to sign in yet — add it in Firebase → Authentication → Settings → Authorized domains.',
  };
  return map[code] ?? 'Something went wrong. Please try again.';
}

// ───────────────────────── Groups ─────────────────────────

export interface Member {
  name: string;
  photo?: string | null;
}

/** Trip details everyone in the group shares. */
export interface SharedTrip {
  title: string;
  startDate?: string;
  endDate?: string;
  stays?: HotelStay[];
  travelMode?: TravelMode;
}

export interface Group {
  id: string;
  name: string;
  countryCode: string;
  ownerId: string;
  members: string[];
  memberInfo: Record<string, Member>;
  inviteCode: string;
  /** Currency shared expenses are totalled in. */
  currency: string;
  trip: SharedTrip;
}

export const SYNCED_TRIP_KEYS = ['startDate', 'endDate', 'stays', 'travelMode'] as const;

export function sharedTripOf(t: Trip): SharedTrip {
  return { title: t.title, startDate: t.startDate, endDate: t.endDate, stays: t.stays, travelMode: t.travelMode };
}

const memberOf = (u: User): Member => ({ name: displayName(u), photo: u.photoURL ?? null });

/** Readable, unambiguous invite codes (no 0/O, 1/I). */
function newInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => chars[n % chars.length]).join('');
}

const stopDoc = ({ tripId: _t, ...s }: Stop) => s;

/** Shares a local trip: creates the group with its plan, and an invite code. */
export async function createGroup(trip: Trip, stops: Stop[], user: User, currency: string): Promise<Group> {
  const ref = doc(collection(db, 'groups'));
  const group: Group = {
    id: ref.id,
    name: trip.title,
    countryCode: trip.countryCode,
    ownerId: user.uid,
    members: [user.uid],
    memberInfo: { [user.uid]: memberOf(user) },
    inviteCode: newInviteCode(),
    currency,
    trip: sharedTripOf(trip),
  };
  const { id: _id, ...data } = group;
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  await setDoc(doc(db, 'invites', group.inviteCode), { groupId: ref.id });
  for (let i = 0; i < stops.length; i += 400) {
    const batch = writeBatch(db);
    stops.slice(i, i + 400).forEach((s) => batch.set(doc(db, 'groups', ref.id, 'stops', s.id), stopDoc(s)));
    await batch.commit();
  }
  await postActivity(ref.id, user, `started the group for ${trip.title}`);
  return group;
}

export class JoinError extends Error {}

/** Joins with an invite code; returns the group (now readable as a member). */
export async function joinGroup(code: string, user: User): Promise<Group> {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 6) throw new JoinError('Invite codes have 6 letters and numbers.');
  const invite = await getDoc(doc(db, 'invites', clean));
  if (!invite.exists()) throw new JoinError('No trip found for that code — check it with your friend.');
  const groupId = invite.data().groupId as string;
  const ref = doc(db, 'groups', groupId);
  // Only members can read the group, so a successful read means "already joined".
  const alreadyMember = await getDoc(ref).then(
    (s) => s.exists() && (s.data().members as string[]).includes(user.uid),
    () => false,
  );
  if (!alreadyMember) await updateDoc(ref, { members: arrayUnion(user.uid), [`memberInfo.${user.uid}`]: memberOf(user) });
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new JoinError('That trip no longer exists.');
  const group = { id: snap.id, ...snap.data() } as Group;
  if (!alreadyMember) await postActivity(groupId, user, 'joined the trip 👋');
  return group;
}

export async function leaveGroup(group: Group, user: User) {
  const ref = doc(db, 'groups', group.id);
  const others = group.members.filter((m) => m !== user.uid);
  if (!others.length) {
    await deleteDoc(doc(db, 'invites', group.inviteCode)).catch(() => undefined);
    await deleteDoc(ref);
    return;
  }
  await postActivity(group.id, user, 'left the trip');
  await updateDoc(ref, {
    members: arrayRemove(user.uid),
    [`memberInfo.${user.uid}`]: deleteField(),
    // The owner hands the group to the next member.
    ...(group.ownerId === user.uid ? { ownerId: others[0] } : {}),
  });
}

export function subscribeGroup(groupId: string, cb: (g: Group | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(doc(db, 'groups', groupId), (s) => cb(s.exists() ? ({ id: s.id, ...s.data() } as Group) : null), onError);
}

export const updateSharedTrip = (groupId: string, trip: Partial<SharedTrip>) =>
  updateDoc(doc(db, 'groups', groupId), Object.fromEntries(Object.entries(trip).map(([k, v]) => [`trip.${k}`, v ?? deleteField()])));

// ───────────────────────── Shared plan ─────────────────────────

/** Full current list of the group's places on every change (plus whether it came from the local cache only). */
export function subscribeStops(groupId: string, cb: (stops: Omit<Stop, 'tripId'>[], fromCache: boolean) => void) {
  return onSnapshot(collection(db, 'groups', groupId, 'stops'), { includeMetadataChanges: false }, (s) =>
    cb(
      s.docs.map((d) => ({ ...(d.data() as Omit<Stop, 'tripId'>), id: d.id })),
      s.metadata.fromCache,
    ),
  );
}

export async function writeStops(groupId: string, upserts: Stop[], deletes: string[]) {
  const batch = writeBatch(db);
  upserts.forEach((s) => batch.set(doc(db, 'groups', groupId, 'stops', s.id), stopDoc(s)));
  deletes.forEach((id) => batch.delete(doc(db, 'groups', groupId, 'stops', id)));
  await batch.commit();
}

// ───────────────────────── Chat ─────────────────────────

/** "Tomorrow" card: the day's places, where it starts and ends. */
export interface PlanCard {
  day: number;
  date: string;
  stops: { name: string; time?: string }[];
  from?: string;
  to?: string;
}

/** A photo or video sent in the chat. The file itself is stored in pieces in groups/{id}/media. */
export interface ChatMedia {
  id: string;
  kind: 'photo' | 'video';
  mime: string;
  size: number;
  /** How many ≤ 900 KB pieces the file was split into. */
  chunks: number;
  w: number;
  h: number;
  /** Seconds (videos). */
  duration?: number;
  /** Tiny JPEG preview (data URL) shown straight away. */
  thumb: string;
}

export interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  type: 'text' | 'activity' | 'plan' | 'photo' | 'video';
  text: string;
  plan?: PlanCard;
  media?: ChatMedia;
  /** Deleted for everyone by its sender (shown as "This message was deleted"). */
  deleted?: boolean;
  createdAt: Date | null;
}

export function subscribeMessages(groupId: string, cb: (m: ChatMessage[]) => void, max = 300, onError?: (e: Error & { code?: string }) => void) {
  return onSnapshot(
    query(collection(db, 'groups', groupId, 'messages'), orderBy('createdAt', 'desc'), limit(max)),
    { includeMetadataChanges: true },
    (s) =>
      cb(
        s.docs
          .map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' }) as DocumentData;
            return { ...(data as ChatMessage), id: d.id, createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null };
          })
          .reverse(),
      ),
    (e) => {
      console.error('Chat listener failed', e);
      onError?.(e);
    },
  );
}

/** Plain-language reason a Firestore read/write failed (shown in the chat so problems are visible). */
export function cloudErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return 'The database refused access (permission-denied). Check the Firestore rules were published, and that you’re a member of this trip.';
  if (code === 'unavailable') return 'Can’t reach the server — you seem to be offline.';
  if (code === 'failed-precondition') return 'The database needs an index for this — see the browser console for a link to create it.';
  return `Something went wrong (${code || 'unknown error'}).`;
}

const send = (groupId: string, user: User, m: Pick<ChatMessage, 'type' | 'text' | 'plan' | 'media'>) =>
  addDoc(collection(db, 'groups', groupId, 'messages'), { ...m, uid: user.uid, name: displayName(user), createdAt: serverTimestamp() });

export const sendText = (groupId: string, user: User, text: string) => send(groupId, user, { type: 'text', text: text.trim() });
export const sendPlan = (groupId: string, user: User, plan: PlanCard) => send(groupId, user, { type: 'plan', text: `Plan for Day ${plan.day + 1}`, plan });
// Chat photos & videos. Firestore documents hold at most 1 MB, so a file is split into
// ≤ 900 KB pieces (media/{mediaId}_{n}), written first; the message that points to them comes last.
const PIECE = 900_000;
export const MAX_CHAT_VIDEO = 20 * 1024 * 1024;

export async function sendMedia(
  groupId: string,
  user: User,
  file: Blob,
  info: Omit<ChatMedia, 'id' | 'size' | 'chunks'>,
  caption: string,
  onProgress?: (fraction: number) => void,
  /** The sender already has the file: show it from here instead of downloading it back. */
  localUrl?: string,
) {
  const id = doc(collection(db, 'groups', groupId, 'media')).id;
  if (localUrl) mediaUrls.set(id, Promise.resolve(localUrl));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = Math.max(1, Math.ceil(bytes.length / PIECE));
  // Up to 8 pieces (~7 MB) per write — under Firestore's 10 MB request limit.
  for (let i = 0; i < chunks; i += 8) {
    const batch = writeBatch(db);
    for (let j = i; j < Math.min(i + 8, chunks); j++) {
      batch.set(doc(db, 'groups', groupId, 'media', `${id}_${j}`), { data: Bytes.fromUint8Array(bytes.subarray(j * PIECE, (j + 1) * PIECE)), addedBy: user.uid });
    }
    await batch.commit();
    onProgress?.(Math.min(i + 8, chunks) / chunks);
  }
  const media: ChatMedia = { ...info, id, size: bytes.length, chunks };
  await send(groupId, user, { type: info.kind, text: caption.trim(), media });
}

/**
 * Delete for everyone (your own messages): the message stays as a "deleted" marker so the
 * conversation still reads right, and its photo/video pieces are removed for good.
 */
export async function deleteMessageForEveryone(groupId: string, m: ChatMessage) {
  await updateDoc(doc(db, 'groups', groupId, 'messages', m.id), { deleted: true, text: '', media: deleteField(), plan: deleteField() });
  if (!m.media) return;
  for (let i = 0; i < m.media.chunks; i += 400) {
    const batch = writeBatch(db);
    for (let j = i; j < Math.min(i + 400, m.media.chunks); j++) batch.delete(doc(db, 'groups', groupId, 'media', `${m.media.id}_${j}`));
    await batch.commit().catch((e) => console.error('Media pieces not removed', e));
  }
}

const mediaUrls = new Map<string, Promise<string>>();

/** A playable/viewable URL for a chat photo or video (downloaded once per session). */
export function chatMediaUrl(groupId: string, m: ChatMedia, onProgress?: (fraction: number) => void): Promise<string> {
  let p = mediaUrls.get(m.id);
  if (!p) {
    let done = 0;
    p = Promise.all(
      Array.from({ length: m.chunks }, (_, i) =>
        getDoc(doc(db, 'groups', groupId, 'media', `${m.id}_${i}`)).then((s) => {
          onProgress?.(++done / m.chunks);
          const data = s.data()?.data as Bytes | undefined;
          if (!data) throw new Error('Missing part of the file');
          return data.toUint8Array();
        }),
      ),
    ).then((parts) => URL.createObjectURL(new Blob(parts as BlobPart[], { type: m.mime })));
    p.catch(() => mediaUrls.delete(m.id));
    mediaUrls.set(m.id, p);
  }
  return p;
}

/** Small grey notes in the chat: "Aina added Fushimi Inari to Day 3". */
export const postActivity = (groupId: string, user: User, text: string) => send(groupId, user, { type: 'activity', text }).catch(() => undefined);

// ───────────────────────── Shared expenses ─────────────────────────

export interface GroupExpense {
  id: string;
  amount: number;
  currency: string;
  category: ExpenseCategory | 'settlement';
  note?: string;
  date: string;
  /** uid of who paid. */
  paidBy: string;
  /** uids it's split between (equally). */
  splitWith: string[];
  createdBy: string;
  createdAt: Date | null;
}

export function subscribeExpenses(groupId: string, cb: (e: GroupExpense[]) => void) {
  return onSnapshot(query(collection(db, 'groups', groupId, 'expenses'), orderBy('date', 'desc')), (s) =>
    cb(
      s.docs.map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return { ...(data as GroupExpense), id: d.id, createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null };
      }),
    ),
  );
}

export async function saveGroupExpense(groupId: string, user: User, e: Omit<GroupExpense, 'id' | 'createdBy' | 'createdAt'> & { id?: string }) {
  const { id, ...data } = e;
  if (id) {
    await updateDoc(doc(db, 'groups', groupId, 'expenses', id), data);
    return id;
  }
  const ref = await addDoc(collection(db, 'groups', groupId, 'expenses'), { ...data, createdBy: user.uid, createdAt: serverTimestamp() });
  return ref.id;
}

export const deleteGroupExpense = (groupId: string, id: string) => deleteDoc(doc(db, 'groups', groupId, 'expenses', id));

// ───────────────────────── Shared photos ─────────────────────────
// A photo's details (small) and its picture (a ~200–600 KB JPEG as a data URL) are separate
// documents, so watching the list stays cheap and each picture downloads only once.

export interface SharedPhoto {
  id: string;
  takenAt: number;
  createdAt: number;
  lat?: number;
  lng?: number;
  place?: string;
  caption?: string;
  addedBy: string;
  name: string;
}

/** Firestore documents max out at 1 MB, so pictures are shrunk until they fit comfortably. */
async function sharedJpeg(blob: Blob): Promise<string | null> {
  for (const [dim, q] of [[1440, 0.75], [1200, 0.65], [960, 0.55]] as const) {
    const out = await compressImage(blob, dim, q);
    if (out.size <= 600_000) return blobToDataURL(out);
  }
  return null;
}

export function subscribePhotos(groupId: string, cb: (photos: SharedPhoto[], fromCache: boolean) => void) {
  return onSnapshot(collection(db, 'groups', groupId, 'photos'), (s) =>
    cb(
      s.docs.map((d) => ({ ...(d.data() as SharedPhoto), id: d.id })),
      s.metadata.fromCache,
    ),
  );
}

/** Adds one of your photos to the group. Returns false if it couldn't be made small enough. */
export async function uploadPhoto(groupId: string, user: User, p: Photo): Promise<boolean> {
  if (!p.blob) return false;
  const data = await sharedJpeg(p.blob);
  if (!data) return false;
  const meta: Omit<SharedPhoto, 'id'> = {
    takenAt: p.takenAt,
    createdAt: p.createdAt,
    lat: p.lat,
    lng: p.lng,
    place: p.place,
    caption: p.caption,
    addedBy: user.uid,
    name: displayName(user),
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'groups', groupId, 'photoData', p.id), { data, addedBy: user.uid });
  batch.set(doc(db, 'groups', groupId, 'photos', p.id), meta);
  await batch.commit();
  return true;
}

/** The picture itself, as a Blob (downloaded once, then kept in the local photo store). */
export async function downloadPhoto(groupId: string, id: string): Promise<Blob | null> {
  const s = await getDoc(doc(db, 'groups', groupId, 'photoData', id));
  const data = s.exists() ? (s.data().data as string | undefined) : undefined;
  return data ? dataURLToBlob(data) : null;
}

export async function deleteSharedPhoto(groupId: string, id: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'groups', groupId, 'photos', id));
  batch.delete(doc(db, 'groups', groupId, 'photoData', id));
  await batch.commit();
}

// ───────────────────────── Typing & read receipts ─────────────────────────
// groups/{id}/status/{uid} → { typingAt, readAt } (both server times, so everyone compares alike)

export interface MemberStatus {
  uid: string;
  typingAt: Date | null;
  readAt: Date | null;
}

export function subscribeStatus(groupId: string, cb: (s: MemberStatus[]) => void) {
  return onSnapshot(collection(db, 'groups', groupId, 'status'), (s) =>
    cb(
      s.docs.map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return { uid: d.id, typingAt: (data.typingAt as Timestamp | null)?.toDate() ?? null, readAt: (data.readAt as Timestamp | null)?.toDate() ?? null };
      }),
    ),
  );
}

export const setTyping = (groupId: string, user: User, typing: boolean) =>
  setDoc(doc(db, 'groups', groupId, 'status', user.uid), { typingAt: typing ? serverTimestamp() : null }, { merge: true }).catch(() => undefined);

export const markChatRead = (groupId: string, user: User) =>
  setDoc(doc(db, 'groups', groupId, 'status', user.uid), { readAt: serverTimestamp() }, { merge: true }).catch(() => undefined);

// ───────────────────────── Notifications ─────────────────────────

/** Remembers this phone's push address on your account, so friends' messages can reach it. */
export const savePushToken = (user: User, token: string) => setDoc(doc(db, 'users', user.uid), { tokens: arrayUnion(token) }, { merge: true });
export const removePushToken = (user: User, token: string) => setDoc(doc(db, 'users', user.uid), { tokens: arrayRemove(token) }, { merge: true });

/**
 * Asks the server (api/notify on Vercel) to alert the other members of a group.
 * Best effort: a missing server or key never blocks the chat.
 */
export async function pushToGroup(groupId: string, user: User, body: string) {
  try {
    const token = await user.getIdToken();
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupId, body }),
    });
  } catch {
    /* offline or not set up — the in-app badge still shows */
  }
}
