import { useEffect, useState } from 'react';
import { Car, ChevronDown, Footprints, Loader2, LocateFixed, Navigation, TrainFront } from 'lucide-react';
import type { TravelMode } from '../types';
import { fmtDistance, fmtDuration, getRoute, type LatLng, type Route } from '../lib/geo';
import { TransitError, transitErrorText, transitRoutes, vehicleEmoji, type TransitRoute, type TransitStep } from '../lib/transit';
import { cn } from '../lib/utils';
import { Sheet } from './ui';

// ───────────────────────── Pieces ─────────────────────────

/** A line badge in the line's own colours: "G Ginza", "Yamanote", "Bus 12". */
export function LineChip({ s, small }: { s: TransitStep; small?: boolean }) {
  const name = s.short || s.line || s.vehicleName || 'Transit';
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md font-bold leading-none whitespace-nowrap', small ? 'px-1.5 py-[3px] text-[10px]' : 'px-2 py-1 text-[11px]')}
      style={{ background: s.color || '#3b82f6', color: s.textColor || '#fff' }}
      title={[s.line, s.agency].filter(Boolean).join(' · ')}
    >
      <span className="leading-none">{vehicleEmoji(s.vehicle)}</span>
      <span className="max-w-[9rem] truncate">{name}</span>
    </span>
  );
}

