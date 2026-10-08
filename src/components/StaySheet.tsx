import { useEffect, useRef, useState } from 'react';
import { BedDouble, ChevronRight, MapPin, Trash2 } from 'lucide-react';
import type { HotelStay, Place, Trip } from '../types';
import { useStore } from '../store';
import { addDays, cn, fmtDate, fromDateInput, uid } from '../lib/utils';
import { HotelSheet } from './HotelSheet';
import { dayLabel } from './PlanSheets';
import { Field, PrimaryButton, Sheet, inputClass } from './ui';

export interface StayDraft {
  /** Present when editing an existing stay. */
  id?: string;
  place?: Place;
  from: number;
  to: number;
}

export const placeTitle = (p: Place) => (p.kind === 'area' ? `Around ${p.name}` : p.name);

/** Pick a hotel (or area) and the days you sleep there. */
export function StaySheet({ trip, days, draft, onClose, onSave, onRemove }: { trip: Trip; days: number; draft: StayDraft | null; onClose: () => void; onSave: (s: HotelStay) => void | Promise<void>; onRemove?: (id: string) => void | Promise<void> }) {
  const { stopsOf } = useStore();
  const [place, setPlace] = useState<Place | undefined>();
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [picking, setPicking] = useState(false);
  // The picker calls onChoose then onClose in the same tick, before `place` state updates.
  const chosen = useRef(false);

  useEffect(() => {
    if (!draft) return;
    setPlace(draft.place);
    setFrom(draft.from);
    setTo(draft.to);
    // A new stay starts with choosing the hotel.
    setPicking(!draft.place);
    chosen.current = !!draft.place;
  }, [draft]);

  const start = trip.startDate!;
  const nights = to - from + 1;
  const range = (a: number, b: number) =>
    a === b ? fmtDate(fromDateInput(addDays(start, a)), { day: 'numeric', month: 'short' }) : `${fmtDate(fromDateInput(addDays(start, a)), { day: 'numeric', month: 'short' })} – ${fmtDate(fromDateInput(addDays(start, b)), { day: 'numeric', month: 'short' })}`;
  const dayOptions = Array.from({ length: days }, (_, i) => (
    <option key={i} value={i} className="bg-[#141417]">
      Day {i + 1} · {dayLabel(start, i)}
    </option>
  ));

  return (
    <>
      <Sheet open={!!draft && !picking} onClose={onClose} title={draft?.id ? 'Edit stay' : 'Add a stay'}>
        {draft && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!place) return;
              await onSave({ id: draft.id ?? uid(), place, from, to });
              onClose();
            }}
          >
            <button type="button" onClick={() => setPicking(true)} className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-3 text-left active:bg-white/10">
              <span className="w-8 h-8 shrink-0 rounded-lg bg-amber-500 text-black flex items-center justify-center">
                {place?.kind === 'area' ? <MapPin size={16} /> : <BedDouble size={16} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white truncate">{place ? placeTitle(place) : 'Choose a hotel or area'}</span>
                <span className="block text-[11px] text-white/40 truncate">{place ? 'Tap to change' : 'Search a city, neighbourhood or hotel'}</span>
              </span>
              <ChevronRight size={16} className="text-white/40" />
            </button>

            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <select
                  value={from}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setFrom(v);
                    if (to < v) setTo(v);
                  }}
                  className={cn(inputClass, 'appearance-none')}
                >
                  {dayOptions}
                </select>
              </Field>
              <Field label="To">
                <select value={to} onChange={(e) => setTo(Number(e.target.value))} className={cn(inputClass, 'appearance-none')}>
                  {dayOptions.slice(from)}
                </select>
              </Field>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              {nights} night{nights === 1 ? '' : 's'} · you sleep here {range(from, to)}.
              {from > 0 && ' On Day ' + (from + 1) + ' the route goes from your previous hotel to this one.'}
            </p>

            <PrimaryButton type="submit" disabled={!place}>
              Save stay
            </PrimaryButton>
            {draft.id && onRemove && (
              <button
                type="button"
                onClick={async () => {
                  await onRemove(draft.id!);
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-400"
              >
                <Trash2 size={16} /> Remove this stay
              </button>
            )}
          </form>
        )}
      </Sheet>

      <HotelSheet
        trip={trip}
        open={!!draft && picking}
        title={draft ? `Where are you staying, Day ${from + 1}${to > from ? `–${to + 1}` : ''}?` : undefined}
        stops={stopsOf(trip.id).filter((s) => s.day >= from && s.day <= to)}
        current={place}
        onChoose={(p) => {
          chosen.current = true;
          setPlace(p);
        }}
        // Closing the picker on a brand-new stay with nothing chosen cancels the whole thing.
        onClose={() => (chosen.current ? setPicking(false) : onClose())}
      />
    </>
  );
}
