import type { Photo } from '../types';

const cache = new Map<string, string>();

/** Returns a displayable URL for a photo (remote URL, or a cached object URL for local blobs). */
export function photoSrc(p?: Photo): string | undefined {
  if (!p) return undefined;
  if (p.url) return p.url;
  if (!p.blob) return undefined;
  let u = cache.get(p.id);
  if (!u) {
    u = URL.createObjectURL(p.blob);
    cache.set(p.id, u);
  }
  return u;
}

export function releasePhotoSrc(id: string) {
  const u = cache.get(id);
  if (u) {
    URL.revokeObjectURL(u);
    cache.delete(id);
  }
}
