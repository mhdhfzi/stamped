import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

export interface StackItem {
  key: string;
  node: ReactNode;
  /** Cards stack; other items (section titles, chips) scroll normally. */
  card?: boolean;
}

const GAP = 16;
/** How far each stacked card peeks out below the one before it. */
const PEEK = 10;
const MAX_PEEKS = 4;

/**
 * A deck of cards that stack as you scroll: each card sticks near the top and the next one slides
 * over it, while the covered card shrinks, tilts back and dims. Photos drift slightly (parallax).
 * All motion is driven by the scroll position, so it tracks your finger exactly.
 *
 * `top` is where cards pin, measured from the scroll area's top padding edge (that's how sticky
 * offsets work inside a padded scroller — 0 pins them right where the list starts).
 */
export function CardStack({ items, scrollRef, top = 0, cardHeight = 200 }: { items: StackItem[]; scrollRef: RefObject<HTMLElement>; top?: number; cardHeight?: number }) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [spacer, setSpacer] = useState(0);
  const cardCount = items.filter((i) => i.card).length;
  cardRefs.current.length = cardCount;
  const layoutKey = items.map((i) => i.key).join('|');

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;

    const update = () => {
      raf = 0;
      const base = sc.getBoundingClientRect().top;
      const view = sc.clientHeight;
      const cards = cardRefs.current.filter((c): c is HTMLDivElement => !!c);
      const ys = cards.map((c) => c.getBoundingClientRect().top - base);
      cards.forEach((card, i) => {
        const motion = card.firstElementChild as HTMLElement | null;
        if (!motion) return;
        // 0 = nothing on top yet, 1 = the next card has slid fully over this one
        const next = ys[i + 1];
        const cover = next == null ? 0 : Math.min(1, Math.max(0, 1 - (next - ys[i]) / (cardHeight + GAP)));
        // Photos drift a little against the scroll for depth
        const parallax = ((ys[i] + cardHeight / 2 - view / 2) / view) * -22;
        motion.style.setProperty('--parallax', parallax.toFixed(1));
        if (reduced) return;
        motion.style.transform = `perspective(900px) translateY(${(-cover * 4).toFixed(2)}px) scale(${(1 - cover * 0.07).toFixed(4)}) rotateX(${(cover * 7).toFixed(2)}deg)`;
        const shade = motion.lastElementChild as HTMLElement | null;
        if (shade) shade.style.opacity = (cover * 0.6).toFixed(3);
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // Room at the end so the last card can rise all the way to the top of the stack.
    const size = () => {
      const cs = getComputedStyle(sc);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      setSpacer(Math.max(0, sc.clientHeight - pad - top - cardHeight - GAP - Math.min(cardCount - 1, MAX_PEEKS) * PEEK));
      schedule();
    };

    size();
    sc.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(size);
    ro.observe(sc);
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener('scroll', schedule);
      ro.disconnect();
    };
  }, [scrollRef, layoutKey, top, cardHeight, cardCount]);

  let n = -1;
  return (
    <div>
      {items.map((item) => {
        if (!item.card) {
          return (
            <div key={item.key} style={{ marginBottom: GAP }}>
              {item.node}
            </div>
          );
        }
        const i = ++n;
        return (
          <div
            key={item.key}
            ref={(el) => (cardRefs.current[i] = el)}
            className="sticky"
            style={{ top: top + Math.min(i, MAX_PEEKS) * PEEK, marginBottom: GAP, zIndex: i + 1 }}
          >
            <div className="relative origin-top rounded-2xl will-change-transform">
              {item.node}
              {/* darkens as the card gets covered */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-black" style={{ opacity: 0 }} />
            </div>
          </div>
        );
      })}
      {cardCount > 1 && <div aria-hidden="true" style={{ height: spacer }} />}
    </div>
  );
}
