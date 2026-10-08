/**
 * Phone notifications for group chats (Firebase Cloud Messaging).
 * This device's push address ("token") is saved on your account; the server (api/notify.js)
 * sends to everyone else in the trip when someone posts. Loaded only with the cloud features.
 */
import { getApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import type { User } from 'firebase/auth';
import { removePushToken, savePushToken } from './cloud';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const ON_KEY = 'stamped:push';
const TOKEN_KEY = 'stamped:push-token';

export type PushState =
  /** The app hasn't been given its Web Push key yet (VITE_FIREBASE_VAPID_KEY). */
  | 'not-setup'
  /** iPhone/iPad in Safari: notifications only work from the Home Screen app. */
  | 'needs-install'
  | 'unsupported'
  /** You said no in the browser's prompt — only the phone's settings can undo that. */
  | 'blocked'
  | 'off'
  | 'on';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function store(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function pushState(): Promise<PushState> {
  if (!VAPID_KEY) return 'not-setup';
  if (isIOS() && !standalone()) return 'needs-install';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await isSupported().catch(() => false))) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && read(ON_KEY) === '1' ? 'on' : 'off';
}

/** The background script that shows notifications while the app is closed (public/sw.js; it also keeps the app offline). */
const worker = () => navigator.serviceWorker.register('/sw.js', { scope: '/' });

async function currentToken() {
  const reg = await worker();
  await navigator.serviceWorker.ready;
  return getToken(getMessaging(getApp()), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}

/** Asks permission (must be called from a tap) and registers this phone. */
export async function enablePush(user: User): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const token = await currentToken();
  await savePushToken(user, token);
  store(TOKEN_KEY, token);
  store(ON_KEY, '1');
  return 'on';
}

export async function disablePush(user: User): Promise<PushState> {
  const token = read(TOKEN_KEY);
  store(ON_KEY, '0');
  store(TOKEN_KEY, null);
  if (token) await removePushToken(user, token).catch(() => undefined);
  await deleteToken(getMessaging(getApp())).catch(() => undefined);
  return 'off';
}

/** On each launch: push addresses can change, so keep the saved one current (silently). */
export async function refreshPush(user: User) {
  if ((await pushState()) !== 'on') return;
  try {
    const token = await currentToken();
    const old = read(TOKEN_KEY);
    if (token === old) return;
    await savePushToken(user, token);
    if (old) await removePushToken(user, old).catch(() => undefined);
    store(TOKEN_KEY, token);
  } catch (e) {
    console.error('Notification refresh failed', e);
  }
}
