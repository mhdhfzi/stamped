import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { RegionFilter, Tab } from './types';
import { StoreProvider, useStore } from './store';
import { PhoneFrame } from './components/PhoneFrame';
import { BottomNav } from './components/BottomNav';
import { PhotoViewer } from './components/PhotoViewer';
import { Splash } from './components/Splash';
import { TripsScreen } from './screens/TripsScreen';
import { TripScreen } from './screens/TripScreen';
import { FeedScreen } from './screens/FeedScreen';
import { AccountScreen } from './screens/AccountScreen';
import { cloudConfigured } from './lib/cloudConfig';

// Sharing (Firebase) loads only when it's set up — solo, offline use never downloads it.
const CloudSync = lazy(() => import('./components/CloudSync'));
const JoinTrip = lazy(() => import('./components/group/JoinTrip'));
const LoginGate = lazy(() => import('./components/login/LoginGate'));

/** An invite link (…?join=CODE) opens the join sheet; the code is removed from the address bar. */
function takeJoinCode(): string | null {
  const url = new URL(location.href);
  const code = url.searchParams.get('join');
  if (!code) return null;
  url.searchParams.delete('join');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  return code;
}

export default function App() {
  return (
    <StoreProvider>
      <PhoneFrame>
        <Shell />
      </PhoneFrame>
    </StoreProvider>
  );
}

function Shell() {
  const { ready, toast } = useStore();
  const [tab, setTab] = useState<Tab>('trips');
  const [tripId, setTripId] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionFilter>('Everywhere');
  const [year, setYear] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ ids: string[]; index: number } | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(() => (cloudConfigured ? takeJoinCode() : null));
  const [loginOpen, setLoginOpen] = useState(false);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  // Launch splash: stays until data is loaded and we know who's signed in (≥2.2 s so it can play, ≤5 s on slow networks).
  const [auth, setAuth] = useState<{ resolved: boolean; name: string | null }>(() => ({ resolved: !cloudConfigured || !!joinCode, name: null }));
  const onAuthResolved = useCallback((name: string | null) => setAuth({ resolved: true, name }), []);
  const [splash, setSplash] = useState<'show' | 'leaving' | 'done'>('show');
  const [minShown, setMinShown] = useState(false);
  const [maxWaited, setMaxWaited] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Long enough for the flags to pop in and turn a little.
    const a = setTimeout(() => setMinShown(true), reduced ? 500 : 2200);
    const b = setTimeout(() => setMaxWaited(true), 5000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  useEffect(() => {
    if (splash === 'show' && ready && minShown && (auth.resolved || maxWaited)) setSplash('leaving');
  }, [splash, ready, minShown, auth.resolved, maxWaited]);
  useEffect(() => {
    if (splash !== 'leaving') return;
    // Remove it once its fade-out has finished.
    const t = setTimeout(() => setSplash('done'), 520);
    return () => clearTimeout(t);
  }, [splash]);

  const openTrip = useCallback((id: string) => {
    setTab('trips');
    setTripId(id);
  }, []);
  const openViewer = useCallback((ids: string[], index: number) => setViewer({ ids, index }), []);
  const closeViewer = useCallback(() => setViewer(null), []);

  return (
    <div id="app-screen" className="relative h-full w-full bg-[#0a0a0c] overflow-hidden text-white">
      {splash !== 'done' && <Splash leaving={splash === 'leaving'} resolved={auth.resolved} name={auth.name} />}
      {ready && (
        <>
          {/* Screens mount as the splash fades, so their entrance animations are seen. */}
          {splash !== 'show' && tab === 'trips' && !tripId && <TripsScreen region={region} setRegion={setRegion} year={year} setYear={setYear} onOpenTrip={openTrip} />}
          {splash !== 'show' && tab === 'trips' && tripId && <TripScreen key={tripId} tripId={tripId} onBack={() => setTripId(null)} onOpenViewer={openViewer} />}
          {tab === 'feed' && <FeedScreen onOpenTrip={openTrip} onOpenViewer={openViewer} />}
          {tab === 'account' && <AccountScreen onOpenTrip={openTrip} onSignIn={() => setLoginOpen(true)} />}

          <BottomNav
            active={tab}
            onChange={(t) => {
              if (t === 'trips' && tab === 'trips') setTripId(null);
              setTab(t);
            }}
          />

          {viewer && <PhotoViewer ids={viewer.ids} start={viewer.index} onClose={closeViewer} />}

          {cloudConfigured && (
            <Suspense fallback={null}>
              <CloudSync />
              {/* An invite link goes straight to joining, so skip the welcome screen then. */}
              {!joinCode && <LoginGate open={loginOpen} onClose={closeLogin} onAuthResolved={onAuthResolved} />}
              {joinCode && (
                <JoinTrip
                  initialCode={joinCode}
                  onClose={() => setJoinCode(null)}
                  onJoined={(id) => {
                    setJoinCode(null);
                    openTrip(id);
                  }}
                />
              )}
            </Suspense>
          )}

          {toast && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[70] bg-white text-black text-xs font-medium rounded-full px-4 py-2 shadow-lg whitespace-nowrap animate-rise-in">
              {toast}
            </div>
          )}
        </>
      )}
    </div>
  );
}
