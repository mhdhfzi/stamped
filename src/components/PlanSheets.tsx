import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, MapPin, Search, Trash2 } from 'lucide-react';
import type { Stop, Trip } from '../types';
import { useStore } from '../store';
import { getCountry } from '../data/countries';
import { searchPlaces, type PlaceResult } from '../lib/geo';
import { addDays, cn, dayCount, fmtDate, fromDateInput, toDateInput } from '../lib/utils';
import { ConfirmSheet, Field, PrimaryButton, Sheet, inputClass } from './ui';

const MAX_DAYS = 60;

export const dayLabel = (start: string, day: number) =>
  fmtDate(fromDateInput(addDays(start, day)), { weekday: 'short', day: 'numeric', month: 'short' });

/** Pick the trip's start and end date. */
export function TripDatesSheet({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const { setTripDates, stopsOf, notify } = useStore();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (!open) return;
    const today = toDateInput(Date.now());
    setStart(trip.startDate ?? today);
    setEnd(trip.endDate ?? addDays(trip.startDate ?? today, 2));
  }, [open, trip.startDate, trip.endDate]);

  const valid = !!start && !!end && end >= start;
  const days = valid ? dayCount(start, end) : 0;
  const lastPlanned = Math.max(-1, ...stopsOf(trip.id).map((s) => s.day));
  const willMove = valid && lastPlanned >= days;

  return (
    <Sheet open={open} onClose={onClose} title="Trip dates">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || days > MAX_DAYS) return;
          await setTripDates(trip.id, start, end);
          notify(`${days} day${days === 1 ? '' : 's'} planned`);
          onClose();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day">
            <input
              type="date"
              required
              value={start}
              onChange={(e) => {
                const v = e.target.value;
                // Keep the trip length when moving the start date.
                if (v && start && end >= start) setEnd(addDays(v, dayCount(start, end) - 1));
                setStart(v);
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Last day">
            <input type="date" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <p className={cn('text-xs', days > MAX_DAYS || !valid ? 'text-red-400' : 'text-white/50')}>
          {!valid ? 'The last day must be on or after the first day.' : days > MAX_DAYS ? `Trips can be up to ${MAX_DAYS} days.` : `${days} day${days === 1 ? '' : 's'}`}
          {willMove && days <= MAX_DAYS && ' · places on later days will move to the last day'}
        </p>
        <PrimaryButton type="submit" disabled={!valid || days > MAX_DAYS}>Save dates</PrimaryButton>
      </form>
    </Sheet>
  );
}

/** Search OpenStreetMap for a place (a stop to visit, or the hotel). */
export function PlaceSearchSheet({ trip, title, open, onClose, onPick, hint, idle }: { trip: Trip; title: string; open: boolean; onClose: () => void; onPick: (r: PlaceResult) => void | Promise<void>; hint?: string; idle?: ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <PlaceSearch
        trip={trip}
        hint={hint}
        idle={idle}
        onPick={async (r) => {
          await onPick(r);
          onClose();
        }}
      />
    </Sheet>
  );
}

interface PlaceSearchProps {
  trip: Trip;
  onPick: (r: PlaceResult) => void | Promise<void>;
  hint?: string;
  placeholder?: string;
  /** Shown before the first search (e.g. shortcuts). */
  idle?: ReactNode;
  /** Optional per-result icon and trailing element. */
  icon?: (r: PlaceResult) => ReactNode;
  trailing?: (r: PlaceResult) => ReactNode;
}

