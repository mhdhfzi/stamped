/**
 * Minimal EXIF reader for JPEG photos: the capture time and GPS position.
 * We need it because compression (canvas re-encode) drops EXIF, and a file's
 * lastModified on phones is often the time it was shared, not taken.
 */
export interface PhotoMeta {
  /** Local capture time (ms), from DateTimeOriginal. */
  takenAt?: number;
  lat?: number;
  lng?: number;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const GPS_LAT_REF = 1;
const GPS_LAT = 2;
const GPS_LNG_REF = 3;
const GPS_LNG = 4;

export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  try {
    // EXIF lives in the first APP1 segment, near the start of the file.
    return parseJpegMeta(new DataView(await file.slice(0, 256 * 1024).arrayBuffer()));
  } catch {
    return {};
  }
}

export function parseJpegMeta(v: DataView): PhotoMeta {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00) return {};
    const len = v.getUint16(off + 2);
    // APP1 "Exif\0\0"
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966 && v.getUint16(off + 8) === 0) {
      return parseTiff(v, off + 10);
    }
    if (marker === 0xffda) return {}; // start of image data: no EXIF
    off += 2 + len;
  }
  return {};
}

function parseTiff(v: DataView, tiff: number): PhotoMeta {
  const le = v.getUint16(tiff) === 0x4949; // "II" little-endian, "MM" big-endian
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  if (u16(tiff + 2) !== 42) return {};

  /** Reads one IFD into a map of tag → entry offset. */
  const ifd = (start: number) => {
    const tags = new Map<number, number>();
    if (start <= 0 || start + 2 > v.byteLength) return tags;
    const n = u16(start);
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      tags.set(u16(e), e);
    }
    return tags;
  };
  const valueOffset = (entry: number, bytes: number) => (bytes <= 4 ? entry + 8 : tiff + u32(entry + 8));
  const ascii = (entry: number) => {
    const count = u32(entry + 4);
    const at = valueOffset(entry, count);
    let s = '';
    for (let i = 0; i < count && at + i < v.byteLength; i++) {
      const c = v.getUint8(at + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rationals = (entry: number) => {
    const count = u32(entry + 4);
    const at = valueOffset(entry, count * 8);
    return Array.from({ length: count }, (_, i) => {
      const den = u32(at + i * 8 + 4);
      return den ? u32(at + i * 8) / den : 0;
    });
  };

  const out: PhotoMeta = {};
  const ifd0 = ifd(tiff + u32(tiff + 4));

  const exifPtr = ifd0.get(TAG_EXIF_IFD);
  const exif = exifPtr != null ? ifd(tiff + u32(exifPtr + 8)) : new Map<number, number>();
  const dt = exif.get(TAG_DATETIME_ORIGINAL) ?? ifd0.get(TAG_DATETIME);
  if (dt != null) out.takenAt = parseExifDate(ascii(dt));

  const gpsPtr = ifd0.get(TAG_GPS_IFD);
  if (gpsPtr != null) {
    const gps = ifd(tiff + u32(gpsPtr + 8));
    const lat = gps.get(GPS_LAT);
    const lng = gps.get(GPS_LNG);
    if (lat != null && lng != null) {
      const dms = (e: number) => {
        const [d = 0, m = 0, s = 0] = rationals(e);
        return d + m / 60 + s / 3600;
      };
      const latRef = gps.get(GPS_LAT_REF);
      const lngRef = gps.get(GPS_LNG_REF);
      let la = dms(lat);
      let lo = dms(lng);
      if (latRef != null && String.fromCharCode(v.getUint8(latRef + 8)) === 'S') la = -la;
      if (lngRef != null && String.fromCharCode(v.getUint8(lngRef + 8)) === 'W') lo = -lo;
      // 0,0 means "no fix" on many cameras.
      if (Number.isFinite(la) && Number.isFinite(lo) && (la || lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
        out.lat = la;
        out.lng = lo;
      }
    }
  }
  return out;
}

/** "2026:10:08 14:32:10" → local time in ms. */
function parseExifDate(s: string): number | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  if (y < 1990 || mo < 1 || mo > 12) return undefined;
  const t = new Date(y, mo - 1, d, h, mi, se).getTime();
  return Number.isFinite(t) ? t : undefined;
}
