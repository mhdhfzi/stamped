import { Component, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

/** Blurred top bar used on every screen (matches the spec header). */
export function TopBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div
      className="absolute top-0 inset-x-0 z-30 px-6 pt-14 pb-4 flex items-center justify-between"
      style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', backgroundColor: 'rgba(10, 10, 12, 0.75)' }}
    >
      {left}
      <div className="flex items-center gap-4">{right}</div>
    </div>
  );
}

export function IconButton({ onClick, label, children, className }: { onClick?: () => void; label: string; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cn('text-white/70 hover:text-white transition-colors active:scale-90', className)}>
      {children}
    </button>
  );
}

export function GlassCircle({ onClick, label, children, size = 'w-10 h-10' }: { onClick?: () => void; label: string; children: ReactNode; size?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn('liquid-glass rounded-full flex items-center justify-center text-white active:scale-90 transition-transform', size)}>
      {children}
    </button>
  );
}

/** Bottom sheet rendered inside the phone frame. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  // Portal to the screen root so a sheet opened from inside scrolling content still covers the screen.
  return createPortal(
    <div className="absolute inset-0 z-[55] flex flex-col justify-end">
      <div className={cn('absolute inset-0 bg-black/60 transition-opacity duration-300', shown ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
      <div
        className={cn(
          'relative max-h-[85%] flex flex-col rounded-t-[28px] bg-[#141417] border-t border-white/10 transition-transform duration-300 ease-out',
          shown ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        {title && (
          <div className="px-6 pt-2 pb-3 flex items-center justify-between">
            <h3 className="text-white text-base font-semibold">{title}</h3>
            <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto scrollbar-hide px-6 pb-8">{children}</div>
      </div>
    </div>,
    document.getElementById('app-screen') ?? document.body,
  );
}

export function SheetRow({ icon, label, hint, onClick, danger, active }: { icon?: ReactNode; label: ReactNode; hint?: ReactNode; onClick?: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors',
        active ? 'bg-white/10' : 'hover:bg-white/5 active:bg-white/10',
        danger ? 'text-red-400' : 'text-white',
      )}
    >
      {icon && <span className={cn('shrink-0', danger ? 'text-red-400' : 'text-white/70')}>{icon}</span>}
      <span className="flex-1 text-sm font-medium">{label}</span>
      {hint && <span className="text-xs text-white/40">{hint}</span>}
    </button>
  );
}

export function PrimaryButton({ children, onClick, disabled, danger, type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full rounded-full py-3.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40',
        danger ? 'bg-red-500 text-white' : 'bg-white text-black',
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-full py-3.5 text-sm font-semibold bg-white/10 text-white active:scale-[0.98]">
      {children}
    </button>
  );
}

export const inputClass =
  'w-full rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/50 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function ConfirmSheet({ open, onClose, title, message, confirmLabel, onConfirm, tone = 'danger' }: { open: boolean; onClose: () => void; title: string; message: string; confirmLabel: string; onConfirm: () => void; tone?: 'danger' | 'primary' }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="pt-3 text-center">
        <h3 className="text-white text-lg font-semibold">{title}</h3>
        <p className="text-white/50 text-sm mt-2 leading-relaxed">{message}</p>
        <div className="mt-6 space-y-2">
          <PrimaryButton danger={tone === 'danger'} onClick={onConfirm}>{confirmLabel}</PrimaryButton>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        </div>
      </div>
    </Sheet>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center pt-16 px-4 animate-rise-in">
      <div className="w-16 h-16 rounded-full liquid-glass flex items-center justify-center text-white/70 mb-5">{icon}</div>
      <h3 className="text-white text-lg font-semibold">{title}</h3>
      <p className="text-white/50 text-sm mt-2 leading-relaxed max-w-[260px]">{body}</p>
      {action && <div className="mt-6 w-full max-w-[220px]">{action}</div>}
    </div>
  );
}

/** Keeps a failing widget (e.g. a map) from blanking the whole app. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function MapFallback() {
  return <div className="h-full flex items-center justify-center bg-white/[0.03] text-xs text-white/40 px-6 text-center">The map couldn’t be shown. Your plan is safe — try reopening this screen.</div>;
}
