import { useMemo, useState } from 'react';
import { Heart, Home, MapPin } from 'lucide-react';
import { useStore } from '../store';
import { getCountry } from '../data/countries';
import { photoSrc } from '../lib/photoSrc';
import { cn, fmtDate } from '../lib/utils';
import { EmptyState, TopBar } from '../components/ui';

interface Props {
  onOpenTrip: (id: string) => void;
  onOpenViewer: (ids: string[], index: number) => void;
}

export function FeedScreen({ onOpenTrip, onOpenViewer }: Props) {
  const { photos, trips, updatePhoto } = useStore();
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');

  const list = useMemo(
    () => photos.filter((p) => filter === 'all' || p.favorite).sort((a, b) => b.takenAt - a.takenAt),
    [photos, filter],
  );
  const ids = list.map((p) => p.id);
  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);

  return (
    <>
      <TopBar
        left={<span className="text-lg font-semibold text-white">Feed</span>}
        right={
          <div className="flex bg-white/[0.06] rounded-full p-0.5">
            {(['all', 'favorites'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={cn('px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors', filter === f ? 'bg-white text-black' : 'text-white/60')}>
                {f}
              </button>
            ))}
          </div>
        }
      />
      <div className="absolute inset-0 overflow-y-auto scrollbar-hide px-6 pt-28 pb-28 space-y-7">
        {list.map((p, i) => {
          const trip = tripById.get(p.tripId);
          if (!trip) return null;
          const c = getCountry(trip.countryCode);
          return (
            <article key={p.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-lg leading-none">{c.flag}</span>
                <button type="button" onClick={() => onOpenTrip(trip.id)} className="text-white text-sm font-semibold hover:underline">
                  {trip.title}
                </button>
                {p.place && (
                  <span className="text-white/40 text-xs flex items-center gap-0.5 truncate">
                    <MapPin size={11} /> {p.place}
                  </span>
                )}
                <span className="ml-auto text-white/40 text-xs shrink-0">{fmtDate(p.takenAt)}</span>
              </div>
              <div className="relative">
                <button type="button" onClick={() => onOpenViewer(ids, i)} className="block w-full rounded-2xl overflow-hidden aspect-[4/5] bg-white/5">
                  <img src={photoSrc(p)} alt={p.caption || trip.title} loading="lazy" className="w-full h-full object-cover" />
                </button>
                <button
                  type="button"
                  aria-label="Favourite"
                  onClick={() => updatePhoto(p.id, { favorite: !p.favorite })}
                  className="absolute bottom-3 right-3 w-9 h-9 liquid-glass rounded-full flex items-center justify-center text-white"
                >
                  <Heart size={18} className={cn(p.favorite && 'fill-rose-500 text-rose-500')} />
                </button>
              </div>
              {p.caption && <p className="text-white/80 text-sm mt-2.5 leading-relaxed">{p.caption}</p>}
            </article>
          );
        })}
        {!list.length && (
          <EmptyState
            icon={filter === 'favorites' ? <Heart size={24} /> : <Home size={24} />}
            title={filter === 'favorites' ? 'No favourites yet' : 'Your feed is empty'}
            body={filter === 'favorites' ? 'Tap the heart on any moment to keep it here.' : 'Moments you add to your trips show up here, newest first.'}
          />
        )}
      </div>
    </>
  );
}
