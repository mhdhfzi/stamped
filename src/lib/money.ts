import { getRepo } from './db';
import { LOCAL_CURRENCIES } from '../data/currencies';

/**
 * Exchange rates (base USD) from free, key-less sources, cached on the device so
 * conversions keep working offline. Refreshed when older than 12 hours.
 */
export interface Rates {
  /** units per 1 USD, uppercase codes */
  rates: Record<string, number>;
  fetchedAt: number;
  source: string;
}

const MAX_AGE = 12 * 3600 * 1000;
let memo: Rates | null = null;
let inflight: Promise<Rates | null> | null = null;

async function fetchRates(): Promise<Rates> {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const j = await r.json();
    if (j?.result === 'success' && j.rates?.USD) return { rates: j.rates, fetchedAt: Date.now(), source: 'open.er-api.com' };
  } catch {
    /* fall through */
  }
  const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
  const j = await r.json();
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(j.usd as Record<string, number>)) if (/^[a-z]{3}$/.test(k) && v > 0) rates[k.toUpperCase()] = v;
  if (!rates.USD) throw new Error('No rates');
  return { rates, fetchedAt: Date.now(), source: 'currency-api (jsDelivr)' };
}

/** Cached rates, refreshing in the background when stale. Null only if never fetched and offline. */
export function loadRates(force = false): Promise<Rates | null> {
  if (memo && !force && Date.now() - memo.fetchedAt < MAX_AGE) return Promise.resolve(memo);
  inflight ??= (async () => {
    const repo = await getRepo();
    const cached = (await repo.getMeta('rates')) as Rates | undefined;
    if (cached && !memo) memo = cached;
    if (memo && !force && Date.now() - memo.fetchedAt < MAX_AGE) return memo;
    try {
      memo = await fetchRates();
      await repo.setMeta('rates', memo);
    } catch {
      /* offline: keep whatever we had */
    }
    return memo;
  })().finally(() => (inflight = null));
  return inflight;
}

/** Converts between currencies; null when a rate is missing. */
export function convert(amount: number, from: string, to: string, rates: Rates | null): number | null {
  if (from === to) return amount;
  const a = rates?.rates[from];
  const b = rates?.rates[to];
  return a && b ? (amount / a) * b : null;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
export function fmtMoney(amount: number, currency: string, opts: { compact?: boolean } = {}): string {
  const key = currency + (opts.compact ? 'c' : '');
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...(opts.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}) });
    } catch {
      f = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
    }
    fmtCache.set(key, f);
  }
  return f.format(amount);
}

/** Digits a currency normally uses (JPY 0, USD 2, KWD 3). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

let names: Intl.DisplayNames | null = null;
export function currencyName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'currency' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Parses a typed amount: "1,500" and "1.500,50" style thousands separators,
 * "12,50" as a decimal comma, spaces and currency symbols ignored. Null if not a number.
 */
export function parseAmount(input: string): number | null {
  let s = input.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: whichever comes last is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Only commas: groups of exactly 3 digits are thousands ("1,500", "12,000,000"); otherwise a decimal comma.
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, ''); // "1.500.000"
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Currencies worth offering in a picker: every country's local currency, plus others the
 * browser can name — skipping unnamed codes (CNH, GGP…), obsolete ones ("… (2009–2024)") and SDR.
 */
// Replaced currencies some rate feeds still list (kuna → euro 2023, lev → euro 2026, …) and the IMF's SDR.
const RETIRED = new Set(['HRK', 'BGN', 'SLL', 'ZWL', 'VEF', 'MRO', 'STD', 'CUC', 'XDR']);

export function selectableCurrencies(rates: Rates | null): string[] {
  return Object.keys(rates?.rates ?? {})
    .filter((c) => {
      if (LOCAL_CURRENCIES.has(c)) return true;
      const name = currencyName(c);
      return name !== c && !/\(\d{4}/.test(name) && !RETIRED.has(c);
    })
    .sort();
}

/** Short symbol shown inside the amount field: "RM", "¥", "$", "₩"… (falls back to the code). */
export function currencySymbol(code: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}
