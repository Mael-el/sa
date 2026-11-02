const CACHE_NAME = "santeplus-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", "/images/doctor-hero.jpg"])));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && (url.pathname === "/" || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/images/"))) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === "navigate" ? await caches.match("/") : Response.error())));
});
