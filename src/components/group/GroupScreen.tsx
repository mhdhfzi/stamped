import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { User } from 'firebase/auth';
import { ArrowRight, Ban, BedDouble, Camera, EyeOff, Check, CheckCheck, ChevronLeft, Images, Plus, Video, Copy, Crown, HandCoins, Loader2, LogOut, MapPinned, MessageCircle, Send, Share2, Trash2, Users, Wallet } from 'lucide-react';
import type { ExpenseCategory, Stop, Trip } from '../../types';
import { currencyOf } from '../../data/currencies';
import { useStore } from '../../store';
import {
  deleteGroupExpense,
  leaveGroup,
  markChatRead,
  pushToGroup,
  saveGroupExpense,
  sendMedia,
  sendPlan,
  sendText,
  setTyping,
  subscribeExpenses,
  subscribeGroup,
  subscribeMessages,
  subscribeStatus,
  cloudErrorMessage,
  deleteMessageForEveryone,
  type ChatMessage,
  type MemberStatus,
  type Group,
  type GroupExpense,
  type PlanCard,
} from '../../lib/cloud';
import { markRead } from '../../lib/groupBadge';
import { PushBanner } from './PushControls';
import { ChatCamera, MediaBubble, MediaPreview, MediaViewer, prepareFiles, type Prepared } from './ChatMedia';
import { convert, fmtMoney, parseAmount } from '../../lib/money';
import { balances, settleUp } from '../../lib/split';
import { dayEnds, stayBlocks } from '../../lib/stays';
import { addDays, cn, dayCount, fmtDate, fromDateInput, toDateInput } from '../../lib/utils';
import { AmountField, CATEGORIES, useRates } from '../TripBudget';
import { placeTitle } from '../StaySheet';
import { dayLabel } from '../PlanSheets';
import { ConfirmSheet, Field, PrimaryButton, Sheet, SheetRow, inputClass } from '../ui';

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
      {group && tab === 'chat' && <PushBanner user={user} />}
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
  const [status, setStatus] = useState<MemberStatus[]>([]);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  // Photos & videos: attach menu, camera, chosen-but-unsent items, uploads in progress, full-screen view.
  const [attachOpen, setAttachOpen] = useState(false);
  const [camera, setCamera] = useState<'photo' | 'video' | null>(null);
  const [picked, setPicked] = useState<Prepared[]>([]);
  const [sending, setSending] = useState<{ item: Prepared; caption: string; progress: number; failed?: boolean }[]>([]);
  const [viewing, setViewing] = useState<ChatMessage | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Deleting: long-press (or right-click) a message for its options. "Delete for me" is remembered on this phone.
  const [actionFor, setActionFor] = useState<ChatMessage | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const hiddenKey = `stamped:hidden:${group.id}`;
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(hiddenKey) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const shown = messages?.filter((m) => !hidden.has(m.id));
  function hideForMe(id: string) {
    const next = new Set(hidden).add(id);
    setHidden(next);
    try {
      localStorage.setItem(hiddenKey, JSON.stringify([...next]));
    } catch {
      /* private mode: hidden until you leave the chat */
    }
  }
  const pressTimer = useRef<number>();
  const longPressed = useRef(false);
  function pressHandlers(m: ChatMessage) {
    const cancel = () => {
      window.clearTimeout(pressTimer.current);
      setPressing(null);
    };
    return {
      onPointerDown: () => {
        longPressed.current = false;
        setPressing(m.id);
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          setPressing(null);
          navigator.vibrate?.(15);
          setActionFor(m);
        }, 450);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        cancel();
        setActionFor(m);
      },
      // The tap that ends a long-press shouldn't also open the photo or toggle "Seen by".
      onClickCapture: (e: MouseEvent) => {
        if (longPressed.current) {
          e.stopPropagation();
          e.preventDefault();
          longPressed.current = false;
        }
      },
    };
  }

  function upload(item: Prepared, caption: string) {
    const patch = (p: Partial<{ progress: number; failed: boolean }>) => setSending((list) => list.map((s) => (s.item.key === item.key ? { ...s, ...p } : s)));
    setSending((list) => [...list.filter((s) => s.item.key !== item.key), { item, caption, progress: 0 }]);
    sendMedia(group.id, user, item.blob, { kind: item.kind, mime: item.mime, w: item.w, h: item.h, duration: item.duration, thumb: item.thumb }, caption, (f) => (f >= 1 ? setSending((list) => list.filter((s) => s.item.key !== item.key)) : patch({ progress: f })), item.url).then(
      () => setSending((list) => list.filter((s) => s.item.key !== item.key)),
      (err) => {
        console.error('Media not sent', err);
        patch({ failed: true });
        notify(`Not sent — ${cloudErrorMessage(err)}`);
      },
    );
  }
  const [now, setNow] = useState(Date.now);
  const bottom = useRef<HTMLDivElement>(null);
  const { notify } = useStore();

  useEffect(() => {
    setLoadError(null);
    return subscribeMessages(group.id, (m) => {
      setLoadError(null);
      setMessages(m);
    }, 300, (e) => setLoadError(cloudErrorMessage(e)));
  }, [group.id]);
  useEffect(() => subscribeStatus(group.id, setStatus), [group.id]);

  // Reading: whenever new messages arrive while the chat is open, tell the group you've seen them.
  useEffect(() => {
    markRead(group.id);
    if (messages && document.visibilityState === 'visible') markChatRead(group.id, user);
  }, [messages?.length, group.id, user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && markChatRead(group.id, user);
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [group.id, user]);

  // Typing: refresh "typing" every few seconds while keys are pressed; clear it after a pause, on send and on leaving.
  const typingSentAt = useRef(0);
  const idleTimer = useRef<number>();
  function stopTyping() {
    window.clearTimeout(idleTimer.current);
    if (typingSentAt.current) {
      typingSentAt.current = 0;
      setTyping(group.id, user, false);
    }
  }
  function onType(v: string) {
    setText(v);
    if (!v.trim()) return stopTyping();
    if (Date.now() - typingSentAt.current > 4000) {
      typingSentAt.current = Date.now();
      setTyping(group.id, user, true);
    }
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopTyping, 6000);
  }
  useEffect(() => stopTyping, [group.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const others = group.members.filter((u) => u !== user.uid);
  const statusOf = new Map(status.map((s) => [s.uid, s]));
  const typers = others.filter((u) => {
    const at = statusOf.get(u)?.typingAt;
    return at && now - at.getTime() < 15_000;
  });
  // Re-check every couple of seconds so a stale "typing…" disappears even if its clear never arrived.
  useEffect(() => {
    if (!status.some((s) => s.typingAt)) return;
    const t = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(t);
  }, [status]);
  useEffect(() => {
    if (typers.length) bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [typers.length]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  const seenBy = (m: ChatMessage) =>
    m.createdAt ? others.filter((u) => {
      const r = statusOf.get(u)?.readAt;
      return r && r.getTime() >= m.createdAt!.getTime();
    }) : [];
  const firstNames = (uids: string[]) => uids.map((u) => nameOf(u).split(/\s+/)[0]).join(', ');
  const lastMine = messages ? [...messages].reverse().find((m) => m.uid === user.uid && m.type !== 'activity') : undefined;

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
        {shown?.map((m, i) => {
          const mine = m.uid === user.uid;
          const prev = shown[i - 1];
          const showName = !mine && m.type !== 'activity' && (prev?.uid !== m.uid || prev?.type === 'activity');
          const time = m.createdAt ? m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          if (m.type === 'activity') {
            return (
              <p key={m.id} {...pressHandlers(m)} className="text-center text-[11px] text-white/40 py-1 select-none">
                <span className="text-white/60">{nameOf(m.uid)}</span> {m.text} · {time}
              </p>
            );
          }
          const seen = mine ? seenBy(m) : [];
          const allSeen = others.length > 0 && seen.length === others.length;
          const showSeen = mine && seen.length > 0 && (m.id === lastMine?.id || infoFor === m.id);
          return (
            <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              {showName && <span className="text-[10px] text-white/40 ml-2 mb-0.5">{group.memberInfo[m.uid]?.name ?? m.name}</span>}
              <div
                className={cn('contents select-none [-webkit-touch-callout:none]', mine && 'cursor-pointer', pressing === m.id && '[&>*]:scale-[0.97] [&>*]:transition-transform')}
                {...pressHandlers(m)}
                onClick={mine && !m.deleted ? () => setInfoFor(infoFor === m.id ? null : m.id) : undefined}
              >
                {m.deleted ? (
                  <p className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm italic flex items-center gap-1.5 border', mine ? 'border-white/20 text-white/55 rounded-br-md' : 'border-white/10 text-white/45 rounded-bl-md')}>
                    <Ban size={13} /> {mine ? 'You deleted this message' : 'This message was deleted'}
                  </p>
                ) : m.type === 'plan' && m.plan ? (
                  <PlanCardView plan={m.plan} start={trip.startDate} mine={mine} />
                ) : m.media ? (
                  <MediaBubble groupId={group.id} media={m.media} caption={m.text} mine={mine} onOpen={() => setViewing(m)} />
                ) : (
                  <p className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words', mine ? 'bg-white text-black rounded-br-md' : 'bg-white/[0.08] text-white rounded-bl-md')}>{m.text}</p>
                )}
              </div>
              <span className="text-[9px] text-white/30 mx-2 mt-0.5 flex items-center gap-1">
                {m.createdAt ? time : 'Sending…'}
                {mine && m.createdAt && !m.deleted && (
                  allSeen ? <CheckCheck size={12} className="text-sky-400" aria-label="Read by everyone" /> : seen.length ? <CheckCheck size={12} className="text-white/50" aria-label="Read by some" /> : <Check size={11} className="text-white/40" aria-label="Sent" />
                )}
              </span>
              {showSeen && (
                <span className="text-[10px] text-white/45 mx-2 mt-0.5 animate-fade-in">
                  {allSeen && others.length > 1 ? 'Seen by everyone' : `Seen by ${firstNames(seen)}`}
                  {infoFor === m.id && !allSeen && ` · not yet ${firstNames(others.filter((u) => !seen.includes(u)))}`}
                </span>
              )}
            </div>
          );
        })}
        {/* Your photos/videos still uploading */}
        {sending.map((s) => (
          <div key={s.item.key} className="flex flex-col items-end">
            <MediaBubble media={s.item} caption={s.caption} mine progress={s.failed ? undefined : s.progress} />
            <span className="text-[9px] mx-2 mt-0.5 flex items-center gap-2">
              {s.failed ? (
                <>
                  <span className="text-red-300">Not sent</span>
                  <button type="button" onClick={() => upload(s.item, s.caption)} className="font-semibold text-white">Retry</button>
                  <button type="button" onClick={() => setSending((x) => x.filter((y) => y.item.key !== s.item.key))} className="text-white/50">Remove</button>
                </>
              ) : (
                <span className="text-white/30">Sending…</span>
              )}
            </span>
          </div>
        ))}
        {typers.length > 0 && (
          <div className="flex items-end gap-2 pt-1 animate-fade-in" aria-live="polite">
            <span className="rounded-2xl rounded-bl-md bg-white/[0.08] px-3.5 py-2.5 flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/60 typing-dot" style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </span>
            <span className="text-[10px] text-white/45 pb-1">
              {typers.length === 1 ? `${firstNames(typers)} is typing…` : typers.length === 2 ? `${firstNames(typers).replace(', ', ' and ')} are typing…` : 'Several people are typing…'}
            </span>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="px-3 pt-2 pb-8 flex items-end gap-2 border-t border-white/[0.06]"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          setText('');
          stopTyping();
          sendText(group.id, user, t).then(
            () => pushToGroup(group.id, user, t),
            (err) => {
              console.error('Message not sent', err);
              setText(t);
              notify(`Message not sent — ${cloudErrorMessage(err)}`);
            },
          );
        }}
      >
        <button
          type="button"
          aria-label="Attach"
          aria-expanded={attachOpen}
          onClick={() => setAttachOpen(!attachOpen)}
          className={cn('w-10 h-10 shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-transform', attachOpen ? 'bg-white text-black rotate-45' : 'bg-white/[0.08] text-white')}
        >
          <Plus size={20} />
        </button>
        <div className="relative flex-1 min-w-0">
          <input value={text} onChange={(e) => onType(e.target.value)} onBlur={stopTyping} placeholder="Message" maxLength={1000} className={cn(inputClass, 'w-full rounded-full py-2.5 pr-11')} />
          {!text.trim() && (
            <button type="button" aria-label="Camera" onClick={() => setCamera('photo')} className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-white/70 flex items-center justify-center active:bg-white/10">
              <Camera size={19} />
            </button>
          )}
        </div>
        <button type="submit" aria-label="Send" disabled={!text.trim()} className="w-10 h-10 shrink-0 rounded-full bg-white text-black flex items-center justify-center active:scale-95 disabled:opacity-30">
          <Send size={16} />
        </button>
      </form>

      {/* WhatsApp-style attach menu */}
      {attachOpen && (
        <>
          <div className="absolute inset-0 z-[55]" onClick={() => setAttachOpen(false)} />
          <div className="absolute left-3 right-3 bottom-[88px] z-[56] rounded-3xl bg-[#1c1c20] border border-white/10 p-4 grid grid-cols-4 gap-2 shadow-2xl animate-rise-in">
            {(
              [
                [Camera, 'Camera', 'bg-rose-500', () => setCamera('photo')],
                [Images, 'Gallery', 'bg-violet-500', () => galleryRef.current?.click()],
                [Video, 'Video', 'bg-sky-500', () => setCamera('video')],
                [MapPinned, 'Day plan', 'bg-amber-500', () => (days ? setPlanOpen(true) : notify('Set the trip dates first to share a day’s plan'))],
              ] as const
            ).map(([Icon, label, color, act]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setAttachOpen(false);
                  act();
                }}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                <span className={cn('w-12 h-12 rounded-full flex items-center justify-center text-white', color)}>
                  <Icon size={21} />
                </span>
                <span className="text-[11px] text-white/80">{label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!files.length) return;
          setCamera(null);
          const { items, tooBig } = await prepareFiles(files);
          if (tooBig) notify(`${tooBig} video${tooBig === 1 ? ' is' : 's are'} over 20 MB — record a shorter clip with the chat camera`);
          if (items.length) setPicked((p) => [...p, ...items]);
        }}
      />
      {camera && (
        <ChatCamera
          startMode={camera}
          onClose={() => setCamera(null)}
          onGallery={() => galleryRef.current?.click()}
          onCapture={(item) => {
            setCamera(null);
            setPicked((p) => [...p, item]);
          }}
        />
      )}
      {picked.length > 0 && (
        <MediaPreview
          items={picked}
          onRemove={(k) => setPicked((p) => p.filter((x) => x.key !== k))}
          onAddMore={() => galleryRef.current?.click()}
          onClose={() => setPicked([])}
          onSend={(caption) => {
            const list = picked;
            setPicked([]);
            list.forEach((item, i) => upload(item, i === 0 ? caption : ''));
            const photos = list.filter((x) => x.kind === 'photo').length;
            const videos = list.length - photos;
            const what = [photos && `📷 ${photos === 1 ? 'Photo' : `${photos} photos`}`, videos && `🎥 ${videos === 1 ? 'Video' : `${videos} videos`}`].filter(Boolean).join(' · ');
            pushToGroup(group.id, user, caption.trim() ? `${what}: ${caption.trim()}` : what);
          }}
        />
      )}
      {viewing?.media && (
        <MediaViewer groupId={group.id} media={viewing.media} caption={viewing.text} title={`${nameOf(viewing.uid)} · ${viewing.createdAt?.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) ?? ''}`} onClose={() => setViewing(null)} />
      )}

      <Sheet open={!!actionFor} onClose={() => setActionFor(null)} title="Message">
        {actionFor && (
          <div className="space-y-1">
            <p className="mb-3 rounded-2xl bg-white/[0.05] px-3.5 py-2.5 text-sm text-white/70 line-clamp-3">
              {actionFor.deleted ? 'Deleted message' : actionFor.type === 'photo' ? `📷 Photo${actionFor.text ? ` · ${actionFor.text}` : ''}` : actionFor.type === 'video' ? `🎥 Video${actionFor.text ? ` · ${actionFor.text}` : ''}` : actionFor.type === 'activity' ? `${nameOf(actionFor.uid)} ${actionFor.text}` : actionFor.text}
            </p>
            {actionFor.text && !actionFor.deleted && actionFor.type !== 'activity' && (
              <SheetRow
                icon={<Copy size={18} />}
                label="Copy text"
                onClick={async () => {
                  await navigator.clipboard?.writeText(actionFor.text).catch(() => undefined);
                  notify('Copied');
                  setActionFor(null);
                }}
              />
            )}
            {actionFor.uid === user.uid && !actionFor.deleted && actionFor.type !== 'activity' && actionFor.createdAt && (
              <SheetRow
                icon={<Trash2 size={18} />}
                label="Delete for everyone"
                danger
                onClick={async () => {
                  const m = actionFor;
                  setActionFor(null);
                  try {
                    await deleteMessageForEveryone(group.id, m);
                    notify('Deleted for everyone');
                  } catch (err) {
                    notify(`Couldn’t delete — ${cloudErrorMessage(err)}`);
                  }
                }}
              />
            )}
            <SheetRow
              icon={<EyeOff size={18} />}
              label="Delete for me"
              danger
              onClick={() => {
                hideForMe(actionFor.id);
                setActionFor(null);
                notify('Deleted from this phone');
              }}
            />
          </div>
        )}
      </Sheet>

      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} trip={trip} stops={stopsOf(trip.id)} onSend={(plan) => sendPlan(group.id, user, plan).then(() => pushToGroup(group.id, user, `📍 Plan for Day ${plan.day + 1}: ${plan.stops.map((s) => s.name).join(', ') || 'free day'}`))} />
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
        Everyone sees and edits the same plan — places, days, hotels and dates — plus the trip’s photos, this chat and the shared expenses. Your personal budget and packing list stay private.
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
