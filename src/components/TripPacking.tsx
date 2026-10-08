import { useState } from 'react';
import { Backpack, Check, Copy, Eye, EyeOff, FileText, HeartPulse, Plug, Plus, RotateCcw, Shirt, Sparkles, X, type LucideIcon } from 'lucide-react';
import type { PackCategory, PackItem, Trip } from '../types';
import { useStore } from '../store';
import { cn, dayCount, uid } from '../lib/utils';
import { EmptyState, PrimaryButton, inputClass } from './ui';

export const PACK_CATEGORIES: { id: PackCategory; label: string; Icon: LucideIcon }[] = [
  { id: 'documents', label: 'Documents & money', Icon: FileText },
  { id: 'clothes', label: 'Clothes', Icon: Shirt },
  { id: 'toiletries', label: 'Toiletries', Icon: Sparkles },
  { id: 'electronics', label: 'Electronics', Icon: Plug },
  { id: 'health', label: 'Health', Icon: HeartPulse },
  { id: 'other', label: 'Other', Icon: Backpack },
];

type Seed = [PackCategory, string];

/** Starter list sized to the trip: daily clothes up to a week (then you do laundry). */
function essentials(nights: number): Seed[] {
  const d = Math.max(1, Math.min(nights, 7));
  return [
    ['documents', 'Passport'],
    ['documents', 'Flight & hotel bookings'],
    ['documents', 'Travel insurance'],
    ['documents', 'Cards & some cash'],
    ['clothes', `Underwear ×${d}`],
    ['clothes', `Socks ×${d}`],
    ['clothes', `T-shirts / tops ×${d}`],
    ['clothes', `Trousers / shorts ×${Math.ceil(d / 3)}`],
    ['clothes', 'Sleepwear'],
    ['clothes', 'Light jacket'],
    ['clothes', 'Comfortable walking shoes'],
    ['toiletries', 'Toothbrush & toothpaste'],
    ['toiletries', 'Deodorant'],
    ['toiletries', 'Shampoo & body wash'],
    ['toiletries', 'Sunscreen'],
    ['electronics', 'Phone & charger'],
    ['electronics', 'Power adapter'],
    ['electronics', 'Power bank'],
    ['electronics', 'Earphones'],
    ['health', 'Personal medication'],
    ['health', 'Plasters & painkillers'],
    ['other', 'Day bag'],
    ['other', 'Reusable water bottle'],
  ];
}

const PACKS: { id: string; label: string; items: Seed[] }[] = [
  { id: 'beach', label: 'Beach', items: [['clothes', 'Swimwear'], ['clothes', 'Flip-flops'], ['clothes', 'Sun hat'], ['other', 'Sunglasses'], ['other', 'Beach towel'], ['toiletries', 'After-sun lotion']] },
  { id: 'cold', label: 'Cold weather', items: [['clothes', 'Warm coat'], ['clothes', 'Thermal layers'], ['clothes', 'Gloves'], ['clothes', 'Beanie'], ['clothes', 'Scarf'], ['toiletries', 'Lip balm & moisturiser']] },
  { id: 'hiking', label: 'Hiking', items: [['clothes', 'Hiking shoes'], ['clothes', 'Rain jacket'], ['other', 'Headlamp'], ['other', 'Trail snacks'], ['health', 'Blister plasters'], ['electronics', 'Offline maps downloaded']] },
  { id: 'work', label: 'Work', items: [['electronics', 'Laptop & charger'], ['clothes', 'Smart outfit'], ['documents', 'Business cards'], ['electronics', 'Presentation clicker']] },
];

const key = (s: string) => s.toLowerCase().replace(/\s*×\d+$/, '').trim();

