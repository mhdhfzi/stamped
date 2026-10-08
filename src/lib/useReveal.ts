import { useEffect, type RefObject } from 'react';

/**
 * Scroll reveal: elements with the `reveal` class inside `rootRef` fade and rise in as they come
 * into view, in a quick stagger (by position). New elements (tab switches, added photos) are picked
 * up automatically. Revealed state lives in a data attribute so React re-renders don't undo it.
 */
export function useReveal(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const shown = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target as HTMLElement)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        shown.forEach((el, i) => {
          el.style.setProperty('--reveal-delay', `${Math.min(i, 10) * 45}ms`);
          el.dataset.revealed = '1';
          io.unobserve(el);
        });
      },
      { root, threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
    );
    const scan = () => root.querySelectorAll<HTMLElement>('.reveal:not([data-revealed])').forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [rootRef]);
}
