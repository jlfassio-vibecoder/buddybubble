/// <reference types="vite/client" />

import type { FirebaseOptions } from 'firebase/app';

/** Injected by `vite.config.ts` from `FIREBASE_WEBAPP_CONFIG` (App Hosting) or `firebase-applet-config.json` (local). */
declare const __FIREBASE_OPTIONS__: FirebaseOptions & { firestoreDatabaseId?: string };
