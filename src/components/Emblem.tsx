/** The Stamped mark: orbit rings around a small plane (one ring slowly turns). */
export function Emblem({ width = 64 }: { width?: number }) {
  return (
    <svg width={width} height={(width * 40) / 64} viewBox="0 0 64 40" fill="none" aria-hidden="true" className="drop-shadow-[0_0_12px_rgba(147,197,253,0.6)]">
      <defs>
        <linearGradient id="emblem-g" x1="0" y1="0" x2="64" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#93c5fd" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="20" rx="29" ry="11" stroke="url(#emblem-g)" strokeWidth="1.6" opacity="0.9" />
      <g className="login-orbit">
        <ellipse cx="32" cy="20" rx="22" ry="17" stroke="url(#emblem-g)" strokeWidth="1.2" opacity="0.7" transform="rotate(-28 32 20)" />
      </g>
      <ellipse cx="32" cy="20" rx="11" ry="17" stroke="url(#emblem-g)" strokeWidth="1.2" opacity="0.6" />
      <path d="M38.5 20 L28.6 18.8 L27.2 14.4 L25.6 14.4 L26.7 18.6 L24.5 18.9 L23.4 17.2 L22.3 17.2 L23 20 L22.3 22.8 L23.4 22.8 L24.5 21.1 L26.7 21.4 L25.6 25.6 L27.2 25.6 L28.6 21.2 Z" fill="#fff" />
    </svg>
  );
}
