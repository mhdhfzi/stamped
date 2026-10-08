import { useEffect, useState } from 'react';

// Every country's flag (flag-icons, MIT, 4:3) as a separate file, fetched only when a card needs it.
const FLAGS = import.meta.glob<string>('../../node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default' });

const cache = new Map<string, string>();

function loaderFor(code: string) {
  return FLAGS[`../../node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`];
}

/** URL of a country's flag image (ISO code like "JP"), or undefined while loading / if there is none. */
export function useFlag(code: string | undefined): string | undefined {
  const [url, setUrl] = useState(() => (code ? cache.get(code) : undefined));
  useEffect(() => {
    if (!code) return setUrl(undefined);
    const hit = cache.get(code);
    if (hit) return setUrl(hit);
    const load = loaderFor(code);
    if (!load) return setUrl(undefined);
    let live = true;
    load().then((u) => {
      cache.set(code, u);
      if (live) setUrl(u);
    }, () => undefined);
    return () => {
      live = false;
    };
  }, [code]);
  return url;
}
