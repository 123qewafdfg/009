const CACHE_NAME = "passlok-stego-static-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./site.webmanifest",
  "./assets/css/style.css",
  "./assets/js/license.js",
  "./assets/js/jsstegencoder.js",
  "./assets/js/jsstegdecoder.js",
  "./assets/js/jssteg.js",
  "./assets/js/prng.js",
  "./assets/js/lz-string.js",
  "./assets/js/purify.js",
  "./assets/js/jszip.min.js",
  "./assets/js/plstego.js",
  "./assets/js/dictionary_en.js",
  "./assets/js/main.js",
  "./assets/js/bodyscript.js",
  "./assets/icons/favicon.svg",
  "./assets/icons/apple-touch-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      });
    })
  );
});
