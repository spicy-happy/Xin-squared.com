/**
 * XieXie Service Worker — offline-first caching.
 *
 * Strategy:
 *  - App shell (HTML, CSS, JS, JSON data): cache-first, update in background
 *  - Stroke data (hanzi-writer-data CDN): cache-first, fetch on miss
 *  - Everything else: network-first with cache fallback
 */

const CACHE_VERSION = 'xxg-v2';
const STROKE_CACHE = 'xxg-strokes-v1';

// App shell — files needed for the app to work offline
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/session.js',
  './js/storage.js',
  './js/enrichment.js',
  './js/sounds.js',
  './js/i18n.js',
  './js/lib/hanzi-writer.min.js',
  './js/lib/lz-string.min.js',
  './js/lib/tesseract.min.js',
  './js/components/profile-picker.js',
  './js/components/onboarding.js',
  './js/components/word-editor.js',
  './js/components/settings.js',
  './js/components/dashboard.js',
  './js/components/test-mode.js',
  './js/components/photo-import.js',
  './js/components/worksheets.js',
  './js/activities/exposure.js',
  './js/activities/meaning-match.js',
  './js/activities/reverse-meaning.js',
  './js/activities/audio-recognition.js',
  './js/activities/pinyin-match.js',
  './js/activities/stroke-writing.js',
  './js/activities/matching-game.js',
  './js/activities/timed-challenge.js',
  './js/activities/compound-discovery.js',
  './js/data/cedict-index.json',
  './js/data/mmah-index.json',
  './js/data/cedict-compounds.json',
  './js/data/confusion-pairs.json',
  './js/data/packs/index.json',
  './js/data/packs/top-100-frequent.json',
  './js/data/packs/top-500-frequent.json',
  './js/data/packs/yct-1.json',
  './js/data/packs/yct-2.json',
  './js/data/packs/yct-3.json',
  './js/data/packs/bumi-k.json',
  './js/data/packs/swkd-book1.json',
  './icon.svg',
  './manifest.json',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== STROKE_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch — route requests to appropriate strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Stroke data — CDN or local — cache permanently in stroke cache
  if (
    (url.hostname.includes('jsdelivr') && url.pathname.includes('hanzi-writer-data')) ||
    (url.origin === self.location.origin && url.pathname.includes('/js/data/strokes/'))
  ) {
    event.respondWith(strokeDataStrategy(event.request));
    return;
  }

  // App shell and local files — cache-first, update in background
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }

  // External requests — network only (don't cache third-party)
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

/** Cache-first for app shell, with background update */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Update cache in background (stale-while-revalidate)
    const fetchPromise = fetch(request).then((response) => {
      if (response.ok) {
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, response));
      }
      return response.clone();
    }).catch(() => {});
    // Don't await — return cached immediately
    fetchPromise;
    return cached;
  }

  // Not in cache — fetch and cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return offline fallback for HTML
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('./index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

/** Stroke data — cache permanently, fetch on miss */
async function strokeDataStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STROKE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('{}', {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Pre-cache stroke data for a list of characters.
 * Called from the app via postMessage.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PRECACHE_STROKES') {
    const chars = event.data.characters || [];
    precacheStrokes(chars);
  }
});

async function precacheStrokes(chars) {
  const cache = await caches.open(STROKE_CACHE);
  const uncached = [];

  for (const ch of chars) {
    const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2/${encodeURIComponent(ch)}.json`;
    const existing = await cache.match(url);
    if (!existing) uncached.push(url);
  }

  // Fetch in batches of 10 to avoid overwhelming the network
  for (let i = 0; i < uncached.length; i += 10) {
    const batch = uncached.slice(i, i + 10);
    await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const resp = await fetch(url);
          if (resp.ok) await cache.put(url, resp);
        } catch {}
      })
    );
  }

  // Notify the app that precaching is done
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({
      type: 'PRECACHE_COMPLETE',
      total: chars.length,
      cached: chars.length - uncached.length + uncached.length,
    });
  }
}
