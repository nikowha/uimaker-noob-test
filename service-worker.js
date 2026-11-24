// Service worker du PROTOTYPE : réseau d'abord, cache en secours (fonctionne hors ligne après une première visite).
const CACHE_NAME = 'uimaker-noob-prototype';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (activateEvent) => activateEvent.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (fetchEvent) => {
  if (fetchEvent.request.method !== 'GET') return;
  fetchEvent.respondWith(
    // « no-cache » : demande toujours au serveur si le fichier a changé (GitHub Pages le laisserait 10 min en cache).
    fetch(fetchEvent.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        const responseCopy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(fetchEvent.request, responseCopy));
        return networkResponse;
      })
      .catch(() => caches.match(fetchEvent.request)),
  );
});
