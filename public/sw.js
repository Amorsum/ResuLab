// ResuLab Service Worker — 离线缓存策略
const CACHE_NAME = 'resulab-v1';

// 安装时预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/builder',
        '/login',
        '/register',
        '/manifest.json',
        '/icon.svg',
      ]);
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
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  // 立即接管所有页面
  self.clients.claim();
});

// 请求拦截：缓存优先，网络回退
self.addEventListener('fetch', (event) => {
  // 跳过 Supabase API 请求
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // 缓存命中，直接返回
      if (cached) return cached;

      // 否则走网络，成功后写入缓存
      return fetch(event.request)
        .then((response) => {
          // 只缓存成功的 GET 请求
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // 网络失败：对于导航请求返回首页
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          // 图片/资源失败时静默忽略
          return new Response('', { status: 204 });
        });
    })
  );
});
