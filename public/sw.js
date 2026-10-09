// Service worker do Livih (PWA). Simples de propósito:
// - páginas: rede primeiro; sem internet, devolve a última casca salva (o app abre, sem dados até a conexão voltar);
// - /assets/* (nomes com hash do Vite, nunca mudam): cache primeiro;
// - todo o resto (Supabase, fontes, outros domínios) passa direto, sem cache: dados sempre frescos.
const CACHE = 'livih-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copia))
          }
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (salvo) =>
          salvo ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copia))
            }
            return res
          }),
      ),
    )
  }
})
