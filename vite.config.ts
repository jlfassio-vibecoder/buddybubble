import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, loadEnv} from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * App Hosting injects `FIREBASE_WEBAPP_CONFIG` at build time. Locally, use `firebase-applet-config.json`
 * (gitignored) copied from `firebase-applet-config.example.json`.
 */
function loadFirebaseOptions(): Record<string, unknown> {
  const fromEnv = process.env.FIREBASE_WEBAPP_CONFIG;
  if (fromEnv !== undefined && fromEnv !== '') {
    try {
      return JSON.parse(fromEnv) as Record<string, unknown>;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[vite] FIREBASE_WEBAPP_CONFIG is set but is not valid JSON (${reason}). Fix the value in App Hosting / Cloud Build; do not fall back to a local file when this variable is present.`,
      );
    }
  }
  const localPath = path.resolve(__dirname, 'firebase-applet-config.json');
  try {
    return JSON.parse(fs.readFileSync(localPath, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new Error(
      '[vite] Firebase config missing: set FIREBASE_WEBAPP_CONFIG (App Hosting) or create firebase-applet-config.json from firebase-applet-config.example.json',
    );
  }
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const firebaseOptions = loadFirebaseOptions();
  const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
      __FIREBASE_OPTIONS__: JSON.stringify(firebaseOptions),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
