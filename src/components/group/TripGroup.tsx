import { useState } from 'react';
import { Images, Loader2, MessageCircle, Users, Wallet, MapPinned } from 'lucide-react';
import type { Trip } from '../../types';
import { useStore } from '../../store';
import { createGroup, useCloudUser } from '../../lib/cloud';
import { AuthPanel } from './AuthPanel';
import { GroupScreen } from './GroupScreen';
import { PrimaryButton, Sheet } from '../ui';

/** Entry point from a trip's header: sign in → share the trip → the group space. */
export default function TripGroup({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { stopsOf, updateTrip, homeCurrency, notify } = useStore();
  const user = useCloudUser();
  const [busy, setBusy] = useState(false);
  const [justShared, setJustShared] = useState(false);

  if (user === undefined) {
    return (
      <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center text-white/60">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (user && trip.groupId) return <GroupScreen trip={trip} user={user} onClose={onClose} initialTab={justShared ? 'members' : 'chat'} />;

  return (
    <Sheet open onClose={onClose} title={user ? `Share ${trip.title}` : 'Travel together'}>
      {!user ? (
        <AuthPanel reason="Sign in to share this trip with friends — plan together, chat, and split expenses." />
      ) : (
        <div className="space-y-4">
          <ul className="space-y-3 text-sm text-white/80">
            {(
              [
                [MapPinned, 'One shared plan', 'Everyone sees and edits the same days, places, hotels and dates — live.'],
                [MessageCircle, 'Group chat', 'Talk in the trip, and send “tomorrow we go to…” reminders.'],
                [Images, 'Shared photos', 'Everyone’s moments from the trip, on everyone’s phone.'],
                [Wallet, 'Split expenses', 'Log who paid, and see who owes whom.'],
              ] as const
            ).map(([Icon, title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="w-8 h-8 shrink-0 rounded-xl bg-white/[0.06] flex items-center justify-center">
                  <Icon size={16} className="text-amber-300" />
                </span>
                <span>
                  <span className="block font-semibold text-white">{title}</span>
                  <span className="block text-xs text-white/50">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-white/40">Your personal budget and packing list stay private.</p>
          <PrimaryButton
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const g = await createGroup(trip, stopsOf(trip.id), user, homeCurrency);
                await updateTrip(trip.id, { groupId: g.id });
                setJustShared(true);
                notify('Trip shared — invite your friends');
              } catch (e) {
                console.error(e);
                notify(navigator.onLine ? 'Couldn’t share the trip. Please try again.' : 'You’re offline — connect to share.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : (
              <span className="flex items-center justify-center gap-2">
                <Users size={16} /> Share with friends
              </span>
            )}
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  );
}
