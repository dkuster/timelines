/* Service worker du viewer mobile : fonctionnement hors ligne.
   VERSION est réécrite par tools/build_viewer.py (date des données + empreinte des fichiers) :
   à chaque changement, le téléphone télécharge la nouvelle version et propose de recharger. */
const VERSION = "2026-10-30T172031-4107c1c0";
const APP = "tl-app-" + VERSION, MEDIA = "tl-media";
const CORE = ["mobile.html", "i18n.js", "data-mobile.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(CORE.map(u => new Request(u, {cache: "reload"})))));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("tl-app-") && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("message", e => { if (e.data === "skip") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // images distantes : réseau seulement
  // fichiers de l'application : cache d'abord (la version change avec VERSION)
  e.respondWith((async () => {
    const hit = await caches.match(req, {ignoreSearch: true, cacheName: APP});
    if (hit) return hit;
    if (req.mode === "navigate"){ const page = await caches.match("mobile.html", {cacheName: APP}); if (page && url.pathname.endsWith("/mobile.html")) return page; }
    try {
      const res = await fetch(req);
      // médias locaux (dossier media/) : mis en cache à la consultation
      if (res.ok && /\/media\//.test(url.pathname)){ const c = await caches.open(MEDIA); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const m = await caches.match(req, {ignoreSearch: true});
      if (m) return m;
      throw err;
    }
  })());
});
