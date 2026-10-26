// ResuLab Service Worker — 只缓存本站静态资源，页面联网优先。
const CACHE_NAME = 'resulab-v2';
const CORE_ASSETS = ['/', '/manifest.json', '/icon.svg'];

// 安装时预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // GitHub Pages SPA routes can return HTTP 404; precache real files only.
      return cache.addAll(CORE_ASSETS);
    })
  );
  // 立即激活，不等待旧 SW
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key.startsWith('resulab-') && key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  // 立即接管所有页面
  self.clients.claim();
});

async function remember(cache, request, response) {
  if (response.ok) {
    try { await cache.put(request, response.clone()); } catch { /* Cache is optional. */ }
  }
  return response;
}

async function navigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    return await remember(cache, request, await fetch(request));
  } catch {
    return await cache.match(request) || await cache.match('/') || Response.error();
  }
}

async function staticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  return remember(cache, request, await fetch(request));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never intercept API calls, other origins or authenticated responses.
  if (request.method !== 'GET' || url.origin !== self.location.origin
      || request.headers.has('authorization') || /^\/api(?:\/|$)/.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
  } else if (url.pathname.startsWith('/assets/') || CORE_ASSETS.includes(url.pathname)) {
    event.respondWith(staticAsset(request));
  }
});
