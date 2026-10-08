import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowRight, BedDouble, Check, ChevronLeft, Copy, Crown, HandCoins, Loader2, LogOut, MapPinned, MessageCircle, Send, Share2, Trash2, Users, Wallet } from 'lucide-react';
import type { ExpenseCategory, Stop, Trip } from '../../types';
import { currencyOf } from '../../data/currencies';
import { useStore } from '../../store';
import {
  deleteGroupExpense,
  leaveGroup,
  saveGroupExpense,
  sendPlan,
  sendText,
  subscribeExpenses,
  subscribeGroup,
  subscribeMessages,
  cloudErrorMessage,
  type ChatMessage,
  type Group,
  type GroupExpense,
  type PlanCard,
} from '../../lib/cloud';
import { markRead } from '../../lib/groupBadge';
import { convert, fmtMoney, parseAmount } from '../../lib/money';
import { balances, settleUp } from '../../lib/split';
import { dayEnds, stayBlocks } from '../../lib/stays';
import { addDays, cn, dayCount, fmtDate, fromDateInput, toDateInput } from '../../lib/utils';
import { AmountField, CATEGORIES, useRates } from '../TripBudget';
import { placeTitle } from '../StaySheet';
import { dayLabel } from '../PlanSheets';
import { ConfirmSheet, Field, PrimaryButton, Sheet, inputClass } from '../ui';

type Tab = 'chat' | 'expenses' | 'members';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function Avatar({ name, photo, size = 32 }: { name: string; photo?: string | null; size?: number }) {
  return photo ? (
    <img src={photo} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full shrink-0 flex items-center justify-center text-white font-bold" style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(135deg, #ff8a5c, #7a5cff)' }}>
      {initials(name)}
    </span>
  );
}

