import { useEffect, useMemo, useRef, useState } from 'react';
import { BedDouble, ChevronLeft, ChevronRight, ExternalLink, Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import type { Place, Stop, Trip } from '../types';
import { getCountry } from '../data/countries';
import { areaRadius, fmtDistance, haversine, isStay, searchStays, stayLinks, type LatLng, type Stay } from '../lib/geo';
import { addDays, cn } from '../lib/utils';
import { PlaceSearch, offlineAware } from './PlanSheets';
import { StaysMap, stayColor } from './StaysMap';
import { ErrorBoundary, MapFallback, Sheet } from './ui';

interface Area extends LatLng {
  /** Shown as "Stay near …" and used as the base name. */
  name: string;
  radius: number;
}

const TYPE_LABEL: Record<string, string> = { hotel: 'Hotel', hostel: 'Hostel', guest_house: 'Guesthouse', apartment: 'Apartment', motel: 'Motel', chalet: 'Chalet' };
const FILTERS = [
  ['all', 'All'],
  ['hotel', 'Hotels'],
  ['hostel', 'Hostels'],
  ['guest_house', 'Guesthouses'],
] as const;

function stars(v?: string) {
  const n = parseInt(v ?? '', 10);
  return n >= 1 && n <= 5 ? '★'.repeat(n) : null;
}

interface HotelSheetProps {
  trip: Trip;
  open: boolean;
  onClose: () => void;
  onChoose: (p: Place) => void | Promise<void>;
  title?: string;
  /** Planned places for these nights — powers "Near your planned places". */
  stops: Stop[];
  /** The current choice: if it's an area, the sheet opens straight onto the places to stay there. */
  current?: Place;
}

/**
 * "Where are you staying?" — search an area (city / neighbourhood) to browse places to stay
 * on a map, use the area itself as your base, or pick a specific hotel by name.
 */
export function HotelSheet({ trip, open, onClose, onChoose, title = 'Where are you staying?', stops, current }: HotelSheetProps) {
  const [area, setArea] = useState<Area | null>(null);

  useEffect(() => {
    if (!open) return;
    setArea(current?.kind === 'area' ? { name: current.name.replace(/^Near /, ''), lat: current.lat, lng: current.lng, radius: 1500 } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function choose(p: Place) {
    await onChoose(p);
    onClose();
  }

  function nearPlan() {
    const c = { lat: stops.reduce((a, s) => a + s.lat, 0) / stops.length, lng: stops.reduce((a, s) => a + s.lng, 0) / stops.length };
    const far = Math.max(...stops.map((s) => haversine(c, s)));
    setArea({ ...c, name: 'your planned places', radius: Math.min(3000, Math.max(800, far * 0.6)) });
  }

  return (
    <Sheet open={open} onClose={onClose} title={area ? undefined : title}>
      {/* Kept mounted while browsing an area so going back keeps the results. */}
      <div className={area ? 'hidden' : ''}>
        <PlaceSearch
          trip={trip}
          placeholder="An area or hotel — e.g. Kyoto, Shinjuku"
          icon={(r) => (isStay(r) ? <BedDouble size={18} className="text-amber-400" /> : <MapPin size={18} />)}
          trailing={(r) =>
            isStay(r) ? (
              <span className="shrink-0 rounded-full bg-white text-black px-3 py-1 text-[11px] font-semibold">Choose</span>
            ) : (
              <span className="shrink-0 flex items-center text-[11px] text-white/50">
                Stays <ChevronRight size={14} />
              </span>
            )
          }
          onPick={(r) =>
            isStay(r)
              ? choose({ kind: 'stay', name: r.name, address: r.address, lat: r.lat, lng: r.lng })
              : setArea({ name: r.name, lat: r.lat, lng: r.lng, radius: areaRadius(r) })
          }
          idle={
            <div className="pt-2 space-y-3">
              {stops.length > 0 && (
                <button type="button" onClick={nearPlan} className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left active:bg-white/10">
                  <LocateFixed size={18} className="text-blue-400 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-white">Near your planned places</span>
                    <span className="block text-[11px] text-white/40">Places to stay around the {stops.length} places in your plan</span>
                  </span>
                  <ChevronRight size={16} className="text-white/40" />
                </button>
              )}
              <p className="text-sm text-white/40 text-center pt-4 leading-relaxed px-2">
                Search a <span className="text-white/70">city or neighbourhood</span> to see hotels, hostels and guesthouses there on a map — or search your hotel by name.
              </p>
            </div>
          }
        />
      </div>
      {area && <AreaStays trip={trip} area={area} onBack={() => setArea(null)} onClose={onClose} onChoose={choose} />}
    </Sheet>
  );
}

function AreaStays({ trip, area, onBack, onClose, onChoose }: { trip: Trip; area: Area; onBack: () => void; onClose: () => void; onChoose: (p: Place) => void }) {
  const country = getCountry(trip.countryCode);
  const [search, setSearch] = useState<{ center: LatLng; radius: number; moved: boolean }>({ center: area, radius: area.radius, moved: false });
  const [pending, setPending] = useState<{ center: LatLng; radius: number } | null>(null);
  const [stays, setStays] = useState<Stay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setStays([]);
    setSelected(null);
    searchStays(search.center, search.radius, (s) => !ac.signal.aborted && setStays(s), ac.signal)
      .catch(() => !ac.signal.aborted && setError(offlineAware('Couldn’t load places to stay. Try again in a moment.', 'find places to stay')))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: stays.length };
    stays.forEach((s) => (c[s.type] = (c[s.type] ?? 0) + 1));
    return c;
  }, [stays]);
  const shown = filter === 'all' ? stays : stays.filter((s) => s.type === filter);
  const label = area.name === 'your planned places' ? trip.title : area.name;
  const baseName = search.moved ? `Near ${label}` : label;
  const links = stayLinks(`${label}, ${country.name}`, trip.startDate, trip.endDate ? addDays(trip.endDate, 1) : undefined);

  return (
    <div>
      <div className="flex items-center gap-2 pt-1 pb-3">
        <button type="button" aria-label="Back to search" onClick={onBack} className="w-8 h-8 -ml-1 rounded-full flex items-center justify-center text-white/70 active:bg-white/10">
          <ChevronLeft size={20} />
        </button>
        <h3 className="flex-1 min-w-0 text-white text-base font-semibold truncate">Stay near {area.name}</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70">
          <X size={16} />
        </button>
      </div>

      <div className="relative h-[210px] rounded-2xl overflow-hidden border border-white/10">
        <ErrorBoundary fallback={<MapFallback />}>
          <StaysMap
            center={search.center}
            radius={search.radius}
            stays={shown}
            selectedId={selected}
            onSelect={(id) => {
              setSelected(id);
              rowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }}
            onMoved={(center, radius) => setPending({ center, radius })}
          />
        </ErrorBoundary>
        {pending && (
          <button
            type="button"
            onClick={() => {
              setSearch({ ...pending, moved: true });
              setPending(null);
            }}
            className="absolute top-2 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white text-black px-3.5 py-1.5 text-xs font-semibold shadow-lg flex items-center gap-1.5 active:scale-95"
          >
            <Search size={13} /> Search this area
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onChoose({ kind: 'area', name: baseName, lat: search.center.lat, lng: search.center.lng })}
        className="mt-3 w-full rounded-2xl bg-white/[0.06] px-4 py-3 flex items-center gap-3 text-left active:bg-white/10"
      >
        <MapPin size={18} className="text-amber-400 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-white truncate">Just use {baseName} as my base</span>
          <span className="block text-[11px] text-white/40">Haven’t booked yet? Plan from the area and pick a hotel later</span>
        </span>
      </button>

      <div className="-mx-6 px-6 mt-4 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {FILTERS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5', filter === k ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70')}
          >
            {k !== 'all' && <span className="w-2 h-2 rounded-full" style={{ background: stayColor(k) }} />}
            {l} {counts[k] ? <span className={filter === k ? 'text-black/50' : 'text-white/40'}>{counts[k]}</span> : null}
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-1">
        {shown.slice(0, 80).map((s) => (
          <li key={s.id} ref={(el) => (el ? rowRefs.current.set(s.id, el) : rowRefs.current.delete(s.id))}>
            <div className={cn('flex items-center gap-3 rounded-2xl pl-3 pr-2 py-2.5', selected === s.id ? 'bg-white/10' : '')}>
              <button type="button" onClick={() => setSelected(s.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stayColor(s.type) }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white truncate">{s.name}</span>
                  <span className="block text-[11px] text-white/40 truncate">
                    {[TYPE_LABEL[s.type] ?? s.kind, stars(s.stars), `${fmtDistance(s.distance)} from centre`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
              {s.website && (
                <a href={s.website} target="_blank" rel="noopener noreferrer" aria-label={`${s.name} website`} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-white/40 active:bg-white/10">
                  <ExternalLink size={14} />
                </a>
              )}
              <button
                type="button"
                onClick={() => onChoose({ kind: 'stay', name: s.name, address: s.address, lat: s.lat, lng: s.lng })}
                className="shrink-0 rounded-full bg-white text-black px-3 py-1.5 text-[11px] font-semibold active:scale-95"
              >
                Choose
              </button>
            </div>
          </li>
        ))}
      </ul>

      {loading && (
        <p className="py-4 flex items-center justify-center gap-2 text-xs text-white/50">
          <Loader2 size={14} className="animate-spin" /> Finding places to stay…
        </p>
      )}
      {!loading && error && <p className="py-6 text-center text-sm text-red-400">{error}</p>}
      {!loading && !error && !shown.length && (
        <p className="py-6 text-center text-sm text-white/50 leading-relaxed">
          No {filter === 'all' ? 'places to stay' : FILTERS.find((f) => f[0] === filter)![1].toLowerCase()} found here on OpenStreetMap. Move the map and tap “Search this area”, or try the sites below.
        </p>
      )}

      <div className="mt-4 rounded-2xl bg-white/[0.04] p-4">
        <p className="text-xs font-medium text-white/70">Airbnbs, prices & availability</p>
        <p className="text-[11px] text-white/40 mt-0.5">
          Opens a search for {label}
          {trip.startDate ? ' with your trip dates' : ''}.
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          {links.map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white flex items-center gap-1.5 active:bg-white/20">
              {l.label} <ExternalLink size={12} />
            </a>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[10px] text-white/30 text-center">Places to stay from OpenStreetMap — some may be missing</p>
    </div>
  );
}
