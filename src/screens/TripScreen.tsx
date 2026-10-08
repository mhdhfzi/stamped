import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useReveal } from '../lib/useReveal';
import { Camera, ChevronLeft, Heart, ImagePlus, Loader2, MoreHorizontal, Users } from 'lucide-react';
import { cloudConfigured } from '../lib/cloudConfig';
import { useUnread } from '../lib/groupBadge';

const TripGroup = lazy(() => import('../components/group/TripGroup'));
import { useStore } from '../store';
import { getCountry } from '../data/countries';
import { photoSrc } from '../lib/photoSrc';
import { cn, dateRange, fmtDate, gradientFor, plural } from '../lib/utils';
import { TripActionsSheet } from '../components/TripActionsSheet';
import { TripPlan } from '../components/TripPlan';
import { TripBudget } from '../components/TripBudget';
import { TripPacking } from '../components/TripPacking';
import { isVisited, photoDay, upcomingLabel, upcomingStatus } from '../lib/tripStatus';
import { EmptyState, GlassCircle } from '../components/ui';

interface Props {
  tripId: string;
  onBack: () => void;
  onOpenViewer: (ids: string[], index: number) => void;
}

export function TripScreen({ tripId, onBack, onOpenViewer }: Props) {
  const { trips, photosOf, coverOf, addPhotos, notify } = useStore();
  const trip = trips.find((t) => t.id === tripId);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const unread = useUnread(trip?.groupId);
  // Trips you're still planning open on the plan.
  const [view, setView] = useState<'moments' | 'plan' | 'budget' | 'pack'>(() => (trip?.planned && !photosOf(tripId).length ? 'plan' : 'moments'));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroImg = useRef<HTMLDivElement>(null);
  const heroText = useRef<HTMLDivElement>(null);
  useReveal(scrollRef);

  // Tab content slides in from the side of the tab you picked.
  const TABS = ['moments', 'plan', 'budget', 'pack'] as const;
  const prevTab = useRef(view);
  const tabAnim = TABS.indexOf(view) >= TABS.indexOf(prevTab.current) ? 'tab-in-right' : 'tab-in-left';
  useEffect(() => {
    prevTab.current = view;
  }, [view]);

  // Hero: the photo drifts at half speed (and stretches when pulled down); the title fades and lifts.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = sc.scrollTop;
      if (heroImg.current) heroImg.current.style.transform = y < 0 ? `scale(${1 + -y / 320})` : `translateY(${(y * 0.45).toFixed(1)}px) scale(${(1 + Math.min(y, 320) / 2400).toFixed(4)})`;
      if (heroText.current) {
        heroText.current.style.opacity = String(Math.max(0, 1 - y / 200));
        heroText.current.style.transform = `translateY(${(-y * 0.25).toFixed(1)}px)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener('scroll', onScroll);
    };
  }, []);

  const photos = trip ? photosOf(trip.id) : [];
  // Grouped by plan day ("Day 2 · Thu 8 Oct") when taken during the trip dates, else by month.
  const groups = useMemo(() => {
    const m = new Map<string, typeof photos>();
    for (const p of photos) {
      const d = trip ? photoDay(trip, p) : null;
      const k = d != null ? `Day ${d + 1} · ${fmtDate(p.takenAt, { weekday: 'short', day: 'numeric', month: 'short' })}` : fmtDate(p.takenAt, { month: 'long', year: 'numeric' });
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [photos, trip]);

  if (!trip) return null;
  const country = getCountry(trip.countryCode);
  const cover = photoSrc(coverOf(trip));
  const ids = photos.map((p) => p.id);

  async function onFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    setProgress({ done: 0, total: files.length });
    const n = await addPhotos(trip!.id, files, (done, total) => setProgress({ done, total }));
    setProgress(null);
    notify(n ? `Added ${plural(n, 'moment')}` : 'Those files aren’t images');
  }

  return (
    <>
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto scrollbar-hide pb-28 animate-fade-in">
        <div className="relative h-[320px] overflow-hidden">
          <div ref={heroImg} className="absolute inset-0 origin-bottom will-change-transform">
            <div className="absolute inset-0" style={{ background: gradientFor(trip.countryCode + trip.title) }} />
            {cover && <img src={cover} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} className="absolute inset-0 w-full h-full object-cover" />}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-[#0a0a0c]" />
          <div className="absolute top-12 inset-x-5 flex justify-between z-10">
            <GlassCircle label="Back" onClick={onBack}>
              <ChevronLeft size={20} />
            </GlassCircle>
            <div className="flex gap-2">
              {cloudConfigured && (
                <span className="relative">
                  <GlassCircle label={trip.groupId ? 'Group chat' : 'Share with friends'} onClick={() => setGroupOpen(true)}>
                    <Users size={18} />
                  </GlassCircle>
                  {unread && <span aria-label="New messages" className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black/40" />}
                </span>
              )}
              <GlassCircle label="Trip options" onClick={() => setActionsOpen(true)}>
                <MoreHorizontal size={18} />
              </GlassCircle>
            </div>
          </div>
          <div ref={heroText} className="absolute bottom-3 inset-x-6">
            <p className="flex items-center gap-2 text-white/70 text-sm">
              <span className="text-xl leading-none">{country.flag}</span>
              {country.name} · {country.region}
            </p>
            <h1 className="text-white text-5xl font-bold tracking-tight leading-none mt-2 truncate">{trip.title}</h1>
            <p className="text-white/50 text-xs mt-2">
              {!isVisited(trip, photos.length) ? `Upcoming · ${upcomingLabel(upcomingStatus(trip))}` : `${plural(photos.length, 'moment')} · ${dateRange(photos.map((p) => p.takenAt))}`}
            </p>
          </div>
        </div>

        <div className="px-6 mt-4">
          <div className="flex rounded-full bg-white/[0.06] p-1" role="tablist">
            {TABS.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn('flex-1 rounded-full py-2 text-sm font-semibold capitalize transition-colors', view === v ? 'bg-white text-black' : 'text-white/60')}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div key={view} className={tabAnim}>
        {view === 'pack' && (
          <div className="px-6">
            <TripPacking trip={trip} />
          </div>
        )}

        {view === 'budget' && (
          <div className="px-6">
            <TripBudget trip={trip} />
          </div>
        )}

        {view === 'plan' && (
          <div className="px-6">
            <TripPlan trip={trip} onOpenViewer={onOpenViewer} />
          </div>
        )}

        {view === 'moments' && (
        <>
        <div className="px-6 mt-4 flex gap-2">
          <button type="button" onClick={() => galleryInput.current?.click()} className="flex-1 rounded-full bg-white text-black py-3 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
            <ImagePlus size={18} /> Add photos
          </button>
          <button type="button" aria-label="Take a photo" onClick={() => cameraInput.current?.click()} className="w-12 h-12 rounded-full liquid-glass text-white flex items-center justify-center active:scale-95">
            <Camera size={20} />
          </button>
          <input ref={galleryInput} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </div>

        <div className="px-6">
          {groups.map(([label, items]) => (
            <section key={label} className="mt-6">
              <h4 className="reveal text-white/50 text-[11px] font-medium uppercase tracking-wider mb-2">{label}</h4>
              <div className="grid grid-cols-3 gap-1">
                {items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpenViewer(ids, ids.indexOf(p.id))}
                    className="reveal group relative aspect-square rounded-lg overflow-hidden bg-white/5 active:opacity-80"
                  >
                    <img
                      src={photoSrc(p)}
                      alt={p.caption || ''}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 group-active:scale-95 group-active:duration-100"
                    />
                    {p.favorite && <Heart size={12} className="absolute top-1.5 right-1.5 fill-white text-white drop-shadow" />}
                    {trip.coverPhotoId === p.id && <span className="absolute bottom-1 left-1 text-[9px] font-semibold text-white bg-black/50 rounded px-1">COVER</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!photos.length && (
            <EmptyState icon={<ImagePlus size={24} />} title="No moments yet" body={`Add your favourite photos from ${trip.title}. They're stored privately on this device.`} />
          )}
        </div>
        </>
        )}
        </div>
      </div>

      {progress && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 liquid-glass bg-black/60 rounded-full px-4 py-2 text-xs text-white flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Adding {progress.done} of {progress.total}…
        </div>
      )}

      <TripActionsSheet trip={actionsOpen ? trip : null} onClose={() => setActionsOpen(false)} onDeleted={onBack} />
      {groupOpen && (
        <Suspense fallback={null}>
          <TripGroup trip={trip} onClose={() => setGroupOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
