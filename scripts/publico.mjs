// Prueba de la tienda pública en un navegador de verdad (Edge headless por DevTools Protocol, como e2e.mjs) y capturas.
// Lo que e2e_publico.py (HTML por HTTP) no puede ver: que no haya desborde horizontal en el celular y que publico.js
// rearme el mensaje de WhatsApp al elegir variante y cantidad.
// Uso: node scripts/publico.mjs <slug> [carpeta-de-capturas]    (el sitio público en :5014 y una tienda con la "Cartera de cuero Mía")
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const slug = process.argv[2]
if (!slug) throw new Error('Falta el slug de la tienda')
const salida = process.argv[3] ?? '../Hermes/docs/capturas'
mkdirSync(salida, { recursive: true })
const BASE = 'http://localhost:5014'
const PUERTO = 9334
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const proc = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pub-edge-'))}`, 'about:blank'])

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
let fallas = 0
const ok = (desc, cond) => { console.log(`${cond ? 'OK   ' : 'FALLA'} ${desc}`); if (!cond) fallas++ }

async function conectar() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })
      return (await r.json()).webSocketDebuggerUrl
    } catch { await dormir(200) }
  }
  throw new Error('Edge no respondió')
}
const ws = new WebSocket(await conectar())
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pendientes = new Map()
const errores = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
})
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id
  pendientes.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)))
  ws.send(JSON.stringify({ id: n, method, params }))
})
const evaluar = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const ir = async (ruta) => { await cdp('Page.navigate', { url: BASE + ruta }); await dormir(1200) }
const captura = async (nombre) => {
  await dormir(500)
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(salida, nombre), Buffer.from(data, 'base64'))
}
const celular = () => cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
const escritorio = () => cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

try {
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await celular()

  await ir(`/${slug}`)
  ok('la tienda no se desborda horizontalmente en el celular (390 px)', await evaluar(`document.documentElement.scrollWidth <= window.innerWidth`))
  ok('los productos se ven en dos columnas', await evaluar(`getComputedStyle(document.querySelector('.grilla')).gridTemplateColumns.split(' ').length === 2`))
  await captura('m10-01-tienda-publica-celular.png')

  await evaluar(`[...document.querySelectorAll('.tarjeta a')].find(a => a.textContent.includes('Cartera de cuero')).click()`)
  await dormir(1500)
  ok('el producto abre en su propia página', (await evaluar(`location.pathname`)).includes('/p/'))
  ok('el producto no se desborda horizontalmente en el celular', await evaluar(`document.documentElement.scrollWidth <= window.innerWidth`))
  const mensaje = () => evaluar(`decodeURIComponent(document.getElementById('pedir').href.split('text=')[1])`)
  ok('el pedido arranca con la primera variante y cantidad 1', (await mensaje()).includes('1 × Cartera de cuero Mía (café) — Bs 180'))
  await evaluar(`document.querySelector('input[name="variante"][data-nombre="negro"]').click()`)
  ok('al elegir otra variante, el mensaje la lleva', (await mensaje()).includes('(negro)'))
  await evaluar(`document.getElementById('mas').click()`)
  await dormir(150)
  await evaluar(`document.getElementById('mas').click()`)
  await dormir(150)
  ok('al subir la cantidad, el mensaje y el total se rearman (3 × … Bs 540)', (await mensaje()).includes('3 × Cartera de cuero Mía (negro) — Bs 540'))
  ok('el contador muestra 3', (await evaluar(`document.getElementById('cantidad').textContent`)) === '3')
  await evaluar(`document.getElementById('menos').click()`)
  await dormir(150)
  await evaluar(`document.getElementById('menos').click()`)
  await dormir(150)
  await evaluar(`document.getElementById('menos').click()`)
  await dormir(150)
  ok('la cantidad nunca baja de 1', (await evaluar(`document.getElementById('cantidad').textContent`)) === '1')
  ok('el mensaje incluye el enlace del producto para la dueña', (await mensaje()).includes('/p/'))
  ok('el enlace abre WhatsApp en otra pestaña sin pasarle la página (noopener)', await evaluar(`(() => { const a = document.getElementById('pedir'); return a.target === '_blank' && a.rel.includes('noopener') && a.href.startsWith('https://wa.me/' + document.getElementById('pedido').dataset.wa.replace(/\\D/g, '') + '?text=') })()`))
  await captura('m10-02-producto-publico-celular.png')

  await escritorio()
  await ir(`/${slug}`)
  ok('en escritorio los productos van en 4 columnas', await evaluar(`getComputedStyle(document.querySelector('.grilla')).gridTemplateColumns.split(' ').length === 4`))
  await captura('m10-03-tienda-publica-escritorio.png')
  await evaluar(`[...document.querySelectorAll('.tarjeta a')].find(a => a.textContent.includes('Cartera de cuero')).click()`)
  await dormir(1500)
  await captura('m10-04-producto-publico-escritorio.png')

  ok(`sin errores de JavaScript en la consola (${errores.length})`, errores.length === 0)
  if (errores.length) console.log(errores.slice(0, 5).join('\n'))
} catch (e) {
  ok(`excepción: ${e.message}`, false)
} finally {
  console.log(`--- fallas: ${fallas}`)
  ws.close()
  proc.kill()
  process.exit(fallas ? 1 : 0)
}