/** Full-screen group space for a shared trip: chat, shared expenses, members & invite. */
export function GroupScreen({ trip, user, onClose, initialTab = 'chat' }: { trip: Trip; user: User; onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const gid = trip.groupId!;

  useEffect(() => subscribeGroup(gid, setGroup, () => setGroup(null)), [gid]);
  useEffect(() => {
    markRead(gid);
    return () => markRead(gid);
  }, [gid]);

  const nameOf = (uid: string) => (uid === user.uid ? 'You' : group?.memberInfo?.[uid]?.name ?? 'Former member');

  return (
    <div className="absolute inset-0 z-50 bg-[#0a0a0c] flex flex-col animate-fade-in">
      <div className="pt-12 px-4 pb-3 flex items-center gap-2 border-b border-white/[0.06]">
        <button type="button" aria-label="Back" onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 active:bg-white/10">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate">{trip.title}</p>
          <p className="text-[11px] text-white/40 truncate">{group ? `${group.members.length} traveller${group.members.length === 1 ? '' : 's'} · ${group.members.map(nameOf).join(', ')}` : group === null ? 'Not available' : 'Connecting…'}</p>
        </div>
        <div className="flex -space-x-2">
          {group?.members.slice(0, 4).map((u) => (
            <span key={u} className="ring-2 ring-[#0a0a0c] rounded-full">
              <Avatar name={group.memberInfo[u]?.name ?? '?'} photo={group.memberInfo[u]?.photo} size={26} />
            </span>
          ))}
        </div>
      </div>
      <div className="px-4 pt-3">
        <div className="flex rounded-full bg-white/[0.06] p-1" role="tablist">
          {(
            [
              ['chat', MessageCircle, 'Chat'],
              ['expenses', Wallet, 'Expenses'],
              ['members', Users, 'Members'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('flex-1 rounded-full py-2 text-xs font-semibold flex items-center justify-center gap-1.5', tab === id ? 'bg-white text-black' : 'text-white/60')}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {group === undefined && (
        <div className="flex-1 flex items-center justify-center text-white/50">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {group === null && (
        <p className="flex-1 px-8 pt-16 text-center text-sm text-white/50">
          This trip’s group isn’t available — you may have left it, or you’re offline. Your own copy of the plan is still here.
        </p>
      )}
      {group && tab === 'chat' && <ChatTab trip={trip} group={group} user={user} nameOf={nameOf} />}
      {group && tab === 'expenses' && <ExpensesTab trip={trip} group={group} user={user} nameOf={nameOf} />}
      {group && tab === 'members' && <MembersTab trip={trip} group={group} user={user} onLeft={onClose} />}
    </div>
  );
}

// ───────────────────────── Chat ─────────────────────────

function ChatTab({ trip, group, user, nameOf }: { trip: Trip; group: Group; user: User; nameOf: (u: string) => string }) {
  const { stopsOf } = useStore();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const { notify } = useStore();

  useEffect(() => {
    setLoadError(null);
    return subscribeMessages(group.id, (m) => {
      setLoadError(null);
      setMessages(m);
    }, 300, (e) => setLoadError(cloudErrorMessage(e)));
  }, [group.id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
    markRead(group.id);
  }, [messages?.length, group.id]);

  const days = trip.startDate && trip.endDate ? dayCount(trip.startDate, trip.endDate) : 0;

  return (
    <>
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-1.5">
        {loadError && <p className="mx-2 mt-6 rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-xs text-red-200 leading-relaxed">Couldn’t load the chat: {loadError}</p>}
        {messages === null && !loadError && (
          <div className="pt-10 flex justify-center text-white/40">
            <Loader2 className="animate-spin" size={18} />
          </div>
        )}
        {messages?.length === 0 && <p className="pt-10 text-center text-sm text-white/40">Say hi to your travel buddies 👋</p>}
        {messages?.map((m, i) => {
          const mine = m.uid === user.uid;
          const prev = messages[i - 1];
          const showName = !mine && m.type !== 'activity' && (prev?.uid !== m.uid || prev?.type === 'activity');
          const time = m.createdAt ? m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          if (m.type === 'activity') {
            return (
              <p key={m.id} className="text-center text-[11px] text-white/40 py-1">
                <span className="text-white/60">{nameOf(m.uid)}</span> {m.text} · {time}
              </p>
            );
          }
          return (
            <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              {showName && <span className="text-[10px] text-white/40 ml-2 mb-0.5">{group.memberInfo[m.uid]?.name ?? m.name}</span>}
              {m.type === 'plan' && m.plan ? (
                <PlanCardView plan={m.plan} start={trip.startDate} mine={mine} />
              ) : (
                <p className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words', mine ? 'bg-white text-black rounded-br-md' : 'bg-white/[0.08] text-white rounded-bl-md')}>{m.text}</p>
              )}
              <span className="text-[9px] text-white/30 mx-2 mt-0.5">{m.createdAt ? time : 'Sending…'}</span>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form
        className="px-3 pt-2 pb-8 flex items-end gap-2 border-t border-white/[0.06]"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          setText('');
          sendText(group.id, user, t).catch((err) => {
            console.error('Message not sent', err);
            setText(t);
            notify(`Message not sent — ${cloudErrorMessage(err)}`);
          });
        }}
      >
        <button
          type="button"
          aria-label="Share a day's plan"
          disabled={!days}
          onClick={() => setPlanOpen(true)}
          className="w-10 h-10 shrink-0 rounded-full bg-white/[0.08] text-amber-300 flex items-center justify-center active:scale-95 disabled:opacity-30"
        >
          <MapPinned size={18} />
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={1000} className={cn(inputClass, 'flex-1 min-w-0 rounded-full py-2.5')} />
        <button type="submit" aria-label="Send" disabled={!text.trim()} className="w-10 h-10 shrink-0 rounded-full bg-white text-black flex items-center justify-center active:scale-95 disabled:opacity-30">
          <Send size={16} />
        </button>
      </form>

      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} trip={trip} stops={stopsOf(trip.id)} onSend={(plan) => sendPlan(group.id, user, plan)} />
    </>
  );
}

function PlanCardView({ plan, start, mine }: { plan: PlanCard; start?: string; mine: boolean }) {
  return (
    <div className={cn('w-[82%] rounded-2xl border p-3', mine ? 'bg-amber-400/10 border-amber-400/30 rounded-br-md' : 'bg-white/[0.06] border-white/10 rounded-bl-md')}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
        <MapPinned size={12} /> Day {plan.day + 1}
        {start ? ` · ${dayLabel(start, plan.day)}` : ''}
      </p>
      {plan.from && (
        <p className="mt-2 text-[11px] text-white/50 flex items-center gap-1.5">
          <BedDouble size={11} /> Start: {plan.from}
        </p>
      )}
      <ol className="mt-1.5 space-y-1">
        {plan.stops.map((s, i) => (
          <li key={i} className="flex items-baseline gap-2 text-sm text-white">
            <span className="w-4 shrink-0 text-xs font-bold text-white/40">{i + 1}</span>
            <span className="flex-1">{s.name}</span>
            {s.time && <span className="text-xs text-white/50 tabular-nums">{s.time}</span>}
          </li>
        ))}
        {!plan.stops.length && <li className="text-sm text-white/50">Free day — nothing planned yet</li>}
      </ol>
      {plan.to && plan.to !== plan.from && (
        <p className="mt-1.5 text-[11px] text-white/50 flex items-center gap-1.5">
          <ArrowRight size={11} /> Tonight: {plan.to}
        </p>
      )}
    </div>
  );
}

/** Pick a day (tomorrow by default) and post its plan to the chat as a reminder card. */
function PlanSheet({ open, onClose, trip, stops, onSend }: { open: boolean; onClose: () => void; trip: Trip; stops: Stop[]; onSend: (p: PlanCard) => Promise<unknown> }) {
  const days = trip.startDate && trip.endDate ? dayCount(trip.startDate, trip.endDate) : 0;
  const [day, setDay] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !trip.startDate) return;
    const tomorrow = Math.round((fromDateInput(addDays(toDateInput(Date.now()), 1)) - fromDateInput(trip.startDate)) / 86_400_000);
    setDay(Math.min(Math.max(tomorrow, 0), Math.max(days - 1, 0)));
  }, [open, trip.startDate, days]);

  const card = useMemo((): PlanCard | null => {
    if (!trip.startDate) return null;
    const ends = dayEnds(stayBlocks(trip, days), day);
    return {
      day,
      date: addDays(trip.startDate, day),
      stops: stops.filter((s) => s.day === day).map((s) => ({ name: s.name, ...(s.time ? { time: s.time } : {}) })),
      ...(ends.start ? { from: placeTitle(ends.start) } : {}),
      ...(ends.end ? { to: placeTitle(ends.end) } : {}),
    };
  }, [trip, days, day, stops]);

  return (
    <Sheet open={open} onClose={onClose} title="Remind the group">
      {card && (
        <div className="space-y-4">
          <div className="-mx-6 px-6 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {Array.from({ length: days }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDay(i)}
                className={cn('shrink-0 rounded-xl px-3 py-1.5 text-left', i === day ? 'bg-white text-black' : 'bg-white/[0.06] text-white')}
              >
                <span className="block text-xs font-bold">Day {i + 1}</span>
                <span className={cn('block text-[10px]', i === day ? 'text-black/60' : 'text-white/45')}>{dayLabel(trip.startDate!, i)}</span>
              </button>
            ))}
          </div>
          <PlanCardView plan={card} start={trip.startDate} mine />
          <PrimaryButton
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSend(card);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Send to group chat
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  );
}

// ───────────────────────── Expenses ─────────────────────────

function ExpensesTab({ trip, group, user, nameOf }: { trip: Trip; group: Group; user: User; nameOf: (u: string) => string }) {
  const { notify } = useStore();
  const rates = useRates();
  const [list, setList] = useState<GroupExpense[] | null>(null);
  const [draft, setDraft] = useState<Partial<GroupExpense> | null>(null);
  useEffect(() => subscribeExpenses(group.id, setList), [group.id]);

  const cur = group.currency;
  const toCur = (amount: number, currency: string) => convert(amount, currency, cur, rates);
  const { net, skipped } = useMemo(() => balances(list ?? [], toCur), [list, rates, cur]); // eslint-disable-line react-hooks/exhaustive-deps
  const transfers = settleUp(net);
  const spent = (list ?? []).filter((e) => e.category !== 'settlement').reduce((s, e) => s + (toCur(e.amount, e.currency) ?? 0), 0);
  const people = [...new Set([...group.members, ...net.keys()])];
  const today = toDateInput(Date.now());

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-4 pb-10">
      <section className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
        <p className="text-white/50 text-xs">Group spent</p>
        <p className="text-white text-3xl font-bold tracking-tight">{fmtMoney(spent, cur)}</p>
        {skipped > 0 && <p className="text-[11px] text-white/40 mt-1">+ {skipped} waiting for exchange rates</p>}
        <ul className="mt-4 space-y-2">
          {people.map((u) => {
            const v = net.get(u) ?? 0;
            return (
              <li key={u} className="flex items-center gap-2.5 text-sm">
                <Avatar name={group.memberInfo[u]?.name ?? '?'} photo={group.memberInfo[u]?.photo} size={24} />
                <span className="flex-1 text-white/80">{nameOf(u)}</span>
                <span className={cn('font-medium tabular-nums', Math.abs(v) < 0.01 ? 'text-white/40' : 'text-white')}>
                  {Math.abs(v) < 0.01 ? 'settled' : v > 0 ? `gets back ${fmtMoney(v, cur)}` : `owes ${fmtMoney(-v, cur)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {transfers.length > 0 && (
        <section className="mt-4">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
            <HandCoins size={12} /> Settle up
          </h4>
          <ul className="space-y-1.5">
            {transfers.map((t) => (
              <li key={t.from + t.to} className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-sm">
                <span className="text-white">{nameOf(t.from)}</span>
                <ArrowRight size={13} className="text-white/40" />
                <span className="text-white flex-1">{nameOf(t.to)}</span>
                <span className="font-semibold text-white tabular-nums">{fmtMoney(t.amount, cur)}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await saveGroupExpense(group.id, user, { amount: t.amount, currency: cur, category: 'settlement', note: 'Settle up', date: today, paidBy: t.from, splitWith: [t.to] });
                    notify('Payment recorded');
                  }}
                  className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white active:bg-white/20"
                >
                  Mark paid
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={() => setDraft({ currency: (list ?? [])[0]?.currency ?? cur, category: 'food', date: today, paidBy: user.uid, splitWith: group.members })}
        className="mt-4 w-full rounded-full bg-white text-black py-3 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <Wallet size={16} /> Add shared expense
      </button>

      <ul className="mt-4 space-y-1">
        {list === null && (
          <li className="py-6 flex justify-center text-white/40">
            <Loader2 size={18} className="animate-spin" />
          </li>
        )}
        {list?.length === 0 && <li className="py-6 text-center text-sm text-white/40">No shared expenses yet — add the first one.</li>}
        {list?.map((e) => {
          const c = CATEGORIES.find((x) => x.id === e.category);
          const settle = e.category === 'settlement';
          return (
            <li key={e.id}>
              <button type="button" onClick={() => setDraft(e)} className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-left active:bg-white/10">
                <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: settle ? '#ffffff1a' : `${c?.color ?? '#888'}33` }}>
                  {settle ? <HandCoins size={15} className="text-white/90" /> : c && <c.Icon size={15} className="text-white/90" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white truncate">{settle ? `${nameOf(e.paidBy)} paid ${nameOf(e.splitWith[0])}` : e.note || c?.label}</span>
                  <span className="block text-[11px] text-white/40 truncate">
                    {settle ? 'Settle up' : `Paid by ${nameOf(e.paidBy)} · split ${e.splitWith.length === group.members.length ? 'by everyone' : `${e.splitWith.length} way${e.splitWith.length === 1 ? '' : 's'}`}`} · {fmtDate(fromDateInput(e.date), { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-medium text-white tabular-nums">{fmtMoney(e.amount, e.currency)}</span>
                  {e.currency !== cur && toCur(e.amount, e.currency) != null && <span className="block text-[10px] text-white/40 tabular-nums">≈ {fmtMoney(toCur(e.amount, e.currency)!, cur)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <GroupExpenseSheet trip={trip} group={group} user={user} draft={draft} rates={rates} nameOf={nameOf} onClose={() => setDraft(null)} />
    </div>
  );
}

function GroupExpenseSheet({ trip, group, user, draft, rates, nameOf, onClose }: { trip: Trip; group: Group; user: User; draft: Partial<GroupExpense> | null; rates: ReturnType<typeof useRates>; nameOf: (u: string) => string; onClose: () => void }) {
  const { notify } = useStore();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(group.currency);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [paidBy, setPaidBy] = useState(user.uid);
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setAmount(draft.amount != null ? String(draft.amount) : '');
    setCurrency(draft.currency ?? group.currency);
    setCategory(draft.category && draft.category !== 'settlement' ? draft.category : 'food');
    setNote(draft.note ?? '');
    setDate(draft.date ?? toDateInput(Date.now()));
    setPaidBy(draft.paidBy ?? user.uid);
    setSplitWith(draft.splitWith ?? group.members);
    setConfirm(false);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = parseAmount(amount);
  const valid = value != null && value > 0 && splitWith.length > 0 && !!date;
  const people = [...new Set([...group.members, paidBy, ...splitWith])];
  const each = valid ? convert(value! / splitWith.length, currency, group.currency, rates) : null;
  const isSettlement = draft?.category === 'settlement';

  return (
    <>
      <Sheet open={!!draft && !confirm} onClose={onClose} title={draft?.id ? (isSettlement ? 'Payment' : 'Edit shared expense') : 'Add shared expense'}>
        {draft && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!valid) return;
              setBusy(true);
              try {
                await saveGroupExpense(group.id, user, { id: draft.id, amount: value!, currency, category: isSettlement ? 'settlement' : category, note: note.trim() || undefined, date, paidBy, splitWith });
                notify(draft.id ? 'Expense updated' : `Added ${fmtMoney(value!, currency)} for the group`);
                onClose();
              } catch {
                notify('Couldn’t save — check your connection');
              } finally {
                setBusy(false);
              }
            }}
          >
            <AmountField label="Amount" value={amount} onChange={setAmount} currency={currency} onCurrency={setCurrency} rates={rates} first={[group.currency, currencyOf(trip.countryCode)]} placeholder="0" />
            {!isSettlement && (
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Category">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={category === c.id}
                    onClick={() => setCategory(c.id)}
                    className={cn('rounded-xl py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-medium border', category === c.id ? 'bg-white text-black border-white' : 'bg-white/[0.04] text-white/70 border-white/10')}
                  >
                    <c.Icon size={12} /> {c.label}
                  </button>
                ))}
              </div>
            )}
            {!isSettlement && (
              <Field label="Note">
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="e.g. Dinner at Pontocho" className={inputClass} />
              </Field>
            )}
            <Field label="Paid by">
              <div className="flex flex-wrap gap-1.5">
                {people.map((u) => (
                  <button key={u} type="button" onClick={() => setPaidBy(u)} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', paidBy === u ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70')}>
                    {nameOf(u)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={isSettlement ? 'Paid to' : 'Split equally between'}>
              <div className="flex flex-wrap gap-1.5">
                {people.map((u) => {
                  const on = splitWith.includes(u);
                  return (
                    <button
                      key={u}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => setSplitWith(isSettlement ? [u] : on ? splitWith.filter((x) => x !== u) : [...splitWith, u])}
                      className={cn('rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1', on ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50')}
                    >
                      {on && <Check size={12} />} {nameOf(u)}
                    </button>
                  );
                })}
              </div>
            </Field>
            {!isSettlement && each != null && splitWith.length > 1 && <p className="text-xs text-white/50 -mt-2">{fmtMoney(each, group.currency)} each</p>}
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
            <PrimaryButton type="submit" disabled={!valid || busy}>
              {draft.id ? 'Save' : 'Add expense'}
            </PrimaryButton>
            {draft.id && (
              <button type="button" onClick={() => setConfirm(true)} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-400">
                <Trash2 size={16} /> Delete
              </button>
            )}
          </form>
        )}
      </Sheet>
      <ConfirmSheet
        open={!!draft && confirm}
        onClose={() => setConfirm(false)}
        title="Delete for everyone?"
        message="This removes it from the group’s expenses and balances."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!draft?.id) return;
          await deleteGroupExpense(group.id, draft.id);
          notify('Deleted');
          onClose();
        }}
      />
    </>
  );
}

// ───────────────────────── Members ─────────────────────────

export const inviteLink = (code: string) => `${location.origin}${location.pathname}?join=${code}`;

function MembersTab({ trip, group, user, onLeft }: { trip: Trip; group: Group; user: User; onLeft: () => void }) {
  const { updateTrip, notify } = useStore();
  const [confirm, setConfirm] = useState(false);
  const link = inviteLink(group.inviteCode);

  async function share() {
    const text = `Join our trip “${trip.title}” on Stamped — code ${group.inviteCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.title, text, url: link });
        return;
      } catch {
        /* cancelled → fall back to copying */
      }
    }
    await navigator.clipboard?.writeText(`${text}\n${link}`);
    notify('Invite copied');
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-4 pb-10">
      <section className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4 text-center">
        <p className="text-xs text-white/50">Invite code</p>
        <p className="mt-1 text-3xl font-bold tracking-[0.25em] text-white tabular-nums">{group.inviteCode}</p>
        <p className="mt-2 text-[11px] text-white/40">Friends open the link, or enter the code in Account → Join a trip.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={share} className="flex-1 rounded-full bg-white text-black py-2.5 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
            <Share2 size={15} /> Share invite
          </button>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(group.inviteCode);
              notify('Code copied');
            }}
            className="rounded-full bg-white/10 px-4 text-sm font-semibold text-white flex items-center gap-1.5 active:bg-white/20"
          >
            <Copy size={14} /> Code
          </button>
        </div>
      </section>

      <h4 className="mt-6 mb-2 text-[11px] font-medium uppercase tracking-wider text-white/40">{group.members.length} travellers</h4>
      <ul className="space-y-1">
        {group.members.map((u) => (
          <li key={u} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
            <Avatar name={group.memberInfo[u]?.name ?? '?'} photo={group.memberInfo[u]?.photo} />
            <span className="flex-1 text-sm text-white">
              {group.memberInfo[u]?.name ?? 'Traveller'}
              {u === user.uid && <span className="text-white/40"> (you)</span>}
            </span>
            {u === group.ownerId && (
              <span className="text-[10px] font-semibold text-amber-300 flex items-center gap-1">
                <Crown size={11} /> Organiser
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-white/40 leading-relaxed">
        Everyone sees and edits the same plan — places, days, hotels and dates — plus this chat and the shared expenses. Photos, your personal budget and packing list stay private.
      </p>

      <button type="button" onClick={() => setConfirm(true)} className="mt-6 w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-400">
        <LogOut size={16} /> Leave this trip group
      </button>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Leave the group?"
        message={`You keep your own copy of ${trip.title}, but it stops syncing and you leave the chat.${group.members.length === 1 ? ' You’re the last member, so the group will be deleted.' : ''}`}
        confirmLabel="Leave"
        onConfirm={async () => {
          try {
            await leaveGroup(group, user);
          } catch {
            notify('Couldn’t leave — check your connection');
            return;
          }
          await updateTrip(trip.id, { groupId: undefined });
          notify(`Left ${trip.title}’s group`);
          onLeft();
        }}
      />
    </div>
  );
}
