import { useEffect, useRef, useState } from 'react';
import { Download, Images, Loader2, Play, RefreshCcw, Send, SwitchCamera, X } from 'lucide-react';
import { chatMediaUrl, MAX_CHAT_VIDEO, type ChatMedia } from '../../lib/cloud';
import { blobToDataURL, compressImage } from '../../lib/image';
import { cn } from '../../lib/utils';

/** A photo or video ready to send: the file plus what the chat needs to show it. */
export interface Prepared {
  key: string;
  blob: Blob;
  kind: 'photo' | 'video';
  mime: string;
  w: number;
  h: number;
  duration?: number;
  thumb: string;
  /** Local URL for previewing before/while sending. */
  url: string;
}

export const fmtDuration = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const key = () => Math.random().toString(36).slice(2);

/** Chat photos: up to 1600 px, plus a tiny preview. */
async function preparePhoto(file: Blob): Promise<Prepared> {
  const blob = await compressImage(file, 1600, 0.8);
  const bmp = await createImageBitmap(blob);
  const prepared = { w: bmp.width, h: bmp.height };
  bmp.close?.();
  const thumb = await blobToDataURL(await compressImage(blob, 320, 0.6));
  return { key: key(), blob, kind: 'photo', mime: blob.type || 'image/jpeg', ...prepared, thumb, url: URL.createObjectURL(blob) };
}

/** Videos: size, length and a first-frame preview (read from a hidden <video>). */
async function prepareVideo(file: Blob, durationHint?: number): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  const meta = await new Promise<{ w: number; h: number; duration?: number; thumb: string }>((resolve) => {
    let settled = false;
    const finish = (thumb: string) => {
      if (settled) return;
      settled = true;
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : durationHint;
      resolve({ w: v.videoWidth || 720, h: v.videoHeight || 1280, duration: d, thumb });
    };
    const grab = () => {
      try {
        const scale = Math.min(1, 320 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(v.videoWidth * scale));
        c.height = Math.max(1, Math.round(v.videoHeight * scale));
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL('image/jpeg', 0.6));
      } catch {
        finish('');
      }
    };
    v.onloadeddata = () => {
      v.onseeked = grab;
      try {
        v.currentTime = Number.isFinite(v.duration) ? Math.min(0.1, v.duration / 2) : 0.1;
      } catch {
        grab();
      }
    };
    v.onerror = () => finish('');
    setTimeout(() => (v.videoWidth ? grab() : finish('')), 5000);
    v.load();
  });
  return { key: key(), blob: file, kind: 'video', mime: file.type || 'video/mp4', ...meta, url };
}

/** Files picked from the gallery → ready to send (too-large videos are left out and reported). */
export async function prepareFiles(files: File[]): Promise<{ items: Prepared[]; tooBig: number }> {
  const items: Prepared[] = [];
  let tooBig = 0;
  for (const f of files) {
    if (f.type.startsWith('video/')) {
      if (f.size > MAX_CHAT_VIDEO) tooBig++;
      else items.push(await prepareVideo(f));
    } else if (f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)) items.push(await preparePhoto(f));
  }
  return { items, tooBig };
}

// ───────────────────────── In-app camera ─────────────────────────

/** Recording format: MP4 where the browser can (plays everywhere), otherwise WebM. */
function recorderType() {
  const types = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
}

const MAX_SECONDS = 60;

/**
 * WhatsApp-style camera: tap the shutter for a photo, hold it (or switch to Video) to record.
 * Videos are recorded at a modest quality so a minute stays around 8 MB.
 */
