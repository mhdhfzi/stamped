import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Place, Stop } from '../types';

interface Props {
  stops: Stop[];
  /** Hotels for this day (last night's and tonight's), drawn as their own pins. */
  hotels?: Place[];
  /** Route polyline as [lat, lng] pairs. */
  line?: [number, number][];
  approximate?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

function pinIcon(n: number, done: boolean, selected: boolean) {
  const bg = selected ? '#fff' : done ? '#22c55e' : '#3b82f6';
  const fg = selected ? '#000' : '#fff';
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:${bg};color:${fg};border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font:700 12px Inter,sans-serif">${n}</div>`,
  });
}

const hotelIcon = L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: '<div style="width:28px;height:28px;border-radius:8px;background:#f59e0b;color:#000;border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/></svg></div>',
});

/** Leaflet map with numbered stops and the day's route. */
export function DayMap({ stops, hotels = [], line, approximate, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
    // Standard OSM tiles, darkened in CSS (.stamped-map .leaflet-tile-pane) to match the app.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The container can change size after mount (tab switch, frame resize).
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Redraw markers + route, and refit only when the set of places changes.
  const points = [...hotels, ...stops];
  const fitKey = points.map((s) => `${s.lat},${s.lng}`).join(';');
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (line && line.length > 1) {
      L.polyline(line, { color: '#000', weight: 7, opacity: 0.35 }).addTo(g);
      L.polyline(line, { color: '#60a5fa', weight: 4, opacity: 0.95, dashArray: approximate ? '6 8' : undefined }).addTo(g);
    }
    hotels.forEach((h) => L.marker([h.lat, h.lng], { icon: hotelIcon, title: h.name, zIndexOffset: -100 }).addTo(g));
    stops.forEach((s, i) => {
      L.marker([s.lat, s.lng], { icon: pinIcon(i + 1, !!s.done, s.id === selectedId), zIndexOffset: s.id === selectedId ? 1000 : 0, title: s.name })
        .on('click', () => onSelectRef.current?.(s.id))
        .addTo(g);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, fitKey, line, approximate, selectedId]);

  useEffect(() => {
    const m = map.current;
    if (!m || !points.length) return;
    if (points.length === 1) m.setView([points[0].lat, points[0].lng], 15);
    else m.fitBounds(L.latLngBounds(points.map((s) => [s.lat, s.lng])), { padding: [36, 36], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const s = stops.find((x) => x.id === selectedId);
    if (s && map.current) map.current.panTo([s.lat, s.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // `isolate` keeps Leaflet's high z-index panes below our sheets.
  return <div ref={el} className="stamped-map relative isolate z-0 h-full w-full bg-[#1a1a1e]" />;
}
