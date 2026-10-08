import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { haversine, type LatLng, type Stay } from '../lib/geo';

export const STAY_COLORS: Record<string, string> = {
  hotel: '#3b82f6',
  hostel: '#a855f7',
  guest_house: '#10b981',
};
export const stayColor = (type: string) => STAY_COLORS[type] ?? '#f59e0b';

interface Props {
  center: LatLng;
  radius: number;
  stays: Stay[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Called when the user pans/zooms, with the new centre and a search radius that fits the view. */
  onMoved?: (center: LatLng, radius: number) => void;
}

/** Map of places to stay around an area. */
export function StaysMap({ center, radius, stays, selectedId, onSelect, onMoved }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const area = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onSelect, onMoved });
  cb.current = { onSelect, onMoved };
  // Ignore move events caused by our own fitBounds/panTo.
  const quietUntil = useRef(0);
  const programmatic = () => (quietUntil.current = Date.now() + 800);

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, scrollWheelZoom: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    area.current = L.layerGroup().addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('moveend', () => {
      if (Date.now() < quietUntil.current) return;
      const b = m.getBounds();
      const c = b.getCenter();
      const r = Math.min(haversine(c, { lat: b.getNorth(), lng: c.lng }), haversine(c, { lat: c.lat, lng: b.getEast() }));
      cb.current.onMoved?.({ lat: c.lat, lng: c.lng }, Math.min(3000, Math.max(300, r)));
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Searched area: a soft circle, refit when it changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !area.current) return;
    area.current.clearLayers();
    L.circle([center.lat, center.lng], { radius, color: '#fff', weight: 1, opacity: 0.4, fillOpacity: 0.04, dashArray: '4 6' }).addTo(area.current);
    L.circleMarker([center.lat, center.lng], { radius: 4, color: '#fff', weight: 2, fillColor: '#000', fillOpacity: 1 }).addTo(area.current);
    programmatic();
    // Computed from the centre — circle.getBounds() needs the map to already have a view.
    m.fitBounds(L.latLng(center.lat, center.lng).toBounds(radius * 2), { padding: [8, 8] });
  }, [center.lat, center.lng, radius]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    // Selected last so it draws on top.
    const sorted = [...stays].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
    for (const s of sorted) {
      const sel = s.id === selectedId;
      L.circleMarker([s.lat, s.lng], {
        radius: sel ? 9 : 6,
        color: sel ? '#fff' : 'rgba(0,0,0,.6)',
        weight: sel ? 3 : 1.5,
        fillColor: stayColor(s.type),
        fillOpacity: 1,
      })
        .bindTooltip(s.name, { direction: 'top', offset: [0, -6] })
        .on('click', () => cb.current.onSelect?.(s.id))
        .addTo(g);
    }
  }, [stays, selectedId]);

  useEffect(() => {
    const s = stays.find((x) => x.id === selectedId);
    const m = map.current;
    if (!s || !m) return;
    if (!m.getBounds().pad(-0.1).contains([s.lat, s.lng])) {
      programmatic();
      m.panTo([s.lat, s.lng]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={el} className="stamped-map relative isolate z-0 h-full w-full bg-[#1a1a1e]" />;
}
