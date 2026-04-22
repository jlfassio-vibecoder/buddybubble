/**
 * Invisible Turnstile loader + token getter.
 *
 * - Loads the Cloudflare script on demand via a vanilla <script> tag — no React
 *   wrapper, no npm dependency.
 * - Renders a single invisible widget into a hidden off-screen div the first time
 *   a token is requested; subsequent requests reuse the widget and reset it so a
 *   fresh token is minted per submit / retry.
 *
 * Site-key env var (confirmed in apps/storefront/src/lib/public-env.ts and
 * .env.example): PUBLIC_TURNSTILE_SITE_KEY.
 */

import { getPublicEnv } from '../../../lib/public-env';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loadPromise = null;
let widgetId = null;
let host = null;
let pendingResolve = null;
let pendingReject = null;

export function getTurnstileSiteKey() {
  const k = getPublicEnv('PUBLIC_TURNSTILE_SITE_KEY');
  return typeof k === 'string' && k.trim() ? k.trim() : '';
}

export function isTurnstileConfigured() {
  return Boolean(getTurnstileSiteKey());
}

export function ensureTurnstileLoaded() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loadPromise = null;
      reject(new Error('Turnstile script failed to load'));
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'absolute';
  host.style.left = '-9999px';
  host.style.top = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  return host;
}

function settle(fn, value) {
  const r = pendingResolve;
  const j = pendingReject;
  pendingResolve = null;
  pendingReject = null;
  if (fn === 'resolve' && r) r(value);
  if (fn === 'reject' && j) j(value);
}

function createWidget(sitekey) {
  if (widgetId !== null) return;
  const container = ensureHost();
  widgetId = window.turnstile.render(container, {
    sitekey,
    size: 'invisible',
    callback: (token) => settle('resolve', token),
    'error-callback': () => settle('reject', new Error('Turnstile verification failed')),
    'timeout-callback': () => settle('reject', new Error('Turnstile timed out')),
  });
}

/**
 * Get a fresh Turnstile token. Resolves with `null` when not configured so
 * callers can unconditionally await and simply omit the token from the payload.
 * Rejects when the widget errors or times out.
 */
export async function getTurnstileToken() {
  const sitekey = getTurnstileSiteKey();
  if (!sitekey) return null;
  await ensureTurnstileLoaded();
  if (!window.turnstile) throw new Error('Turnstile runtime missing');
  if (pendingResolve || pendingReject) {
    // Guard against overlapping requests; very unlikely given submit flow.
    throw new Error('Turnstile already in progress');
  }
  createWidget(sitekey);
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    try {
      window.turnstile.reset(widgetId);
      window.turnstile.execute(widgetId);
    } catch (e) {
      pendingResolve = null;
      pendingReject = null;
      reject(e);
    }
  });
}

export function resetTurnstile() {
  if (typeof window === 'undefined' || !window.turnstile || widgetId === null) return;
  try {
    window.turnstile.reset(widgetId);
  } catch {
    // ignore
  }
}
