import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Loader2, MapPin, Plus, RefreshCw, Sparkles } from 'lucide-react';
import type { Stop } from '../types';
import { fmtDistance, haversine, type LatLng } from '../lib/geo';
import { POPULAR_CATEGORIES, popularNear, type Attraction, type PopularCategory } from '../lib/popular';
import { cn } from '../lib/utils';

/** A city/area the trip covers (from its hotels, its plan, or its title). */
export interface TripArea extends LatLng {
  name: string;
}

const CATEGORY_LABEL = new Map(POPULAR_CATEGORIES.map((c) => [c.id, c.label]));

export function usePopular(area: TripArea | null) {
  const [items, setItems] = useState<Attraction[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!area) return;
    const ac = new AbortController();
    setItems(null);
    setError(false);
    popularNear(area, 12, ac.signal)
      .then((r) => setItems(r))
      .catch(() => !ac.signal.aborted && setError(true));
    return () => ac.abort();
  }, [area?.lat, area?.lng, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, error, retry: () => setAttempt((n) => n + 1) };
}

/** The day a place is already planned on (same name, or within 200 m), if any. */
export function plannedDay(a: Attraction, stops: Stop[]): number | null {
  const name = a.name.toLowerCase();
  const s = stops.find((x) => x.name.toLowerCase() === name || haversine(x, a) < 200);
  return s ? s.day : null;
}

function Thumb({ a, className }: { a: Attraction; className: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('bg-white/[0.06] overflow-hidden flex items-center justify-center', className)}>
      {a.image && !failed ? (
        <img src={a.image} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <MapPin size={18} className="text-white/30" />
      )}
    </div>
  );
}

function AddButton({ day, onAdd, name, compact }: { day: number | null; onAdd: () => void; name: string; compact?: boolean }) {
  if (day != null) {
    return (
      <span className={cn('shrink-0 rounded-full bg-green-500/15 text-green-300 font-semibold flex items-center gap-1', compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]')}>
        <Check size={compact ? 11 : 12} /> Day {day + 1}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Add ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      className={cn('shrink-0 rounded-full bg-white text-black font-semibold flex items-center gap-1 active:scale-95', compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]')}
    >
      <Plus size={compact ? 11 : 12} /> Add
    </button>
  );
}

function Status({ area, items, error, retry }: { area: TripArea; items: Attraction[] | null; error: boolean; retry: () => void }) {
  if (error) {
    return (
      <div className="py-4 text-center text-xs text-white/50">
        {navigator.onLine ? 'Couldn’t load popular places right now.' : 'You’re offline — popular places need a connection the first time.'}
        <button type="button" onClick={retry} className="ml-2 inline-flex items-center gap-1 text-white font-medium">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }
  if (!items) {
    return (
      <p className="py-4 flex items-center justify-center gap-2 text-xs text-white/50">
        <Loader2 size={14} className="animate-spin" /> Finding popular places near {area.name}… (first time can take ~20 s)
      </p>
    );
  }
  return null;
}

/** Horizontal strip of the most popular places near the day's area, not yet in the plan. */
export function PopularCarousel({ area, stops, day, onAdd, onSeeAll }: { area: TripArea; stops: Stop[]; day: number; onAdd: (a: Attraction) => void; onSeeAll: () => void }) {
  const { items, error, retry } = usePopular(area);
  const shown = useMemo(() => (items ?? []).filter((a) => plannedDay(a, stops) == null).slice(0, 12), [items, stops]);

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/40 flex items-center gap-1.5">
          <Sparkles size={12} /> Popular near {area.name}
        </h4>
        <button type="button" onClick={onSeeAll} className="text-[11px] font-medium text-white/60 flex items-center active:opacity-70">
          See all <ChevronRight size={13} />
        </button>
      </div>
      <Status area={area} items={items} error={error} retry={retry} />
      {items && (
        <div className="-mx-6 px-6 flex gap-2 overflow-x-auto scrollbar-hide">
          {shown.map((a) => (
            <div key={a.id} className="reveal w-36 shrink-0 rounded-2xl bg-white/[0.04] overflow-hidden">
              <Thumb a={a} className="h-20 w-full" />
              <div className="p-2.5">
                <p className="text-xs font-semibold text-white leading-snug line-clamp-2 min-h-[2.1rem]">{a.name}</p>
                <p className="text-[10px] text-white/40 truncate mt-0.5">{CATEGORY_LABEL.get(a.category)}</p>
                <div className="mt-2">
                  <AddButton day={null} name={`${a.name} to Day ${day + 1}`} onAdd={() => onAdd(a)} compact />
                </div>
              </div>
            </div>
          ))}
          {!shown.length && <p className="text-xs text-white/40 py-3">You’ve added all the top places here — see all for more.</p>}
        </div>
      )}
    </section>
  );
}

/** Full list for the "Add a place" sheet: area chips, category filters, add buttons. */
export function PopularList({ areas, initialArea, stops, onAdd }: { areas: TripArea[]; initialArea: number; stops: Stop[]; onAdd: (a: Attraction) => void }) {
  const [areaIdx, setAreaIdx] = useState(initialArea);
  const area = areas[Math.min(areaIdx, areas.length - 1)] ?? null;
  const { items, error, retry } = usePopular(area);
  const [cat, setCat] = useState<PopularCategory | 'all'>('all');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    (items ?? []).forEach((a) => m.set(a.category, (m.get(a.category) ?? 0) + 1));
    return m;
  }, [items]);
  const shown = (items ?? []).filter((a) => cat === 'all' || a.category === cat).slice(0, 60);

  if (!area) return null;
  return (
    <div className="pt-1">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40 flex items-center gap-1.5 mb-2">
        <Sparkles size={12} /> Popular places
      </p>
      {areas.length > 1 && (
        <div className="-mx-6 px-6 flex gap-1.5 overflow-x-auto scrollbar-hide mb-2">
          {areas.map((a, i) => (
            <button
              key={a.name + i}
              type="button"
              onClick={() => {
                setAreaIdx(i);
                setCat('all');
              }}
              className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1', i === areaIdx ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70')}
            >
              <MapPin size={11} /> {a.name}
            </button>
          ))}
        </div>
      )}
      {items && items.length > 0 && (
        <div className="-mx-6 px-6 flex gap-1.5 overflow-x-auto scrollbar-hide mb-3">
          {[{ id: 'all' as const, label: 'All' }, ...POPULAR_CATEGORIES.filter((c) => counts.get(c.id))].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={cn('shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold', cat === c.id ? 'bg-white/90 text-black' : 'bg-white/[0.06] text-white/60')}
            >
              {c.label}
              <span className={cat === c.id ? 'text-black/50' : 'text-white/35'}> {c.id === 'all' ? items.length : counts.get(c.id)}</span>
            </button>
          ))}
        </div>
      )}
      <Status area={area} items={items} error={error} retry={retry} />
      <ul className="space-y-1">
        {shown.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
            <Thumb a={a} className="w-14 h-14 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{a.name}</p>
              <p className="text-[11px] text-white/40 truncate">{a.description || CATEGORY_LABEL.get(a.category)}</p>
              <p className="text-[10px] text-white/30">
                {CATEGORY_LABEL.get(a.category)} · {fmtDistance(a.distance)} from {area.name}
              </p>
            </div>
            <AddButton day={plannedDay(a, stops)} name={a.name} onAdd={() => onAdd(a)} />
          </li>
        ))}
      </ul>
      {items && <p className="mt-3 text-[10px] text-white/30 text-center">Ranked by fame across Wikipedia · data from Wikidata</p>}
    </div>
  );
}
