// Service worker del panel: lo justo para que se pueda INSTALAR en el celular y abra rápido.
// - /assets/* (JS y CSS con hash en el nombre: nunca cambian) → de la caché, y si no está, de la red.
// - La página (navegación) → SIEMPRE de la red; sin conexión, la última copia guardada (el panel muestra su propio aviso de
//   "no pudimos conectarnos" al pedir datos).
// - /api y /archivos → NUNCA pasan por acá: los datos (stock, ventas, pedidos) siempre son los de ahora.
const CACHE = 'panel-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request
  if (pedido.method !== 'GET') return
  const url = new URL(pedido.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/archivos/')) return

  if (url.pathname.startsWith('/assets/')) {
    evento.respondWith(
      caches.match(pedido).then(
        (guardada) =>
          guardada ??
          fetch(pedido).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone()
              caches.open(CACHE).then((c) => c.put(pedido, copia))
            }
            return respuesta
          }),
      ),
    )
    return
  }

  if (pedido.mode === 'navigate') {
    evento.respondWith(
      fetch(pedido)
        .then((respuesta) => {
          const copia = respuesta.clone()
          caches.open(CACHE).then((c) => c.put('/', copia))
          return respuesta
        })
        .catch(() => caches.match('/').then((r) => r ?? Response.error())),
    )
  }
})
