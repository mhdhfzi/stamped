import { useEffect, useRef } from 'react';
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import landTopo from 'world-atlas/land-110m.json';

type LonLat = [number, number];

const CITIES: Record<string, LonLat> = {
  'Kuala Lumpur': [101.71, 2.75],
  Tokyo: [139.69, 35.69],
  Kyoto: [135.77, 35.01],
  Seoul: [126.98, 37.57],
  Bali: [115.19, -8.41],
  Bangkok: [100.5, 13.76],
  Singapore: [103.82, 1.35],
  Dubai: [55.27, 25.2],
  Istanbul: [28.98, 41.01],
  Rome: [12.5, 41.9],
  Paris: [2.35, 48.86],
  London: [-0.13, 51.5],
  Sydney: [151.21, -33.87],
  'New York': [-74, 40.71],
};
const HOME = CITIES['Kuala Lumpur'];

const ROUTES: [string, string][] = [
  ['Kuala Lumpur', 'Tokyo'],
  ['Kuala Lumpur', 'Seoul'],
  ['Kuala Lumpur', 'Bali'],
  ['Kuala Lumpur', 'Rome'],
  ['Kuala Lumpur', 'London'],
  ['Kuala Lumpur', 'Sydney'],
  ['Kuala Lumpur', 'Istanbul'],
  ['Singapore', 'Paris'],
  ['Bangkok', 'Dubai'],
  ['Tokyo', 'New York'],
  ['Seoul', 'Sydney'],
];

/** Where each continent's name sits on the globe. */
const CONTINENTS: { name: string; at: LonLat }[] = [
  { name: 'Asia', at: [92, 46] },
  { name: 'Europe', at: [18, 53] },
  { name: 'Africa', at: [20, 6] },
  { name: 'North America', at: [-102, 46] },
  { name: 'South America', at: [-60, -14] },
  { name: 'Oceania', at: [134, -24] },
  { name: 'Antarctica', at: [20, -78] },
];

// A small airliner, nose pointing along +x.
const PLANE = new Path2D('M13 0 L-5 -2.2 L-7.5 -10 L-10.5 -10 L-8.5 -1.8 L-12.5 -1.4 L-14.5 -4.5 L-16.5 -4.5 L-15.2 0 L-16.5 4.5 L-14.5 4.5 L-12.5 1.4 L-8.5 1.8 L-10.5 10 L-7.5 10 L-5 2.2 Z');

const land = feature(landTopo as unknown as Topology, (landTopo as unknown as Topology).objects.land);
const graticule = geoGraticule10();

interface Plane {
  from: LonLat;
  to: LonLat;
  interp: (t: number) => LonLat;
  t: number;
  /** ms for the whole flight */
  dur: number;
  mine: boolean;
}
interface Pin {
  at: LonLat;
  born: number;
}

const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function newPlane(from: LonLat, to: LonLat, mine = false): Plane {
  const d = geoDistance(from, to); // radians
  return { from, to, interp: geoInterpolate(from, to) as (t: number) => LonLat, t: 0, dur: 2600 + d * 2200, mine };
}

/**
 * A spinning 3D globe on canvas: drag to rotate (with momentum), tap to send a plane from home
 * to that spot (it drops a stamp when it lands), and planes fly great-circle routes.
 */
