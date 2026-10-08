/**
 * Firebase settings from .env (see .env.example). Kept separate from the Firebase SDK
 * so the app can check "is sharing set up?" without downloading Firebase.
 */
const env = import.meta.env;

export const useEmulators = env.VITE_FIREBASE_EMULATORS === 'true';

/**
 * Where Google sign-in pages are served from. Online (HTTPS, a real domain) we use our own
 * address: the host forwards /__/auth/* to Firebase (see vercel.json; Firebase Hosting does it
 * natively). Keeping sign-in on the same site is what makes redirect sign-in work on phones,
 * whose browsers block reading another site's storage. Locally we use Firebase's own domain.
 */
function authDomain(fallback: string) {
  const { protocol, hostname, host } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  return protocol === 'https:' && !local ? host : fallback;
}

export const firebaseConfig = useEmulators
  ? { apiKey: 'demo-key', authDomain: 'demo-stamped.firebaseapp.com', projectId: 'demo-stamped', appId: 'demo-app' }
  : env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY as string,
        authDomain: authDomain(env.VITE_FIREBASE_AUTH_DOMAIN as string),
        projectId: env.VITE_FIREBASE_PROJECT_ID as string,
        appId: env.VITE_FIREBASE_APP_ID as string,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
      }
    : null;

/** True when trips can be shared (Firebase is configured). */
export const cloudConfigured = !!firebaseConfig;
