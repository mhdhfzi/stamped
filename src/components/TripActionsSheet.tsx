import { useEffect, useState } from 'react';
import { ArrowUpRight, Pencil, Plane, Stamp, Trash2 } from 'lucide-react';
import type { Trip } from '../types';
import { useStore } from '../store';
import { getCountry } from '../data/countries';
import { ConfirmSheet, Field, PrimaryButton, Sheet, SheetRow, inputClass } from './ui';

interface Props {
  trip: Trip | null;
  onClose: () => void;
  onOpen?: (id: string) => void;
  onDeleted?: () => void;
}

export function TripActionsSheet({ trip, onClose, onOpen, onDeleted }: Props) {
  const { updateTrip, deleteTrip, photosOf, notify } = useStore();
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (trip) {
      setMode('menu');
      setTitle(trip.title);
    }
  }, [trip]);

  const open = !!trip;
  const country = trip ? getCountry(trip.countryCode) : null;

  return (
    <>
      <Sheet open={open && mode !== 'delete'} onClose={onClose} title={mode === 'rename' ? 'Rename trip' : `${country?.flag ?? ''} ${trip?.title ?? ''}`}>
        {mode === 'menu' && trip && (
          <div className="space-y-1">
            {onOpen && <SheetRow icon={<ArrowUpRight size={18} />} label="Open trip" onClick={() => onOpen(trip.id)} />}
            <SheetRow icon={<Pencil size={18} />} label="Rename" onClick={() => setMode('rename')} />
            {!photosOf(trip.id).length &&
              (trip.planned ? (
                <SheetRow
                  icon={<Stamp size={18} />}
                  label="Mark as been there"
                  hint="Counts as a stamp"
                  onClick={async () => {
                    await updateTrip(trip.id, { planned: false });
                    notify(`${trip.title} added to your stamps`);
                    onClose();
                  }}
                />
              ) : (
                <SheetRow
                  icon={<Plane size={18} />}
                  label="Move to upcoming"
                  hint="Still planning it"
                  onClick={async () => {
                    await updateTrip(trip.id, { planned: true });
                    notify(`${trip.title} moved to upcoming`);
                    onClose();
                  }}
                />
              ))}
            <SheetRow icon={<Trash2 size={18} />} label="Delete trip" danger onClick={() => setMode('delete')} />
          </div>
        )}
        {mode === 'rename' && trip && (
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              await updateTrip(trip.id, { title: title.trim() || country!.name });
              notify('Trip renamed');
              onClose();
            }}
          >
            <Field label="Card title">
              <input autoFocus value={title} maxLength={24} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </Field>
            <PrimaryButton type="submit">Save</PrimaryButton>
          </form>
        )}
      </Sheet>
      <ConfirmSheet
        open={open && mode === 'delete'}
        onClose={onClose}
        title={`Delete ${trip?.title ?? 'trip'}?`}
        message={`This removes the trip and its ${trip ? photosOf(trip.id).length : 0} moments from this device. This can't be undone.`}
        confirmLabel="Delete trip"
        onConfirm={async () => {
          if (!trip) return;
          await deleteTrip(trip.id);
          notify('Trip deleted');
          onClose();
          onDeleted?.();
        }}
      />
    </>
  );
}
