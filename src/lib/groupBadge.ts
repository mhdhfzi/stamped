import { useSyncExternalStore } from 'react';

/**
 * Unread-chat badge state. Filled by the cloud sync (time of each group's newest message
 * from someone else); the read mark is a per-device convenience kept in localStorage.
 */
const latest = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

const readKey = (groupId: string) => `stamped:read:${groupId}`;

function lastRead(groupId: string): number {
  try {
    return Number(localStorage.getItem(readKey(groupId))) || 0;
  } catch {
    return 0;
  }
}

function notify() {
  version++;
  listeners.forEach((l) => l());
}

export function setLatestMessage(groupId: string, at: number) {
  if (latest.get(groupId) === at) return;
  latest.set(groupId, at);
  notify();
}

export function markRead(groupId: string) {
  try {
    localStorage.setItem(readKey(groupId), String(Date.now()));
  } catch {
    /* private mode: badge just won't persist */
  }
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True when someone else posted since you last opened the chat. */
export function useUnread(groupId: string | undefined): boolean {
  useSyncExternalStore(subscribe, () => version);
  return !!groupId && (latest.get(groupId) ?? 0) > lastRead(groupId);
}
