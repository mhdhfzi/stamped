import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BedDouble, ChevronDown, Plus, Receipt, ShoppingBag, Ticket, Trash2, TrainFront, UtensilsCrossed, Wallet, type LucideIcon } from 'lucide-react';
import type { Expense, ExpenseCategory, Trip } from '../types';
import { useStore } from '../store';
import { currencyFlag, currencyOf } from '../data/currencies';
import { convert, currencyDigits, currencyName, currencySymbol, fmtMoney, loadRates, parseAmount, selectableCurrencies, type Rates } from '../lib/money';
import { cn, dayCount, fmtDate, fromDateInput, toDateInput } from '../lib/utils';
import { ConfirmSheet, EmptyState, Field, PrimaryButton, Sheet, inputClass } from './ui';

/** Fixed colour per category (validated categorical palette, dark mode) — colour follows the category, never its rank. */
export const CATEGORIES: {
  id: ExpenseCategory;
  label: string;
  color: string;
  Icon: LucideIcon;
  hint: string;
}[] = [
  {
    id: 'stay',
    label: 'Stay',
    color: '#3987e5',
    Icon: BedDouble,
    hint: 'e.g. Hotel Gracery, 3 nights',
  },
  {
    id: 'food',
    label: 'Food',
    color: '#d95926',
    Icon: UtensilsCrossed,
    hint: 'e.g. Ramen at Ichiran',
  },
  {
    id: 'transport',
    label: 'Transport',
    color: '#199e70',
    Icon: TrainFront,
    hint: 'e.g. Shinkansen to Kyoto',
  },
  {
    id: 'activities',
    label: 'Activities',
    color: '#c98500',
    Icon: Ticket,
    hint: 'e.g. Skytree tickets',
  },
  {
    id: 'shopping',
    label: 'Shopping',
    color: '#d55181',
    Icon: ShoppingBag,
    hint: 'e.g. Souvenirs',
  },
  {
    id: 'other',
    label: 'Other',
    color: '#008300',
    Icon: Receipt,
    hint: 'e.g. SIM card',
  },
];
const catOf = (id: ExpenseCategory) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[5];
const CRITICAL = '#d03b3b';

export function useRates() {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    let live = true;
    loadRates().then((r) => live && setRates(r));
    return () => {
      live = false;
    };
  }, []);
  return rates;
}

/** Currency choices: the useful ones first, then everything we have a rate for. */
function currencyOptions(rates: Rates | null, first: string[]) {
  const top = [...new Set(first)];
  const rest = selectableCurrencies(rates).filter((c) => !top.includes(c));
  return { top, rest };
}

