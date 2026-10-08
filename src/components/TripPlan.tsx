import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BedDouble, CalendarDays, Camera, Car, Check, ChevronDown, ChevronRight, ChevronUp, Footprints, Loader2, MapPin, Navigation, Plus, Sparkles, TrainFront, Wand2 } from 'lucide-react';
import type { HotelStay, Photo, Place, Stop, TravelMode, Trip } from '../types';
import { useStore } from '../store';
import { GOOGLE_MAPS_MAX_POINTS, fmtDistance, fmtDuration, getRoute, googleMapsUrl, haversine, searchPlaces, type Route } from '../lib/geo';
import type { Attraction } from '../lib/popular';
import { bestOrder, pathCost, splitByStays, travelMatrix } from '../lib/optimize';
import { dayEnds, firstGap, samePlace, stayBlocks, suggestNights, upsertStay } from '../lib/stays';
import { photoDay, stopForPhoto } from '../lib/tripStatus';
import { photoSrc } from '../lib/photoSrc';
import { addDays, cn, dayCount, fmtDate, fromDateInput, plural, uid } from '../lib/utils';
import { DayMap } from './DayMap';
import { HotelSheet } from './HotelSheet';
import { PlaceSearchSheet, StopSheet, TripDatesSheet, dayLabel } from './PlanSheets';
import { StaySheet, placeTitle, type StayDraft } from './StaySheet';
import { PopularCarousel, PopularList, type TripArea } from './PopularPlaces';
import { ConfirmSheet, EmptyState, ErrorBoundary, MapFallback } from './ui';

type Layout = Pick<Stop, 'id' | 'day' | 'order'>[];

const snapshot = (stops: Stop[]): Layout => stops.map(({ id, day, order }) => ({ id, day, order }));

/** Stops followed by the distinct hotels, for a travel matrix; `index` maps a hotel to its row. */
function withPlaces(stops: Stop[], places: (Place | undefined)[]) {
  const extra: Place[] = [];
  for (const p of places) if (p && !extra.some((e) => samePlace(e, p))) extra.push(p);
  const points = [...stops, ...extra];
  const index = (p?: Place) => {
    if (!p) return undefined;
    const i = extra.findIndex((e) => samePlace(e, p));
    return i < 0 ? undefined : stops.length + i;
  };
  return { points, index };
}

