import { useEffect, useState } from 'react';
import { MoreHorizontal, Plane } from 'lucide-react';
import type { Trip } from '../types';
import { cn, fitTitleSize, gradientFor } from '../lib/utils';
import { useFlag } from '../lib/flags';

interface Props {
  trip: Trip;
  cover?: string;
  /** Pill text, e.g. "12 moments" or "In 12 days". */
  badge: string;
  /** Planned trip: shows a plane in the pill. */
  upcoming?: boolean;
  index: number;
  onOpen: () => void;
  onMore: () => void;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function DestinationCard({ trip, cover, badge, upcoming, index, onOpen, onMore }: Props) {
  const [visible, setVisible] = useState(false);
  const [launching, setLaunching] = useState(false);

  // Staggered entrance: 150ms, 270ms, 390ms, 510ms…
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 150 + index * 120);
    return () => clearTimeout(t);
  }, [index]);

  // Picking a card: a quick zoom "into" it, then the trip opens.
  function open() {
    if (launching) return;
    if (reducedMotion()) return onOpen();
    setLaunching(true);
    setTimeout(onOpen, 220);
  }

  const fs = fitTitleSize(trip.title, 300, 60, 28);
  const flag = useFlag(cover ? undefined : trip.countryCode);

  return (
    // Outer layer: entrance animation only
    <div className={cn('transition-all duration-700 ease-out', visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6')}>
      {/* Inner layer: hover zoom / press / launch */}
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        className={cn(
          'group relative w-full h-[200px] rounded-2xl overflow-hidden cursor-pointer outline-none',
          'transition-[transform,box-shadow,filter] duration-300 ease-out',
          'shadow-[0_-10px_30px_rgba(0,0,0,0.55)]',
          'hover:scale-[1.03] hover:shadow-[0_18px_40px_rgba(0,0,0,0.6)] focus-visible:scale-[1.03] focus-visible:ring-2 focus-visible:ring-white/70',
          'active:scale-[0.97] active:duration-100',
          launching && '!scale-[1.07] brightness-110 !duration-200',
        )}
      >
        <div className="absolute inset-0" style={{ background: gradientFor(trip.countryCode + trip.title) }} />
        {!cover && flag && (
          // No photo yet: the country's flag is the cover, dimmed a little so the name stays readable.
          <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.1] group-focus-visible:scale-[1.1]">
            <img src={flag} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30" />
          </div>
        )}
        {cover && (
          // Zoom wrapper (hover) around the photo, which drifts with the scroll (--parallax from the card stack)
          <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.1] group-focus-visible:scale-[1.1]">
            <img
              src={cover}
              alt=""
              draggable={false}
              onError={(e) => (e.currentTarget.style.display = 'none')}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: 'translateY(calc(var(--parallax, 0) * 1px)) scale(1.14)' }}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent transition-opacity duration-300 group-hover:opacity-60" />

        <div className="absolute top-3 left-3 liquid-glass rounded-full px-3 py-1 flex items-center gap-1.5 transition-transform duration-300 group-hover:translate-x-0.5">
          {upcoming && <Plane size={12} className="text-white/90 transition-transform duration-500 group-hover:-rotate-12 group-hover:translate-x-0.5" />}
          <span className="text-white/90 text-xs font-normal">{badge}</span>
        </div>

        <button
          type="button"
          aria-label="Trip options"
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
          className="absolute top-3 right-3 liquid-glass w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-90"
        >
          <MoreHorizontal size={16} className="text-white/80" />
        </button>

        {/* Name sits in the middle of the card, fully visible, over a soft shade so it reads on any photo */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.35)_0%,transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 pt-6">
          <span
            className="font-bold tracking-tight leading-[1.15] pb-[0.08em] text-center text-white/90 line-clamp-2 break-words drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] transition-transform duration-500 ease-out group-hover:scale-105"
            style={{ fontSize: fs }}
          >
            {trip.title}
          </span>
        </div>
      </div>
    </div>
  );
}