/** One-line summary: 🚶 4 › [G Ginza] › 🚶 3. */
export function StepChips({ route, small }: { route: TransitRoute; small?: boolean }) {
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {route.steps.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-white/30 text-[10px]">›</span>}
          {s.mode === 'transit' ? (
            <LineChip s={s} small={small} />
          ) : (
            <span className={cn('inline-flex items-center gap-0.5 text-white/60', small ? 'text-[10px]' : 'text-[11px]')}>
              <Footprints size={small ? 10 : 11} /> {Math.max(1, Math.round(s.duration / 60))}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/** The full step list: walk to…, ride the X line from A to B (n stops), … */
export function StepList({ route, showTimes }: { route: TransitRoute; showTimes?: boolean }) {
  return (
    <ol className="relative mt-2 space-y-2.5 border-l border-white/10 ml-2 pl-4">
      {route.steps.map((s, i) =>
        s.mode === 'walk' ? (
          <li key={i} className="text-[12px] text-white/60 flex items-center gap-1.5">
            <span className="absolute -left-[7px] w-3.5 h-3.5 rounded-full bg-[#141417] border border-white/25 flex items-center justify-center">
              <Footprints size={8} />
            </span>
            Walk {fmtDuration(s.duration)} · {fmtDistance(s.distance)}
            {i === route.steps.length - 1 ? ' to arrive' : s.instruction ? ` · ${s.instruction}` : ''}
          </li>
        ) : (
          <li key={i} className="text-[12px] text-white">
            <span className="absolute -left-[7px] w-3.5 h-3.5 rounded-full border-2" style={{ background: s.color || '#3b82f6', borderColor: '#141417' }} />
            <div className="flex items-center gap-2 flex-wrap">
              <LineChip s={s} />
              <span className="text-white/80 font-medium">{s.line && s.short && s.line !== s.short ? s.line : s.vehicleName}</span>
            </div>
            {s.headsign && <p className="mt-1 text-[11px] text-white/50">towards {s.headsign}</p>}
            <p className="mt-1 text-[12px]">
              {showTimes && s.departTime && <span className="font-semibold tabular-nums mr-1.5">{s.departTime}</span>}
              <span className="text-white/85">{s.from ?? 'Board'}</span>
            </p>
            <p className="text-[11px] text-white/45 my-0.5">
              {s.stops != null ? `${s.stops} stop${s.stops === 1 ? '' : 's'} · ` : ''}
              {fmtDuration(s.duration)}
              {s.headway ? ` · every ${Math.max(1, Math.round(s.headway / 60))} min` : ''}
              {s.agency ? ` · ${s.agency}` : ''}
            </p>
            <p className="text-[12px]">
              {showTimes && s.arriveTime && <span className="font-semibold tabular-nums mr-1.5">{s.arriveTime}</span>}
              <span className="text-white/85">{s.to ?? 'Get off'}</span>
            </p>
          </li>
        ),
      )}
    </ol>
  );
}

/** A hop in the day plan by transit: compact lines, tap to see every step. */
export function TransitLegRow({ leg, label, loading, failed }: { leg?: TransitRoute | null; label?: string; loading?: boolean; failed?: boolean }) {
  const [open, setOpen] = useState(false);
  const rides = leg?.steps.filter((s) => s.mode === 'transit').length ?? 0;
  return (
    <div className="pl-[22px] py-1.5">
      <button type="button" disabled={!leg} onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left text-[10px] text-white/45">
        <span className="h-4 border-l border-dashed border-white/25 mr-2 shrink-0" />
        {loading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" /> Finding trains & buses…
          </span>
        ) : leg ? (
          <>
            <span className="flex-1 min-w-0">
              {label && <span className="block mb-1">{label}</span>}
              <StepChips route={leg} small />
            </span>
            <span className="shrink-0 tabular-nums text-white/60">{fmtDuration(leg.duration)}</span>
            {rides > 0 && <ChevronDown size={12} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />}
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <TrainFront size={11} /> {label ? `${label} · ` : ''}
            {failed ? 'Lines unavailable here — tap the blue arrow for trains in Google Maps' : 'No public transport — walk or take a taxi'}
          </span>
        )}
      </button>
      {open && leg && (
        <div className="pl-5 pb-1 animate-fade-in">
          <StepList route={leg} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Directions sheet ─────────────────────────

export interface Endpoint extends LatLng {
  name: string;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Google Maps / Apple Maps directions links. With no origin, the maps app starts from where you are. */
function mapsLinks(to: LatLng, mode: TravelMode, from?: LatLng) {
  const g = new URLSearchParams({ api: '1', destination: `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`, travelmode: mode === 'car' ? 'driving' : mode === 'transit' ? 'transit' : 'walking' });
  if (from) g.set('origin', `${from.lat.toFixed(6)},${from.lng.toFixed(6)}`);
  const a = new URLSearchParams({ daddr: `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`, dirflg: mode === 'car' ? 'd' : mode === 'transit' ? 'r' : 'w' });
  if (from) a.set('saddr', `${from.lat.toFixed(6)},${from.lng.toFixed(6)}`);
  return { google: `https://www.google.com/maps/dir/?${g}`, apple: `https://maps.apple.com/?${a}` };
}

function myLocation(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}

/**
 * "How do I get there?" — from where you are now (or the previous place), by transit, walking or
 * driving; transit shows real lines and departure times. Start opens Google/Apple Maps to guide you.
 */
export function DirectionsSheet({ to, fallback, defaultMode, onClose }: { to: Endpoint | null; fallback?: Endpoint; defaultMode: TravelMode; onClose: () => void }) {
  const [mode, setMode] = useState<TravelMode>(defaultMode);
  const [origin, setOrigin] = useState<{ point: LatLng; name: string; live: boolean } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [transit, setTransit] = useState<TransitRoute[] | null>(null);
  const [transitError, setTransitError] = useState<string | null>(null);
  const [road, setRoad] = useState<Route | null>(null);
  const [loading, setLoading] = useState(false);
  const [openIdx, setOpenIdx] = useState(0);

  // Where from: your location (asked once), else the previous place.
  function locate() {
    setLocating(true);
    setLocError(null);
    myLocation()
      .then((p) => setOrigin({ point: p, name: 'Your location', live: true }))
      .catch(() => {
        setLocError('Location is off — showing from the previous place. Allow location for Stamped to start from where you are.');
        if (fallback) setOrigin({ point: fallback, name: fallback.name, live: false });
      })
      .finally(() => setLocating(false));
  }
  useEffect(() => {
    if (!to) return;
    setMode(defaultMode);
    setOrigin(null);
    setTransit(null);
    setRoad(null);
    locate();
  }, [to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!to || !origin) return;
    const ac = new AbortController();
    setLoading(true);
    setOpenIdx(0);
    if (mode === 'transit') {
      setTransit(null);
      setTransitError(null);
      transitRoutes(origin.point, to, { alternatives: true, signal: ac.signal })
        .then(setTransit)
        .catch((e) => !ac.signal.aborted && setTransitError(transitErrorText(e instanceof TransitError ? e : null)))
        .finally(() => !ac.signal.aborted && setLoading(false));
    } else {
      setRoad(null);
      getRoute([origin.point, to], mode, ac.signal)
        .then(setRoad)
        .catch(() => undefined)
        .finally(() => !ac.signal.aborted && setLoading(false));
    }
    return () => ac.abort();
  }, [to, origin, mode]);

  const links = to ? mapsLinks(to, mode, origin && !origin.live ? origin.point : undefined) : null;

  return (
    <Sheet open={!!to} onClose={onClose} title={to ? `To ${to.name}` : 'Directions'}>
      {to && (
        <div className="space-y-4">
          <p className="text-[11px] text-white/50 flex items-center gap-1.5 -mt-1">
            <LocateFixed size={12} />
            From {locating ? 'your location…' : origin?.name ?? '—'}
            {origin && !origin.live && !locating && (
              <button type="button" onClick={locate} className="ml-1 text-white font-medium underline-offset-2 hover:underline">
                Use my location
              </button>
            )}
          </p>
          {locError && <p className="text-[11px] text-amber-300/90 -mt-2">{locError}</p>}

          <div className="flex rounded-full bg-white/[0.06] p-1" role="radiogroup" aria-label="How to go">
            {([['transit', TrainFront, 'Transit'], ['foot', Footprints, 'Walk'], ['car', Car, 'Drive']] as const).map(([m, Icon, label]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn('flex-1 rounded-full py-2 text-xs font-semibold flex items-center justify-center gap-1.5', mode === m ? 'bg-white text-black' : 'text-white/60')}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {(loading || locating) && (
            <p className="py-6 flex items-center justify-center gap-2 text-xs text-white/50">
              <Loader2 size={14} className="animate-spin" /> {locating ? 'Finding where you are…' : mode === 'transit' ? 'Checking trains & buses…' : 'Finding the route…'}
            </p>
          )}
          {!origin && !locating && <p className="text-xs text-white/50">Allow location to get directions from where you are.</p>}

          {mode === 'transit' && !loading && transitError && <p className="rounded-2xl bg-white/[0.05] px-4 py-3 text-xs text-white/60">{transitError} Tap Start in Google Maps below to see the lines and times.</p>}
          {mode === 'transit' && !loading && transit && (
            <ul className="space-y-2">
              {transit.map((r, i) => (
                <li key={i} className={cn('rounded-2xl border px-3.5 py-3', i === openIdx ? 'bg-white/[0.06] border-white/15' : 'bg-white/[0.03] border-white/[0.06]')}>
                  <button type="button" onClick={() => setOpenIdx(i)} className="w-full text-left">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-white tabular-nums">{r.departTime && r.arriveTime ? `${r.departTime} → ${r.arriveTime}` : fmtDuration(r.duration)}</span>
                      <span className="text-xs text-white/60 tabular-nums">
                        {r.departTime ? fmtDuration(r.duration) : fmtDistance(r.distance)}
                        {r.fare ? ` · ${r.fare}` : ''}
                      </span>
                    </div>
                    <div className="mt-2">
                      <StepChips route={r} />
                    </div>
                    {r.steps.find((s) => s.mode === 'transit')?.departTime && i !== openIdx && (
                      <p className="mt-1.5 text-[11px] text-white/45">
                        Leaves {r.steps.find((s) => s.mode === 'transit')!.departTime} from {r.steps.find((s) => s.mode === 'transit')!.from}
                      </p>
                    )}
                  </button>
                  {i === openIdx && <StepList route={r} showTimes />}
                </li>
              ))}
            </ul>
          )}

          {mode !== 'transit' && !loading && road && (
            <div className="rounded-2xl bg-white/[0.05] px-4 py-3 flex items-center gap-3">
              {mode === 'car' ? <Car size={18} className="text-white/70" /> : <Footprints size={18} className="text-white/70" />}
              <span className="text-sm text-white font-semibold">
                {road.approximate ? '≈ ' : ''}
                {fmtDuration(road.duration)}
              </span>
              <span className="text-xs text-white/50">{fmtDistance(road.distance)}{road.approximate ? ' · straight-line estimate' : ''}</span>
            </div>
          )}

          {links && (
            <div className="flex gap-2 pt-1">
              <a href={links.google} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-full bg-white text-black py-3 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                <Navigation size={15} /> Start in Google Maps
              </a>
              {isIOS() && (
                <a href={links.apple} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/10 px-4 py-3 text-sm font-semibold text-white flex items-center justify-center active:bg-white/15">
                  Apple Maps
                </a>
              )}
            </div>
          )}
          <p className="text-[10px] text-white/30 text-center">Turn-by-turn guidance opens in your maps app · transit data from Google</p>
        </div>
      )}
    </Sheet>
  );
}
