import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, ImageIcon, MapPin, Pencil, Share2, Trash2, X } from 'lucide-react';
import type { Photo } from '../types';
import { useStore } from '../store';
import { photoSrc } from '../lib/photoSrc';
import { cn, fmtDate, fromDateInput, toDateInput } from '../lib/utils';
import { getCountry } from '../data/countries';
import { photoDay, stopForPhoto } from '../lib/tripStatus';
import { ConfirmSheet, Field, GlassCircle, PrimaryButton, Sheet, inputClass } from './ui';

export function PhotoViewer({ ids, start, onClose }: { ids: string[]; start: number; onClose: () => void }) {
  const { photos, trips, stopsOf, updatePhoto, deletePhoto, updateTrip, notify } = useStore();
  const list = useMemo(() => ids.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as Photo[], [ids, photos]);
  const [i, setI] = useState(start);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const touchX = useRef<number | null>(null);

  const idx = Math.min(i, list.length - 1);
  const photo = list[idx];
  const trip = photo ? trips.find((t) => t.id === photo.tripId) : undefined;
  // Linked to the plan: which day it was taken on, and the planned place if it's geotagged nearby.
  const day = trip && photo ? photoDay(trip, photo) : null;
  const atStop = trip && photo ? stopForPhoto(trip, photo, stopsOf(trip.id)) : undefined;
  const place = photo?.place || atStop?.name;

  useEffect(() => {
    if (!list.length) onClose();
  }, [list.length, onClose]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (editing || confirmDel) return;
      if (e.key === 'ArrowRight') setI((v) => Math.min(list.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [list.length, onClose, editing, confirmDel]);

  if (!photo) return null;
  const country = trip ? getCountry(trip.countryCode) : null;
  const isCover = trip?.coverPhotoId === photo.id;

  async function share() {
    try {
      if (photo.blob) {
        const f = new File([photo.blob], 'moment.jpg', { type: photo.blob.type || 'image/jpeg' });
        if (navigator.canShare?.({ files: [f] })) {
          await navigator.share({ files: [f], title: trip?.title, text: photo.caption });
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: trip?.title, text: photo.caption || `A moment from ${trip?.title}`, url: photo.url });
        return;
      }
      notify('Sharing isn’t supported on this browser');
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-black flex flex-col animate-fade-in">
      <div className="absolute top-0 inset-x-0 z-10 px-5 pt-12 pb-6 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
        <GlassCircle label="Close" onClick={onClose}>
          <X size={18} />
        </GlassCircle>
        <span className="text-white/80 text-xs font-medium liquid-glass rounded-full px-3 py-1">
          {idx + 1} / {list.length}
        </span>
        <GlassCircle label={photo.favorite ? 'Unfavourite' : 'Favourite'} onClick={() => updatePhoto(photo.id, { favorite: !photo.favorite })}>
          <Heart size={18} className={cn(photo.favorite && 'fill-rose-500 text-rose-500')} />
        </GlassCircle>
      </div>

      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (dx < -50) setI(Math.min(list.length - 1, idx + 1));
          if (dx > 50) setI(Math.max(0, idx - 1));
          touchX.current = null;
        }}
      >
        <img key={photo.id} src={photoSrc(photo)} alt={photo.caption || trip?.title} className="max-w-full max-h-full object-contain animate-fade-in" draggable={false} />
        {idx > 0 && (
          <button type="button" aria-label="Previous" onClick={() => setI(idx - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white/80 flex items-center justify-center">
            <ChevronLeft size={20} />
          </button>
        )}
        {idx < list.length - 1 && (
          <button type="button" aria-label="Next" onClick={() => setI(idx + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white/80 flex items-center justify-center">
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      <div className="px-6 pt-4 pb-8 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="flex items-center gap-2 text-white text-sm font-semibold">
          <span className="text-lg leading-none">{country?.flag}</span>
          {trip?.title}
          <span className="text-white/40 font-normal text-xs ml-auto">
            {day != null && `Day ${day + 1} · `}
            {fmtDate(photo.takenAt)}
          </span>
        </div>
        {place && (
          <p className="flex items-center gap-1 text-white/50 text-xs mt-1">
            <MapPin size={12} /> {place}
          </p>
        )}
        {photo.caption && <p className="text-white/80 text-sm mt-2 leading-relaxed">{photo.caption}</p>}
        <div className="flex justify-around mt-5">
          <ViewerAction icon={<Pencil size={18} />} label="Edit" onClick={() => setEditing(true)} />
          <ViewerAction
            icon={<ImageIcon size={18} />}
            label={isCover ? 'Cover ✓' : 'Set cover'}
            onClick={async () => {
              if (!trip) return;
              await updateTrip(trip.id, { coverPhotoId: photo.id });
              notify('Cover updated');
            }}
          />
          <ViewerAction icon={<Share2 size={18} />} label="Share" onClick={share} />
          <ViewerAction icon={<Trash2 size={18} />} label="Delete" danger onClick={() => setConfirmDel(true)} />
        </div>
      </div>

      <EditPhotoSheet photo={editing ? photo : null} onClose={() => setEditing(false)} />
      <ConfirmSheet
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete this moment?"
        message="The photo will be removed from this device."
        confirmLabel="Delete"
        onConfirm={async () => {
          setConfirmDel(false);
          await deletePhoto(photo.id);
          notify('Moment deleted');
        }}
      />
    </div>
  );
}

function ViewerAction({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex flex-col items-center gap-1 text-[10px] font-medium', danger ? 'text-red-400' : 'text-white/70')}>
      <span className="w-11 h-11 rounded-full liquid-glass flex items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}

export function EditPhotoSheet({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  const { updatePhoto, notify } = useStore();
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (photo) {
      setCaption(photo.caption ?? '');
      setPlace(photo.place ?? '');
      setDate(toDateInput(photo.takenAt));
    }
  }, [photo]);

  return (
    <Sheet open={!!photo} onClose={onClose} title="Edit moment">
      {photo && (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await updatePhoto(photo.id, { caption: caption.trim() || undefined, place: place.trim() || undefined, takenAt: date ? fromDateInput(date) : photo.takenAt });
            notify('Moment saved');
            onClose();
          }}
        >
          <Field label="Caption">
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} maxLength={280} placeholder="What happened here?" className={inputClass + ' resize-none'} />
          </Field>
          <Field label="Place">
            <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={60} placeholder="e.g. Shibuya Crossing" className={inputClass} />
          </Field>
          <Field label="Date taken">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <PrimaryButton type="submit">Save</PrimaryButton>
        </form>
      )}
    </Sheet>
  );
}
