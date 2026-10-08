import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { displayName, useCloudUser } from '../../lib/cloud';
import { LoginScreen } from './LoginScreen';

const SEEN_KEY = 'stamped:welcomed';
const seen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode: they'll just see the welcome again next time */
  }
};

/**
 * Shows the welcome/sign-in screen on first launch (until you sign in or skip),
 * and whenever the app asks for it (`open`, e.g. Account → Sign in). Closes itself once signed in.
 */
export default function LoginGate({ open, onClose, onAuthResolved }: { open: boolean; onClose: () => void; onAuthResolved?: (name: string | null) => void }) {
  const user = useCloudUser();
  const { notify } = useStore();
  const [firstRun] = useState(() => !seen());
  const [dismissed, setDismissed] = useState(false);
  const prevUser = useRef(user);

  // Tell the launch splash who's here (once the saved session has been restored).
  const reported = useRef(false);
  useEffect(() => {
    if (user === undefined || reported.current) return;
    reported.current = true;
    onAuthResolved?.(user ? displayName(user) : null);
  }, [user, onAuthResolved]);

  useEffect(() => {
    if (prevUser.current === null && user) {
      markSeen();
      notify(`Welcome, ${displayName(user)} 👋`);
      onClose();
    }
    prevUser.current = user;
  }, [user, notify, onClose]);

  if (user === undefined || user) return null;
  const showFirstRun = firstRun && !dismissed;
  if (!open && !showFirstRun) return null;

  return (
    <LoginScreen
      onSkip={
        showFirstRun && !open
          ? () => {
              markSeen();
              setDismissed(true);
            }
          : undefined
      }
      onClose={open ? onClose : undefined}
    />
  );
}
