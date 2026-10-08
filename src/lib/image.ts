/**
 * Resizes and re-encodes a photo before storing it, so a 12 MB phone picture
 * becomes a ~300–600 KB JPEG. EXIF orientation is respected.
 * Falls back to the original file if the browser can't decode it (e.g. HEIC on Chrome).
 */
export async function compressImage(file: File, maxDim = 1800, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export async function dataURLToBlob(d: string): Promise<Blob> {
  return (await fetch(d)).blob();
}
