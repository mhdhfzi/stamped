import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { JoinError, joinGroup, useCloudUser } from '../../lib/cloud';
import { toDateInput } from '../../lib/utils';
import { AuthPanel } from './AuthPanel';
import { Field, PrimaryButton, Sheet, inputClass } from '../ui';

/** Join a friend's trip with an invite code (or link): adds the trip here, linked to the group. */
export default function JoinTrip({ initialCode = '', onClose, onJoined }: { initialCode?: string; onClose: () => void; onJoined: (tripId: string) => void }) {
  const { trips, addTrip, updateTrip, stopsOf, photosOf, notify } = useStore();
  const user = useCloudUser();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const g = await joinGroup(code, user);
      const existing = trips.find((t) => t.groupId === g.id);
      if (existing) {
        onJoined(existing.id);
        return;
      }
      const title = g.trip.title || g.name;
      const shared = { groupId: g.id, startDate: g.trip.startDate, endDate: g.trip.endDate, stays: g.trip.stays, travelMode: g.trip.travelMode };
      // An earlier join that didn't link up left an empty planned copy of this trip: link that one instead of adding another.
      const orphan = trips.find((t) => !t.groupId && t.planned && t.countryCode === g.countryCode && t.title === title && !stopsOf(t.id).length && !photosOf(t.id).length);
      if (orphan) {
        await updateTrip(orphan.id, shared);
        notify(`You joined ${title} 🎉`);
        onJoined(orphan.id);
        return;
      }
      const upcoming = !g.trip.endDate || g.trip.endDate >= toDateInput(Date.now());
      // One write: the new trip is linked to the group (and gets its dates) from the start.
      const t = await addTrip(g.countryCode, title, upcoming, shared);
      notify(`You joined ${title} 🎉`);
      onJoined(t.id);
    } catch (e) {
      setError(e instanceof JoinError ? e.message : navigator.onLine ? 'Couldn’t join right now. Please try again.' : 'You’re offline — connect to join.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Join a friend’s trip">
      {user === undefined ? (
        <div className="py-10 flex justify-center text-white/50">
          <Loader2 className="animate-spin" />
        </div>
      ) : !user ? (
        <AuthPanel reason="Sign in to join the trip — you’ll share the plan, the group chat and expenses." />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <Field label="Invite code">
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. K7P2QX"
              maxLength={8}
              autoCapitalize="characters"
              className={`${inputClass} text-center text-2xl font-bold tracking-[0.3em] uppercase`}
            />
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <PrimaryButton type="submit" disabled={busy || code.trim().length < 6}>
            {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Join trip'}
          </PrimaryButton>
        </form>
      )}
    </Sheet>
  );
}
