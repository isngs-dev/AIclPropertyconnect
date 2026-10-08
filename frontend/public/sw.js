// Minimal service worker: makes the portal installable ("Add to Home Screen") and shows a friendly page when offline.
// API calls and pages are always fetched live - money and charges are never served from a cache.
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => { e.waitUntil(caches.open("aicl-offline-v1").then((c) => c.add(OFFLINE))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
  }
});
