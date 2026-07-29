// Bump this whenever the precache list changes OR any file in NETWORK_FIRST_FILES changes shape
// in a way that needs old caches evicted. Files in CACHE_FIRST_FILES rarely change once shipped.
const CACHE_NAME = "challenge-fantasy-v1";

const CAST_SLUGS = [
  "adrienne", "anna-leigh", "bananas", "brad", "cara-maria", "cassidy", "cedric", "chris",
  "cory", "ct", "deb", "izzy", "josh", "justin", "keanu", "leo", "lete", "michele", "nelson",
  "nurys", "reilly", "sydney", "tori", "will",
];

// Code + markup: actively edited during development, must reflect a fresh deploy immediately.
const NETWORK_FIRST_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/draft.js",
  "./js/gist.js",
  "./js/scoring.js",
  "./js/seed.js",
  "./js/state.js",
  "./js/views/commissioner.js",
  "./js/views/player.js",
  "./js/views/shared.js",
];

// Heavy static binary assets: unchanged once shipped, safe to serve from cache first for
// offline reliability (and to avoid re-downloading 24 images + a font on every load).
const CACHE_FIRST_FILES = [
  "./fonts/Anton-Regular.woff2",
  "./images/logo.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  ...CAST_SLUGS.map((slug) => `./images/cast/${slug}.webp`),
];

const PRECACHE_FILES = [...NETWORK_FIRST_FILES, ...CACHE_FIRST_FILES];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isNetworkFirst(url) {
  return NETWORK_FIRST_FILES.some((path) => url.pathname.endsWith(path.replace("./", "/")) || url.pathname === "/");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests. Gist API calls (api.github.com) and any writes must
  // always hit the network directly — this app's data sync protocol is not something to cache.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (isNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