export function TripPacking({ trip }: { trip: Trip }) {
  const { trips, updateTrip, notify } = useStore();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PackCategory>('other');
  const [hidePacked, setHidePacked] = useState(false);

  const items = trip.packing ?? [];
  const nights = trip.startDate && trip.endDate ? dayCount(trip.startDate, trip.endDate) : 5;
  const packed = items.filter((i) => i.packed).length;
  const others = trips.filter((t) => t.id !== trip.id && t.packing?.length);

  const save = (next: PackItem[]) => updateTrip(trip.id, { packing: next });

  /** Adds items that aren't on the list yet (ignoring "×n" counts). */
  async function addSeeds(seeds: Seed[], label: string) {
    const have = new Set(items.map((i) => key(i.name)));
    const fresh = seeds.filter(([, n]) => !have.has(key(n))).map(([c, n]): PackItem => ({ id: uid(), name: n, category: c, packed: false }));
    if (!fresh.length) return notify('Already on your list');
    await save([...items, ...fresh]);
    notify(`Added ${fresh.length} ${label} item${fresh.length === 1 ? '' : 's'}`);
  }

  async function addOne() {
    const n = name.trim();
    if (!n) return;
    if (items.some((i) => key(i.name) === key(n))) return notify(`${n} is already on the list`);
    await save([...items, { id: uid(), name: n, category, packed: false }]);
    setName('');
  }

  const toggle = (id: string) => save(items.map((i) => (i.id === id ? { ...i, packed: !i.packed } : i)));
  const remove = (id: string) => save(items.filter((i) => i.id !== id));

  if (!items.length) {
    return (
      <div className="pb-4">
        <EmptyState
          icon={<Backpack size={24} />}
          title="Pack smart"
          body={`Start with a checklist for ${nights} day${nights === 1 ? '' : 's'}, then add your own items. Tick things off as they go in the bag.`}
          action={<PrimaryButton onClick={() => addSeeds(essentials(nights), 'essential')}>Add the essentials</PrimaryButton>}
        />
        {others.length > 0 && (
          <div className="mt-6 space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">Or copy a list from</p>
            {others.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => addSeeds(t.packing!.map((i) => [i.category, i.name]), 'copied')}
                className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-left active:bg-white/10"
              >
                <Copy size={16} className="text-white/50" />
                <span className="flex-1 text-sm text-white">{t.title}</span>
                <span className="text-xs text-white/40">{t.packing!.length} items</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 animate-fade-in">
      {/* Progress */}
      <section className="reveal rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-white text-2xl font-bold tracking-tight">
            {packed}
            <span className="text-white/40 text-base font-semibold"> / {items.length} packed</span>
          </p>
          {packed === items.length && <span className="text-xs font-semibold text-green-400 flex items-center gap-1"><Check size={13} /> All set</span>}
        </div>
        <div className="h-2 rounded-full bg-white/10 mt-3 overflow-hidden">
          <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${(packed / items.length) * 100}%` }} />
        </div>
        <div className="mt-3 flex gap-4 text-xs text-white/60">
          <button type="button" onClick={() => setHidePacked((v) => !v)} className="flex items-center gap-1.5 active:opacity-70">
            {hidePacked ? <Eye size={13} /> : <EyeOff size={13} />} {hidePacked ? 'Show packed' : 'Hide packed'}
          </button>
          {packed > 0 && (
            <button type="button" onClick={() => save(items.map((i) => ({ ...i, packed: false })))} className="flex items-center gap-1.5 active:opacity-70">
              <RotateCcw size={13} /> Unpack all
            </button>
          )}
        </div>
      </section>

      {/* Add your own */}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addOne();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item…" maxLength={60} className={cn(inputClass, 'flex-1 min-w-0')} />
        <select value={category} onChange={(e) => setCategory(e.target.value as PackCategory)} aria-label="Category" className="shrink-0 w-[92px] truncate rounded-xl bg-white/[0.06] border border-white/10 px-2 text-xs text-white appearance-none">
          {PACK_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#141417]">
              {c.label}
            </option>
          ))}
        </select>
        <button type="submit" aria-label="Add item" disabled={!name.trim()} className="shrink-0 w-11 rounded-xl bg-white text-black flex items-center justify-center disabled:opacity-40">
          <Plus size={18} />
        </button>
      </form>
      <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide -mx-6 px-6">
        <span className="shrink-0 text-[11px] text-white/40 py-1.5">Add a pack:</span>
        {PACKS.map((p) => (
          <button key={p.id} type="button" onClick={() => addSeeds(p.items, p.label.toLowerCase())} className="shrink-0 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/70 active:bg-white/10">
            + {p.label}
          </button>
        ))}
      </div>

      {/* Items by category */}
      {PACK_CATEGORIES.map((c) => {
        const list = items.filter((i) => i.category === c.id && (!hidePacked || !i.packed));
        const total = items.filter((i) => i.category === c.id);
        if (!list.length) return null;
        return (
          <section key={c.id} className="mt-5">
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/40 mb-1.5 flex items-center gap-1.5">
              <c.Icon size={12} /> {c.label}
              <span className="text-white/25 normal-case tracking-normal">
                {total.filter((i) => i.packed).length}/{total.length}
              </span>
            </h4>
            <ul className="space-y-1">
              {list.map((i) => (
                <li key={i.id} className="reveal flex items-center gap-1 rounded-2xl bg-white/[0.04] pr-1">
                  <button type="button" role="checkbox" aria-checked={i.packed} onClick={() => toggle(i.id)} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left">
                    <span className={cn('w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors', i.packed ? 'bg-green-500 border-green-500' : 'border-white/30')}>
                      {i.packed && <Check size={13} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className={cn('text-sm truncate', i.packed ? 'text-white/40 line-through' : 'text-white')}>{i.name}</span>
                  </button>
                  <button type="button" aria-label={`Remove ${i.name}`} onClick={() => remove(i.id)} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-white/30 active:bg-white/10">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {hidePacked && packed === items.length && <p className="mt-6 text-center text-sm text-white/50">Everything’s packed. Have a great trip!</p>}
    </div>
  );
}
