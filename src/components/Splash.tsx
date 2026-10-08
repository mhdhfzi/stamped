import { useMemo } from 'react';
import { Emblem } from './Emblem';
// Square flag images (flag-icons, MIT) — real images, because Windows doesn't draw flag emoji.
import my from 'flag-icons/flags/1x1/my.svg';
import jp from 'flag-icons/flags/1x1/jp.svg';
import kr from 'flag-icons/flags/1x1/kr.svg';
import id from 'flag-icons/flags/1x1/id.svg';
import th from 'flag-icons/flags/1x1/th.svg';
import sg from 'flag-icons/flags/1x1/sg.svg';
import it from 'flag-icons/flags/1x1/it.svg';
import fr from 'flag-icons/flags/1x1/fr.svg';
import gb from 'flag-icons/flags/1x1/gb.svg';
import us from 'flag-icons/flags/1x1/us.svg';
import au from 'flag-icons/flags/1x1/au.svg';
import tr from 'flag-icons/flags/1x1/tr.svg';
import gr from 'flag-icons/flags/1x1/gr.svg';
import ca from 'flag-icons/flags/1x1/ca.svg';
import za from 'flag-icons/flags/1x1/za.svg';
import inFlag from 'flag-icons/flags/1x1/in.svg';
import ch from 'flag-icons/flags/1x1/ch.svg';
import nz from 'flag-icons/flags/1x1/nz.svg';
import ae from 'flag-icons/flags/1x1/ae.svg';
import vn from 'flag-icons/flags/1x1/vn.svg';

const OUTER = [my, jp, kr, id, th, sg, it, fr, gb, us, au, tr];
// Flags with simple designs only (detailed coats of arms are 10–80 KB each).
const INNER = [gr, ca, za, inFlag, ch, nz, ae, vn];

/** One ring of flags. The ring turns; each flag turns back the other way so it stays upright. */
function FlagRing({ flags, radius, size, reverse, seconds, delay }: { flags: string[]; radius: number; size: number; reverse?: boolean; seconds: number; delay: number }) {
  return (
    <div className="absolute inset-0 splash-spin" style={{ animationDuration: `${seconds}s`, animationDirection: reverse ? 'reverse' : 'normal' }}>
      {flags.map((src, i) => {
        const angle = (360 / flags.length) * i;
        return (
          <div
            key={src}
            className="absolute left-1/2 top-1/2"
            style={{ width: size, height: size, margin: -size / 2, transform: `rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle}deg)` }}
          >
            {/* counter-spin keeps the flag upright */}
            <div className="w-full h-full splash-spin" style={{ animationDuration: `${seconds}s`, animationDirection: reverse ? 'normal' : 'reverse' }}>
              <img
                src={src}
                alt=""
                draggable={false}
                className="w-full h-full rounded-full object-cover ring-2 ring-white/25 shadow-[0_4px_14px_rgba(0,0,0,0.5)] splash-pop"
                style={{ animationDelay: `${delay + i * 70}ms` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Name size on the welcome line: big for short names, smaller as they get longer (then "…"). */
function greetingSize(name: string) {
  const n = name.trim().length;
  return n <= 12 ? 28 : n <= 18 ? 24 : n <= 26 ? 20 : 18;
}

/**
 * Launch screen shown every time the app opens: rings of country flags spinning around the emblem.
 * Stays until the app is ready, then fades into the home page (or the sign-up screen for new users).
 */
export function Splash({ leaving, resolved, name }: { leaving: boolean; resolved: boolean; name: string | null }) {
  const stars = useMemo(
    () => Array.from({ length: 60 }, () => ({ x: Math.random() * 100, y: Math.random() * 100, s: Math.random() < 0.15 ? 2 : 1, d: Math.random() * 4 })),
    [],
  );

  return (
    <div
      role="status"
      aria-label="Loading Stamped"
      className={`absolute inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#10264a_0%,#05060a_62%)] transition-all duration-500 ease-out ${leaving ? 'opacity-0 scale-[1.04] pointer-events-none' : 'opacity-100'}`}
    >
      <div className="pointer-events-none absolute inset-0">
        {stars.map((st, i) => (
          <span key={i} className="absolute rounded-full bg-white login-twinkle" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />
        ))}
      </div>

      {/* Spinning flags around the emblem */}
      <div className="relative w-[300px] h-[300px] -mt-10">
        {/* faint orbit lines */}
        <span className="absolute inset-[18px] rounded-full border border-white/[0.07]" />
        <span className="absolute inset-[66px] rounded-full border border-dashed border-white/[0.08]" />
        <FlagRing flags={OUTER} radius={132} size={40} seconds={26} delay={100} />
        <FlagRing flags={INNER} radius={84} size={30} seconds={34} delay={500} reverse />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="absolute w-28 h-28 rounded-full bg-sky-400/20 blur-2xl splash-pulse" />
          <span className="relative login-rise">
            <Emblem width={84} />
          </span>
        </div>
      </div>

      <h1 className="font-display mt-6 text-white text-[52px] leading-none login-rise" style={{ animationDelay: '250ms' }}>
        Stamped
      </h1>
      {/* Greeting: fixed space under the title so nothing jumps; long names shrink, then end in "…" */}
      <div className={`mt-4 h-16 w-full max-w-[320px] px-6 flex flex-col items-center justify-start text-center transition-all duration-500 ease-out ${resolved ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
        {name ? (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">Welcome back</span>
            <span className="mt-1.5 max-w-full truncate font-display italic leading-tight text-amber-100" style={{ fontSize: greetingSize(name) }} title={name}>
              {name}
            </span>
          </>
        ) : (
          <span className="font-display italic text-base text-amber-100/80">Every place you go, stamped.</span>
        )}
      </div>

      {/* Indeterminate loading bar */}
      <div className="absolute bottom-20 w-28 h-[3px] rounded-full bg-white/10 overflow-hidden">
        <span className="block h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-sky-200 to-transparent splash-bar" />
      </div>
    </div>
  );
}