export function InteractiveGlobe({
  onLaunch,
  onInteract,
  centerY = 0.5,
  size = 0.43,
}: {
  onLaunch?: (stamps: number) => void;
  onInteract?: () => void;
  /** Vertical position of the globe's centre, as a fraction of the height. */
  centerY?: number;
  /** Radius as a fraction of the smaller side (above 0.5 the globe runs past the edges). */
  size?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cb = useRef({ onLaunch, onInteract });
  cb.current = { onLaunch, onInteract };

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let r = 0;

    // Start centred over Southeast Asia, slightly tilted.
    const rot = { lambda: -108, phi: -12 };
    const vel = { lambda: 0, phi: 0 };
    let lastTouch = 0;
    const planes: Plane[] = [];
    const pins: Pin[] = [];
    let stamps = 0;
    let nextSpawn = 0;

    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(projection, ctx);

    // Keep the element itself: a last resize can arrive after React has let go of the ref.
    const box = wrap.current!;
    const resize = () => {
      if (!box.isConnected) return;
      const b = box.getBoundingClientRect();
      w = b.width;
      h = b.height;
      r = Math.min(w, h) * size;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      projection.translate([w / 2, h * centerY]).scale(r);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    const center = (): LonLat => [-rot.lambda, -rot.phi];
    const visible = (p: LonLat, margin = 0) => geoDistance(p, center()) < Math.PI / 2 - margin;

    // ── Interaction ──
    let drag: { x: number; y: number; t: number; lambda: number; phi: number; moved: number; lx: number; ly: number; lt: number } | null = null;
    const degPerPx = () => 57.3 / r;

    const onDown = (e: PointerEvent) => {
      try {
        el.setPointerCapture(e.pointerId); // keep receiving moves while dragging off the canvas
      } catch {
        /* some synthetic/stale pointers can't be captured — dragging still works inside the canvas */
      }
      drag = { x: e.offsetX, y: e.offsetY, t: performance.now(), lambda: rot.lambda, phi: rot.phi, moved: 0, lx: e.offsetX, ly: e.offsetY, lt: performance.now() };
      vel.lambda = vel.phi = 0;
      lastTouch = performance.now();
      cb.current.onInteract?.();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.offsetX - drag.x;
      const dy = e.offsetY - drag.y;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      rot.lambda = drag.lambda + dx * degPerPx();
      rot.phi = Math.max(-70, Math.min(70, drag.phi - dy * degPerPx()));
      const now = performance.now();
      const dt = Math.max(1, now - drag.lt);
      vel.lambda = ((e.offsetX - drag.lx) * degPerPx()) / dt;
      vel.phi = (-(e.offsetY - drag.ly) * degPerPx()) / dt;
      drag.lx = e.offsetX;
      drag.ly = e.offsetY;
      drag.lt = now;
      lastTouch = now;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      const tap = drag.moved < 6 && performance.now() - drag.t < 350;
      if (tap) {
        vel.lambda = vel.phi = 0;
        const inside = Math.hypot(e.offsetX - w / 2, e.offsetY - h * centerY) < r;
        const at = inside ? (projection.invert?.([e.offsetX, e.offsetY]) as LonLat | null) : null;
        if (at) planes.push(newPlane(HOME, at, true));
      } else if (performance.now() - drag.lt > 80) {
        vel.lambda = vel.phi = 0; // held still before letting go: no fling
      }
      drag = null;
      lastTouch = performance.now();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    // ── Drawing ──
    const sphere = { type: 'Sphere' } as const;
    const drawPlane = (x: number, y: number, angle: number, scale: number, mine: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.shadowColor = mine ? 'rgba(251,191,36,0.9)' : 'rgba(147,197,253,0.8)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#fff';
      ctx.fill(PLANE);
      ctx.restore();
    };

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;

      // Motion: momentum after a fling, then a slow idle spin.
      if (!drag) {
        if (Math.abs(vel.lambda) > 0.0005 || Math.abs(vel.phi) > 0.0005) {
          rot.lambda += vel.lambda * dt;
          rot.phi = Math.max(-70, Math.min(70, rot.phi + vel.phi * dt));
          const decay = Math.pow(0.94, dt / 16);
          vel.lambda *= decay;
          vel.phi *= decay;
        } else if (!reduced && now - lastTouch > 1800) {
          rot.lambda += 0.006 * dt;
        }
      }
      projection.rotate([rot.lambda, rot.phi]);

      // Ambient traffic.
      if (!reduced && now > nextSpawn && planes.filter((p) => !p.mine).length < 5) {
        const [a, b] = rand(ROUTES);
        planes.push(Math.random() < 0.5 ? newPlane(CITIES[a], CITIES[b]) : newPlane(CITIES[b], CITIES[a]));
        nextSpawn = now + 900 + Math.random() * 1400;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * centerY;

      // Atmosphere glow
      const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.3);
      glow.addColorStop(0, 'rgba(96,165,250,0.35)');
      glow.addColorStop(1, 'rgba(96,165,250,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Ocean
      const ocean = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      ocean.addColorStop(0, '#1b3358');
      ocean.addColorStop(1, '#070d1a');
      ctx.beginPath();
      path(sphere);
      ctx.fillStyle = ocean;
      ctx.fill();

      // Grid + land
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.beginPath();
      path(land);
      ctx.fillStyle = '#2b4a6f';
      ctx.fill();
      ctx.strokeStyle = 'rgba(147,197,253,0.35)';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Continent names — fade out towards the edge of the globe, where they'd be squashed
      const labelSize = Math.max(9, Math.min(13, r / 17));
      ctx.font = `600 ${labelSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2px';
      for (const c of CONTINENTS) {
        const d = geoDistance(c.at, center());
        const fade = Math.max(0, Math.min(1, (Math.PI / 2 - 0.35 - d) / 0.5));
        if (!fade) continue;
        const [x, y] = projection(c.at)!;
        const label = c.name.toUpperCase();
        // The globe is wider than the screen: fade names out before they'd be cut off at the sides.
        const half = ctx.measureText(label).width / 2;
        const overflow = Math.max(0, 10 - (x - half), x + half - (w - 10));
        const edge = Math.max(0, 1 - overflow / 28);
        if (!edge) continue;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = `rgba(226,236,255,${0.62 * fade * edge})`;
        ctx.fillText(label, x, y);
      }
      ctx.shadowBlur = 0;
      if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';

      // Rim light
      ctx.beginPath();
      path(sphere);
      ctx.strokeStyle = 'rgba(147,197,253,0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Cities
      for (const p of Object.values(CITIES)) {
        if (!visible(p)) continue;
        const [x, y] = projection(p)!;
        const pulse = 0.5 + 0.5 * Math.sin(now / 600 + p[0]);
        ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flights: faint full route, bright trail, then the plane
      for (let i = planes.length - 1; i >= 0; i--) {
        const pl = planes[i];
        pl.t = Math.min(1, pl.t + dt / pl.dur);
        const route = { type: 'LineString' as const, coordinates: Array.from({ length: 33 }, (_, k) => pl.interp(k / 32)) };
        ctx.beginPath();
        path(route);
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = pl.mine ? 'rgba(251,191,36,0.35)' : 'rgba(147,197,253,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        const tail = Math.max(0, pl.t - 0.35);
        const steps = 14;
        const trail = { type: 'LineString' as const, coordinates: Array.from({ length: steps + 1 }, (_, k) => pl.interp(tail + ((pl.t - tail) * k) / steps)) };
        ctx.beginPath();
        path(trail);
        ctx.strokeStyle = pl.mine ? 'rgba(251,191,36,0.95)' : 'rgba(191,219,254,0.75)';
        ctx.lineWidth = pl.mine ? 2 : 1.4;
        ctx.stroke();

        const pos = pl.interp(pl.t);
        if (visible(pos)) {
          const [x, y] = projection(pos)!;
          const ahead = projection(pl.interp(Math.min(1, pl.t + 0.01)));
          const angle = ahead ? Math.atan2(ahead[1] - y, ahead[0] - x) : 0;
          const lift = Math.sin(Math.PI * pl.t); // bigger mid-flight = "higher"
          drawPlane(x, y, angle, (pl.mine ? 0.75 : 0.55) + lift * 0.35, pl.mine);
        }
        if (pl.t >= 1) {
          if (pl.mine) {
            pins.push({ at: pl.to, born: now });
            stamps++;
            cb.current.onLaunch?.(stamps);
          }
          planes.splice(i, 1);
        }
      }

      // Stamps you've dropped, with a ripple when they land
      for (const pin of pins) {
        if (!visible(pin.at)) continue;
        const [x, y] = projection(pin.at)!;
        const age = (now - pin.born) / 1000;
        if (age < 1.6) {
          for (const off of [0, 0.4]) {
            const a = age - off;
            if (a < 0 || a > 1.2) continue;
            ctx.beginPath();
            ctx.arc(x, y, 4 + a * 22, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(251,191,36,${0.8 * (1 - a / 1.2)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas ref={canvas} className="block touch-none cursor-grab active:cursor-grabbing" aria-label="Interactive globe: drag to spin, tap to send a plane" role="img" />
    </div>
  );
}