export function CurrencySelect({ value, onChange, rates, first, className }: { value: string; onChange: (c: string) => void; rates: Rates | null; first: string[]; className?: string }) {
  const { top, rest } = currencyOptions(rates, [...first, value]);
  // Closed it shows just the code ("MYR ▾"); the native list underneath shows full names.
  return (
    <span className={cn('relative inline-flex items-center justify-center gap-1.5', className)}>
      <span className="text-base leading-none">{currencyFlag(value)}</span>
      {value}
      <ChevronDown size={13} className="opacity-60" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Currency">
        <optgroup label="Suggested">
          {top.map((c) => (
            <option key={c} value={c} className="bg-[#141417]">
              {currencyFlag(c)} {c} · {currencyName(c)}
            </option>
          ))}
        </optgroup>
        {rest.length > 0 && (
          <optgroup label="All currencies">
            {rest.map((c) => (
              <option key={c} value={c} className="bg-[#141417]">
                {currencyFlag(c)} {c} · {currencyName(c)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </span>
  );
}

/** Big amount box with the currency's symbol inside, and a flag + code currency picker beside it. */
export function AmountField({ label, value, onChange, currency, onCurrency, rates, first, placeholder }: { label: string; value: string; onChange: (v: string) => void; currency: string; onCurrency: (c: string) => void; rates: Rates | null; first: string[]; placeholder: string }) {
  return (
    <div className="flex gap-2">
      <label className="flex-1 min-w-0 flex items-center gap-2 rounded-xl bg-white/[0.06] border border-white/10 px-4 focus-within:border-white/30">
        <span className="shrink-0 text-lg font-semibold text-white/50">{currencySymbol(currency)}</span>
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-2xl font-bold text-white tabular-nums outline-none placeholder:text-white/25"
        />
      </label>
      <CurrencySelect value={currency} onChange={onCurrency} rates={rates} first={first} className="shrink-0 rounded-xl bg-white/[0.06] border border-white/10 px-3 text-sm font-semibold text-white" />
    </div>
  );
}

export function TripBudget({ trip }: { trip: Trip }) {
  const { expensesOf, homeCurrency, setHomeCurrency } = useStore();
  const rates = useRates();
  const [draft, setDraft] = useState<Partial<Expense> | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [barSel, setBarSel] = useState<number | null>(null);

  const local = currencyOf(trip.countryCode);
  const list = expensesOf(trip.id);
  const days = trip.startDate && trip.endDate ? dayCount(trip.startDate, trip.endDate) : 0;
  const dayIndex = (date: string) => (trip.startDate ? Math.round((fromDateInput(date) - fromDateInput(trip.startDate)) / 86_400_000) : -1);

  const toHome = (amount: number, currency: string) => convert(amount, currency, homeCurrency, rates);

  const stats = useMemo(() => {
    let total = 0;
    let unconverted = 0;
    const byCat = new Map<ExpenseCategory, number>();
    const byDay = new Array<number>(days).fill(0);
    for (const e of list) {
      const h = convert(e.amount, e.currency, homeCurrency, rates);
      if (h == null) {
        unconverted++;
        continue;
      }
      total += h;
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + h);
      const d = dayIndex(e.date);
      if (d >= 0 && d < days) byDay[d] += h;
    }
    return { total, unconverted, byCat, byDay };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, homeCurrency, rates, days, trip.startDate]);

  const budget = trip.budget ? toHome(trip.budget.amount, trip.budget.currency) : null;
  const left = budget != null ? budget - stats.total : null;
  const over = left != null && left < 0;

  // Days still to come (including today) for the "per day left" guidance.
  const todayIdx = trip.startDate ? dayIndex(toDateInput(Date.now())) : -1;
  const remainingDays = !days ? 0 : todayIdx < 0 ? days : todayIdx < days ? days - todayIdx : 0;

  function newExpense() {
    const today = toDateInput(Date.now());
    // During or before the trip → today; after it → its first day.
    const date = trip.endDate && today > trip.endDate && trip.startDate ? trip.startDate : today;
    setDraft({ currency: list[0]?.currency ?? local, category: 'food', date });
  }

  if (!list.length && !trip.budget) {
    return (
      <>
        <EmptyState
          icon={<Wallet size={24} />}
          title="Track your spending"
          body={`Log what you spend in ${currencyName(local)} or any currency — totals show in ${homeCurrency}, by category and by day.`}
          action={
            <div className="space-y-2">
              <PrimaryButton onClick={newExpense}>Add an expense</PrimaryButton>
              <button type="button" onClick={() => setBudgetOpen(true)} className="w-full rounded-full py-3 text-sm font-semibold bg-white/10 text-white active:scale-[0.98]">
                Set a budget
              </button>
            </div>
          }
        />
        <ExpenseSheet trip={trip} draft={draft} rates={rates} onClose={() => setDraft(null)} />
        <BudgetSheet trip={trip} open={budgetOpen} rates={rates} onClose={() => setBudgetOpen(false)} />
      </>
    );
  }

  const cats = CATEGORIES.filter((c) => (stats.byCat.get(c.id) ?? 0) > 0);
  const maxDay = Math.max(0, ...stats.byDay);
  const groups = new Map<string, Expense[]>();
  for (const e of list) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
  const dateLabel = (date: string) => {
    const d = dayIndex(date);
    const nice = fmtDate(fromDateInput(date), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    if (!trip.startDate) return nice;
    if (d < 0) return `Before the trip · ${nice}`;
    if (d >= days) return `After the trip · ${nice}`;
    return `Day ${d + 1} · ${nice}`;
  };

  return (
    <div className="mt-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-white/50">
          Totals in
          <CurrencySelect
            value={homeCurrency}
            onChange={setHomeCurrency}
            rates={rates}
            first={['MYR', 'USD', 'EUR', 'SGD', local]}
            className="bg-white/[0.06] rounded-full px-2.5 py-1 text-xs font-semibold text-white"
          />
        </label>
        <span className="text-[10px] text-white/30">{rates ? `Rates of ${fmtDate(rates.fetchedAt, { day: 'numeric', month: 'short' })}` : 'Loading rates…'}</span>
      </div>

      {/* Hero: total spent + budget meter */}
      <section className="reveal mt-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
        <p className="text-white/50 text-xs">Spent</p>
        <p className="text-white text-3xl font-bold tracking-tight mt-0.5">{fmtMoney(stats.total, homeCurrency)}</p>
        {stats.unconverted > 0 && <p className="text-[11px] text-white/40 mt-1">+ {stats.unconverted} not converted yet (needs exchange rates)</p>}

        {budget != null ? (
          <button type="button" onClick={() => setBudgetOpen(true)} className="w-full text-left mt-4">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (stats.total / Math.max(budget, 1e-9)) * 100)}%`,
                  background: over ? CRITICAL : '#fff',
                }}
              />
            </div>
            <p className="mt-2 text-xs flex items-center gap-1.5">
              {over ? (
                <>
                  <AlertTriangle size={13} style={{ color: CRITICAL }} />
                  <span className="text-white font-medium">{fmtMoney(-left!, homeCurrency)} over budget</span>
                  <span className="text-white/40">of {fmtMoney(budget, homeCurrency)}</span>
                </>
              ) : (
                <>
                  <span className="text-white font-medium">{fmtMoney(left!, homeCurrency)} left</span>
                  <span className="text-white/40">of {fmtMoney(budget, homeCurrency)}</span>
                </>
              )}
            </p>
            {!over && remainingDays > 0 && (
              <p className="text-[11px] text-white/40 mt-1">
                ≈ {fmtMoney(left! / remainingDays, homeCurrency)} a day for the{' '}
                {remainingDays === days ? `${days} days` : `${remainingDays} day${remainingDays === 1 ? '' : 's'} left`}
              </p>
            )}
          </button>
        ) : (
          <button type="button" onClick={() => setBudgetOpen(true)} className="mt-3 text-xs font-medium text-white/60 flex items-center gap-1 active:opacity-70">
            <Plus size={13} /> Set a budget
          </button>
        )}
        {days > 0 && stats.total > 0 && (budget == null || remainingDays === 0) && (
          <p className="text-[11px] text-white/40 mt-2">
            {fmtMoney(stats.total / days, homeCurrency)} a day on average over {days} days
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={newExpense}
        className="mt-3 w-full rounded-full bg-white text-black py-3 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <Plus size={16} /> Add expense
      </button>

      {/* By category: one stacked bar (2px gaps) + a labelled list, so identity never relies on colour alone */}
      {cats.length > 0 && (
        <section className="mt-5">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/40 mb-2">By category</h4>
          <div
            className="flex h-2.5 gap-[2px] rounded-full overflow-hidden"
            role="img"
            aria-label={cats.map((c) => `${c.label} ${Math.round(((stats.byCat.get(c.id) ?? 0) / stats.total) * 100)}%`).join(', ')}
          >
            {cats.map((c) => (
              <div key={c.id} style={{ flexGrow: stats.byCat.get(c.id), background: c.color }} />
            ))}
          </div>
          <ul className="mt-3 space-y-2">
            {cats.map((c) => {
              const v = stats.byCat.get(c.id) ?? 0;
              return (
                <li key={c.id} className="reveal flex items-center gap-2.5 text-sm">
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${c.color}33` }}>
                    <c.Icon size={13} className="text-white/90" />
                  </span>
                  <span className="w-2 h-2 rounded-full shrink-0 -ml-1" style={{ background: c.color }} />
                  <span className="flex-1 text-white/80">{c.label}</span>
                  <span className="text-white font-medium tabular-nums">{fmtMoney(v, homeCurrency)}</span>
                  <span className="w-10 text-right text-xs text-white/40 tabular-nums">{Math.round((v / stats.total) * 100)}%</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* By day: single-series bars; tap a bar for its value */}
      {days > 1 && maxDay > 0 && (
        <section className="mt-6">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/40 mb-2 flex justify-between">
            <span>By day</span>
            <span className="normal-case tracking-normal text-white/60">
              {barSel != null ? `Day ${barSel + 1} · ${fmtMoney(stats.byDay[barSel], homeCurrency)}` : `Highest ${fmtMoney(maxDay, homeCurrency)}`}
            </span>
          </h4>
          <div className="flex items-end gap-[2px] h-24 border-b border-white/10">
            {stats.byDay.map((v, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Day ${i + 1}: ${fmtMoney(v, homeCurrency)}`}
                onClick={() => setBarSel(barSel === i ? null : i)}
                className="flex-1 h-full flex items-end group"
              >
                <span
                  className={cn('w-full rounded-t-[4px] transition-colors', barSel === i ? 'bg-white' : 'bg-white/45 group-hover:bg-white/70')}
                  style={{
                    height: v ? `${Math.max(4, (v / maxDay) * 100)}%` : 0,
                  }}
                />
              </button>
            ))}
          </div>
          <div className="flex gap-[2px] mt-1">
            {stats.byDay.map((_, i) => (
              <span key={i} className={cn('flex-1 text-center text-[9px] tabular-nums', barSel === i ? 'text-white' : 'text-white/35')}>
                {days <= 10 || i % 2 === 0 ? i + 1 : ''}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Expenses */}
      <section className="mt-6">
        {[...groups.entries()].map(([date, items]) => (
          <div key={date} className="mb-4">
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/40 mb-1.5">{dateLabel(date)}</h4>
            <ul className="space-y-1">
              {items.map((e) => {
                const c = catOf(e.category);
                const h = toHome(e.amount, e.currency);
                return (
                  <li key={e.id} className="reveal">
                    <button
                      type="button"
                      onClick={() => setDraft(e)}
                      className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-left active:bg-white/10"
                    >
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${c.color}33` }}>
                        <c.Icon size={15} className="text-white/90" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-white truncate">{e.note || c.label}</span>
                        <span className="block text-[11px] text-white/40 truncate">
                          {c.label}
                          {e.currency !== homeCurrency && ` · ${fmtMoney(e.amount, e.currency)}`}
                        </span>
                      </span>
                      <span className="text-sm font-medium text-white tabular-nums">{h != null ? fmtMoney(h, homeCurrency) : fmtMoney(e.amount, e.currency)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <ExpenseSheet trip={trip} draft={draft} rates={rates} onClose={() => setDraft(null)} />
      <BudgetSheet trip={trip} open={budgetOpen} rates={rates} onClose={() => setBudgetOpen(false)} />
    </div>
  );
}

function ExpenseSheet({ trip, draft, rates, onClose }: { trip: Trip; draft: Partial<Expense> | null; rates: Rates | null; onClose: () => void }) {
  const { saveExpense, deleteExpense, homeCurrency, notify } = useStore();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [confirm, setConfirm] = useState(false);
  const local = currencyOf(trip.countryCode);

  useEffect(() => {
    if (!draft) return;
    setAmount(draft.amount != null ? String(draft.amount) : '');
    setCurrency(draft.currency ?? local);
    setCategory(draft.category ?? 'food');
    setNote(draft.note ?? '');
    setDate(draft.date ?? toDateInput(Date.now()));
    setConfirm(false);
  }, [draft, local]);

  const value = parseAmount(amount);
  const valid = value != null && value > 0 && !!date;
  const inHome = valid && currency !== homeCurrency ? convert(value!, currency, homeCurrency, rates) : null;
  const d = trip.startDate && date ? Math.round((fromDateInput(date) - fromDateInput(trip.startDate)) / 86_400_000) : null;
  const days = trip.startDate && trip.endDate ? dayCount(trip.startDate, trip.endDate) : 0;
  const cat = catOf(category);

  return (
    <>
      <Sheet open={!!draft && !confirm} onClose={onClose} title={draft?.id ? 'Edit expense' : 'Add expense'}>
        {draft && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!valid) return;
              const digits = currencyDigits(currency);
              await saveExpense({
                id: draft.id,
                tripId: trip.id,
                amount: Number(value!.toFixed(digits)),
                currency,
                category,
                note: note.trim() || undefined,
                date,
              });
              notify(draft.id ? 'Expense updated' : `Added ${fmtMoney(value!, currency)}`);
              onClose();
            }}
          >
            <AmountField label="Amount" value={amount} onChange={setAmount} currency={currency} onCurrency={setCurrency} rates={rates} first={[local, homeCurrency]} placeholder="0" />
            <p className="text-xs text-white/50 -mt-2">
              In {currencyName(currency)}
              {inHome != null && <span className="text-white/80"> · ≈ {fmtMoney(inHome, homeCurrency)}</span>}
              {inHome == null && currency !== homeCurrency && valid && ' · converted when rates are available'}
            </p>

            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Category">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'rounded-xl py-2 flex flex-col items-center gap-1 text-[11px] font-medium border transition-colors',
                    category === c.id ? 'bg-white text-black border-white' : 'bg-white/[0.04] text-white/70 border-white/10',
                  )}
                >
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{
                      background: category === c.id ? c.color : `${c.color}33`,
                    }}
                  >
                    <c.Icon size={13} className="text-white" />
                  </span>
                  {c.label}
                </button>
              ))}
            </div>

            <Field label="Note">
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder={cat.hint} className={inputClass} />
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
            {d != null && days > 0 && (
              <p className="text-[11px] text-white/40 -mt-2">{d < 0 ? 'Before the trip (e.g. flights, bookings)' : d >= days ? 'After the trip' : `Day ${d + 1} of your trip`}</p>
            )}

            <PrimaryButton type="submit" disabled={!valid}>
              {draft.id ? 'Save' : 'Add expense'}
            </PrimaryButton>
            {draft.id && (
              <button type="button" onClick={() => setConfirm(true)} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-400">
                <Trash2 size={16} /> Delete expense
              </button>
            )}
          </form>
        )}
      </Sheet>
      <ConfirmSheet
        open={!!draft && confirm}
        onClose={() => setConfirm(false)}
        title="Delete this expense?"
        message={`${draft?.note || catOf(draft?.category ?? 'other').label} · ${draft?.amount != null ? fmtMoney(draft.amount, draft.currency ?? 'USD') : ''}`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!draft?.id) return;
          await deleteExpense(draft.id);
          notify('Expense deleted');
          onClose();
        }}
      />
    </>
  );
}