/** Search box + results. Unmounting cancels any request in flight. */
export function PlaceSearch({ trip, onPick, hint, placeholder, idle, icon, trailing }: PlaceSearchProps) {
  const { stopsOf } = useStore();
  const country = getCountry(trip.countryCode);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anywhere, setAnywhere] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const near = [...stopsOf(trip.id), ...(trip.base ? [trip.base] : []), ...(trip.stays ?? []).map((x) => x.place)];

  async function run(query: string, everywhere: boolean) {
    if (!query.trim()) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchPlaces(query.trim(), everywhere ? undefined : trip.countryCode, everywhere ? [] : near, ac.signal));
    } catch {
      if (!ac.signal.aborted) setError(offlineAware('Search isn’t available right now. Try again in a moment.', 'search for places'));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q, anywhere);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder ?? `Search places in ${country.name}`}
            enterKeyHint="search"
            className={cn(inputClass, 'pl-10')}
          />
        </div>
        <button type="submit" disabled={!q.trim() || loading} className="rounded-xl bg-white text-black px-4 text-sm font-semibold disabled:opacity-40">
          Search
        </button>
      </form>
      <label className="mt-3 flex items-center gap-2 text-xs text-white/50">
        <input
          type="checkbox"
          checked={anywhere}
          onChange={(e) => {
            setAnywhere(e.target.checked);
            if (results) run(q, e.target.checked);
          }}
          className="accent-white"
        />
        Search outside {country.name} too
      </label>

      <div className="mt-4 min-h-[180px]">
        {loading && (
          <div className="flex justify-center pt-10 text-white/50">
            <Loader2 className="animate-spin" size={20} />
          </div>
        )}
        {!loading && error && <p className="text-sm text-red-400 text-center pt-8">{error}</p>}
        {!loading && !error && results?.length === 0 && (
          <p className="text-sm text-white/50 text-center pt-8">No places found. Try a different name{anywhere ? '' : ` or search outside ${country.name}`}.</p>
        )}
        {!loading && !error && !results && (idle ?? <p className="text-sm text-white/40 text-center pt-8 leading-relaxed">{hint ?? 'Try a landmark, museum, restaurant or neighbourhood.'}</p>)}
        {!loading && results && results.length > 0 && (
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onPick(r)} className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-white/5 active:bg-white/10">
                  <span className="text-white/50 shrink-0">{icon?.(r) ?? <MapPin size={18} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white truncate">{r.name}</span>
                    <span className="block text-xs text-white/40 truncate">{[r.kind, r.address].filter(Boolean).join(' · ')}</span>
                  </span>
                  {trailing?.(r)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-4 text-[10px] text-white/30 text-center">Search by OpenStreetMap Nominatim</p>
    </>
  );
}

export const offlineAware = (online: string, action: string) => (navigator.onLine ? online : `You’re offline. Connect to ${action}.`);

/** Edit a planned stop: time, note, day, or delete it. */
export function StopSheet({ trip, stop, onClose }: { trip: Trip; stop: Stop | null; onClose: () => void }) {
  const { updateStop, deleteStop, notify } = useStore();
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const days = trip.startDate && trip.endDate ? dayCount(trip.startDate, trip.endDate) : 1;

  useEffect(() => {
    if (stop) {
      setTime(stop.time ?? '');
      setNote(stop.note ?? '');
      setDay(stop.day);
      setConfirm(false);
    }
  }, [stop]);

  return (
    <>
      <Sheet open={!!stop && !confirm} onClose={onClose} title={stop?.name}>
        {stop && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await updateStop(stop.id, { time: time || undefined, note: note.trim() || undefined, day });
              notify(day !== stop.day ? `Moved to Day ${day + 1}` : 'Saved');
              onClose();
            }}
          >
            {stop.address && <p className="text-xs text-white/40 -mt-1">{stop.address}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Time">
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Day">
                <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={cn(inputClass, 'appearance-none')}>
                  {Array.from({ length: days }, (_, i) => (
                    <option key={i} value={i} className="bg-[#141417]">
                      Day {i + 1}{trip.startDate ? ` · ${dayLabel(trip.startDate, i)}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Note">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="Tickets, opening hours, what to eat…" className={cn(inputClass, 'resize-none')} />
            </Field>
            <PrimaryButton type="submit">Save</PrimaryButton>
            <button type="button" onClick={() => setConfirm(true)} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-400">
              <Trash2 size={16} /> Remove from plan
            </button>
          </form>
        )}
      </Sheet>
      <ConfirmSheet
        open={!!stop && confirm}
        onClose={() => setConfirm(false)}
        title={`Remove ${stop?.name ?? 'place'}?`}
        message="It will be taken off this day’s plan."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!stop) return;
          await deleteStop(stop.id);
          notify('Removed from plan');
          onClose();
        }}
      />
    </>
  );
}
