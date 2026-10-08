import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Plane, Search, Stamp } from 'lucide-react';
import type { Country, Trip } from '../types';
import { COUNTRIES, REGIONS } from '../data/countries';
import { useStore } from '../store';
import { isVisited } from '../lib/tripStatus';
import { cn } from '../lib/utils';
import { Field, PrimaryButton, Sheet, inputClass } from './ui';

export function AddTripSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: Trip) => void }) {
  const { trips, addTrip, photosOf } = useStore();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Country | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [planned, setPlanned] = useState(false);

  useEffect(() => {
    if (open) {
      setQ('');
      setPicked(null);
      setTitle('');
      setPlanned(false);
    }
  }, [open]);

  const visited = useMemo(() => new Set(trips.filter((t) => isVisited(t, photosOf(t.id).length)).map((t) => t.countryCode)), [trips, photosOf]);
  const plannedCodes = useMemo(() => new Set(trips.filter((t) => !isVisited(t, photosOf(t.id).length)).map((t) => t.countryCode)), [trips, photosOf]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase() === s) : COUNTRIES;
    return REGIONS.map((r) => ({ region: r, items: list.filter((c) => c.region === r) })).filter((g) => g.items.length);
  }, [q]);

  async function create() {
    if (!picked) return;
    setBusy(true);
    const t = await addTrip(picked.code, title, planned);
    setBusy(false);
    onCreated(t);
  }

  return (
    <Sheet open={open} onClose={onClose} title={picked ? 'Name this trip' : 'Choose a country'}>
      {!picked ? (
        <div>
          <div className="relative mb-4 sticky top-0 z-10 bg-[#141417] pb-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 -mt-0.5" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search countries" className={inputClass + ' pl-10'} />
          </div>
          {groups.map((g) => (
            <div key={g.region} className="mb-4">
              <p className="text-[11px] uppercase tracking-wider text-white/40 font-medium mb-1 px-1">{g.region}</p>
              {g.items.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setPicked(c);
                    setTitle(c.name);
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 active:bg-white/10 text-left"
                >
                  <span className="text-2xl leading-none">{c.flag}</span>
                  <span className="flex-1 text-sm text-white">{c.name}</span>
                  {visited.has(c.code) ? (
                    <span className="text-[10px] font-medium text-emerald-300/90 bg-emerald-400/10 rounded-full px-2 py-0.5">Visited</span>
                  ) : (
                    plannedCodes.has(c.code) && <span className="text-[10px] font-medium text-sky-300/90 bg-sky-400/10 rounded-full px-2 py-0.5">Planned</span>
                  )}
                </button>
              ))}
            </div>
          ))}
          {!groups.length && <p className="text-center text-sm text-white/40 py-10">No country matches “{q}”.</p>}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="space-y-5"
        >
          <button type="button" onClick={() => setPicked(null)} className="flex items-center gap-1 text-xs text-white/50 -mt-1">
            <ChevronLeft size={14} /> Change country
          </button>
          <div className="flex items-center gap-4">
            <span className="text-5xl leading-none">{picked.flag}</span>
            <div>
              <p className="text-white text-lg font-semibold">{picked.name}</p>
              <p className="text-white/40 text-xs">{picked.region}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Trip type">
            {([
              [false, Stamp, 'Been there', 'Add photos & memories'],
              [true, Plane, 'Planning a trip', 'Plan days, hotels, routes'],
            ] as const).map(([v, Icon, label, hint]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={planned === v}
                onClick={() => setPlanned(v)}
                className={cn('rounded-2xl p-3 text-left border transition-colors', planned === v ? 'bg-white text-black border-white' : 'bg-white/[0.04] text-white border-white/10')}
              >
                <Icon size={18} className={planned === v ? 'text-black' : 'text-white/60'} />
                <span className="block text-sm font-semibold mt-2">{label}</span>
                <span className={cn('block text-[11px] mt-0.5', planned === v ? 'text-black/60' : 'text-white/40')}>{hint}</span>
              </button>
            ))}
          </div>
          <Field label="Card title">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={24} placeholder={picked.name} className={inputClass} />
          </Field>
          <p className="text-xs text-white/40 -mt-3">Tip: use a city name (like “Tokyo”) or keep the country name.</p>
          <PrimaryButton type="submit" disabled={busy}>{planned ? 'Start planning' : 'Create trip'}</PrimaryButton>
        </form>
      )}
    </Sheet>
  );
}