export function ChatCamera({ startMode = 'photo', onCapture, onGallery, onClose }: { startMode?: 'photo' | 'video'; onCapture: (p: Prepared) => void; onGallery: () => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const holdTimer = useRef<number>();
  const heldToRecord = useRef(false);
  const [mode, setMode] = useState(startMode);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [recStart, setRecStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const nativePhoto = useRef<HTMLInputElement>(null);
  const nativeVideo = useRef<HTMLInputElement>(null);

  // Open the camera (and microphone, for videos); reopen when flipping.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const video = { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } };
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const s = await navigator.mediaDevices.getUserMedia({ video, audio: true }).catch(() => navigator.mediaDevices.getUserMedia({ video, audio: false }));
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) setError('Stamped can’t use the camera here. Allow camera access in your browser settings, or use your phone’s camera app below.');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  useEffect(() => {
    if (recStart == null) return;
    const t = window.setInterval(() => {
      const s = (Date.now() - recStart) / 1000;
      setElapsed(s);
      if (s >= MAX_SECONDS) stopRecording();
    }, 200);
    return () => window.clearInterval(t);
  }, [recStart]); // eslint-disable-line react-hooks/exhaustive-deps

  async function takePhoto() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || busy) return;
    setBusy(true);
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const g = c.getContext('2d')!;
    // Selfies are saved the way they look in the preview (mirrored), like most camera apps.
    if (facing === 'user') {
      g.translate(c.width, 0);
      g.scale(-1, 1);
    }
    g.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
    if (blob) onCapture(await preparePhoto(blob));
    setBusy(false);
  }

  function startRecording() {
    const s = streamRef.current;
    if (!s || recorder.current) return;
    const mimeType = recorderType();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(s, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 64_000 });
    } catch {
      setError('This browser can’t record video here — use your phone’s camera app below.');
      return;
    }
    const parts: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = async () => {
      recorder.current = null;
      setRecStart(null);
      const seconds = (Date.now() - started) / 1000;
      if (seconds < 0.6) return; // a slip of the finger
      setBusy(true);
      const blob = new Blob(parts, { type: (rec.mimeType || mimeType || 'video/webm').split(';')[0] });
      onCapture(await prepareVideo(blob, seconds));
      setBusy(false);
    };
    rec.start(1000);
    recorder.current = rec;
    setElapsed(0);
    setRecStart(Date.now());
  }

  function stopRecording() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  // Shutter: in Photo, tap = photo and hold = video; in Video, tap starts/stops.
  function down() {
    if (mode === 'video') return recorder.current ? stopRecording() : startRecording();
    heldToRecord.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldToRecord.current = true;
      startRecording();
    }, 350);
  }
  function up() {
    if (mode === 'video') return;
    window.clearTimeout(holdTimer.current);
    if (heldToRecord.current) stopRecording();
    else takePhoto();
  }

  const recording = recStart != null;

  return (
    <div className="absolute inset-0 z-[70] bg-black flex flex-col animate-fade-in select-none">
      <video ref={videoRef} playsInline muted className={cn('absolute inset-0 w-full h-full object-cover', facing === 'user' && '-scale-x-100')} />

      <div className="relative z-10 pt-12 px-4 flex items-center justify-between">
        <button type="button" aria-label="Close camera" onClick={onClose} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center">
          <X size={22} />
        </button>
        {recording && (
          <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-semibold text-white tabular-nums flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> {fmtDuration(elapsed)}
          </span>
        )}
        <span className="w-10" />
      </div>

      {error && (
        <div className="relative z-10 mx-6 mt-24 rounded-2xl bg-white/10 backdrop-blur p-4 text-center">
          <p className="text-sm text-white/85 leading-relaxed">{error}</p>
          <div className="mt-3 flex justify-center gap-2">
            <button type="button" onClick={() => nativePhoto.current?.click()} className="rounded-full bg-white text-black px-4 py-2 text-xs font-semibold">
              Take photo
            </button>
            <button type="button" onClick={() => nativeVideo.current?.click()} className="rounded-full bg-white/15 text-white px-4 py-2 text-xs font-semibold">
              Record video
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 mt-auto pb-10 pt-6 bg-gradient-to-t from-black/70 to-transparent">
        {!recording && !error && <p className="text-center text-[11px] text-white/70 mb-3">{mode === 'photo' ? 'Tap for photo, hold for video' : 'Tap to start and stop recording'}</p>}
        <div className="flex items-center justify-around px-8">
          <button type="button" aria-label="Choose from gallery" disabled={recording} onClick={onGallery} className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur text-white flex items-center justify-center disabled:opacity-0">
            <Images size={20} />
          </button>
          <button
            type="button"
            aria-label={mode === 'photo' ? 'Shutter' : recording ? 'Stop recording' : 'Start recording'}
            disabled={!!error || busy}
            onPointerDown={down}
            onPointerUp={up}
            onPointerLeave={() => holdTimer.current && window.clearTimeout(holdTimer.current)}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
              'relative w-[76px] h-[76px] rounded-full border-4 flex items-center justify-center transition-all touch-none disabled:opacity-40',
              recording ? 'border-red-500 scale-110' : 'border-white',
            )}
          >
            {busy ? (
              <Loader2 className="animate-spin text-white" />
            ) : (
              <span className={cn('block transition-all', recording ? 'w-7 h-7 rounded-lg bg-red-500' : mode === 'video' ? 'w-14 h-14 rounded-full bg-red-500' : 'w-14 h-14 rounded-full bg-white')} />
            )}
          </button>
          <button type="button" aria-label="Flip camera" disabled={recording} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')} className="w-11 h-11 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center disabled:opacity-0">
            <SwitchCamera size={20} />
          </button>
        </div>
        {!recording && (
          <div className="mt-4 flex justify-center gap-6 text-xs font-semibold">
            {(['video', 'photo'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn('uppercase tracking-wider', mode === m ? 'text-amber-300' : 'text-white/60')}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fallback: the phone's own camera app */}
      <input ref={nativePhoto} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCapture(await preparePhoto(f)); }} />
      <input
        ref={nativeVideo}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (f.size > MAX_CHAT_VIDEO) return setError('That video is over 20 MB — record a shorter one (about 20 seconds from the phone camera).');
          onCapture(await prepareVideo(f));
        }}
      />
    </div>
  );
}

