import { useEffect, useState, type ReactNode } from 'react';

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

function useFitScale(h: number) {
  const [s, setS] = useState(1);
  useEffect(() => {
    const on = () => setS(Math.min(1, (window.innerHeight - 48) / h));
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [h]);
  return s;
}

/**
 * On desktop/tablet: renders the app inside the iPhone-style frame from the spec.
 * On a real phone (narrow screen): renders full-screen so it behaves like a native app.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const framed = useMedia('(min-width: 520px)');
  const scale = useFitScale(800);

  if (!framed) {
    return <div className="h-[100dvh] w-screen bg-[#0a0a0c] overflow-hidden relative">{children}</div>;
  }

  return (
    <div className="h-screen w-screen bg-white flex items-center justify-center overflow-hidden">
      <div
        className="relative shrink-0"
        style={{
          width: 375,
          height: 780,
          background: '#0a0a0c',
          borderRadius: 52,
          overflow: 'hidden',
          transform: scale < 1 ? `scale(${scale})` : undefined,
          boxShadow:
            'inset 0 0 0 2px rgba(255, 255, 255, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 0 10px #1a1a1e, 0 0 0 11px rgba(255, 255, 255, 0.06), 0 0 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-black rounded-b-2xl z-[60]" />
        {children}
      </div>
    </div>
  );
}
