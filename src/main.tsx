import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Keep the app on the phone so it opens with no internet (and receives notifications). Not in development.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !location.pathname.endsWith('.html')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
