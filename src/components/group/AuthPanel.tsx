import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { authErrorMessage, signInWithEmail, signInWithGoogle, signUpWithEmail } from '../../lib/cloud';
import { cn } from '../../lib/utils';
import { Field, PrimaryButton, inputClass } from '../ui';

/** Sign in with Google, or with email + password (create an account or sign in). */
export function AuthPanel({ reason, showGoogle = true }: { reason?: string; showGoogle?: boolean }) {
  const { profileName } = useStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [name, setName] = useState(profileName === 'Traveler' ? '' : profileName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'google' | 'email', fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {reason && <p className="text-sm text-white/60 leading-relaxed">{reason}</p>}
      {showGoogle && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('google', signInWithGoogle)}
          className="w-full rounded-full bg-white text-black py-3 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
        >
          {busy === 'google' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
              />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
          )}
          Continue with Google
        </button>
      )}

      {showGoogle && (
        <div className="flex items-center gap-3 text-[11px] text-white/30">
          <span className="h-px flex-1 bg-white/10" /> or with email <span className="h-px flex-1 bg-white/10" />
        </div>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run('email', () => (mode === 'signup' ? signUpWithEmail(name, email, password) : signInWithEmail(email, password)));
        }}
      >
        {mode === 'signup' && (
          <Field label="Your name (friends see this)">
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} autoComplete="name" className={inputClass} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={inputClass} />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className={inputClass}
          />
        </Field>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <PrimaryButton type="submit" disabled={!!busy}>
          {busy === 'email' ? <Loader2 size={16} className="animate-spin mx-auto" /> : mode === 'signup' ? 'Create account' : 'Sign in'}
        </PrimaryButton>
      </form>
      <p className="text-center text-xs text-white/50">
        {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
        <button type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')} className={cn('font-semibold text-white underline-offset-2 hover:underline')}>
          {mode === 'signup' ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  );
}
