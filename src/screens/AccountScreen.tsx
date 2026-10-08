import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Download, HardDrive, Pencil, Trash2, Upload } from 'lucide-react';
import { useStore } from '../store';
import { REGIONS, COUNTRIES, TOTAL_COUNTRIES, getCountry, regionOf } from '../data/countries';
import { downloadBlob, fmtDate, formatBytes } from '../lib/utils';
import { isVisited } from '../lib/tripStatus';
import { convert, fmtMoney, loadRates, type Rates } from '../lib/money';
import { CurrencySelect } from '../components/TripBudget';
import { ConfirmSheet, Field, PrimaryButton, Sheet, SheetRow, TopBar, inputClass } from '../components/ui';
import { cloudConfigured } from '../lib/cloudConfig';

const AccountCloud = lazy(() => import('../components/group/AccountCloud'));

export function AccountScreen({ onOpenTrip, onSignIn }: { onOpenTrip: (id: string) => void; onSignIn: () => void }) {
  const { trips, photos, photosOf, expenses, homeCurrency, setHomeCurrency, profileName, setProfileName, exportBackup, importBackup, resetAll, notify, storageMode } = useStore();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(profileName);
  const [confirmReset, setConfirmReset] = useState(false);
  const [usage, setUsage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    loadRates().then(setRates);
  }, []);
  // All trips' spending in the home currency (expenses without a rate yet are left out).
  const spent = useMemo(() => expenses.reduce((sum, e) => sum + (convert(e.amount, e.currency, homeCurrency, rates) ?? 0), 0), [expenses, homeCurrency, rates]);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage != null ? formatBytes(e.usage) : null)).catch(() => undefined);
  }, [photos.length]);

  // Only trips you've been on count; planned ones are shown as "next stamps".
  const countries = useMemo(() => [...new Set(trips.filter((t) => isVisited(t, photosOf(t.id).length)).map((t) => t.countryCode))], [trips, photosOf]);
  const plannedCountries = useMemo(
    () => [...new Set(trips.filter((t) => !isVisited(t, photosOf(t.id).length)).map((t) => t.countryCode))].filter((c) => !countries.includes(c)),
    [trips, photosOf, countries],
  );
  const regionsVisited = new Set(countries.map(regionOf)).size;
  const favorites = photos.filter((p) => p.favorite).length;
  const pct = Math.min(100, (countries.length / TOTAL_COUNTRIES) * 100);
  const firstTrip = photos.length ? Math.min(...photos.map((p) => p.takenAt)) : null;

  const stats = [
    { label: 'Countries', value: countries.length },
    { label: 'Moments', value: photos.length },
    { label: 'Regions', value: `${regionsVisited}/${REGIONS.length}` },
    { label: 'Favourites', value: favorites },
  ];

  return (
    <>
      <TopBar left={<span className="text-lg font-semibold text-white">Account</span>} />
      <div className="absolute inset-0 overflow-y-auto scrollbar-hide px-6 pt-28 pb-28 animate-fade-in">
        {/* Profile */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #ff8a5c, #7a5cff)' }}>
            {profileName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <button type="button" onClick={() => { setName(profileName); setEditName(true); }} className="flex items-center gap-2 text-white text-xl font-semibold truncate">
              {profileName} <Pencil size={14} className="text-white/40" />
            </button>
            <p className="text-white/40 text-xs mt-0.5">{firstTrip ? `Travelling since ${fmtDate(firstTrip, { month: 'long', year: 'numeric' })}` : 'Ready for the first stamp'}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mt-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
              <p className="text-white text-2xl font-bold tracking-tight">{s.value}</p>
              <p className="text-white/40 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* World progress */}
        <section className="mt-6 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-white text-sm font-semibold">World explored</p>
            <p className="text-white/50 text-xs">{countries.length} of {TOTAL_COUNTRIES} · {pct.toFixed(1)}%</p>
          </div>
          <div className="h-2 rounded-full bg-white/10 mt-3 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, countries.length ? 2 : 0)}%`, background: 'linear-gradient(90deg, #ff8a5c, #7a5cff)' }} />
          </div>
          <div className="mt-4 space-y-2.5">
            {REGIONS.map((r) => {
              const total = COUNTRIES.filter((c) => c.region === r).length;
              const n = countries.filter((c) => regionOf(c) === r).length;
              return (
                <div key={r} className="flex items-center gap-3">
                  <span className="text-white/60 text-xs w-24 shrink-0">{r}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-white/70 rounded-full" style={{ width: `${(n / total) * 100}%` }} />
                  </div>
                  <span className="text-white/40 text-[11px] w-10 text-right">{n}/{total}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Passport stamps */}
        <section className="mt-6">
          <p className="text-white text-sm font-semibold mb-3">Passport stamps</p>
          {countries.length ? (
            <div className="flex flex-wrap gap-2">
              {countries.map((code) => {
                const c = getCountry(code);
                return (
                  <span key={code} className="liquid-glass rounded-full pl-2 pr-3 py-1 text-xs text-white/80 flex items-center gap-1.5">
                    <span className="text-base leading-none">{c.flag}</span> {c.name}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-white/40 text-xs">Add a trip to collect your first stamp.</p>
          )}
          {plannedCountries.length > 0 && (
            <>
              <p className="text-white/50 text-xs font-medium mt-4 mb-2">Next stamps</p>
              <div className="flex flex-wrap gap-2">
                {plannedCountries.map((code) => {
                  const c = getCountry(code);
                  return (
                    <span key={code} className="rounded-full border border-dashed border-white/25 pl-2 pr-3 py-1 text-xs text-white/60 flex items-center gap-1.5">
                      <span className="text-base leading-none opacity-70">{c.flag}</span> {c.name}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {cloudConfigured && (
          <Suspense fallback={null}>
            <AccountCloud onOpenTrip={onOpenTrip} onSignIn={onSignIn} />
          </Suspense>
        )}

        {/* Money */}
        <section className="mt-8">
          <p className="text-white text-sm font-semibold mb-2">Money</p>
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm text-white">
              <span>
                Home currency
                <span className="block text-[11px] text-white/40">Trip totals and budgets are shown in this</span>
              </span>
              <CurrencySelect
                value={homeCurrency}
                onChange={setHomeCurrency}
                rates={rates}
                first={['MYR', 'USD', 'EUR', 'SGD', 'GBP', 'AUD']}
                className="shrink-0 bg-white/[0.08] rounded-xl px-3 py-2 text-sm font-semibold text-white"
              />
            </label>
            {expenses.length > 0 && (
              <p className="flex items-baseline justify-between text-sm text-white/70 border-t border-white/[0.06] pt-3">
                Spent on all trips <span className="text-white font-semibold">{fmtMoney(spent, homeCurrency)}</span>
              </p>
            )}
          </div>
        </section>

        {/* Data */}
        <section className="mt-8">
          <p className="text-white text-sm font-semibold mb-2">Your data</p>
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-1">
            <SheetRow
              icon={<Download size={18} />}
              label="Export backup"
              hint=".json"
              onClick={async () => {
                notify('Preparing backup…');
                const blob = await exportBackup();
                downloadBlob(blob, `stamped-backup-${new Date().toISOString().slice(0, 10)}.json`);
              }}
            />
            <SheetRow icon={<Upload size={18} />} label="Import backup" onClick={() => importRef.current?.click()} />
            <SheetRow
              icon={<HardDrive size={18} />}
              label="Storage"
              hint={storageMode === 'memory' ? 'Temporary (private mode)' : usage ? `${usage} on device` : 'On this device'}
            />
            <SheetRow icon={<Trash2 size={18} />} label="Delete all data" danger onClick={() => setConfirmReset(true)} />
          </div>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const n = await importBackup(f);
                notify(`Imported ${n} moments`);
              } catch (err) {
                notify(err instanceof Error ? err.message : 'Import failed');
              }
            }}
          />
          <p className="text-white/30 text-[11px] mt-3 leading-relaxed px-1">
            Photos never leave your device. They're compressed and stored privately in your browser. Export a backup now and then so you never lose them.
          </p>
        </section>
      </div>

      <Sheet open={editName} onClose={() => setEditName(false)} title="Your name">
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            await setProfileName(name);
            setEditName(false);
          }}
        >
          <Field label="Display name">
            <input autoFocus value={name} maxLength={30} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <PrimaryButton type="submit">Save</PrimaryButton>
        </form>
      </Sheet>

      <ConfirmSheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Delete everything?"
        message="All trips and photos on this device will be permanently removed. Export a backup first if you want to keep them."
        confirmLabel="Delete all data"
        onConfirm={async () => {
          await resetAll();
          setConfirmReset(false);
          notify('All data deleted');
        }}
      />
    </>
  );
}
