import { useMemo, useState } from 'react';
import { ChevronLeft, Hand, Loader2, X } from 'lucide-react';
import { authErrorMessage, signInWithGoogle } from '../../lib/cloud';
import { AuthPanel } from '../group/AuthPanel';
import { InteractiveGlobe } from './InteractiveGlobe';
import { Emblem } from '../Emblem';

const GOOGLE_G = (
  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/**
 * Full-screen welcome / sign-in: the interactive globe is the backdrop (drag to spin, tap to fly),
 * with a centred serif headline and a single primary button over a dark fade at the bottom.
 */
export function LoginScreen({ onSkip, onClose }: { onSkip?: () => void; onClose?: () => void }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [stamps, setStamps] = useState(0);

  // A fixed starfield (positions chosen once).
  const stars = useMemo(
    () => Array.from({ length: 80 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, s: Math.random() < 0.15 ? 2 : 1, d: Math.random() * 4 })),
    [],
  );

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-[80] overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#10264a_0%,#05060a_62%)] animate-fade-in">
      {/* Stars */}
      <div className="pointer-events-none absolute inset-0">
        {stars.map((st, i) => (
          <span key={i} className="absolute rounded-full bg-white login-twinkle" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />
        ))}
      </div>

      {/* The globe fills the screen behind everything */}
      <InteractiveGlobe centerY={0.4} size={0.6} onInteract={() => setTouched(true)} onLaunch={setStamps} />

      {/* Dark fade so the headline and button read over the globe */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%] bg-gradient-to-t from-[#05060a] via-[#05060a]/90 to-transparent" />

      {/* Top: emblem (and close when opened from the app) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 pt-12 flex justify-center login-rise" style={{ animationDelay: '100ms' }}>
        <Emblem />
      </div>
      {onClose && (
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-12 right-5 w-9 h-9 rounded-full bg-white/10 backdrop-blur text-white/80 flex items-center justify-center active:scale-95">
          <X size={18} />
        </button>
      )}

      {/* Bottom: headline + actions. Only the controls take touches, so the globe stays draggable behind. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-7 pb-9 text-center">
        <span
          className={`inline-flex rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-[11px] text-white/80 items-center gap-1.5 transition-opacity duration-500 ${touched && !stamps ? 'opacity-0' : 'opacity-100'}`}
        >
          {stamps ? (
            <>
              <span className="text-amber-300">●</span> {stamps} {stamps === 1 ? 'place' : 'places'} stamped — tap to fly again
            </>
          ) : (
            <>
              <Hand size={12} /> Drag to spin · tap a place to fly ✈️
            </>
          )}
        </span>

        <h1 className="font-display mt-5 text-white text-[46px] leading-[0.95] drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)]">
          <span className="block login-rise" style={{ animationDelay: '250ms' }}>
            Every place you go,
          </span>
          <span className="block italic text-amber-100 login-rise" style={{ animationDelay: '420ms' }}>
            stamped.
          </span>
        </h1>
        <p className="mt-4 text-sm text-white/55 leading-relaxed login-rise" style={{ animationDelay: '600ms' }}>
          Plan, share and remember your trips —
          <br />
          together with your friends.
        </p>

        <div className="mt-7 space-y-3 login-rise" style={{ animationDelay: '760ms' }}>
          <button
            type="button"
            disabled={busy}
            onClick={google}
            className="pointer-events-auto w-full rounded-full bg-white text-black py-3.5 text-[15px] font-semibold flex items-center justify-center gap-2.5 shadow-[0_8px_30px_rgba(255,255,255,0.15)] active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : GOOGLE_G} Continue with Google
          </button>
          {error && <p className="text-xs text-red-300">{error}</p>}
          <button type="button" onClick={() => setEmailOpen(true)} className="pointer-events-auto text-sm font-medium text-white/85 active:opacity-70">
            Continue with email
          </button>
          {onSkip && (
            <button type="button" onClick={onSkip} className="pointer-events-auto block mx-auto text-xs text-white/45 active:opacity-70">
              Continue without an account
            </button>
          )}
          <p className="pt-1 text-[10px] text-white/30">Your photos always stay on your phone.</p>
        </div>
      </div>

      {/* Email sign-in slides up over the bottom */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${emailOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setEmailOpen(false)} />
        <div
          className={`absolute inset-x-0 bottom-0 rounded-t-[28px] bg-[#141417] border-t border-white/10 px-6 pt-4 pb-8 transition-transform duration-300 ease-out ${emailOpen ? 'translate-y-0' : 'translate-y-full'}`}
        >
          <button type="button" onClick={() => setEmailOpen(false)} className="mb-3 flex items-center gap-1 text-xs text-white/50 active:opacity-70">
            <ChevronLeft size={14} /> Back
          </button>
          {emailOpen && <AuthPanel showGoogle={false} />}
        </div>
      </div>
    </div>
  );
}