// ───────────────────────── Preview before sending ─────────────────────────

/** Full-screen look at what you're about to send, with a caption — like WhatsApp's send screen. */
export function MediaPreview({ items, onRemove, onAddMore, onSend, onClose }: { items: Prepared[]; onRemove: (key: string) => void; onAddMore: () => void; onSend: (caption: string) => void; onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  const [caption, setCaption] = useState('');
  const item = items[Math.min(current, items.length - 1)];
  if (!item) return null;
  return (
    <div className="absolute inset-0 z-[75] bg-black flex flex-col animate-fade-in">
      <div className="pt-12 px-4 flex items-center justify-between">
        <button type="button" aria-label="Cancel" onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
          <X size={22} />
        </button>
        {items.length > 1 && <span className="text-xs text-white/60">{items.length} selected</span>}
        <button type="button" onClick={onAddMore} className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white flex items-center gap-1.5">
          <Images size={14} /> Add
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        {item.kind === 'photo' ? (
          <img src={item.url} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
        ) : (
          <video key={item.key} src={item.url} controls playsInline autoPlay className="max-w-full max-h-full rounded-xl bg-black" />
        )}
      </div>
      {items.length > 1 && (
        <div className="px-3 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {items.map((it, i) => (
            <div key={it.key} className="relative shrink-0">
              <button type="button" onClick={() => setCurrent(i)} className={cn('block w-14 h-14 rounded-lg overflow-hidden border-2', i === current ? 'border-amber-300' : 'border-transparent')}>
                {it.thumb ? <img src={it.thumb} alt="" className="w-full h-full object-cover" /> : <span className="block w-full h-full bg-white/10" />}
                {it.kind === 'video' && <Play size={14} className="absolute inset-0 m-auto text-white drop-shadow" fill="currentColor" />}
              </button>
              <button type="button" aria-label="Remove" onClick={() => onRemove(it.key)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white flex items-center justify-center ring-1 ring-white/30">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className="px-3 pt-2 pb-8 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(caption);
        }}
      >
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption…" maxLength={500} className="flex-1 min-w-0 rounded-full bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none" />
        <button type="submit" aria-label="Send" className="w-12 h-12 shrink-0 rounded-full bg-amber-300 text-black flex items-center justify-center active:scale-95">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

// ───────────────────────── In the chat ─────────────────────────

/** Bubble size that keeps the picture's shape (max 240 × 320). */
function boxFor(w: number, h: number) {
  const ratio = w && h ? w / h : 1;
  let width = 240;
  let height = width / ratio;
  if (height > 320) {
    height = 320;
    width = height * ratio;
  }
  return { width: Math.round(Math.max(width, 120)), height: Math.round(Math.max(height, 90)) };
}

/** A photo/video message: the tiny preview straight away, the full photo once it scrolls into view. */
export function MediaBubble({ groupId, media, caption, mine, progress, onOpen }: { groupId?: string; media: Pick<ChatMedia, 'kind' | 'w' | 'h' | 'thumb' | 'duration'> & Partial<ChatMedia>; caption?: string; mine: boolean; progress?: number; onOpen?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [full, setFull] = useState<string | null>(null);
  const box = boxFor(media.w, media.h);

  useEffect(() => {
    if (media.kind !== 'photo' || !groupId || !media.id || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      chatMediaUrl(groupId, media as ChatMedia).then(setFull, () => undefined);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [groupId, media.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('max-w-[78%] rounded-2xl p-1', mine ? 'bg-white rounded-br-md' : 'bg-white/[0.08] rounded-bl-md')}>
      <button ref={ref} type="button" onClick={(e) => { e.stopPropagation(); onOpen?.(); }} disabled={!onOpen} className="relative block overflow-hidden rounded-xl bg-white/10" style={box}>
        {(full || media.thumb) && <img src={full ?? media.thumb} alt="" className={cn('absolute inset-0 w-full h-full object-cover', !full && media.kind === 'photo' && 'blur-[2px] scale-105')} />}
        {media.kind === 'video' && progress == null && (
          <>
            <span className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
              <Play size={20} className="text-white ml-0.5" fill="currentColor" />
            </span>
            {media.duration != null && <span className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-white drop-shadow">🎥 {fmtDuration(media.duration)}</span>}
          </>
        )}
        {progress != null && (
          <span className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1 text-white">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-[10px] font-semibold tabular-nums">{Math.round(progress * 100)}%</span>
          </span>
        )}
      </button>
      {caption && <p className={cn('px-2.5 pt-1.5 pb-1 text-sm whitespace-pre-wrap break-words', mine ? 'text-black' : 'text-white')}>{caption}</p>}
    </div>
  );
}

/** Full-screen photo or video from the chat, with a download button. */
export function MediaViewer({ groupId, media, caption, title, onClose }: { groupId: string; media: ChatMedia; caption?: string; title: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    chatMediaUrl(groupId, media, setProgress).then(setUrl, () => setFailed(true));
  }, [groupId, media]);
  const ext = media.mime.includes('mp4') ? 'mp4' : media.mime.includes('webm') ? 'webm' : media.kind === 'photo' ? 'jpg' : 'mov';

  return (
    <div className="absolute inset-0 z-[70] bg-black flex flex-col animate-fade-in">
      <div className="pt-12 px-4 pb-3 flex items-center gap-3">
        <button type="button" aria-label="Close" onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
          <X size={22} />
        </button>
        <p className="flex-1 min-w-0 text-sm text-white/80 truncate">{title}</p>
        {url && (
          <a href={url} download={`stamped-${media.id}.${ext}`} aria-label="Save" className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
            <Download size={18} />
          </a>
        )}
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {url ? (
          media.kind === 'photo' ? (
            <img src={url} alt="" className="max-w-full max-h-full object-contain" />
          ) : (
            <video src={url} controls autoPlay playsInline className="max-w-full max-h-full" />
          )
        ) : failed ? (
          <div className="text-center text-white/60 text-sm">
            Couldn’t load this {media.kind}.
            <button type="button" onClick={() => { setFailed(false); chatMediaUrl(groupId, media, setProgress).then(setUrl, () => setFailed(true)); }} className="mt-3 mx-auto flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white">
              <RefreshCcw size={13} /> Try again
            </button>
          </div>
        ) : (
          <div className="relative">
            {media.thumb && <img src={media.thumb} alt="" className="max-w-[80vw] max-h-[60vh] object-contain blur-sm opacity-60" />}
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="animate-spin" />
              {media.chunks > 1 && <span className="text-xs tabular-nums">{Math.round(progress * 100)}%</span>}
            </span>
          </div>
        )}
      </div>
      {caption && <p className="px-5 pt-3 pb-10 text-sm text-white text-center whitespace-pre-wrap">{caption}</p>}
      {!caption && <div className="pb-10" />}
    </div>
  );
}
