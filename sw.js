/* Offline shell only. Music and API responses always go to the network. */

const VERSION = "cyf-radio-v1.0.0";
const SHELL = [
  "/",
  "/index.html",
  "/assets/css/app.css",
  "/assets/js/app.js",
  "/assets/js/api.js",
  "/assets/js/data.js",
  "/assets/js/player.js",
  "/assets/js/store.js",
  "/assets/js/ui.js",
  "/assets/js/utils.js",
  "/assets/js/views.js",
  "/assets/img/favicon.svg",
  "/assets/img/cover-fallback.svg",
  "/assets/img/hero-portrait.jpg",
  "/assets/img/photo-bunny.jpg",
  "/assets/img/photo-christmas.jpg",
  "/site.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put("/index.html", copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached || new Response("离线了，请联网后再试。", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        })))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname === "/site.webmanifest") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        }).catch(() => cached || new Response("资源暂时不可用", { status: 503 }));
        return cached || network;
      })
    );
  }
});
