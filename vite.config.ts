import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Writes dist/precache.json: every file of this build, so the service worker (public/sw.js)
 * can keep the whole app on the phone and open it with no internet.
 */
function precacheList(): Plugin {
  return {
    name: 'stamped-precache-list',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).map((f) => `/${f}`);
      const urls = ['/', '/manifest.webmanifest', '/icon.svg', ...files];
      // A new version whenever any file name (they contain content hashes) changes.
      let h = 0;
      for (const ch of urls.join('|')) h = (h * 31 + ch.charCodeAt(0)) | 0;
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify({ version: (h >>> 0).toString(36), urls }) });
    },
  };
}

// `npm run build:single` bundles everything into one self-contained index.html
// (handy for sharing a demo). The normal `npm run build` produces a regular PWA build.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [precacheList()])],
  build: mode === 'single' ? { outDir: 'dist-single' } : undefined,
}));