export function TripPlan({ trip, onOpenViewer }: { trip: Trip; onOpenViewer: (ids: string[], index: number) => void }) {
  const { stopsOf, photosOf, addStop, updateTrip, updateStop, reorderDay, arrangeStops, notify } = useStore();
  const [day, setDay] = useState(0);
  const [datesOpen, setDatesOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [firstHotelOpen, setFirstHotelOpen] = useState(false);
  const [stayDraft, setStayDraft] = useState<StayDraft | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [editing, setEditing] = useState<Stop | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);
  const [busy, setBusy] = useState<'optimise' | 'split' | null>(null);
  const [undo, setUndo] = useState<{ message: string; layout: Layout } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const mode: TravelMode = trip.travelMode ?? 'foot';
  const days = trip.startDate && trip.endDate ? dayCount(trip.startDate, trip.endDate) : 0;
  const blocks = useMemo(() => stayBlocks(trip, days), [trip, days]);
  // This day starts where you slept last night and ends where you sleep tonight.
  const ends = dayEnds(blocks, day);
  const all = stopsOf(trip.id);
  const dayStops = useMemo(() => all.filter((s) => s.day === day), [all, day]);
  // Moments taken on this plan day, and geotagged ones matched to the planned place they were taken at.
  const tripPhotos = photosOf(trip.id);
  const dayPhotos = useMemo(() => tripPhotos.filter((p) => photoDay(trip, p) === day), [tripPhotos, trip, day]);

  // Areas the trip covers, for "Popular near …": each hotel/area stayed at; else the planned places; else the trip's title geocoded.
  const [titleArea, setTitleArea] = useState<TripArea | null>(null);
  const areas = useMemo(() => {
    const out: TripArea[] = [];
    const push = (a: TripArea) => !out.some((o) => haversine(o, a) < 8000) && out.push(a);
    blocks.forEach((b) => push({ name: b.place.kind === 'area' ? b.place.name.replace(/^Near /, '') : b.place.name, lat: b.place.lat, lng: b.place.lng }));
    if (!out.length && all.length) {
      const pts = dayStops.length ? dayStops : all;
      push({ name: trip.title, lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length });
    }
    if (!out.length && titleArea) out.push(titleArea);
    return out;
  }, [blocks, all, dayStops, trip.title, titleArea]);
  useEffect(() => {
    if (areas.length || titleArea || !days) return;
    const ac = new AbortController();
    searchPlaces(trip.title, trip.countryCode, [], ac.signal)
      .then((r) => r[0] && setTitleArea({ name: trip.title, lat: r[0].lat, lng: r[0].lng }))
      .catch(() => undefined);
    return () => ac.abort();
  }, [areas.length, titleArea, days, trip.title, trip.countryCode]);
  // The area for this day: nearest to tonight's hotel, else to the day's places.
  const dayAreaIdx = useMemo(() => {
    const ref = ends.end ?? ends.start ?? dayStops[0];
    if (!ref || areas.length < 2) return 0;
    let best = 0;
    areas.forEach((a, i) => haversine(a, ref) < haversine(areas[best], ref) && (best = i));
    return best;
  }, [areas, ends.end, ends.start, dayStops]);

  async function addPopular(a: Attraction) {
    await addStop({ tripId: trip.id, day, name: a.name, address: a.description, lat: a.lat, lng: a.lng });
    notify(`Added ${a.name} to Day ${day + 1}`);
  }
  const photosByStop = useMemo(() => {
    const m = new Map<string, Photo[]>();
    for (const p of dayPhotos) {
      const st = stopForPhoto(trip, p, all);
      if (st) m.set(st.id, [...(m.get(st.id) ?? []), p]);
    }
    return m;
  }, [dayPhotos, trip, all]);
  const countByDay = useMemo(() => {
    const m = new Map<number, number>();
    all.forEach((s) => m.set(s.day, (m.get(s.day) ?? 0) + 1));
    return m;
  }, [all]);

  useEffect(() => {
    if (days && day >= days) setDay(days - 1);
  }, [days, day]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 12000);
    return () => clearTimeout(t);
  }, [undo]);

  // Fetch the route whenever the day's places, their order, the hotels or the travel mode change.
  const routePoints = useMemo(
    () => (dayStops.length ? [...(ends.start ? [ends.start] : []), ...dayStops, ...(ends.end ? [ends.end] : [])] : []),
    [dayStops, ends.start, ends.end],
  );
  const routeKey = mode + routePoints.map((s) => `${s.lat},${s.lng}`).join(';');
  useEffect(() => {
    if (routePoints.length < 2) {
      setRoute(null);
      return;
    }
    const ac = new AbortController();
    setRouting(true);
    getRoute(routePoints, mode, ac.signal)
      .then((r) => setRoute(r))
      .catch(() => undefined)
      .finally(() => !ac.signal.aborted && setRouting(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  function move(index: number, dir: -1 | 1) {
    const ids = dayStops.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorderDay(trip.id, day, ids);
  }

  function selectFromMap(id: string) {
    setSelectedId(id);
    rowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Best order for this day. Ticked-off places stay first; the rest continue from the last one visited. */
  async function optimiseDay() {
    const done = dayStops.filter((s) => s.done);
    const todo = dayStops.filter((s) => !s.done);
    if (todo.length < 2) {
      notify(todo.length ? 'Nothing to reorder yet' : 'Add at least 2 places first');
      return;
    }
    setBusy('optimise');
    try {
      const { points, index } = withPlaces(dayStops, [ends.start, ends.end]);
      const [from, to] = [index(ends.start), index(ends.end)];
      const { m } = await travelMatrix(points, mode);
      const idx = (s: Stop) => dayStops.indexOf(s);
      const doneIdx = done.map(idx);
      const start = doneIdx.length ? doneIdx[doneIdx.length - 1] : from;
      const order = [...doneIdx, ...bestOrder(todo.map(idx), m, { start, end: to })];
      const before = pathCost(dayStops.map(idx), m, { start: from, end: to });
      const after = pathCost(order, m, { start: from, end: to });
      if (before - after < 30) {
        notify('Already in the best order');
        return;
      }
      const prev = snapshot(dayStops);
      await arrangeStops(order.map((i, o) => ({ id: dayStops[i].id, day, order: o })));
      setUndo({ message: `Saves about ${fmtDuration(before - after)} of ${mode === 'car' ? 'driving' : 'walking'}`, layout: prev });
    } catch {
      notify('Couldn’t optimise right now');
    } finally {
      setBusy(null);
    }
  }

  /** Groups nearby places into the same day and orders each day. Ticked-off places stay put. */
  async function splitAcrossDays() {
    setSplitOpen(false);
    const movable = all.filter((s) => !s.done);
    if (movable.length < 2) return;
    setBusy('split');
    try {
      const nights = Array.from({ length: days }, (_, d) => dayEnds(blocks, d).end);
      const { points, index } = withPlaces(movable, nights);
      const { m } = await travelMatrix(points, mode);
      const groups = splitByStays(movable.map((_, i) => i), nights.map(index), m, points);
      const layout: Layout = [];
      for (let d = 0; d < days; d++) {
        const kept = all.filter((s) => s.done && s.day === d);
        kept.forEach((s, o) => layout.push({ id: s.id, day: d, order: o }));
        (groups[d] ?? []).forEach((i, o) => layout.push({ id: movable[i].id, day: d, order: kept.length + o }));
      }
      const prev = snapshot(all);
      await arrangeStops(layout);
      setUndo({ message: `Arranged ${movable.length} places across ${days} days`, layout: prev });
      setSelectedId(null);
    } catch {
      notify('Couldn’t arrange right now');
    } finally {
      setBusy(null);
    }
  }

  function openGoogleMaps() {
    const todo = dayStops.filter((s) => !s.done);
    const stops = todo.length ? todo : dayStops;
    const points = [...(ends.start ? [ends.start] : []), ...stops, ...(ends.end ? [ends.end] : [])];
    if (points.length > GOOGLE_MAPS_MAX_POINTS) notify(`Google Maps takes ${GOOGLE_MAPS_MAX_POINTS} stops at most — the rest are left off`);
    window.open(googleMapsUrl(points, mode), '_blank', 'noopener');
  }

  if (!days) {
    return (
      <>
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="Plan your days"
          body={`Set your travel dates, then add the places you want to see in ${trip.title} for each day — with the route on a map.`}
          action={
            <button type="button" onClick={() => setDatesOpen(true)} className="w-full rounded-full bg-white text-black py-3 text-sm font-semibold active:scale-[0.98]">
              Set trip dates
            </button>
          }
        />
        <TripDatesSheet trip={trip} open={datesOpen} onClose={() => setDatesOpen(false)} />
      </>
    );
  }

  const start = trip.startDate!;
  const modeWord = mode === 'car' ? 'driving' : 'walking';
  const ModeIcon = mode === 'car' ? Car : Footprints;
  // With hotels, route legs are: hotel→1, 1→2, …, last→hotel.
  const legAfter = (i: number) => route?.legs[ends.start ? i + 1 : i];
  const movableCount = all.filter((s) => !s.done).length;
  const gap = blocks.length ? firstGap(blocks, days) : null;
  const shortRange = (a: number, b: number) =>
    `${fmtDate(fromDateInput(addDays(start, a)), { day: 'numeric', month: 'short' })}${b > a ? ` – ${fmtDate(fromDateInput(addDays(start, b)), { day: 'numeric', month: 'short' })}` : ''}`;
  // A hotel far from every place planned on its days usually means the wrong city.
  const farFrom = (b: HotelStay) => {
    const near = all.filter((s) => s.day >= b.from && s.day <= b.to);
    const d = near.length ? Math.min(...near.map((s) => haversine(b.place, s))) : 0;
    return d > 30_000 ? d : 0;
  };
  const saveStays = (next: HotelStay[]) => updateTrip(trip.id, { stays: next, base: undefined });

  const legRow = (leg?: { distance: number; duration: number }, label?: string) =>
    leg ? (
      <p className="pl-[22px] py-1.5 text-[10px] text-white/35 flex items-center gap-1.5">
        <span className="h-3 border-l border-dashed border-white/25 mr-2" />
        <ModeIcon size={11} />
        {label && `${label} · `}
        {route?.approximate ? '≈ ' : ''}
        {fmtDuration(leg.duration)} · {fmtDistance(leg.distance)}
      </p>
    ) : null;

  return (
    <div className="mt-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setDatesOpen(true)} className="flex items-center gap-2 text-white/70 text-xs font-medium active:opacity-70">
          <CalendarDays size={15} />
          {days > 1 && `${fmtDate(fromDateInput(start), { day: 'numeric', month: 'short' })} – `}
          {fmtDate(fromDateInput(trip.endDate!))} · {days}d
        </button>
        <div className="flex rounded-full bg-white/[0.06] p-0.5" role="radiogroup" aria-label="Travel mode">
          {([['foot', Footprints, 'Walk'], ['car', Car, 'Drive']] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => updateTrip(trip.id, { travelMode: m })}
              className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors', mode === m ? 'bg-white text-black' : 'text-white/60')}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Where you're staying — one row per hotel / city */}
      <div className="mt-3 space-y-1.5">
        {blocks.map((b) => {
          const far = farFrom(b);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setStayDraft({ id: b.id, place: b.place, from: b.from, to: b.to })}
              className="reveal w-full flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-2 text-left active:bg-white/10"
            >
              <span className="w-7 h-7 shrink-0 rounded-lg bg-amber-500 text-black flex items-center justify-center">
                {b.place.kind === 'area' ? <MapPin size={15} /> : <BedDouble size={15} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white truncate">{placeTitle(b.place)}</span>
                <span className={cn('block text-[10px] truncate', far ? 'text-amber-400' : 'text-white/40')}>
                  {days > 1 && `Day ${b.from + 1}${b.to > b.from ? `–${b.to + 1}` : ''} · `}
                  {far ? `${fmtDistance(far)} from these days’ places — right city?` : shortRange(b.from, b.to)}
                </span>
              </span>
              <ChevronRight size={15} className="text-white/30 shrink-0" />
            </button>
          );
        })}
        {!blocks.length && (
          <button type="button" onClick={() => setFirstHotelOpen(true)} className="reveal w-full flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-2 text-left active:bg-white/10">
            <span className="w-7 h-7 shrink-0 rounded-lg bg-amber-500 text-black flex items-center justify-center">
              <BedDouble size={15} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-white">Add where you’re staying</span>
              <span className="block text-[10px] text-white/40">Search an area or hotel — routes start and end there</span>
            </span>
          </button>
        )}
        {gap && (
          <button type="button" onClick={() => setStayDraft(gap)} className="w-full text-left px-3 py-1 text-[11px] text-amber-400 active:opacity-70">
            No hotel for Day {gap.from + 1}
            {gap.to > gap.from ? `–${gap.to + 1}` : ''} · tap to add
          </button>
        )}
        {blocks.length > 0 && !gap && days > 1 && (
          <button type="button" onClick={() => setStayDraft(suggestNights(blocks, days))} className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-white/50 active:opacity-70">
            <Plus size={12} /> Moving to another city? Add another stay
          </button>
        )}
      </div>

      {/* Day picker */}
      <div className="-mx-6 px-6 mt-4 flex gap-2 overflow-x-auto scrollbar-hide">
        {Array.from({ length: days }, (_, i) => {
          const n = countByDay.get(i) ?? 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setDay(i);
                setSelectedId(null);
              }}
              className={cn(
                'shrink-0 rounded-2xl px-3.5 py-2 text-left transition-colors',
                i === day ? 'bg-white text-black' : 'bg-white/[0.06] text-white active:bg-white/10',
              )}
            >
              <span className="block text-sm font-bold">Day {i + 1}</span>
              <span className={cn('block text-[10px]', i === day ? 'text-black/60' : 'text-white/45')}>
                {dayLabel(start, i)}{n ? ` · ${n}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {(ends.start || ends.end) && (
        <p className="mt-3 text-[11px] text-white/55 flex items-center gap-1.5 min-w-0">
          {ends.moving ? (
            <>
              <TrainFront size={13} className="text-amber-400 shrink-0" />
              <span className="shrink-0 font-medium text-amber-300">Moving day</span>
              <span className="truncate">{placeTitle(ends.start!)}</span>
              <ArrowRight size={11} className="shrink-0" />
              <span className="truncate">{placeTitle(ends.end!)}</span>
            </>
          ) : (
            <>
              <BedDouble size={13} className="text-amber-400 shrink-0" />
              <span className="truncate">{placeTitle((ends.end ?? ends.start)!)}</span>
            </>
          )}
        </p>
      )}

      {/* Map */}
      <div className="reveal mt-4 h-[240px] rounded-2xl overflow-hidden border border-white/10">
        {dayStops.length ? (
          <ErrorBoundary fallback={<MapFallback />}>
            <DayMap stops={dayStops} hotels={[ends.start, ends.end].filter((p): p is Place => !!p)} line={route?.line} approximate={route?.approximate} selectedId={selectedId} onSelect={selectFromMap} />
          </ErrorBoundary>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center bg-white/[0.03] px-8">
            <MapPin size={22} className="text-white/30" />
            <p className="text-white/40 text-xs mt-2 leading-relaxed">
              {ends.moving ? 'Moving day — add places to visit on the way, or just travel.' : `Add places to Day ${day + 1} to see them and your route on the map.`}
            </p>
          </div>
        )}
      </div>

      {dayStops.length > 0 && (
        <>
          <p className="mt-2.5 text-[11px] text-white/50 flex items-center gap-1.5 flex-wrap">
            {dayStops.length} place{dayStops.length === 1 ? '' : 's'}
            {route && (
              <>
                {' · '}
                {route.approximate ? '≈ ' : ''}
                {fmtDistance(route.distance)} · {fmtDuration(route.duration)} {modeWord}
              </>
            )}
            {routing && <Loader2 size={11} className="animate-spin" />}
            {route?.approximate && !routing && <span className="text-white/30">(straight-line estimate)</span>}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={optimiseDay}
              disabled={!!busy || dayStops.length < 2}
              className="flex-1 rounded-full bg-white text-black py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-40"
            >
              {busy === 'optimise' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Optimise order
            </button>
            <button
              type="button"
              onClick={openGoogleMaps}
              className="flex-1 rounded-full liquid-glass text-white py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <Navigation size={14} /> Google Maps
            </button>
          </div>
        </>
      )}

      {undo && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-green-500/15 border border-green-500/30 pl-3 pr-1 py-1 animate-rise-in" role="status">
          <Check size={14} className="text-green-400 shrink-0" />
          <span className="flex-1 text-xs text-green-100">{undo.message}</span>
          <button
            type="button"
            onClick={async () => {
              await arrangeStops(undo.layout);
              setUndo(null);
              notify('Undone');
            }}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white active:bg-white/10"
          >
            Undo
          </button>
        </div>
      )}

      {/* Stops */}
      <ol className="mt-3">
        {ends.start && dayStops.length > 0 && legRow(route?.legs[0], ends.moving ? 'From last night’s hotel' : 'From hotel')}
        {dayStops.map((s, i) => (
          <li key={s.id} className="reveal" ref={(el) => (el ? rowRefs.current.set(s.id, el) : rowRefs.current.delete(s.id))}>
            <div className={cn('flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors', selectedId === s.id ? 'bg-white/10' : 'bg-white/[0.04]')}>
              <button
                type="button"
                aria-label={s.done ? `Mark ${s.name} as not visited` : `Mark ${s.name} as visited`}
                onClick={() => updateStop(s.id, { done: !s.done })}
                className={cn('w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold', s.done ? 'bg-green-500 text-white' : 'bg-blue-500 text-white')}
              >
                {s.done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(s.id);
                  setEditing(s);
                }}
                className="flex-1 min-w-0 text-left"
              >
                <span className={cn('block text-sm font-medium truncate', s.done ? 'text-white/50 line-through' : 'text-white')}>{s.name}</span>
                <span className="block text-[11px] text-white/40 truncate">{[s.time, s.note || s.address].filter(Boolean).join(' · ')}</span>
              </button>
              {photosByStop.get(s.id) && (
                <button
                  type="button"
                  aria-label={`${plural(photosByStop.get(s.id)!.length, 'photo')} at ${s.name}`}
                  onClick={() => onOpenViewer(photosByStop.get(s.id)!.map((p) => p.id), 0)}
                  className="relative w-9 h-9 shrink-0 rounded-lg overflow-hidden bg-white/5"
                >
                  <img src={photoSrc(photosByStop.get(s.id)![0])} alt="" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] font-semibold leading-none px-1 py-0.5 rounded-tl">{photosByStop.get(s.id)!.length}</span>
                </button>
              )}
              <div className="flex flex-col -my-1">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="text-white/50 disabled:opacity-20 p-0.5">
                  <ChevronUp size={16} />
                </button>
                <button type="button" aria-label="Move down" disabled={i === dayStops.length - 1} onClick={() => move(i, 1)} className="text-white/50 disabled:opacity-20 p-0.5">
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
            {i < dayStops.length - 1 ? (legRow(legAfter(i)) ?? <div className="h-2" />) : ends.end && legRow(legAfter(i), ends.moving ? 'To tonight’s hotel' : 'Back to hotel')}
          </li>
        ))}
      </ol>

      {dayPhotos.length > 0 && (
        <section className="reveal mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
            <Camera size={12} /> Memories from Day {day + 1} · {dayPhotos.length}
          </p>
          <div className="-mx-6 px-6 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {dayPhotos.map((p, i) => (
              <button key={p.id} type="button" onClick={() => onOpenViewer(dayPhotos.map((x) => x.id), i)} className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-white/5 active:opacity-80">
                <img src={photoSrc(p)} alt={p.caption || ''} loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="mt-3 w-full rounded-2xl border border-dashed border-white/20 py-3.5 text-sm font-medium text-white/70 flex items-center justify-center gap-2 active:bg-white/5"
      >
        <Plus size={16} /> Add a place to Day {day + 1}
      </button>

      {areas[dayAreaIdx] && <PopularCarousel area={areas[dayAreaIdx]} stops={all} day={day} onAdd={addPopular} onSeeAll={() => setAddOpen(true)} />}

      {days > 1 && movableCount >= 2 && (
        <button
          type="button"
          onClick={() => setSplitOpen(true)}
          disabled={!!busy}
          className="mt-2 w-full rounded-2xl bg-white/[0.04] py-3 text-left px-4 flex items-center gap-3 active:bg-white/10 disabled:opacity-50"
        >
          <span className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center shrink-0">
            {busy === 'split' ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white">Split across days</span>
            <span className="block text-[11px] text-white/40">Group nearby places into the same day</span>
          </span>
        </button>
      )}

      <TripDatesSheet trip={trip} open={datesOpen} onClose={() => setDatesOpen(false)} />
      <PlaceSearchSheet
        trip={trip}
        title={`Add to Day ${day + 1}`}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={async (r) => {
          const s = await addStop({ tripId: trip.id, day, name: r.name, address: r.address, lat: r.lat, lng: r.lng });
          notify(`Added ${r.name}`);
          setSelectedId(s.id);
        }}
        idle={areas.length ? <PopularList key={day} areas={areas} initialArea={dayAreaIdx} stops={all} onAdd={addPopular} /> : undefined}
      />
      <HotelSheet
        trip={trip}
        open={firstHotelOpen}
        onClose={() => setFirstHotelOpen(false)}
        stops={all}
        onChoose={async (p) => {
          await saveStays([{ id: uid(), place: p, from: 0, to: days - 1 }]);
          notify(p.kind === 'area' ? `Staying around ${p.name}` : `Staying at ${p.name}`);
        }}
      />
      <StaySheet
        trip={trip}
        days={days}
        draft={stayDraft}
        onClose={() => setStayDraft(null)}
        onSave={async (st) => {
          await saveStays(upsertStay(blocks, st));
          notify(days > 1 ? `${placeTitle(st.place)} · Day ${st.from + 1}${st.to > st.from ? `–${st.to + 1}` : ''}` : 'Stay saved');
        }}
        onRemove={async (id) => {
          await saveStays(blocks.filter((b) => b.id !== id));
          notify('Stay removed');
        }}
      />
      <StopSheet trip={trip} stop={editing} onClose={() => setEditing(null)} />
      <ConfirmSheet
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        title={`Arrange ${movableCount} places across ${days} days?`}
        message="Places close to each other go on the same day, the days are kept roughly even, and each day is put in the best order. Places you’ve ticked off stay where they are. You can undo this."
        confirmLabel="Arrange my days"
        tone="primary"
        onConfirm={splitAcrossDays}
      />
    </div>
  );
}
