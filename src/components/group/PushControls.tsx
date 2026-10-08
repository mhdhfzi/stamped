import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Bell, BellOff, BellRing, X } from 'lucide-react';
import { disablePush, enablePush, pushState, type PushState } from '../../lib/push';
import { useStore } from '../../store';
import { SheetRow } from '../ui';

const HINT: Record<PushState, string> = {
  'not-setup': 'Not set up yet',
  'needs-install': 'Add to Home Screen first',
  unsupported: 'Not supported here',
  blocked: 'Blocked in settings',
  off: 'Off',
  on: 'On',
};

/** This device's notification state, plus turning it on/off (from a tap). */
function usePush(user: User) {
  const { notify } = useStore();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState().then(setState);
  }, []);

  async function toggle() {
    if (!state || busy) return;
    if (state === 'needs-install') return notify('On iPhone: tap Share → Add to Home Screen, then open Stamped from there');
    if (state === 'blocked') return notify('Notifications are blocked — allow them for Stamped in your phone’s settings');
    if (state === 'unsupported') return notify('This browser can’t show notifications');
    if (state === 'not-setup') return notify('Notifications aren’t set up for this app yet');
    setBusy(true);
    try {
      const next = state === 'on' ? await disablePush(user) : await enablePush(user);
      setState(next);
      notify(next === 'on' ? 'Notifications on 🔔' : next === 'blocked' ? 'Notifications blocked' : 'Notifications off');
    } catch (e) {
      console.error(e);
      notify('Couldn’t turn on notifications — try again');
    } finally {
      setBusy(false);
    }
  }
  return { state, busy, toggle };
}

/** Account → Friends & sharing → Notifications. */
export function PushRow({ user }: { user: User }) {
  const { state, busy, toggle } = usePush(user);
  if (!state) return null;
  return <SheetRow icon={state === 'on' ? <BellRing size={18} /> : state === 'off' ? <Bell size={18} /> : <BellOff size={18} />} label="Chat notifications" hint={busy ? '…' : HINT[state]} onClick={toggle} />;
}

/** In a group chat: a one-tap "turn on notifications" banner until you do (or dismiss it). */
export function PushBanner({ user }: { user: User }) {
  const { state, busy, toggle } = usePush(user);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('stamped:push-banner') === 'hidden';
    } catch {
      return false;
    }
  });
  if (hidden || !state || state === 'on' || state === 'not-setup' || state === 'unsupported') return null;
  const text = state === 'needs-install' ? 'Add Stamped to your Home Screen to get chat notifications' : state === 'blocked' ? 'Notifications are blocked for Stamped' : 'Get notified when your friends message';
  return (
    <div className="mx-4 mt-3 rounded-2xl bg-amber-400/10 border border-amber-400/25 pl-3 pr-1.5 py-2 flex items-center gap-2.5">
      <BellRing size={16} className="text-amber-300 shrink-0" />
      <p className="flex-1 text-xs text-white/80">{text}</p>
      {state === 'off' && (
        <button type="button" disabled={busy} onClick={toggle} className="rounded-full bg-white text-black px-3 py-1.5 text-[11px] font-semibold active:scale-95 disabled:opacity-50">
          Turn on
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem('stamped:push-banner', 'hidden');
          } catch {
            /* fine */
          }
        }}
        className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 active:bg-white/10"
      >
        <X size={14} />
      </button>
    </div>
  );
}
