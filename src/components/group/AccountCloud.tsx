import { useState } from 'react';
import { Loader2, LogOut, UserPlus, Users } from 'lucide-react';
import { displayName, signOut, useCloudUser } from '../../lib/cloud';
import JoinTrip from './JoinTrip';
import { PushRow } from './PushControls';
import { useStore } from '../../store';
import { SheetRow } from '../ui';

/** Account → "Friends & sharing": sign in/out, join a trip with a code. */
export default function AccountCloud({ onOpenTrip, onSignIn }: { onOpenTrip: (id: string) => void; onSignIn: () => void }) {
  const user = useCloudUser();
  const { switchAccount, notify } = useStore();
  const [joinOpen, setJoinOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <section className="mt-8">
      <p className="text-white text-sm font-semibold mb-2">Friends & sharing</p>
      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-1">
        {user === undefined ? (
          <div className="py-4 flex justify-center text-white/40">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : user ? (
          <>
            <div className="px-4 py-3">
              <p className="text-sm text-white font-medium">{displayName(user)}</p>
              <p className="text-[11px] text-white/40">{user.email ?? 'Signed in'}</p>
            </div>
            <SheetRow icon={<UserPlus size={18} />} label="Join a trip with a code" onClick={() => setJoinOpen(true)} />
            <PushRow user={user} />
            <SheetRow
              icon={<LogOut size={18} />}
              label="Sign out"
              hint={signingOut ? '…' : undefined}
              onClick={async () => {
                if (signingOut) return;
                setSigningOut(true);
                try {
                  // This phone stops getting this account's chat notifications.
                  const push = await import('../../lib/push');
                  if ((await push.pushState()) === 'on') await push.disablePush(user).catch(() => undefined);
                  await signOut();
                  await switchAccount(null);
                  notify('Signed out — your trips come back when you sign in');
                  onSignIn();
                } finally {
                  setSigningOut(false);
                }
              }}
            />
          </>
        ) : (
          <SheetRow icon={<Users size={18} />} label="Sign in to travel with friends" hint="Chat, plan & split" onClick={onSignIn} />
        )}
      </div>
      {joinOpen && (
        <JoinTrip
          onClose={() => setJoinOpen(false)}
          onJoined={(id) => {
            setJoinOpen(false);
            onOpenTrip(id);
          }}
        />
      )}
    </section>
  );
}
