// Service worker do Livih (PWA). Simples de propósito:
// - páginas: rede primeiro; sem internet, devolve a última casca salva (o app abre, sem dados até a conexão voltar);
// - /assets/* (nomes com hash do Vite, nunca mudam): cache primeiro;
// - todo o resto (Supabase, fontes, outros domínios) passa direto, sem cache: dados sempre frescos.
const CACHE = 'livih-v2'

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

// ---------- notificações push (Edge Function push-enviar) ----------
// A mensagem chega cifrada como JSON: { titulo, corpo, url, tag }. A tag é a conversa: mensagens seguidas da
// mesma conversa substituem a notificação anterior em vez de empilhar.
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { corpo: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || 'Livih', {
      body: d.corpo || '',
      icon: '/icon-192.png',
      tag: d.tag || 'livih',
      renotify: true,
      data: { url: d.url || '/conversas' },
    }),
  )
})

// Toque na notificação: abre a conversa numa janela do Livih que já esteja aberta, ou abre uma nova.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/conversas', self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (janelas) => {
      const janela = janelas.find((j) => new URL(j.url).origin === self.location.origin)
      if (janela) {
        await janela.focus()
        return janela.navigate(url).catch(() => self.clients.openWindow(url))
      }
      return self.clients.openWindow(url)
    }),
  )
})
