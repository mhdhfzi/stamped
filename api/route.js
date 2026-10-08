/**
 * POST /api/route  (Vercel serverless function)
 * Public-transport directions (subway, train, bus…) from the Google Routes API, simplified for the app.
 *
 * Body: { origin: {lat, lng}, destination: {lat, lng}, alternatives?: boolean, departureTime?: ISO string }
 * Needs the Vercel environment variable GOOGLE_MAPS_API_KEY (a key limited to the Routes API).
 * The key never reaches the phone; requests are only accepted from the app's own pages.
 */

const ALLOWED_HOSTS = ['stamped-three.vercel.app', 'localhost', '127.0.0.1'];
const FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.localizedValues',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.navigationInstruction.instructions',
  'routes.legs.steps.transitDetails',
].join(',');

// A light per-visitor limit (per server instance): 40 requests a minute.
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 40;
}

const seconds = (d) => (typeof d === 'string' ? parseFloat(d) || 0 : 0);
const point = (p) => ({ location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } } });
const valid = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/** "10:42" in the city's own time zone. */
function clock(iso, timeZone) {
  if (!iso) return undefined;
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timeZone || 'UTC' }).format(new Date(iso));
  } catch {
    return undefined;
  }
}

function simplify(route) {
  const steps = [];
  let timeZone;
  for (const leg of route.legs || []) {
    for (const s of leg.steps || []) {
      const duration = seconds(s.staticDuration);
      const distance = s.distanceMeters || 0;
      const t = s.transitDetails;
      if (s.travelMode === 'TRANSIT' && t) {
        const line = t.transitLine || {};
        const stops = t.stopDetails || {};
        timeZone = t.localizedValues?.departureTime?.timeZone || timeZone;
        steps.push({
          mode: 'transit',
          duration,
          distance,
          vehicle: line.vehicle?.type || 'TRANSIT',
          vehicleName: line.vehicle?.name?.text,
          line: line.name,
          short: line.nameShort,
          color: line.color,
          textColor: line.textColor,
          icon: line.vehicle?.iconUri ? (line.vehicle.iconUri.startsWith('//') ? `https:${line.vehicle.iconUri}` : line.vehicle.iconUri) : undefined,
          agency: line.agencies?.[0]?.name,
          headsign: t.headsign,
          from: stops.departureStop?.name,
          to: stops.arrivalStop?.name,
          departAt: stops.departureTime,
          arriveAt: stops.arrivalTime,
          stops: t.stopCount,
          headway: t.headway ? seconds(t.headway) : undefined,
        });
      } else {
        // Merge back-to-back walking steps into one "walk 6 min".
        const prev = steps[steps.length - 1];
        if (prev && prev.mode === 'walk') {
          prev.duration += duration;
          prev.distance += distance;
        } else steps.push({ mode: 'walk', duration, distance, instruction: s.navigationInstruction?.instructions });
      }
    }
  }
  for (const s of steps) {
    if (s.mode !== 'transit') continue;
    s.departTime = clock(s.departAt, timeZone);
    s.arriveTime = clock(s.arriveAt, timeZone);
  }
  // Whole journey: leave = first ride minus the walk before it; arrive = last ride plus the walk after it.
  const rides = steps.filter((s) => s.mode === 'transit');
  let departTime;
  let arriveTime;
  if (rides.length) {
    const first = steps.indexOf(rides[0]);
    const last = steps.indexOf(rides[rides.length - 1]);
    const before = steps.slice(0, first).reduce((a, s) => a + s.duration, 0);
    const after = steps.slice(last + 1).reduce((a, s) => a + s.duration, 0);
    if (rides[0].departAt) departTime = clock(new Date(Date.parse(rides[0].departAt) - before * 1000).toISOString(), timeZone);
    const end = rides[rides.length - 1].arriveAt;
    if (end) arriveTime = clock(new Date(Date.parse(end) + after * 1000).toISOString(), timeZone);
  }
  return {
    duration: seconds(route.duration),
    distance: route.distanceMeters || 0,
    departTime,
    arriveTime,
    fare: route.localizedValues?.transitFare?.text,
    polyline: route.polyline?.encodedPolyline,
    steps,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: 'not-setup' });

  // Only from the app's own pages (stops others from using your key through this server).
  const from = req.headers.origin || req.headers.referer || '';
  let host = '';
  try {
    host = new URL(from).hostname;
  } catch {
    /* no origin */
  }
  // (Vercel preview deployments are named stamped-….vercel.app.)
  if (!ALLOWED_HOSTS.includes(host) && !(host.startsWith('stamped') && host.endsWith('.vercel.app'))) return res.status(403).json({ error: 'forbidden' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) return res.status(429).json({ error: 'slow-down' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { origin, destination, alternatives, departureTime } = body;
  if (!valid(origin) || !valid(destination)) return res.status(400).json({ error: 'origin and destination are required' });

  const request = {
    origin: point(origin),
    destination: point(destination),
    travelMode: 'TRANSIT',
    computeAlternativeRoutes: !!alternatives,
    languageCode: 'en',
    units: 'METRIC',
  };
  if (typeof departureTime === 'string' && !Number.isNaN(Date.parse(departureTime))) request.departureTime = new Date(departureTime).toISOString();

  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify(request),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('Routes API error', r.status, JSON.stringify(json).slice(0, 500));
    return res.status(502).json({ error: 'routes-failed', status: r.status, message: json?.error?.message });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ routes: (json.routes || []).map(simplify) });
}