function BudgetSheet({ trip, open, rates, onClose }: { trip: Trip; open: boolean; rates: Rates | null; onClose: () => void }) {
  const { updateTrip, homeCurrency, notify } = useStore();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(homeCurrency);

  useEffect(() => {
    if (!open) return;
    setAmount(trip.budget ? String(trip.budget.amount) : '');
    setCurrency(trip.budget?.currency ?? homeCurrency);
  }, [open, trip.budget, homeCurrency]);

  const value = parseAmount(amount);
  const valid = value != null && value > 0;

  return (
    <Sheet open={open} onClose={onClose} title="Trip budget">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await updateTrip(trip.id, { budget: { amount: value!, currency } });
          notify(`Budget set: ${fmtMoney(value!, currency)}`);
          onClose();
        }}
      >
        <AmountField
          label="Budget amount"
          value={amount}
          onChange={setAmount}
          currency={currency}
          onCurrency={setCurrency}
          rates={rates}
          first={[homeCurrency, currencyOf(trip.countryCode)]}
          placeholder="e.g. 5000"
        />
        <p className="text-xs text-white/50 -mt-2">In {currencyName(currency)}</p>
        <p className="text-xs text-white/40">Everything you plan to spend on this trip — flights, hotels, food, fun.</p>
        <PrimaryButton type="submit" disabled={!valid}>
          Save budget
        </PrimaryButton>
        {trip.budget && (
          <button
            type="button"
            onClick={async () => {
              await updateTrip(trip.id, { budget: undefined });
              notify('Budget removed');
              onClose();
            }}
            className="w-full py-3 text-sm font-medium text-red-400"
          >
            Remove budget
          </button>
        )}
      </form>
    </Sheet>
  );
}
