// Prueba de punta a punta del front con Edge headless vía Chrome DevTools Protocol (sin
// dependencias: Node 24 trae WebSocket). Necesita la API (perfil http) y `pnpm dev` corriendo.
// Uso: pnpm e2e [carpeta-de-capturas]   (por defecto ../Hermes/docs/capturas)
// Cubre M1 (sesión y armazón). Cada módulo nuevo agrega sus pasos acá.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const salida = process.argv[2] ?? '../Hermes/docs/capturas'
mkdirSync(salida, { recursive: true })
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173'
const PUERTO = 9333
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const perfil = mkdtempSync(join(tmpdir(), 'e2e-edge-'))
const proc = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, 'about:blank'])

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
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errores.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
})
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id
  pendientes.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)))
  ws.send(JSON.stringify({ id: n, method, params }))
})
const evaluar = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  // Con la expresión que falló: una carrera intermitente se encuentra mucho más rápido sabiendo en qué paso fue.
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n    en: ${expr.slice(0, 160)}`)
  return r.result.value
}
const esperar = async (expr, desc, ms = 10000) => {
  const fin = Date.now() + ms
  while (Date.now() < fin) { try { if (await evaluar(expr)) return true } catch {} ; await dormir(150) }
  ok(`${desc} (no pasó en ${ms} ms)`, false)
  return false
}
const ir = async (ruta) => { await cdp('Page.navigate', { url: BASE + ruta }); await dormir(300) }
// Recargar y esperar a que la página VIEJA se haya ido: si no, la próxima espera puede cumplirse todavía en la vieja (que ya
// tenía los datos) y la lectura siguiente cae en la nueva a medio cargar (era la carrera intermitente "reading 'value'").
const recargar = async () => {
  await evaluar('window.__paginaVieja = true')
  await cdp('Page.reload')
  const fin = Date.now() + 15000
  while (Date.now() < fin) { try { if (!(await evaluar('window.__paginaVieja === true'))) break } catch {} ; await dormir(100) }
}
const ruta = () => evaluar('location.pathname')
const texto = () => evaluar('document.body.innerText')
const captura = async (nombre) => {
  await dormir(350) // fuentes y transiciones
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  // En Windows el archivo viejo puede estar tomado un instante (indexador, antivirus, una vista previa abierta): se reintenta
  // y, si igual no se puede, se avisa sin fallar la prueba (una captura no es una verificación).
  for (let intento = 1; ; intento++) {
    try { writeFileSync(join(salida, nombre), Buffer.from(data, 'base64')); return }
    catch (e) { if (intento >= 5) { console.log(`AVISO no se pudo guardar la captura ${nombre}: ${e.code ?? e.message}`); return } await dormir(300) }
  }
}
const celular = () => cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
const escritorio = () => cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

// Helpers dentro de la página: completar un campo por su etiqueta (React necesita el setter nativo).
const helpers = `
  window.__campo = (etiqueta) => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === etiqueta); return l && (l.control || document.getElementById(l.htmlFor)) };
  window.__escribir = (etiqueta, v) => { const el = __campo(etiqueta); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  window.__subirPng = async (color) => { const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 300, 300); g.fillStyle = '#fff'; g.fillRect(100, 100, 100, 100); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'logo.png', { type: 'image/png' })); const i = document.querySelector('input[type=file]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); };
  // cache 'reload' salta la caché del navegador: las fotos se sirven con caché inmutable de un año y sin
  // esto una foto ya borrada seguiría respondiendo 200 desde la copia local. (Sin comillas invertidas
  // acá: todo este bloque es un texto entre comillas invertidas.)
  window.__elegir = (etiqueta, v) => { const el = __campo(etiqueta); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  window.__subirYEsperar = async (color) => { const antes = document.querySelectorAll('.galeria-foto img').length; await __subirPng(color); for (let i = 0; i < 100; i++) { if (document.querySelectorAll('.galeria-foto img').length > antes) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
  window.__tarjetas = () => [...document.querySelectorAll('.tarjeta-producto')].map(a => a.querySelector('.producto-nombre').textContent);
  window.__poner = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  window.__filas = () => [...document.querySelectorAll('.fila-stock')].map(li => li.querySelector('.fila-stock-nombre').textContent);
  window.__fila = (nombre) => [...document.querySelectorAll('.fila-stock')].find(li => li.querySelector('.fila-stock-nombre').textContent === nombre);
  window.__botonEn = (raiz, txt) => [...raiz.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(txt));
  window.__estado = (url) => fetch(url, { cache: 'reload' }).then(r => r.status);
  window.__vender = (nombre) => [...document.querySelectorAll('.fila-vender')].find(li => li.querySelector('.fila-stock-nombre').textContent === nombre);
  window.__ventas = () => [...document.querySelectorAll('.fila-venta')];
  window.__clic = (txt) => { const el = [...document.querySelectorAll('a,button')].find(x => x.textContent.trim().startsWith(txt) || x.getAttribute('aria-label') === txt); el.click(); return !!el };
`
await cdp('Page.enable')
await cdp('Runtime.enable')
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: helpers })

const n = Math.floor(Math.random() * 90000) + 10000
const email = `prueba${n}@ejemplo.com`
const password = 'secreta123'

try {
  // 1. Sin sesión, una ruta del panel lleva a la bienvenida
  await celular()
  await ir('/catalogo')
  await esperar(`location.pathname === '/bienvenida'`, 'sin sesión /catalogo → /bienvenida', 60000) // la primera carga de Vite en frío tarda
  ok('sin sesión /catalogo → /bienvenida', (await ruta()) === '/bienvenida')
  await captura('m1-01-bienvenida-celular.png')

  // 2. Registro: validación de contraseña y dirección automática
  await evaluar(`__clic('Crear mi cuenta')`)
  await esperar(`location.pathname === '/registro'`, 'botón Crear mi cuenta → /registro')
  await evaluar(`__escribir('Tu nombre', 'Andrea Prueba')`)
  await evaluar(`__escribir('Email', '${email}')`)
  await evaluar(`__escribir('Contraseña', 'abc')`)
  await esperar(`__campo('Contraseña').getAttribute('aria-invalid') === 'true'`, 'contraseña débil marcada')
  ok('contraseña débil muestra ayuda en rojo', (await texto()).includes('Usá al menos 8 caracteres.'))
  await evaluar(`__escribir('Contraseña', '${password}')`)
  await evaluar(`__escribir('Nombre de tu negocio', 'Ñandú Accesorios ${n}')`)
  await esperar(`__campo('Dirección de tu tienda').value === 'nandu-accesorios-${n}'`, 'dirección automática')
  ok('dirección se arma sola sin tildes ni ñ', (await evaluar(`__campo('Dirección de tu tienda').value`)) === `nandu-accesorios-${n}`)
  ok('el registro enlaza los términos y la privacidad', await evaluar(`!!document.querySelector('a[href="/terminos"]') && !!document.querySelector('a[href="/privacidad"]')`))
  ok('el panel se puede instalar (manifiesto y ícono)', await evaluar(`fetch('/manifest.webmanifest').then(r => r.json()).then(m => m.display === 'standalone' && m.icons.length === 3 && !/hermes/i.test(JSON.stringify(m)))`))
  await captura('m1-02-registro-celular.png')

  // 3. Crear cuenta → Inicio
  await evaluar(`__clic('Crear mi cuenta')`)
  await esperar(`document.querySelector('h1')?.textContent === 'Hola, Andrea'`, 'registro → Inicio con saludo')
  ok('registro entra al Inicio', (await ruta()) === '/')
  await esperar(`document.body.innerText.includes('Tu cuenta está lista')`, 'el Inicio de una tienda sin actividad muestra los primeros pasos')
  const t = await texto()
  ok('Inicio muestra la dirección de la tienda', t.includes(`/nandu-accesorios-${n}`))
  ok('ningún texto visible menciona "hermes"', !/hermes/i.test(t) && !/hermes/i.test(await evaluar('document.title')))
  await captura('m1-03-inicio-celular.png')

  // 4. Recargar: la sesión sigue (cookie HttpOnly + refresh)
  await recargar()
  await esperar(`document.querySelector('h1')?.textContent === 'Hola, Andrea'`, 'tras recargar sigue la sesión')
  ok('tras recargar sigue en el panel', (await ruta()) === '/')
  ok('el refresh token no es visible para JavaScript', !(await evaluar('document.cookie')).includes('hermes_refresh'))

  // 5. Token vencido → el cliente renueva y repite el pedido solo
  const estado = await evaluar(`(async () => { const m = await import('/src/api/cliente.ts'); m.fijarToken('token-vencido'); const r = await m.api.GET('/api/v1/auth/yo'); return r.response.status })()`)
  ok('con token inválido, el pedido se renueva y responde 200', estado === 200)

  // 6. Dos pestañas renovando a la vez: no cierra la sesión
  const dos = await evaluar(`(async () => {
    const r = await Promise.all([1, 2].map(() => fetch('/api/v1/auth/refresh', { method: 'POST' })));
    const m = await import('/src/api/cliente.ts');
    const s = await m.renovarSesion();
    return { estados: r.map(x => x.status).sort(), despues: !!s };
  })()`)
  ok(`dos renovaciones simultáneas: una gana, otra 401 (${dos.estados})`, dos.estados.join() === '200,401')
  ok('después de la carrera la sesión sigue viva', dos.despues === true)

  // 7. Secciones en construcción y barra inferior
  await evaluar(`__clic('Catálogo')`)
  await esperar(`location.pathname === '/catalogo'`, 'barra inferior → Catálogo')
  await esperar(`document.body.innerText.includes('Todavía no cargaste productos')`, 'el catálogo de una tienda nueva está vacío')
  ok('la barra marca la sección actual', await evaluar(`document.querySelector('.barra-inferior a[aria-current="page"]')?.textContent.trim() === 'Catálogo'`))
  await captura('m4-01-catalogo-vacio-celular.png')
  await evaluar(`__clic('Nueva venta')`)
  await esperar(`location.pathname === '/venta'`, 'botón central → Nueva venta')
  await esperar(`document.querySelector('h1')?.textContent === 'Nueva venta'`, 'Nueva venta carga su pantalla')
  ok('Nueva venta ya no está "en construcción"', !(await texto()).includes('Estamos construyendo esta sección'))
  await evaluar(`__clic('Ventas')`)
  await esperar(`location.pathname === '/ventas'`, 'Ventas desde el menú')
  await esperar(`document.body.innerText.includes('Hoy todavía no vendiste')`, 'una tienda nueva no vendió nada hoy')

  // 8. Escritorio
  await escritorio()
  await ir('/')
  await esperar(`document.querySelector('h1')?.textContent === 'Hola, Andrea'`, 'Inicio en escritorio')
  ok('menú lateral visible y barra inferior oculta', await evaluar(`getComputedStyle(document.querySelector('.menu-lateral')).display !== 'none' && getComputedStyle(document.querySelector('.barra-inferior')).display === 'none'`))
  await captura('m1-05-inicio-escritorio.png')

  // 8b. M3 · Mi tienda: datos, color, WhatsApp, logo y dirección
  await celular()
  await ir('/mi-tienda')
  const nombreInicial = `Ñandú Accesorios ${n}`
  await esperar(`__campo('Nombre de la tienda')?.value === '${nombreInicial}'`, 'Mi tienda carga los datos de la tienda')
  ok('el formulario arranca con Guardar desactivado (sin cambios)', await evaluar(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar cambios').disabled`))

  await evaluar(`__escribir('WhatsApp para pedidos', '12345')`)
  await esperar(`__campo('WhatsApp para pedidos').getAttribute('aria-invalid') === 'true'`, 'WhatsApp inválido se marca')
  ok('WhatsApp inválido: aviso y Guardar desactivado',
    (await texto()).includes('8 dígitos que empiecen con 6 o 7') && await evaluar(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar cambios').disabled`))

  await evaluar(`__escribir('Nombre de la tienda', 'Luna ${n}')`)
  await evaluar(`__escribir('Descripción corta', 'Accesorios hechos a mano · Cochabamba')`)
  await evaluar(`__escribir('WhatsApp para pedidos', '712 34567')`)
  await evaluar(`__clic('Terracota')`)
  await evaluar(`__subirPng('#2552A3')`)
  await esperar(`document.querySelector('.foto-redonda img')?.complete && document.querySelector('.foto-redonda img').naturalWidth > 0`, 'el logo se sube y se ve')
  const logoSubido = await evaluar(`document.querySelector('.foto-redonda img').getAttribute('src')`)
  ok('el logo se sirve desde /archivos/…/miniatura.webp', /^\/archivos\/[0-9a-f-]{36}\/imagenes\/[0-9a-f-]{36}\/miniatura\.webp$/.test(logoSubido))
  ok('Terracota queda marcado', await evaluar(`document.querySelector('[aria-label="Terracota"]').getAttribute('aria-pressed') === 'true'`))
  await captura('m3-01-mi-tienda-celular.png')

  await evaluar(`__clic('Guardar cambios')`)
  await esperar(`document.body.innerText.includes('Guardado. Ya está actualizado.')`, 'guardar muestra confirmación')
  ok('el menú ya muestra el nombre nuevo sin recargar', await evaluar(`document.querySelector('.menu-tienda-nombre').textContent === 'Luna ${n}'`))

  await recargar()
  await esperar(`__campo('Nombre de la tienda')?.value === 'Luna ${n}'`, 'tras recargar, el nombre guardado sigue')
  ok('persiste la descripción', (await evaluar(`__campo('Descripción corta').value`)) === 'Accesorios hechos a mano · Cochabamba')
  ok('persiste el WhatsApp (solo los 8 dígitos, el +591 va fijo)', (await evaluar(`__campo('WhatsApp para pedidos').value`)) === '71234567')
  ok('persiste el color Terracota', await evaluar(`document.querySelector('[aria-label="Terracota"]').getAttribute('aria-pressed') === 'true'`))
  await esperar(`document.querySelector('.foto-redonda img')?.complete && document.querySelector('.foto-redonda img').naturalWidth > 0`, 'el logo guardado se ve tras recargar')
  ok('persiste el logo (misma imagen)', (await evaluar(`document.querySelector('.foto-redonda img').getAttribute('src')`)) === logoSubido)

  // Cambiar de logo y descartar: la foto sin guardar se borra del servidor (no quedan huérfanas)
  await evaluar(`__subirPng('#B42318')`)
  await esperar(`document.querySelector('.foto-redonda img')?.getAttribute('src') !== '${logoSubido}'`, 'se sube un logo nuevo')
  const logoNuevo = await evaluar(`document.querySelector('.foto-redonda img').getAttribute('src')`)
  ok('el logo nuevo existe en el servidor mientras se edita', (await evaluar(`__estado('${logoNuevo}')`)) === 200)
  await evaluar(`__clic('Descartar')`)
  await esperar(`document.querySelector('.foto-redonda img')?.getAttribute('src') === '${logoSubido}'`, 'Descartar vuelve al logo guardado')
  await dormir(600)
  ok('al descartar, la foto sin guardar se borró del servidor', (await evaluar(`__estado('${logoNuevo}')`)) === 404)
  ok('y el logo guardado sigue intacto', (await evaluar(`__estado('${logoSubido}')`)) === 200)

  // Lo que está a medio editar no se pierde al cambiar la dirección
  await evaluar(`__escribir('Nombre de la tienda', 'Borrador sin guardar')`)
  await evaluar(`__clic('Cambiar dirección')`)
  await esperar(`!!document.querySelector('dialog[open]')`, 'se abre el diálogo de dirección')
  ok('el diálogo advierte que los enlaces compartidos dejan de funcionar', (await evaluar(`document.querySelector('dialog[open]').innerText`)).includes('van a dejar de funcionar'))
  await captura('m3-02-direccion-celular.png')
  await evaluar(`__escribir('Nueva dirección', 'admin')`)
  await evaluar(`document.querySelector('dialog[open] form button[type=submit]').click()`)
  await esperar(`!!document.querySelector('dialog[open] [role=alert]')`, 'dirección reservada muestra error')
  ok('dirección reservada: mensaje del servidor', (await evaluar(`document.querySelector('dialog[open] [role=alert]').textContent`)).includes('reservada'))
  // Una dirección que ya usa otra tienda (creada desde Node: sin cookies compartidas con el navegador)
  const otra = await fetch(`${BASE}/api/v1/auth/registro`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Otra', email: `otra${n}@ejemplo.com`, password, nombreTienda: 'Otra', slug: `ocupada-${n}` }) })
  ok('se creó otra tienda para probar la dirección ocupada', otra.ok)
  await evaluar(`__escribir('Nueva dirección', 'ocupada-${n}')`)
  await evaluar(`document.querySelector('dialog[open] form button[type=submit]').click()`)
  await esperar(`document.querySelector('dialog[open] [role=alert]')?.textContent.includes('ya está en uso')`, 'dirección ocupada muestra error')
  await evaluar(`__escribir('Nueva dirección', 'luna-${n}')`)
  await evaluar(`document.querySelector('dialog[open] form button[type=submit]').click()`)
  await esperar(`!document.querySelector('dialog[open]') && document.querySelector('.direccion')?.textContent === '/luna-${n}'`, 'la dirección nueva se guarda y el diálogo se cierra')
  ok('lo que estaba a medio editar sigue ahí', (await evaluar(`__campo('Nombre de la tienda').value`)) === 'Borrador sin guardar')
  await evaluar(`__clic('Descartar')`)
  await esperar(`__campo('Nombre de la tienda').value === 'Luna ${n}'`, 'Descartar restaura lo guardado')

  // Quitar el logo y guardar: la foto se borra
  await evaluar(`__clic('Quitar')`)
  await esperar(`!document.querySelector('.foto-redonda img')`, 'Quitar saca el logo')
  // "Luna 12345" → iniciales de las dos primeras palabras: "L1", sobre el color elegido (Terracota, texto blanco)
  ok('sin logo se muestran las iniciales sobre el color de la tienda',
    await evaluar(`(() => { const e = document.querySelector('.foto-redonda'); return e.textContent === 'L${String(n)[0]}' && getComputedStyle(e).backgroundColor === 'rgb(181, 83, 47)' && getComputedStyle(e).color === 'rgb(255, 255, 255)' })()`))
  await evaluar(`__clic('Guardar cambios')`)
  await esperar(`document.body.innerText.includes('Guardado. Ya está actualizado.')`, 'guardar sin logo')
  await dormir(400)
  ok('al guardar sin logo, la foto anterior se borró del servidor', (await evaluar(`__estado('${logoSubido.replace('/miniatura.webp', '/detalle.webp')}')`)) === 404)

  await escritorio()
  await ir('/mi-tienda')
  await esperar(`__campo('Nombre de la tienda')?.value === 'Luna ${n}'`, 'Mi tienda en escritorio')
  await captura('m3-03-mi-tienda-escritorio.png')

  // 8c. M4 · Catálogo: crear con fotos y variantes, listar, filtrar, editar, archivar, categorías, paginar
  await celular()
  await ir('/catalogo')
  await esperar(`document.body.innerText.includes('Todavía no cargaste productos')`, 'catálogo vacío')
  await evaluar(`__clic('Cargar mi primer producto')`)
  await esperar(`location.pathname === '/catalogo/nuevo' && !!__campo('Categoría')`, 'abre el formulario de producto nuevo')

  // Categoría nueva desde el mismo formulario
  await evaluar(`__elegir('Categoría', '__nueva')`)
  await esperar(`!!__campo('Nombre de la categoría')`, 'aparece el campo de categoría nueva')
  await evaluar(`__escribir('Nombre de la categoría', 'Carteras')`)
  await evaluar(`__clic('Crear categoría')`)
  await esperar(`__campo('Categoría').selectedOptions[0]?.textContent === 'Carteras'`, 'la categoría se crea y queda elegida')

  await evaluar(`__escribir('Nombre', 'Cartera de cuero Mía')`)
  await evaluar(`__escribir('Precio', '180')`)
  ok('sin costo, avisa que cargándolo te avisa si perdés plata', (await texto()).includes('te avisamos si un precio te hace perder'))
  await evaluar(`__escribir('Tu costo', '110')`)
  await esperar(`document.body.innerText.includes('Te quedan Bs 70 de ganancia por unidad.')`, 'muestra la ganancia en vivo')
  await evaluar(`__escribir('Colores (separados por coma)', 'café, Negro, café')`)
  await evaluar(`__escribir('Tallas (separadas por coma)', 'S, M')`)
  ok('4 variantes (2 colores sin repetir × 2 tallas)', (await texto()).includes('4 variantes (2 × 2)'))
  await evaluar(`__escribir('Descripción', 'Hecha a mano en Cochabamba.')`)

  ok('se suben dos fotos', (await evaluar(`__subirYEsperar('#B5532F')`)) && (await evaluar(`__subirYEsperar('#2552A3')`)))
  const fotoA = await evaluar(`document.querySelectorAll('.galeria-foto img')[0].getAttribute('src')`)
  const fotoB = await evaluar(`document.querySelectorAll('.galeria-foto img')[1].getAttribute('src')`)
  ok('la primera foto es la portada', await evaluar(`document.querySelector('.galeria-foto .galeria-portada') === document.querySelectorAll('.galeria-foto')[0].querySelector('.galeria-portada')`))
  await evaluar(`document.querySelector('[aria-label="Usar la foto 2 como portada"]').click()`)
  await esperar(`document.querySelectorAll('.galeria-foto img')[0].getAttribute('src') === '${fotoB}'`, 'la segunda foto pasa a ser portada')
  ok('el orden cambió (B primero, A segunda)', (await evaluar(`document.querySelectorAll('.galeria-foto img')[1].getAttribute('src')`)) === fotoA)

  // Una foto que se sube y se saca antes de guardar se borra del servidor
  await evaluar(`__subirYEsperar('#0B7A57')`)
  const fotoC = await evaluar(`document.querySelectorAll('.galeria-foto img')[2].getAttribute('src')`)
  ok('la tercera foto existe mientras se edita', (await evaluar(`__estado('${fotoC}')`)) === 200)
  await evaluar(`document.querySelector('[aria-label="Quitar la foto 3"]').click()`)
  await esperar(`__estado('${fotoC}').then(s => s === 404)`, 'la foto sacada se borra del servidor', 5000)
  ok('al sacarla sin guardar, se borró del servidor', (await evaluar(`__estado('${fotoC}')`)) === 404)
  await captura('m4-02-nuevo-producto-celular.png')

  await evaluar(`__clic('Guardar producto')`)
  await esperar(`document.body.innerText.includes('¡Guardado!')`, 'se guarda el producto y aparece la pantalla de éxito')
  await evaluar(`__clic('Ver mi catálogo')`)
  await esperar(`__tarjetas().includes('Cartera de cuero Mía')`, 'el producto aparece en el catálogo')
  ok('la tarjeta muestra el precio y cuánto ganás', await evaluar(`(() => { const t = document.querySelector('.tarjeta-producto').innerText; return t.includes('Bs 180') && t.includes('Ganás Bs 70') })()`))
  await esperar(`document.querySelector('.tarjeta-producto img')?.complete && document.querySelector('.tarjeta-producto img').naturalWidth > 0`, 'la portada se ve en la tarjeta')

  // Segundo producto: pierde plata
  await evaluar(`__clic('Producto')`)
  // Esperar el CAMPO, no solo la dirección: el formulario se arma después de cargar las categorías (era la carrera
  // intermitente "reading 'value'/'tagName'" de esta parte).
  await esperar(`location.pathname === '/catalogo/nuevo' && !!__campo('Nombre') && !!__campo('Tu costo')`, 'Producto → formulario nuevo')
  await evaluar(`__escribir('Nombre', 'Billetera Tunari')`)
  await evaluar(`__escribir('Precio', '60')`)
  await evaluar(`__escribir('Tu costo', '62')`)
  await esperar(`document.body.innerText.includes('Con este precio perdés Bs 2 por unidad.')`, 'avisa en vivo que perdés plata')
  await evaluar(`__clic('Guardar producto')`)
  await esperar(`document.body.innerText.includes('¡Guardado!')`, 'segundo producto guardado')
  await evaluar(`__clic('Ver mi catálogo')`)
  await esperar(`__tarjetas().length === 2`, 'dos productos en el catálogo')
  ok('la billetera dice "Perdés Bs 2"', await evaluar(`[...document.querySelectorAll('.tarjeta-producto')].find(a => a.innerText.includes('Billetera')).innerText.includes('Perdés Bs 2')`))
  await captura('m4-03-catalogo-celular.png')

  // Filtros y búsqueda (guardados en la dirección)
  await evaluar(`__clic('Revisar precio')`)
  await esperar(`__tarjetas().length === 1 && __tarjetas()[0] === 'Billetera Tunari'`, '"Revisar precio" trae solo la que pierde')
  ok('el filtro queda en la dirección', (await evaluar(`location.search`)).includes('filtro=revisar'))
  await evaluar(`__clic('Todos')`)
  await esperar(`__tarjetas().length === 2`, 'Todos vuelve a mostrar todo')
  await evaluar(`__clic('Carteras')`)
  await esperar(`__tarjetas().length === 1 && __tarjetas()[0] === 'Cartera de cuero Mía'`, 'filtro por categoría')
  await evaluar(`__clic('Todos')`)
  await evaluar(`__escribir('Buscar producto', 'BILLE')`)
  await esperar(`__tarjetas().length === 1 && __tarjetas()[0] === 'Billetera Tunari'`, 'buscar ignora mayúsculas')
  await evaluar(`__escribir('Buscar producto', 'xyz')`)
  await esperar(`document.body.innerText.includes('No encontramos productos con ese filtro.')`, 'búsqueda sin resultados')
  await evaluar(`__escribir('Buscar producto', '')`)
  await esperar(`__tarjetas().length === 2`, 'al borrar la búsqueda vuelve todo')

  // Editar: datos guardados, cambiar precio y sacar un color
  await evaluar(`[...document.querySelectorAll('.tarjeta-producto')].find(a => a.innerText.includes('Cartera')).click()`)
  await esperar(`/^\\/catalogo\\/[0-9a-f-]{36}$/.test(location.pathname) && __campo('Nombre')?.value === 'Cartera de cuero Mía'`, 'abre el producto para editar')
  const rutaProducto = await evaluar(`location.pathname`)
  await esperar(`__campo('Categoría')?.selectedOptions[0]?.textContent === 'Carteras'`, 'la categoría del producto llega (se pide aparte)')
  ok('el formulario trae lo guardado', await evaluar(`__campo('Precio').value === '180' && __campo('Tu costo').value === '110' && __campo('Colores (separados por coma)').value === 'café, Negro' && __campo('Tallas (separadas por coma)').value === 'S, M' && __campo('Descripción').value === 'Hecha a mano en Cochabamba.' && __campo('Categoría').selectedOptions[0].textContent === 'Carteras'`))
  ok('trae sus dos fotos en el orden guardado (B primera)', (await evaluar(`document.querySelectorAll('.galeria-foto img')[0].getAttribute('src')`)) === fotoB && (await evaluar(`document.querySelectorAll('.galeria-foto img').length`)) === 2)
  ok('Guardar está desactivado sin cambios', await evaluar(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar cambios').disabled`))
  await evaluar(`__escribir('Precio', '200')`)
  await evaluar(`__escribir('Colores (separados por coma)', 'café')`)
  await esperar(`document.body.innerText.includes('2 variantes (1 × 2)')`, 'el resumen de variantes se actualiza')
  await evaluar(`__clic('Guardar cambios')`)
  await esperar(`document.body.innerText.includes('Guardado. Ya está actualizado.')`, 'guardar cambios del producto')
  await recargar()
  await esperar(`__campo('Precio')?.value === '200' && !!__campo('Colores (separados por coma)')`, 'el cambio persiste tras recargar')
  ok('persisten los colores (el que se sacó ya no está)', (await evaluar(`__campo('Colores (separados por coma)').value`)) === 'café')
  await captura('m4-04-editar-producto-celular.png')

  // Archivar y desarchivar
  await evaluar(`__clic('Archivar este producto')`)
  await esperar(`!!document.querySelector('dialog[open]')`, 'pide confirmación para archivar')
  await evaluar(`[...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === 'Archivar').click()`)
  await esperar(`document.body.innerText.includes('Este producto está archivado')`, 'queda archivado')
  await ir('/catalogo')
  await esperar(`__tarjetas().length === 1 && __tarjetas()[0] === 'Billetera Tunari'`, 'el archivado no aparece en el catálogo')
  await evaluar(`__clic('Archivados')`)
  await esperar(`__tarjetas().length === 1 && __tarjetas()[0] === 'Cartera de cuero Mía'`, '"Archivados" lo muestra')
  await ir(rutaProducto)
  await esperar(`document.body.innerText.includes('Este producto está archivado')`, 'abre el archivado')
  await evaluar(`__clic('Desarchivar')`)
  await esperar(`!document.body.innerText.includes('Este producto está archivado')`, 'se desarchiva')

  // Categorías: agregar, renombrar y ocultar
  await ir('/catalogo')
  await esperar(`__tarjetas().length === 2`, 'catálogo de nuevo completo')
  await evaluar(`__clic('Categorías')`)
  await esperar(`!!document.querySelector('dialog[open] .categorias-lista li')`, 'el diálogo de categorías muestra la lista')
  await evaluar(`__escribir('Nueva categoría', 'Joyería')`)
  await evaluar(`[...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === 'Agregar').click()`)
  await esperar(`document.querySelectorAll('dialog[open] .categorias-lista li').length === 2`, 'se agrega Joyería')
  await evaluar(`[...document.querySelectorAll('dialog[open] .categorias-lista li')].find(li => li.innerText.includes('Carteras')).querySelector('button').click()`)
  await evaluar(`(() => { const i = document.querySelector('dialog[open] .categoria-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Carteras y bolsos'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await evaluar(`[...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === 'Guardar').click()`)
  await esperar(`document.querySelector('dialog[open]').innerText.includes('Carteras y bolsos')`, 'se renombra la categoría')
  await evaluar(`[...document.querySelectorAll('dialog[open] .categorias-lista li')].find(li => li.innerText.includes('Joyería')).querySelectorAll('button')[1].click()`)
  await esperar(`document.querySelector('dialog[open]').innerText.includes('Joyería · oculta')`, 'se oculta Joyería')
  await captura('m4-05-categorias-celular.png')
  await evaluar(`[...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === 'Listo').click()`)
  await esperar(`!document.querySelector('dialog[open]')`, 'se cierra el diálogo')
  ok('los filtros reflejan el cambio (renombrada sí, oculta no)', await evaluar(`(() => { const t = [...document.querySelectorAll('.chip')].map(c => c.textContent); return t.includes('Carteras y bolsos') && !t.includes('Joyería') })()`))

  // Paginación real: 26 productos más desde la propia sesión (28 en total, 24 por página)
  const creados = await evaluar(`(async () => { const m = await import('/src/api/cliente.ts'); let n = 0; for (let i = 1; i <= 26; i++) { const r = await m.api.POST('/api/v1/productos', { body: { nombre: 'Masivo ' + i, descripcion: null, precio: 10 + i, costo: 0, categoriaId: null, visibleEnTienda: true, colores: [], tallas: [], fotoIds: [] } }); if (r.data) n++ } return n })()`)
  ok('se crearon 26 productos más (' + creados + ')', creados === 26)
  await ir('/catalogo')
  await esperar(`__tarjetas().length === 24`, 'la primera página trae 24')
  ok('aparece "Ver más productos"', await evaluar(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Ver más productos')`))
  await evaluar(`__clic('Ver más productos')`)
  await esperar(`__tarjetas().length === 28`, 'la segunda página completa los 28')
  ok('sin repetidos', await evaluar(`new Set(__tarjetas()).size === 28`))
  ok('ya no hay más páginas', await evaluar(`![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Ver más productos')`))

  // Una foto subida en un producto nuevo que se abandona sin guardar se borra
  await ir('/catalogo/nuevo')
  await esperar(`!!document.querySelector('input[type=file]')`, 'formulario nuevo')
  await evaluar(`__subirYEsperar('#7C5CFC')`)
  const fotoAbandonada = (await evaluar(`document.querySelector('.galeria-foto img').getAttribute('src')`)).replace('miniatura', 'detalle')
  ok('la foto está subida mientras no se guarda', (await evaluar(`__estado('${fotoAbandonada}')`)) === 200)
  await evaluar(`__clic('Volver al catálogo')`)
  await esperar(`location.pathname === '/catalogo'`, 'vuelve al catálogo sin guardar')
  await dormir(700)
  ok('al salir sin guardar, la foto se borró del servidor', (await evaluar(`__estado('${fotoAbandonada}')`)) === 404)

  // Escritorio
  await escritorio()
  await ir('/catalogo')
  await esperar(`__tarjetas().length === 24`, 'catálogo en escritorio')
  await captura('m4-06-catalogo-escritorio.png')
  await evaluar(`[...document.querySelectorAll('.tarjeta-producto')].find(a => a.innerText.includes('Billetera')) ? 0 : __clic('Ver más productos')`)
  await ir(rutaProducto)
  await esperar(`__campo('Nombre')?.value === 'Cartera de cuero Mía'`, 'editar en escritorio')
  await captura('m4-07-editar-producto-escritorio.png')

  // 8d. M5 · Stock: llegaron más, corregir, historial, por encargo, orden por urgencia y paginación
  await celular()
  await ir('/catalogo/nuevo')
  await esperar(`!!__campo('Nombre')`, 'formulario de producto para el stock')
  await evaluar(`__escribir('Nombre', 'Collar Salar turquesa')`)
  await evaluar(`__escribir('Precio', '120')`)
  await evaluar(`__escribir('Tu costo', '58')`)
  await evaluar(`__escribir('Colores (separados por coma)', 'azul, verde')`)
  ok('el control de stock viene encendido por defecto', await evaluar(`(() => { const s = [...document.querySelectorAll('[role=switch]')].find(b => b.innerText.includes('Llevar control de stock')); return s.getAttribute('aria-checked') === 'true' && !!__campo('Avisarme cuando queden') && __campo('Avisarme cuando queden').value === '3' })()`))
  await evaluar(`__clic('Guardar producto')`)
  await esperar(`document.body.innerText.includes('¡Guardado!')`, 'collar guardado')
  ok('la pantalla de éxito ofrece cargar cuántas tenés', await evaluar(`!![...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Cargar cuántas tenés')`))
  await evaluar(`__clic('Cargar cuántas tenés')`)
  await esperar(`location.pathname === '/stock' && !!document.querySelector('dialog[open]')`, 'abre Stock con "Llegaron más" ya abierto')
  ok('el diálogo pregunta cuántas llegaron del collar', await evaluar(`(() => { const d = document.querySelector('dialog[open]'); return d.innerText.includes('¿Cuántas llegaron?') && d.innerText.includes('Collar Salar turquesa') && d.innerText.includes('azul') && d.innerText.includes('verde') })()`))
  ok('el parámetro ?llegaron se limpió de la dirección', !(await evaluar(`location.search`)).includes('llegaron'))
  ok('"Sumar" está desactivado mientras no haya cantidades', await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Sumar').disabled`))
  await captura('m5-02-llegaron-mas-celular.png')
  await evaluar(`__poner(document.querySelector('dialog[open] [aria-label="Cantidad que llegó de azul"]'), '4')`)
  // Dos toques en "+" separados (como una persona): dos clics dentro de la misma tarea no dejan que React redibuje entre uno y otro.
  await evaluar(`document.querySelectorAll('dialog[open] .llegaron-fila')[1].querySelector('[aria-label="Uno más"]').click()`)
  await dormir(150)
  await evaluar(`document.querySelectorAll('dialog[open] .llegaron-fila')[1].querySelector('[aria-label="Uno más"]').click()`)
  await esperar(`__botonEn(document.querySelector('dialog[open]'), 'Sumar').textContent.trim() === 'Sumar 6'`, 'el botón suma 4 + 2 = 6')
  ok('el costo viene con el del producto', (await evaluar(`__campo('Costo por unidad (opcional)').value`)) === '58')
  await evaluar(`__escribir('Costo por unidad (opcional)', '55,5')`)
  await evaluar(`__escribir('Costo por unidad (opcional)', '55,555')`)
  await esperar(`document.querySelector('dialog[open]').innerText.includes('hasta 2 decimales') && __botonEn(document.querySelector('dialog[open]'), 'Sumar').disabled`, 'un costo con 3 decimales bloquea el botón')
  await evaluar(`__escribir('Costo por unidad (opcional)', '55,5')`)
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Sumar').click()`)
  await esperar(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Sumaste 6 a Collar Salar turquesa.')`, 'sumar cierra el diálogo y avisa')
  await evaluar(`__escribir('Buscar producto', 'collar')`)
  await esperar(`__filas().length === 1 && __filas()[0] === 'Collar Salar turquesa'`, 'buscar el collar en Stock')
  ok('el collar quedó con 6 y "Bien"', await evaluar(`(() => { const f = __fila('Collar Salar turquesa'); return f.querySelector('.fila-stock-total').textContent === '6' && f.innerText.includes('Bien') })()`))
  await evaluar(`__fila('Collar Salar turquesa').querySelector('.fila-stock-cabecera').click()`)
  await esperar(`__fila('Collar Salar turquesa').innerText.includes('Llegaron 4 (azul)')`, 'el historial muestra lo que llegó')
  ok('el detalle muestra las variantes y las dos llegadas', await evaluar(`(() => { const t = __fila('Collar Salar turquesa').innerText; return t.includes('azul') && t.includes('Llegaron 2 (verde)') && t.includes('Hoy') })()`))
  await captura('m5-01-stock-celular.png')

  // Resumen y catálogo reflejan lo cargado
  ok('el resumen valora la mercadería (6 × 55,50 = 333; 6 × 120 = 720)', await evaluar(`(() => { const t = document.querySelector('.resumen-stock').innerText; return t.includes('Bs 333') && t.includes('Bs 720') })()`))
  await ir('/catalogo?q=collar')
  await esperar(`__tarjetas().length === 1`, 'collar en el catálogo')
  ok('la tarjeta dice "Quedan 6" y el margen con el costo nuevo (Bs 64,50)', await evaluar(`(() => { const t = document.querySelector('.tarjeta-producto').innerText; return t.includes('Quedan 6') && t.includes('Ganás Bs 64,50') })()`))

  // Corregir lo que se contó
  await ir('/stock?q=collar')
  await esperar(`__filas().length === 1`, 'de vuelta en Stock')
  await evaluar(`__fila('Collar Salar turquesa').querySelector('.fila-stock-cabecera').click()`)
  await evaluar(`__botonEn(__fila('Collar Salar turquesa'), 'Corregir').click()`)
  await esperar(`!!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').innerText.includes('Corregir el stock')`, 'abre Corregir')
  ok('trae lo que hay ahora (azul 4, verde 2) y Guardar está desactivado sin cambios', await evaluar(`(() => { const d = document.querySelector('dialog[open]'); return d.querySelector('[aria-label="Cuántas hay de azul"]').value === '4' && d.querySelector('[aria-label="Cuántas hay de verde"]').value === '2' && __botonEn(d, 'Guardar').disabled })()`))
  await evaluar(`__poner(document.querySelector('dialog[open] [aria-label="Cuántas hay de azul"]'), '1')`)
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Dañado').click()`)
  ok('el motivo "Dañado" queda en el campo', (await evaluar(`__campo('O escribí otro').value`)) === 'Dañado')
  await captura('m5-03-corregir-celular.png')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar').click()`)
  await esperar(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Corregiste el stock de Collar Salar turquesa.')`, 'corregir guarda y avisa')
  ok('quedó en 3 y "Por agotarse" (3 ≤ mínimo 3)', await evaluar(`(() => { const f = __fila('Collar Salar turquesa'); return f.querySelector('.fila-stock-total').textContent === '3' && f.innerText.includes('Por agotarse') })()`))
  await esperar(`__fila('Collar Salar turquesa').innerText.includes('Corregiste a 1 (azul) · Dañado')`, 'el historial muestra la corrección con su motivo')

  // Sacar una variante con stock se rechaza con un mensaje claro
  await ir('/catalogo?q=collar')
  await esperar(`__tarjetas().length === 1`, 'collar para editar')
  await evaluar(`document.querySelector('.tarjeta-producto').click()`)
  await esperar(`__campo('Colores (separados por coma)')?.value === 'azul, verde'`, 'editar el collar')
  await evaluar(`__escribir('Colores (separados por coma)', 'azul')`)
  await evaluar(`__clic('Guardar cambios')`)
  await esperar(`document.querySelector('[role=alert]')?.textContent.includes('Todavía quedan 2 de verde')`, 'rechaza sacar el verde con 2 en stock')
  ok('y el formulario no pierde lo escrito', (await evaluar(`__campo('Colores (separados por coma)').value`)) === 'azul')

  // Por encargo: sin control de stock
  await ir('/catalogo/nuevo')
  await esperar(`!!__campo('Nombre')`, 'formulario para el producto por encargo')
  await evaluar(`__escribir('Nombre', 'Bolso por encargo')`)
  await evaluar(`__escribir('Precio', '220')`)
  await evaluar(`[...document.querySelectorAll('[role=switch]')].find(b => b.innerText.includes('Llevar control de stock')).click()`)
  await esperar(`!__campo('Avisarme cuando queden') && document.body.innerText.includes('Por encargo: no se cuentan unidades')`, 'apagar el control oculta el mínimo y explica')
  await evaluar(`__clic('Guardar producto')`)
  await esperar(`document.body.innerText.includes('¡Guardado!')`, 'bolso guardado')
  ok('sin control no se ofrece cargar cuántas tenés', await evaluar(`![...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Cargar cuántas tenés')`))
  await ir('/stock?vista=encargo')
  await esperar(`__filas().includes('Bolso por encargo')`, 'el bolso aparece en "Por encargo"')
  ok('muestra "—" y "No lleva stock", sin cantidad', await evaluar(`(() => { const f = __fila('Bolso por encargo'); return f.querySelector('.fila-stock-total').textContent === '—' && f.innerText.includes('Por encargo') && f.innerText.includes('No lleva stock') })()`))
  await evaluar(`__fila('Bolso por encargo').querySelector('.fila-stock-cabecera').click()`)
  ok('al abrirlo explica que no cuenta unidades y no ofrece "Llegaron más"', await evaluar(`(() => { const f = __fila('Bolso por encargo'); return f.innerText.includes('no cuenta unidades') && !__botonEn(f, 'Llegaron más') })()`))
  await ir('/catalogo?q=bolso')
  await esperar(`__tarjetas().length === 1`, 'bolso en el catálogo')
  ok('en el catálogo no tiene etiqueta de stock', await evaluar(`!document.querySelector('.tarjeta-producto .producto-stock')`))

  // "A reponer" y el orden por urgencia con paginación real (30 productos: 28 agotados, 1 por agotarse, 1 por encargo)
  await ir('/stock?vista=areponer&q=collar')
  await esperar(`__filas().length === 1 && __filas()[0] === 'Collar Salar turquesa'`, '"A reponer" trae el collar (por agotarse)')
  await ir('/stock')
  await esperar(`__filas().length === 24`, 'primera página de Stock: 24')
  ok('la primera página son todos agotados (lo más urgente primero)', await evaluar(`[...document.querySelectorAll('.fila-stock')].every(li => li.innerText.includes('Agotado'))`))
  await evaluar(`__clic('Ver más productos')`)
  await esperar(`__filas().length === 30`, 'segunda página completa los 30')
  ok('sin repetidos', await evaluar(`new Set(__filas()).size === 30`))
  ok('el orden sigue entre páginas: ... agotados, collar (por agotarse), bolso (por encargo)', await evaluar(`__filas().at(-2) === 'Collar Salar turquesa' && __filas().at(-1) === 'Bolso por encargo'`))
  await escritorio()
  await ir('/stock')
  await esperar(`__filas().length === 24`, 'Stock en escritorio')
  await captura('m5-04-stock-escritorio.png')

  // 8e. M6 · Ventas: venta rápida, tope por stock, ganancia, anular, historial e idempotencia
  await celular()
  await ir('/venta')
  await esperar(`document.querySelectorAll('.fila-vender').length === 20`, 'Nueva venta lista 20 productos')
  const primeros = await evaluar(`[...document.querySelectorAll('.fila-vender')].slice(0, 3).map(li => li.querySelector('.fila-stock-nombre').textContent).join(' | ')`)
  // Dentro de lo vendible, lo último que cargaste va primero (como el catálogo).
  ok(`primero lo vendible (bolso y collar) y después los agotados (${primeros})`, primeros.startsWith('Bolso por encargo | Collar Salar turquesa | '))
  ok('los agotados no tienen contador', await evaluar(`(() => { const a = [...document.querySelectorAll('.fila-vender-agotada')]; return a.length === 18 && a.every(li => !li.querySelector('.contador') && li.innerText.includes('Agotado')) })()`))
  ok('el collar muestra sus variantes con lo que queda', await evaluar(`(() => { const t = __vender('Collar Salar turquesa').innerText; return t.includes('azul') && t.includes('Quedan 1') && t.includes('verde') && t.includes('Quedan 2') })()`))
  ok('el botón de registrar está desactivado sin productos', await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Registrar venta').disabled`))
  await captura('m6-01-nueva-venta-celular.png')

  await evaluar(`__poner(document.querySelector('[aria-label="Cantidad de Collar Salar turquesa (azul)"]'), '1')`)
  await evaluar(`__poner(document.querySelector('[aria-label="Cantidad de Collar Salar turquesa (verde)"]'), '5')`)
  await esperar(`document.querySelector('.pie-venta-monto').textContent === 'Bs 360'`, 'el total suma 3 collares')
  ok('no deja vender más de lo que queda (5 → 2)', (await evaluar(`document.querySelector('[aria-label="Cantidad de Collar Salar turquesa (verde)"]').value`)) === '2')
  ok('muestra cuánto se gana (3 × 64,50)', (await evaluar(`document.querySelector('.pie-venta').innerText`)).includes('Ganás Bs 193,50'))
  await evaluar(`__vender('Bolso por encargo').querySelector('[aria-label="Uno más"]').click()`)
  await esperar(`document.querySelector('.pie-venta-monto').textContent === 'Bs 580'`, 'con el bolso el total es 580')
  ok('con un producto sin costo no se inventa la ganancia', !(await evaluar(`document.querySelector('.pie-venta').innerText`)).includes('Ganás'))
  await evaluar(`__poner(document.querySelector('[aria-label="Cantidad de Bolso por encargo"]'), '0')`)
  await esperar(`document.querySelector('.pie-venta-monto').textContent === 'Bs 360' && document.querySelector('.pie-venta').innerText.includes('Ganás Bs 193,50')`, 'sacar el bolso vuelve a mostrar la ganancia')

  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'QR').click()`)
  ok('el chip QR queda marcado', await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'QR').getAttribute('aria-pressed') === 'true' && __botonEn(document.querySelector('.pie-venta'), 'Efectivo').getAttribute('aria-pressed') === 'false'`))
  ok('el cliente no estorba: arranca escondido tras "Agregar cliente"', await evaluar(`!__campo('Cliente (opcional)') && !!__botonEn(document.querySelector('.pie-venta'), '+ Agregar cliente')`))
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), '+ Agregar cliente').click()`)
  await esperar(`!!__campo('Cliente (opcional)')`, 'aparece el campo de cliente')
  await evaluar(`__escribir('Cliente (opcional)', 'Doña Rosa')`)
  await captura('m6-02-venta-armada-celular.png')
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Registrar venta').click()`)
  await esperar(`document.body.innerText.includes('¡Venta registrada!')`, 'la venta se registra')
  ok('la pantalla de éxito resume la venta', await evaluar(`(() => { const t = document.querySelector('.venta-lista').innerText; return t.includes('Bs 360') && t.includes('3 unidades') && t.includes('QR') && t.includes('Doña Rosa') && t.includes('Ganaste Bs 193,50') })()`))
  ok('ofrece registrar otra, ver las ventas y volver al inicio', await evaluar(`(() => { const t = document.querySelector('.venta-lista').innerText; return t.includes('Registrar otra venta') && t.includes('Ver mis ventas') && t.includes('Volver al inicio') })()`))
  ok('recuerda el último método de pago', (await evaluar(`localStorage.getItem('venta.pago')`)) === 'Qr')
  await captura('m6-03-venta-registrada-celular.png')

  await evaluar(`__clic('Registrar otra venta')`)
  // La lista vieja se ve hasta que llega la nueva: se espera a que el collar figure agotado.
  await esperar(`document.querySelector('h1')?.textContent === 'Nueva venta' && !!__vender('Collar Salar turquesa')?.innerText.includes('Agotado')`, 'otra venta vuelve a la lista con el stock al día')
  const primero = await evaluar(`document.querySelector('.fila-vender .fila-stock-nombre').textContent`)
  ok(`el bolso quedó primero (${primero})`, primero === 'Bolso por encargo')
  ok('y el collar quedó agotado, sin contador', await evaluar(`__vender('Collar Salar turquesa').innerText.includes('Agotado') && !__vender('Collar Salar turquesa').querySelector('.contador')`))
  ok('arranca vacía: sin cliente ni total', await evaluar(`document.querySelector('.pie-venta-monto').textContent === 'Bs 0' && !__campo('Cliente (opcional)')`))

  // Segunda venta: bolso × 2 en efectivo, sin cliente
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Efectivo').click()`)
  await evaluar(`__poner(document.querySelector('[aria-label="Cantidad de Bolso por encargo"]'), '2')`)
  await esperar(`document.querySelector('.pie-venta-monto').textContent === 'Bs 440'`, 'dos bolsos: 440')
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Registrar venta').click()`)
  await esperar(`document.body.innerText.includes('¡Venta registrada!')`, 'segunda venta registrada')
  ok('sin costo no dice cuánto ganaste', !(await evaluar(`document.querySelector('.venta-lista').innerText`)).includes('Ganaste'))
  await evaluar(`__clic('Ver mis ventas')`)
  await esperar(`location.pathname === '/ventas' && __ventas().length === 2`, 'Ventas lista las dos')

  // Historial del día
  const resumenVentas = await evaluar(`document.querySelector('.resumen-stock').innerText`)
  ok('el resumen suma Bs 800, 2 ventas y 5 unidades', resumenVentas.includes('Bs 800') && resumenVentas.includes('2 ventas') && resumenVentas.includes('5 unidades'))
  ok('la ganancia solo cuenta lo que tiene costo y avisa lo que falta', resumenVentas.includes('Ganaste Bs 193,50') && resumenVentas.includes('2 unidades sin costo cargado'))
  ok('la más nueva va primero, con su método de pago', await evaluar(`__ventas()[0].innerText.includes('Bolso por encargo') && __ventas()[0].innerText.includes('Efectivo') && __ventas()[1].innerText.includes('QR') && __ventas()[1].innerText.includes('Doña Rosa')`))
  await captura('m6-04-ventas-celular.png')
  await evaluar(`__ventas()[1].querySelector('.fila-stock-cabecera').click()`)
  await esperar(`__ventas()[1].innerText.includes('Anular venta')`, 'se abre el detalle de la venta del collar')
  ok('el detalle lista las líneas con su variante y la ganancia', await evaluar(`(() => { const t = __ventas()[1].innerText; return t.includes('1 × Collar Salar turquesa (azul)') && t.includes('2 × Collar Salar turquesa (verde)') && t.includes('Ganaste Bs 193,50') })()`))

  // Anular: confirmar, arrepentirse y anular de verdad
  await evaluar(`__botonEn(__ventas()[1], 'Anular venta').click()`)
  await esperar(`!!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').innerText.includes('¿Anular esta venta?')`, 'pide confirmar la anulación')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'No, dejarla').click()`)
  await esperar(`!document.querySelector('dialog[open]')`, 'arrepentirse cierra el diálogo')
  ok('al arrepentirse la venta sigue vigente', await evaluar(`__ventas().length === 2 && !__ventas()[1].classList.contains('fila-venta-anulada')`))
  await dormir(400)
  await evaluar(`__botonEn(__ventas()[1], 'Anular venta').click()`)
  await esperar(`!!document.querySelector('dialog[open]')`, 'se vuelve a pedir confirmar')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Sí, anular').click()`)
  await esperar(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Venta anulada.')`, 'la venta se anula y avisa')
  await esperar(`__ventas().length === 1 && document.querySelector('.resumen-stock').innerText.includes('Bs 440')`, 'la anulada sale de la lista y del resumen')
  ok('el resumen ya no cuenta la anulada', await evaluar(`document.querySelector('.resumen-stock').innerText.includes('1 venta') && !document.querySelector('.resumen-stock').innerText.includes('Ganaste Bs 193')`))
  await evaluar(`__botonEn(document.querySelector('.chips'), 'Mostrar anuladas').click()`)
  await esperar(`__ventas().length === 2`, '"Mostrar anuladas" trae la anulada')
  ok('la anulada se ve marcada', await evaluar(`__ventas()[1].classList.contains('fila-venta-anulada') && __ventas()[1].innerText.includes('Anulada') && location.search.includes('anuladas=1')`))
  await evaluar(`__clic('Semana')`)
  await esperar(`location.search.includes('periodo=semana')`, 'el período vive en la dirección')
  await esperar(`__ventas().length === 2`, 'la semana incluye las ventas de hoy')

  // El stock volvió al anular
  await ir('/stock?q=collar')
  await esperar(`__filas().length === 1`, 'collar en Stock tras anular')
  ok('el collar volvió a 3 ("Por agotarse")', await evaluar(`(() => { const f = __fila('Collar Salar turquesa'); return f.querySelector('.fila-stock-total').textContent === '3' && f.innerText.includes('Por agotarse') })()`))
  await evaluar(`__fila('Collar Salar turquesa').querySelector('.fila-stock-cabecera').click()`)
  await esperar(`__fila('Collar Salar turquesa').innerText.includes('Devolvieron')`, 'el historial del collar muestra la devolución')
  ok('y el historial muestra la venta y la devolución', await evaluar(`(() => { const t = __fila('Collar Salar turquesa').innerText; return t.includes('Vendiste') && t.includes('Devolvieron') })()`))

  // Por la API: el reintento con la misma clave no duplica y sin stock suficiente se rechaza con un mensaje claro
  const reintento = await evaluar(`(async () => {
    const m = await import('/src/api/cliente.ts');
    const bolso = (await m.api.GET('/api/v1/ventas/productos', { params: { query: { Buscar: 'bolso' } } })).data.items[0];
    const body = { claveIdempotencia: crypto.randomUUID(), lineas: [{ varianteId: bolso.variantes[0].id, cantidad: 1 }], metodoPago: 'Efectivo' };
    const a = await m.api.POST('/api/v1/ventas', { body });
    const b = await m.api.POST('/api/v1/ventas', { body });
    return [a.response.status, b.response.status, a.data.id === b.data.id];
  })()`)
  ok(`reintentar la misma venta devuelve la misma (${reintento})`, reintento.join() === '201,200,true')
  const sinStock = await evaluar(`(async () => {
    const m = await import('/src/api/cliente.ts');
    const collar = (await m.api.GET('/api/v1/ventas/productos', { params: { query: { Buscar: 'collar' } } })).data.items[0];
    const verde = collar.variantes.find(v => v.color === 'verde');
    const r = await m.api.POST('/api/v1/ventas', { body: { claveIdempotencia: crypto.randomUUID(), lineas: [{ varianteId: verde.id, cantidad: 9 }], metodoPago: 'Efectivo' } });
    return [r.response.status, r.error?.detail ?? ''];
  })()`)
  ok(`vender más de lo que hay responde 409 con el motivo (${sinStock[1]})`, sinStock[0] === 409 && sinStock[1].includes('se necesitan 9'))

  await escritorio()
  await ir('/ventas')
  await esperar(`__ventas().length >= 1`, 'Ventas en escritorio')
  await captura('m6-05-ventas-escritorio.png')
  await ir('/venta')
  await esperar(`document.querySelectorAll('.fila-vender').length === 20`, 'Nueva venta en escritorio')
  await captura('m6-06-nueva-venta-escritorio.png')

  // 8f. M7 · Proveedores y compras: cargar proveedores, comprar, recibir, pagar, anular y comparar precios
  await celular()
  await ir('/proveedores')
  await esperar(`document.body.innerText.includes('Todavía no cargaste proveedores')`, 'una tienda sin proveedores lo explica')
  ok('las pestañas Stock / Compras / Proveedores están a mano', await evaluar(`[...document.querySelectorAll('.pestanas a')].map(a => a.textContent).join() === 'Stock,Compras,Proveedores'`))
  await captura('m7-01-proveedores-vacio-celular.png')
  await evaluar(`__clic('Agregar un proveedor')`)
  await esperar(`!!document.querySelector('dialog[open]') && !!__campo('Nombre')`, 'se abre el formulario de proveedor')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar').click()`)
  await esperar(`document.querySelector('dialog[open] [role=alert]')?.textContent.includes('Escribí el nombre')`, 'sin nombre no guarda')
  await evaluar(`__escribir('Nombre', 'Cueros Don Beto')`)
  await evaluar(`__escribir('WhatsApp (opcional)', '12345')`)
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar').click()`)
  await esperar(`document.querySelector('dialog[open] [role=alert]')?.textContent.includes('8 dígitos')`, 'un WhatsApp inválido muestra el mensaje del servidor')
  await evaluar(`__escribir('WhatsApp (opcional)', '712 34567')`)
  await evaluar(`__escribir('Notas (opcional)', 'Entrega los viernes')`)
  await captura('m7-02-nuevo-proveedor-celular.png')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar').click()`)
  await esperar(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Agregaste a Cueros Don Beto.')`, 'el proveedor se guarda y avisa')
  await evaluar(`__clic('Nuevo proveedor')`)
  await esperar(`!!document.querySelector('dialog[open]') && !!__campo('Nombre')`, 'segundo proveedor')
  await evaluar(`__escribir('Nombre', 'cueros don beto')`)
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar').click()`)
  await esperar(`document.querySelector('dialog[open] [role=alert]')?.textContent.includes('Ya tenés un proveedor llamado')`, 'el mismo nombre se rechaza aunque cambien las mayúsculas')
  await evaluar(`__escribir('Nombre', 'Hilos Rosa')`)
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar').click()`)
  await esperar(`!document.querySelector('dialog[open]') && __ventas().length === 2`, 'hay dos proveedores')
  ok('la lista va por nombre y dice que todavía no les compraste', await evaluar(`__ventas()[0].innerText.includes('Cueros Don Beto') && __ventas()[1].innerText.includes('Hilos Rosa') && __ventas()[0].innerText.includes('Todavía no le compraste')`))
  await evaluar(`__ventas()[0].querySelector('.fila-stock-cabecera').click()`)
  await esperar(`__ventas()[0].innerText.includes('Todavía no hay compras con este proveedor')`, 'el detalle del proveedor')
  ok('«Pedirle por WhatsApp» abre el chat con el número del proveedor', await evaluar(`(() => { const a = [...__ventas()[0].querySelectorAll('a')].find(x => x.textContent.trim() === 'Pedirle por WhatsApp'); return !!a && a.href.startsWith('https://wa.me/59171234567?text=') && a.target === '_blank' && a.rel.includes('noopener') })()`))
  await captura('m7-03-proveedores-celular.png')

  // Nueva compra desde el proveedor: llega con él elegido
  await evaluar(`[...__ventas()[0].querySelectorAll('a')].find(x => x.textContent.trim() === 'Nueva compra').click()`)
  await esperar(`location.pathname === '/compras/nueva' && document.querySelectorAll('.fila-vender').length > 0`, 'Nueva compra con productos')
  ok('el proveedor viene elegido desde la ficha', await evaluar(`document.querySelector('#proveedor').selectedOptions[0].textContent === 'Cueros Don Beto'`))
  ok('registrar está desactivado sin productos', await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Registrar compra').disabled`))
  await evaluar(`__escribir('Buscar producto', 'collar')`)
  await esperar(`document.querySelectorAll('.fila-vender').length === 1 && !!__vender('Collar Salar turquesa')`, 'buscar el collar para comprarlo')
  ok('muestra el costo de hoy y cuánto tenés', await evaluar(`(() => { const t = __vender('Collar Salar turquesa').innerText; return t.includes('Tu costo hoy: Bs 55,50') && t.includes('Tenés 3') })()`))
  await evaluar(`__poner(document.querySelector('[aria-label="Cantidad de Collar Salar turquesa (azul)"]'), '4')`)
  await esperar(`!!__campo('Costo por unidad de Collar Salar turquesa')`, 'aparece el costo del collar')
  ok('el costo viene con el actual y el total lo usa (4 × 55,50 = 222)', (await evaluar(`__campo('Costo por unidad de Collar Salar turquesa').value`)) === '55.5' && (await evaluar(`document.querySelector('.pie-venta-monto').textContent`)) === 'Bs 222')
  await evaluar(`__escribir('Costo por unidad de Collar Salar turquesa', '70,555')`)
  await esperar(`document.querySelector('.pie-venta').innerText.includes('Escribí el costo de Collar Salar turquesa')`, 'un costo con 3 decimales se marca')
  ok('con costo inválido no deja registrar', await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Registrar compra').disabled`))
  await evaluar(`__escribir('Costo por unidad de Collar Salar turquesa', '70')`)
  await esperar(`document.querySelector('.pie-venta-monto').textContent === 'Bs 280'`, '4 × 70 = 280')
  await captura('m7-04-nueva-compra-celular.png')
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Registrar compra').click()`)
  await esperar(`document.body.innerText.includes('¡Compra registrada!')`, 'la compra se registra')
  ok('queda en camino y por pagar, con el total', await evaluar(`(() => { const t = document.querySelector('.venta-lista').innerText; return t.includes('Bs 280') && t.includes('Cueros Don Beto') && t.includes('En camino') && t.includes('Por pagar') && t.includes('4 unidades') })()`))
  ok('ofrece pedirle por WhatsApp con lo que se pide', await evaluar(`(() => { const a = [...document.querySelectorAll('.venta-lista a')].find(x => x.textContent.trim() === 'Pedirle por WhatsApp'); return !!a && decodeURIComponent(a.href).includes('4 Collar Salar turquesa (azul)') })()`))
  await captura('m7-05-compra-registrada-celular.png')

  // Segunda compra: ya llegó y ya se pagó, con un costo que deja el producto en pérdida (el aviso de margen)
  await evaluar(`__clic('Registrar otra compra')`)
  await esperar(`document.querySelector('h1')?.textContent === 'Nueva compra' && !!document.querySelector('#proveedor')`, 'otra compra')
  await evaluar(`(() => { const s = document.querySelector('#proveedor'); const o = [...s.options].find(x => x.textContent === 'Cueros Don Beto'); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await evaluar(`__escribir('Buscar producto', 'bolso')`)
  await esperar(`document.querySelectorAll('.fila-vender').length === 1 && !!__vender('Bolso por encargo')`, 'buscar el bolso')
  await evaluar(`__vender('Bolso por encargo').querySelector('[aria-label="Uno más"]').click()`)
  await esperar(`!!__campo('Costo por unidad de Bolso por encargo')`, 'costo del bolso')
  ok('sin costo cargado el campo arranca vacío y no deja registrar', await evaluar(`__campo('Costo por unidad de Bolso por encargo').value === '' && __botonEn(document.querySelector('.pie-venta'), 'Registrar compra').disabled`))
  await evaluar(`__escribir('Costo por unidad de Bolso por encargo', '250')`)
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Ya llegó').click()`)
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Ya la pagué').click()`)
  await esperar(`document.querySelector('.pie-venta').innerText.includes('sumamos el stock y actualizamos tu costo')`, 'explica qué pasa al marcar «Ya llegó»')
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), '+ Agregar una nota').click()`)
  await esperar(`!!__campo('Nota (opcional)')`, 'campo de nota')
  await evaluar(`__escribir('Nota (opcional)', 'Material para la semana')`)
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Registrar compra').click()`)
  await esperar(`document.body.innerText.includes('¡Compra registrada!')`, 'la segunda compra se registra')
  ok('ya llegó y ya pagada', await evaluar(`(() => { const t = document.querySelector('.venta-lista').innerText; return t.includes('Bs 250') && t.includes('Ya llegó') && t.includes('Pagada') })()`))
  ok('avisa que con ese costo perdés plata (250 contra 220)', await evaluar(`(() => { const t = document.querySelector('.venta-lista').innerText; return t.includes('Revisá tus precios') && t.includes('Bolso por encargo') && t.includes('perdés Bs 30') })()`))
  await captura('m7-06-aviso-margen-celular.png')

  // Compras: resumen, vistas y acciones
  await evaluar(`__clic('Ver mis compras')`)
  await esperar(`location.pathname === '/compras' && __ventas().length === 2`, 'Compras lista las dos')
  const resumenCompras = await evaluar(`document.querySelector('.resumen-stock').innerText`)
  ok('el resumen dice que le debés 280 (la otra ya está paga) y 1 pedido en camino', resumenCompras.includes('Bs 280') && resumenCompras.includes('1 compra por pagar') && resumenCompras.includes('1 pedido en camino'))
  ok('la más nueva va primero, con su estado', await evaluar(`__ventas()[0].innerText.includes('Recibida') && __ventas()[0].innerText.includes('Pagada') && __ventas()[1].innerText.includes('En camino') && __ventas()[1].innerText.includes('Por pagar')`))
  await captura('m7-07-compras-celular.png')
  await evaluar(`__clic('En camino')`)
  await esperar(`location.search.includes('vista=encamino') && __ventas().length === 1`, '«En camino» trae una')
  await evaluar(`__clic('Por pagar')`)
  await esperar(`location.search.includes('vista=porpagar') && __ventas().length === 1`, '«Por pagar» trae una')
  await evaluar(`__clic('Todas')`)
  await esperar(`__ventas().length === 2`, 'de vuelta en todas')

  await evaluar(`__ventas()[1].querySelector('.fila-stock-cabecera').click()`)
  await esperar(`__ventas()[1].innerText.includes('Llegó')`, 'detalle de la compra en camino')
  ok('lista las líneas con su costo', await evaluar(`__ventas()[1].innerText.includes('4 × Collar Salar turquesa (azul)') && __ventas()[1].innerText.includes('Bs 70 c/u')`))
  await evaluar(`__botonEn(__ventas()[1], 'Llegó').click()`)
  await esperar(`document.body.innerText.includes('Anotamos que llegó')`, '«Llegó» suma el stock y avisa')
  ok('con costo 70 y precio 120 no hay aviso de margen', !(await texto()).includes('Revisá tus precios'))
  await esperar(`!document.querySelector('.resumen-stock').innerText.includes('pedido en camino')`, 'el resumen ya no tiene nada en camino')
  await esperar(`__ventas().length === 2`, 'la lista se recargó')
  await evaluar(`__ventas()[1].querySelector('.fila-stock-cabecera').click()`)
  await esperar(`!!__botonEn(__ventas()[1], 'Marcar pagada')`, 'ahora se puede marcar pagada')
  ok('una compra recibida ya no ofrece «Llegó»', await evaluar(`!__botonEn(__ventas()[1], 'Llegó')`))
  await evaluar(`__botonEn(__ventas()[1], 'Marcar pagada').click()`)
  await esperar(`document.body.innerText.includes('Marcada como pagada.') && document.querySelector('.resumen-stock').innerText.includes('Todo al día')`, 'pagar deja todo al día')

  // El stock y el costo se actualizaron al recibir
  await ir('/stock?q=collar')
  await esperar(`__filas().length === 1`, 'collar en Stock tras recibir')
  ok('el collar pasó de 3 a 7', await evaluar(`__fila('Collar Salar turquesa').querySelector('.fila-stock-total').textContent === '7'`))
  await evaluar(`__fila('Collar Salar turquesa').querySelector('.fila-stock-cabecera').click()`)
  await esperar(`__fila('Collar Salar turquesa').innerText.includes('Llegaron 4 (azul)')`, 'el historial muestra la llegada de la compra')
  await ir('/catalogo?q=collar')
  await esperar(`__tarjetas().length === 1`, 'collar en el catálogo')
  ok('el costo del producto pasó a 70 (ganás 50)', await evaluar(`document.querySelector('.tarjeta-producto').innerText.includes('Ganás Bs 50')`))

  // Anular la compra del bolso (ya llegó y es por encargo: no mueve stock)
  await ir('/compras')
  await esperar(`__ventas().length === 2`, 'Compras de nuevo')
  await evaluar(`__ventas()[0].querySelector('.fila-stock-cabecera').click()`)
  await esperar(`!!__botonEn(__ventas()[0], 'Anular compra')`, 'detalle de la compra del bolso')
  await evaluar(`__botonEn(__ventas()[0], 'Anular compra').click()`)
  await esperar(`!!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').innerText.includes('¿Anular esta compra?')`, 'pide confirmar')
  ok('el diálogo explica qué pasa con el stock y con el costo', await evaluar(`(() => { const t = document.querySelector('dialog[open]').innerText; return t.includes('se resta del stock') && t.includes('Tu costo no vuelve al anterior') })()`))
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'No, dejarla').click()`)
  await esperar(`!document.querySelector('dialog[open]')`, 'arrepentirse cierra el diálogo')
  await dormir(400)
  await evaluar(`__botonEn(__ventas()[0], 'Anular compra').click()`)
  await esperar(`!!document.querySelector('dialog[open]')`, 'se vuelve a pedir confirmar')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Sí, anular').click()`)
  await esperar(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Compra anulada.')`, 'la compra se anula y avisa')
  await esperar(`__ventas().length === 2 && __ventas()[0].classList.contains('fila-venta-anulada') && __ventas()[0].innerText.includes('Anulada')`, 'la anulada queda marcada en «Todas»')
  ok('una anulada no muestra «Por pagar» ni ofrece acciones', await evaluar(`!__ventas()[0].innerText.includes('Por pagar')`))

  // Lo último que le pagaste y el comparador (la anulada no cuenta)
  await ir('/proveedores')
  await esperar(`__ventas().length === 2`, 'Proveedores tras comprar')
  ok('Don Beto figura sin deudas y con 2 compras hechas (la anulada no cuenta)', await evaluar(`__ventas()[0].innerText.includes('Sin deudas')`))
  await evaluar(`__ventas()[0].querySelector('.fila-stock-cabecera').click()`)
  await esperar(`__ventas()[0].innerText.includes('Collar Salar turquesa')`, 'últimos precios de Don Beto')
  ok('muestra lo último que pagó: collar a Bs 70 (y no el bolso anulado)', await evaluar(`(() => { const t = __ventas()[0].innerText; return t.includes('Bs 70') && !t.includes('Bolso por encargo') })()`))
  await ir('/compras/nueva')
  await esperar(`!!document.querySelector('#proveedor') && document.querySelectorAll('.fila-vender').length > 0`, 'Nueva compra para comparar')
  await evaluar(`(() => { const s = document.querySelector('#proveedor'); const o = [...s.options].find(x => x.textContent === 'Hilos Rosa'); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await evaluar(`__escribir('Buscar producto', 'collar')`)
  await esperar(`document.querySelectorAll('.fila-vender').length === 1`, 'collar para comparar')
  await evaluar(`__poner(document.querySelector('[aria-label="Cantidad de Collar Salar turquesa (verde)"]'), '1')`)
  await esperar(`__vender('Collar Salar turquesa').innerText.includes('Lo más barato que pagaste: Cueros Don Beto, Bs 70')`, 'el comparador dice quién fue más barato')
  await captura('m7-08-comparador-celular.png')

  // Desactivar un proveedor: sale de la lista pero no se borra
  await ir('/proveedores')
  await esperar(`__ventas().length === 2`, 'Proveedores para desactivar')
  await evaluar(`__ventas()[1].querySelector('.fila-stock-cabecera').click()`)
  await esperar(`!!__botonEn(__ventas()[1], 'Desactivar')`, 'detalle de Hilos Rosa')
  await evaluar(`__botonEn(__ventas()[1], 'Desactivar').click()`)
  await esperar(`__ventas().length === 1 && document.body.innerText.includes('Sus compras siguen guardadas')`, 'desactivar lo saca de la lista')
  await evaluar(`__botonEn(document.querySelector('.chips'), 'Mostrar desactivados').click()`)
  await esperar(`__ventas().length === 2 && __ventas()[1].innerText.includes('Desactivado')`, '«Mostrar desactivados» lo trae de vuelta')

  await escritorio()
  await ir('/compras')
  await esperar(`__ventas().length === 2`, 'Compras en escritorio')
  await captura('m7-09-compras-escritorio.png')
  await ir('/proveedores')
  await esperar(`__ventas().length >= 1`, 'Proveedores en escritorio')
  await captura('m7-10-proveedores-escritorio.png')
  await ir('/compras/nueva')
  await esperar(`document.querySelectorAll('.fila-vender').length > 0`, 'Nueva compra en escritorio')
  await captura('m7-11-nueva-compra-escritorio.png')

  // 8g. M8 · Calculadora de precio: costeo, precio sugerido (calculado por el servidor) y costo coherente
  await celular()
  await ir('/catalogo?q=collar')
  await esperar(`__tarjetas().length === 1`, 'collar para costear')
  await evaluar(`document.querySelector('.tarjeta-producto').click()`)
  await esperar(`!!document.querySelector('.calculadora') && __campo('Material')?.value === '70'`, 'la calculadora arranca con el costo que ya tenías como material')
  ok('el margen arranca en 40 %', (await evaluar(`__campo('Cuánto querés ganar (% del precio)').value`)) === '40')
  await esperar(`document.querySelector('.calculadora-resultado')?.innerText.includes('Cobrá Bs 117')`, 'sugerido para costo 70: 70 ÷ 0,6 = 116,67 → 117')
  ok('compara con tu precio de hoy (120: ganás 50, 41,7 %)', await evaluar(`document.querySelector('.calculadora-resultado').innerText.includes('Hoy cobrás Bs 120 y ganás Bs 50 (41,7 %)')`))
  await evaluar(`__escribir('Empaque', '5')`)
  await evaluar(`__escribir('Mano de obra', '20')`)
  await evaluar(`__escribir('Costo fijo', '5')`)
  await esperar(`document.querySelector('.calculadora-resultado')?.innerText.includes('Cobrá Bs 167')`, 'con costo 100 el sugerido cambia a 167')
  ok('y muestra lo que ganás hoy con el precio actual (20, 16,7 %)', await evaluar(`document.querySelector('.calculadora-resultado').innerText.includes('ganás Bs 20 (16,7 %)') && document.querySelector('.calculadora-resultado').innerText.includes('Te cuesta Bs 100')`))
  await evaluar(`document.querySelector('.calculadora').scrollIntoView({ block: 'center' })`)
  await captura('m8-01-calculadora-celular.png')
  await evaluar(`__escribir('Empaque', '1,555')`)
  await esperar(`document.querySelector('.calculadora').innerText.includes('Revisá los números') && __botonEn(document.querySelector('.calculadora'), 'Guardar costeo').disabled`, 'un monto con 3 decimales bloquea el guardado')
  await evaluar(`__escribir('Empaque', '5')`)
  ok('el precio del producto no se tocó solo mientras se calcula', (await evaluar(`__campo('Precio').value`)) === '120')
  await evaluar(`__botonEn(document.querySelector('.calculadora'), 'Guardar costeo').click()`)
  await esperar(`document.querySelector('.calculadora').innerText.includes('tu costo ahora es Bs 100') && __campo('Tu costo').disabled && __campo('Tu costo').value === '100'`, 'guardar el costeo deja tu costo en 100 y lo bloquea')
  ok('el precio sigue en 120 después de guardar el costeo', (await evaluar(`__campo('Precio').value`)) === '120')
  ok('el formulario explica de dónde sale el costo', (await texto()).includes('Sale de tu costeo'))

  // "Usar este precio" lo pone en el formulario, sin guardarlo
  await evaluar(`__botonEn(document.querySelector('.calculadora'), 'Usar este precio').click()`)
  await esperar(`__campo('Precio')?.value === '167'`, '«Usar este precio» lo escribe en el formulario')
  await ir('/catalogo?q=collar')
  await esperar(`__tarjetas().length === 1`, 'collar tras no guardar')
  ok('sin tocar Guardar, el precio del catálogo sigue en 120', await evaluar(`document.querySelector('.tarjeta-producto').innerText.includes('Bs 120')`))
  await evaluar(`document.querySelector('.tarjeta-producto').click()`)
  await esperar(`!!document.querySelector('.calculadora') && __campo('Tu costo')?.disabled === true`, 'de vuelta en el collar con costeo')
  await esperar(`document.querySelector('.calculadora').innerText.includes('Quitar costeo')`, 'ofrece quitar el costeo')
  await evaluar(`document.querySelector('.calculadora').scrollIntoView({ block: 'center' })`)
  await captura('m8-02-costeo-guardado-celular.png')
  await evaluar(`__botonEn(document.querySelector('.calculadora'), 'Quitar costeo').click()`)
  await esperar(`document.querySelector('.calculadora').innerText.includes('Quitamos el costeo') && __campo('Tu costo')?.disabled === false`, 'quitar el costeo libera el costo')
  ok('el costo queda en 100 y vuelve a editarse', (await evaluar(`__campo('Tu costo').value`)) === '100')
  await escritorio()
  await evaluar(`document.querySelector('.calculadora').scrollIntoView({ block: 'center' })`)
  await captura('m8-03-calculadora-escritorio.png')

  // 8h. M9 · Inicio y gastos: resumen del mes, gastos, "ya cubriste el X %", para reponer y lo último que pasó
  await celular()
  await ir('/')
  await esperar(`!!document.querySelector('.kpis') && !!document.querySelector('.gastos-cubiertos') && document.querySelectorAll('.grafico-columna').length === 14`, 'el Inicio con actividad muestra las tarjetas, el gráfico de 14 días y los gastos')
  const resumenInicio = await evaluar(`document.querySelector('.kpis').innerText`)
  ok('las tarjetas suman lo vendido (2 ventas vigentes, la anulada no cuenta: Bs 660, ticket Bs 330)', resumenInicio.includes('Bs 660') && resumenInicio.includes('2 ventas') && resumenInicio.includes('ticket promedio Bs 330'))
  ok('avisa las unidades sin costo cargado', resumenInicio.includes('unidades sin costo cargado'))
  ok('sin gastos explica qué hacer', await evaluar(`document.querySelector('.gastos-cubiertos').innerText.includes('Todavía no anotaste gastos este mes')`))
  ok('lo que hay que reponer aparece como aviso con enlace a Stock', await evaluar(`(() => { const a = document.querySelector('a[href="/stock?vista=areponer"]'); return !!a && a.innerText.includes('llegaron más') })()`))
  ok('«Últimas ventas» lista las 2 ventas vigentes', await evaluar(`document.querySelectorAll('[aria-labelledby="ultimas-titulo"] tbody tr').length === 2`))
  ok('«Lo que más se vende» lista los productos con sus unidades', await evaluar(`document.querySelectorAll('[aria-labelledby="mas-vendido-titulo"] tbody tr').length >= 1`))
  ok('el gráfico marca el día de hoy y su monto', await evaluar(`document.querySelector('.grafico-dia-hoy') !== null && /Bs 660/.test(document.querySelector('.grafico-cabecera').innerText)`))
  await evaluar(`[...document.querySelectorAll('.selector-periodo .segmento')].find(b => b.textContent.trim() === 'Semana').click()`)
  await esperar(`document.querySelector('.gastos-cubiertos').innerText.includes('Gastos de la semana cubiertos') && location.search.includes('periodo=semana')`, 'el selector de período cambia a Semana')
  await evaluar(`[...document.querySelectorAll('.selector-periodo .segmento')].find(b => b.textContent.trim() === 'Mes').click()`)
  await esperar(`document.querySelector('.gastos-cubiertos').innerText.includes('Gastos de') && !location.search.includes('periodo')`, 'y vuelve al Mes')
  await captura('m9-01-inicio-celular.png')

  await evaluar(`document.querySelector('.accesos').querySelector('a[href="/gastos?nuevo=1"]').click()`)
  await esperar(`location.pathname === '/gastos' && !!document.querySelector('dialog[open]') && !!__campo('Monto')`, '«Anotar un gasto» abre el formulario directo')
  ok('el parámetro ?nuevo se limpió de la dirección', !(await evaluar(`location.search`)).includes('nuevo'))
  ok('Guardar está desactivado sin datos', await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar gasto').disabled`))
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Alquiler').click()`)
  ok('una sugerencia llena el concepto', (await evaluar(`__campo('¿En qué gastaste?').value`)) === 'Alquiler')
  await evaluar(`__escribir('Monto', '10,555')`)
  await esperar(`document.querySelector('dialog[open]').innerText.includes('hasta 2 decimales') && __botonEn(document.querySelector('dialog[open]'), 'Guardar gasto').disabled`, 'un monto con 3 decimales se marca')
  await evaluar(`__escribir('Monto', '800')`)
  await captura('m9-02-nuevo-gasto-celular.png')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar gasto').click()`)
  await esperar(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Anotaste Alquiler: Bs 800.')`, 'el gasto se guarda y avisa')
  await esperar(`__ventas().length === 1 && document.querySelector('.resumen-stock').innerText.includes('Bs 800')`, 'el gasto aparece y el total del mes lo suma')

  await evaluar(`__clic('Nuevo gasto')`)
  await esperar(`!!document.querySelector('dialog[open]') && !!__campo('Monto')`, 'segundo gasto')
  await evaluar(`__escribir('¿En qué gastaste?', 'Luz')`)
  await evaluar(`__escribir('Monto', '120')`)
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Guardar gasto').click()`)
  await esperar(`!document.querySelector('dialog[open]') && __ventas().length === 2 && document.querySelector('.resumen-stock').innerText.includes('Bs 920')`, 'el total pasa a 920')
  await captura('m9-03-gastos-celular.png')
  await evaluar(`document.querySelector('[aria-label="Anular el gasto Luz"]').click()`)
  await esperar(`!!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').innerText.includes('¿Anular este gasto?')`, 'pide confirmar')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Sí, anular').click()`)
  await esperar(`!document.querySelector('dialog[open]') && __ventas().length === 1 && document.querySelector('.resumen-stock').innerText.includes('Bs 800')`, 'anular saca el gasto y el total vuelve a 800')

  // El Inicio cruza ganancia con gastos
  await ir('/')
  await esperar(`!!document.querySelector('.medidor-barra')`, 'el medidor con gastos')
  ok('dice que cubriste 0 % (todo se vendió sin costo cargado) y cuánto falta', await evaluar(`(() => { const t = document.querySelector('.gastos-cubiertos').innerText; return t.includes('0 %') && t.includes('Te faltan Bs 800') && t.includes('(Bs 800)') })()`))
  ok('el medidor es una barra de progreso accesible', await evaluar(`document.querySelector('.medidor-barra').getAttribute('role') === 'progressbar' && document.querySelector('.medidor-barra').getAttribute('aria-valuenow') === '0'`))
  await captura('m9-04-inicio-con-gastos-celular.png')

  // Vender y ver el medidor en la pantalla de éxito
  await ir('/venta')
  await esperar(`!!__vender('Collar Salar turquesa')`, 'Nueva venta para el medidor')
  await evaluar(`__vender('Collar Salar turquesa').querySelector('[aria-label="Uno más"]').click()`)
  await evaluar(`__botonEn(document.querySelector('.pie-venta'), 'Registrar venta').click()`)
  await esperar(`document.body.innerText.includes('¡Venta registrada!')`, 'venta para el medidor')
  await esperar(`document.querySelector('.venta-lista').innerText.includes('ya cubriste el')`, 'la pantalla de éxito dice cuánto de los gastos se cubrió')
  ok('el menú lateral tiene «Gastos»', await evaluar(`[...document.querySelectorAll('.menu-enlace')].some(a => a.textContent.trim() === 'Gastos')`))

  await escritorio()
  await ir('/')
  await esperar(`!!document.querySelector('.medidor-barra')`, 'Inicio en escritorio')
  await captura('m9-05-inicio-escritorio.png')
  await ir('/gastos')
  await esperar(`__ventas().length === 1`, 'Gastos en escritorio')
  await captura('m9-06-gastos-escritorio.png')

  // 8i. M10 · Tienda pública desde el panel: enlace, qué ven los clientes, fondo y publicar / despublicar
  await celular()
  await ir('/mi-tienda')
  await esperar(`!!document.querySelector('.tienda-internet') && !!document.querySelector('.tarjeta-enlace a.direccion-enlace')`, 'la tarjeta del enlace y la sección de diseño')
  await esperar(`!!document.querySelector('.tarjeta-enlace-qr img')`, 'el código QR se dibuja')
  ok('el QR es una imagen PNG y se puede descargar con el nombre de la tienda', await evaluar(`(() => { const i = document.querySelector('.tarjeta-enlace-qr img'); const a = [...document.querySelectorAll('.tarjeta-enlace a')].find(x => x.textContent.trim() === 'Descargar QR'); return i.src.startsWith('data:image/png') && a.hasAttribute('download') && a.download.startsWith('qr-') && a.href === i.src })()`))
  ok('la vista previa en vivo muestra el nombre y el color de la tienda', await evaluar(`(() => { const v = document.querySelector('.vp-cabecera'); return !!v && v.innerText.length > 0 && !!document.querySelector('.marco-direccion') })()`))
  await escritorio()
  await evaluar(`__escribir('Nombre de la tienda', 'Nombre en vivo ${n}')`)
  ok('al escribir el nombre, la vista previa cambia al instante (sin guardar)', await evaluar(`document.querySelector('.vp-cabecera').innerText.includes('Nombre en vivo ${n}')`))
  await evaluar(`[...document.querySelectorAll('.color-muestra')].find(b => b.getAttribute('aria-label') === 'Azul').click()`)
  ok('al elegir un color, la cabecera de la vista previa lo toma', await evaluar(`getComputedStyle(document.querySelector('.vp-cabecera')).backgroundColor === 'rgb(37, 82, 163)'`))
  await captura('m3-04-mi-tienda-vista-previa-escritorio.png')
  await evaluar(`__clic('Descartar')`)
  await esperar(`!document.querySelector('.vp-cabecera').innerText.includes('Nombre en vivo ${n}')`, 'descartar vuelve la vista previa')
  await celular()
  const slugTienda = await evaluar(`document.querySelector('.tarjeta-enlace a.direccion-enlace').textContent.split('/').pop()`)
  const interruptor = (txt) => `[...document.querySelectorAll('.tienda-internet [role=switch]')].find(b => b.innerText.startsWith('${txt}'))`
  // `no-store`: la tienda pública se cachea 30 s a propósito (Cache-Control); acá se quiere ver el cambio al instante.
  const publico = (ruta) => `fetch('/public/${slugTienda}${ruta}', { cache: 'no-store' }).then(async r => ({ estado: r.status, json: r.status === 200 ? await r.json() : null }))`
  ok('arranca todo encendido', await evaluar(`['Tienda publicada', 'Mostrar los precios', 'Mostrar si hay', 'Pedidos por WhatsApp'].every(t => ${interruptor('\'+t+\'')}?.getAttribute('aria-checked') === 'true')`.replace(`${interruptor('\'+t+\'')}`, `[...document.querySelectorAll('.tienda-internet [role=switch]')].find(b => b.innerText.startsWith(t))`)))
  ok('el enlace es el de la tienda pública con tu dirección', (await evaluar(`document.querySelector('.tarjeta-enlace a.direccion-enlace').href`)) === `http://localhost:5014/${slugTienda}`)
  ok('«Ver como cliente» se abre en otra pestaña sin pasarle el panel (noopener)', await evaluar(`(() => { const a = [...document.querySelectorAll('.pagina-cabecera a')].find(x => x.textContent.trim() === 'Ver como cliente'); return a.target === '_blank' && a.rel.includes('noopener') })()`))
  ok('«Compartir por WhatsApp» arma el mensaje con el enlace', await evaluar(`(() => { const a = [...document.querySelectorAll('.tarjeta-enlace a')].find(x => x.textContent.trim() === 'Compartir por WhatsApp'); return a.href.startsWith('https://wa.me/?text=') && decodeURIComponent(a.href).includes('http://localhost:5014/${slugTienda}') })()`))
  await evaluar(`[...document.querySelectorAll('.tarjeta-enlace button')].find(x => x.textContent.trim() === 'Copiar enlace').click()`)
  await esperar(`document.querySelector('.tarjeta-enlace').innerText.includes('Copiaste el enlace') || document.querySelector('.tarjeta-enlace').innerText.includes('No pudimos copiarlo')`, '«Copiar enlace» responde (copia o explica qué hacer)')
  const pub0 = await evaluar(publico('/productos?Limite=50'))
  ok('la tienda pública responde y muestra precios y disponibilidad', pub0.estado === 200 && pub0.json.items.length > 0 && pub0.json.items.every((i) => i.precio !== null && i.disponible !== null))

  await evaluar(`${interruptor('Mostrar los precios')}.click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Ya no se ven los precios.')`, 'apagar precios guarda y avisa')
  ok('sin precios: el público ya no los recibe', await evaluar(`${publico('/productos?Limite=50')}.then(r => r.json.items.every(i => i.precio === null))`))
  ok('el interruptor refleja el cambio', (await evaluar(`${interruptor('Mostrar los precios')}.getAttribute('aria-checked')`)) === 'false')
  await evaluar(`${interruptor('Mostrar los precios')}.click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Ahora se ven los precios.')`, 'volver a mostrar precios')

  await evaluar(`${interruptor('Mostrar si hay')}.click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Ya no se ve si hay o no hay.')`, 'apagar disponibilidad')
  ok('sin disponibilidad: el público no recibe ni el dato', await evaluar(`${publico('/productos?Limite=50')}.then(r => r.json.items.every(i => i.disponible === null))`))
  await evaluar(`${interruptor('Mostrar si hay')}.click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Ahora se ve si hay o no hay.')`, 'volver a mostrar disponibilidad')

  ok('con WhatsApp cargado, los pedidos explican cómo llegan', await evaluar(`${interruptor('Pedidos por WhatsApp')}.innerText.includes('te llega el pedido armado')`))
  await evaluar(`${interruptor('Pedidos por WhatsApp')}.click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Ya no se puede pedir por WhatsApp.')`, 'apagar pedidos')
  ok('sin pedidos por WhatsApp, el público no recibe el número', await evaluar(`${publico('')}.then(r => r.json.whatsapp === null)`))
  await evaluar(`${interruptor('Pedidos por WhatsApp')}.click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Ahora se puede pedir por WhatsApp.')`, 'volver a encender pedidos')

  await evaluar(`[...document.querySelectorAll('.tienda-internet .segmento')].find(b => b.textContent.trim() === 'Oscuro').click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Fondo oscuro.')`, 'cambiar el fondo')
  ok('el fondo elegido llega a la tienda pública', await evaluar(`${publico('')}.then(r => r.json.fondo === 'Oscuro')`))
  await evaluar(`document.querySelector('.tienda-internet').scrollIntoView({ block: 'start' })`)
  await captura('m10-05-tienda-en-internet-celular.png')
  await evaluar(`[...document.querySelectorAll('.tienda-internet .segmento')].find(b => b.textContent.trim() === 'Crema').click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Fondo crema.')`, 'volver al fondo crema')

  await evaluar(`${interruptor('Tienda publicada')}.click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Tu tienda dejó de verse.')`, 'despublicar')
  ok('despublicada: la tienda pública responde 404 y el panel lo explica', (await evaluar(publico(''))).estado === 404 && (await evaluar(`${interruptor('Tienda publicada')}.innerText.includes('no encontrada')`)))
  await evaluar(`document.querySelector('.tienda-internet').scrollIntoView({ block: 'start' })`)
  await captura('m10-06-tienda-despublicada-celular.png')
  await evaluar(`${interruptor('Tienda publicada')}.click()`)
  await esperar(`document.querySelector('.tienda-internet').innerText.includes('Tu tienda está publicada.')`, 'publicar otra vez')
  ok('publicada otra vez: vuelve a verse', (await evaluar(publico(''))).estado === 200)

  // Si cambia la dirección, el enlace cambia con ella (y la anterior deja de funcionar: el panel ya lo advierte)
  await escritorio()
  await ir('/mi-tienda')
  await esperar(`!!document.querySelector('.tienda-internet')`, 'Mi tienda en escritorio')
  await evaluar(`document.querySelector('.tienda-internet').scrollIntoView({ block: 'start' })`)
  await captura('m10-07-tienda-en-internet-escritorio.png')

  // 8j. M11 · Desde Instagram: probá tu formato, bandeja de revisión, revisar y publicar, descartar
  await celular()
  await ir('/instagram')
  await esperar(`!!document.querySelector('.lector') && document.body.innerText.includes('No tenés nada esperando')`, 'Desde Instagram con la bandeja vacía')
  ok('sin texto, los botones están desactivados', await evaluar(`__botonEn(document.querySelector('.lector'), 'Ver qué entendió').disabled && __botonEn(document.querySelector('.lector'), 'Mandar a la bandeja').disabled`))
  ok('la guía explica el formato', await evaluar(`document.querySelector('.guia-formato').textContent.includes('Colores y tallas') && document.querySelector('.guia-formato').textContent.includes('Quedan 5')`))
  await evaluar(`import('/src/api/cliente.ts').then(m => m.api.POST('/api/v1/categorias', { body: { nombre: 'Accesorios' } }))`)
  const publicacion = '✨ Cartera Aurora ✨\n💰 Bs 150\nColores: café, negro\nQuedan 4\n#carteras #hechoamano'
  await evaluar(`__escribir('Texto de la publicación', ${JSON.stringify(publicacion)})`)
  await evaluar(`__botonEn(document.querySelector('.lector'), 'Ver qué entendió').click()`)
  await esperar(`!!document.querySelector('.entendido')`, 'el lector responde')
  ok('entendió nombre, precio, colores, stock y categoría (sin emojis ni hashtags genéricos)', await evaluar(`(() => { const t = document.querySelector('.entendido').innerText; return t.includes('Cartera Aurora') && t.includes('Bs 150') && t.includes('café, negro') && t.includes('4') && t.includes('Carteras') && !t.includes('✨') && !t.includes('hechoamano') })()`))
  await captura('m11-01-lector-celular.png')
  ok('probar el formato NO guarda nada', await evaluar(`document.body.innerText.includes('No tenés nada esperando')`))
  await evaluar(`__escribir('Texto de la publicación', ${JSON.stringify(publicacion + ' ')})`)
  await esperar(`!document.querySelector('.entendido')`, 'al cambiar el texto, el resultado viejo se va')

  await evaluar(`__botonEn(document.querySelector('.lector'), 'Mandar a la bandeja').click()`)
  await esperar(`document.body.innerText.includes('Mandamos «Cartera Aurora» a la bandeja')`, 'mandar a la bandeja')
  await esperar(`__ventas().length === 1 && __ventas()[0].innerText.includes('Cartera Aurora')`, 'la bandeja lista el producto')
  ok('el texto se limpió y la bandeja cuenta 1', await evaluar(`__campo('Texto de la publicación').value === '' && document.querySelector('.bandeja').innerText.includes('Para revisar (1)')`))
  ok('lo importado NO está en el catálogo', await evaluar(`import('/src/api/cliente.ts').then(m => m.api.GET('/api/v1/productos', { params: { query: { Buscar: 'Aurora' } } })).then(r => r.data.items.length === 0)`))
  await evaluar(`__escribir('Texto de la publicación', ${JSON.stringify('Mochila escolar\nHecha a mano')})`)
  await evaluar(`__botonEn(document.querySelector('.lector'), 'Mandar a la bandeja').click()`)
  await esperar(`__ventas().length === 2`, 'segundo producto en la bandeja')
  ok('el que no tiene precio lo dice', await evaluar(`__ventas().find(li => li.innerText.includes('Mochila escolar')).innerText.includes('Falta el precio')`))
  await evaluar(`__escribir('Texto de la publicación', ${JSON.stringify('Aretes Luna\nBs 90\nQuedan 7\n#accesorios')})`)
  await evaluar(`__botonEn(document.querySelector('.lector'), 'Mandar a la bandeja').click()`)
  await esperar(`__ventas().length === 3`, 'tercer producto en la bandeja')
  await captura('m11-02-bandeja-celular.png')

  // Revisar y publicar el de varios colores
  await evaluar(`[...__ventas().find(li => li.innerText.includes('Cartera Aurora')).querySelectorAll('a')].find(a => a.textContent.trim() === 'Revisar').click()`)
  await esperar(`location.pathname.startsWith('/instagram/revisar/') && !!__campo('Nombre') && __campo('Nombre').value === 'Cartera Aurora'`, 'la pantalla de revisión con lo entendido')
  const idAurora = await evaluar(`location.pathname.split('/').pop()`)
  ok('el formulario trae precio y colores', (await evaluar(`__campo('Precio').value`)) === '150' && (await evaluar(`__campo('Colores (separados por coma)').value`)) === 'café, negro')
  await esperar(`document.querySelector('#categoria')?.options.length > 1`, 'las categorías cargaron')
  ok('«#carteras» no coincide con ninguna categoría (hoy es «Carteras y bolsos»): queda sin categoría', (await evaluar(`document.querySelector('#categoria').value`)) === '')
  ok('dice que es una revisión y que la publicación decía cuántos quedan', await evaluar(`document.querySelector('h1').textContent === 'Revisar producto' && document.querySelector('.panel-borrador').innerText.includes('quedan 4')`))
  ok('ofrece ver el texto original', await evaluar(`document.querySelector('.panel-borrador details').textContent.includes('Ver el texto original')`))
  await captura('m11-03-revisar-celular.png')
  await evaluar(`__escribir('Precio', '160')`)
  await evaluar(`__clic('Guardar producto')`)
  await esperar(`document.body.innerText.includes('¡Guardado!')`, 'se publica')
  ok('queda en el catálogo, no carga el stock (hay dos colores) y dice por qué', await evaluar(`(() => { const t = document.body.innerText; return t.includes('Cartera Aurora ya está en tu catálogo') && t.includes('varias opciones') && t.includes('Seguir con la bandeja') })()`))
  await evaluar(`__clic('Seguir con la bandeja')`)
  await esperar(`location.pathname === '/instagram' && __ventas().length === 2`, 'de vuelta en la bandeja con dos pendientes')
  ok('abrir de nuevo el ya publicado avisa que ya está en el catálogo', await (async () => { await ir(`/instagram/revisar/${idAurora}`); await esperar(`document.body.innerText.includes('ya está en tu catálogo')`, 'el publicado no se revisa de nuevo'); return (await texto()).includes('Este producto ya está en tu catálogo') })())

  // Revisar el de una sola opción: carga el stock
  await ir('/instagram')
  await esperar(`__ventas().length === 2`, 'bandeja')
  await evaluar(`[...__ventas().find(li => li.innerText.includes('Aretes Luna')).querySelectorAll('a')].find(a => a.textContent.trim() === 'Revisar').click()`)
  await esperar(`__campo('Nombre')?.value === 'Aretes Luna'`, 'revisar los aretes')
  await esperar(`document.querySelector('#categoria')?.selectedOptions[0]?.textContent === 'Accesorios'`, 'el hashtag coincide con una categoría que existe: la elige (sin importar mayúsculas)')
  await evaluar(`__clic('Guardar producto')`)
  await esperar(`document.body.innerText.includes('¡Guardado!') && document.body.innerText.includes('Cargamos las unidades')`, 'publicar con una sola opción carga el stock')
  ok('el stock de «Quedan 7» quedó cargado', await evaluar(`import('/src/api/cliente.ts').then(m => m.api.GET('/api/v1/stock', { params: { query: { Buscar: 'Aretes Luna' } } })).then(r => r.data.items[0].stock === 7)`))

  // Descartar
  await ir('/instagram')
  await esperar(`__ventas().length === 1 && __ventas()[0].innerText.includes('Mochila escolar')`, 'queda solo la mochila')
  await evaluar(`document.querySelector('[aria-label="Descartar Mochila escolar"]').click()`)
  await esperar(`!!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').innerText.includes('¿Descartar este producto?')`, 'pide confirmar')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'No, dejarlo').click()`)
  await esperar(`!document.querySelector('dialog[open]')`, 'arrepentirse')
  await dormir(400)
  await evaluar(`document.querySelector('[aria-label="Descartar Mochila escolar"]').click()`)
  await esperar(`!!document.querySelector('dialog[open]')`, 'confirmar de nuevo')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Sí, descartar').click()`)
  await esperar(`!document.querySelector('dialog[open]') && document.body.innerText.includes('Lo descartaste') && document.body.innerText.includes('No tenés nada esperando')`, 'descartar vacía la bandeja')
  ok('lo descartado no llegó al catálogo', await evaluar(`import('/src/api/cliente.ts').then(m => m.api.GET('/api/v1/productos', { params: { query: { Buscar: 'Mochila escolar' } } })).then(r => r.data.items.length === 0)`))
  ok('el menú lateral y la sección tienen su lugar (ya no está en construcción)', !(await texto()).includes('Estamos construyendo esta sección'))
  await escritorio()
  await ir('/instagram')
  await esperar(`!!document.querySelector('.lector')`, 'Desde Instagram en escritorio')
  await evaluar(`__escribir('Texto de la publicación', ${JSON.stringify('Novedades\n1. Cartera Bs 120\n2. Aretes Bs 95\n3. Collar Bs 150\n#accesorios')})`)
  await evaluar(`__botonEn(document.querySelector('.lector'), 'Ver qué entendió').click()`)
  await esperar(`document.querySelectorAll('.entendido').length === 3`, 'un carrusel se lee como tres productos')
  await captura('m11-04-carrusel-escritorio.png')

  // 8k. M13 · Planes: límite del Gratis, pedir un plan con comprobante, el administrador lo aprueba
  const API = 'http://localhost:5013'
  const cred = JSON.parse(readFileSync('../Hermes/scripts/admin.local.json', 'utf8').replace(/^﻿/, ''))
  const llamar = async (metodo, ruta, token, cuerpo) => {
    const r = await fetch(API + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
    return { estado: r.status, datos: r.headers.get('content-type')?.includes('json') ? await r.json() : null }
  }
  const tokenAdmin = (await llamar('POST', '/api/v1/auth/login', null, cred)).datos.accessToken
  // El nombre y la dirección cambiaron más arriba (prueba de Mi tienda): se leen los de ahora.
  const { slug: slugDuena, nombre: nombreDuena } = await evaluar(`import('/src/api/cliente.ts').then(m => m.api.GET('/api/v1/tienda')).then(r => r.data)`)
  const tiendaDuena = (await llamar('GET', `/api/v1/admin/tiendas?Buscar=${slugDuena}`, tokenAdmin)).datos.items[0].id
  const planesAdmin = (await llamar('GET', '/api/v1/admin/planes', tokenAdmin)).datos
  const idPlan = (codigo) => planesAdmin.find((p) => p.codigo === codigo).id

  await celular()
  await ir('/mi-plan')
  await esperar(`document.body.innerText.includes('Plan Negocio')`, 'Mi plan con el plan por defecto de desarrollo')
  ok('muestra los planes de pago con su precio por mes', await evaluar(`(() => { const t = document.body.innerText; return t.includes('Emprendedor') && t.includes('Bs 39') && t.includes('por mes') && t.includes('sin límite') })()`))
  await captura('m13-01-mi-plan-celular.png')
  await ir('/admin')
  await esperar(`location.pathname === '/'`, 'una dueña común no entra a /admin')
  ok('el menú de una dueña no tiene Administración', !(await evaluar(`document.body.innerText.includes('Administración')`)))

  // Pasarla al plan Gratis y llenar el límite de 15 productos
  ok('el administrador la pasa al Gratis', (await llamar('PUT', `/api/v1/admin/tiendas/${tiendaDuena}/plan`, tokenAdmin, { planId: idPlan('gratis'), meses: null })).estado === 200)
  const topeado = await evaluar(`import('/src/api/cliente.ts').then(async (m) => { for (let i = 0; i < 40; i++) { const r = await m.api.POST('/api/v1/productos', { body: { nombre: 'Relleno ' + i, descripcion: null, precio: 10, costo: 0, categoriaId: null, visibleEnTienda: true, colores: null, tallas: null, fotoIds: null, controlaStock: false } }); if (r.response.status === 402) return i; if (!r.data) return -1 } return -2 })`)
  ok('el plan Gratis corta la creación de productos con un 402', topeado >= 0)
  await ir('/catalogo/nuevo')
  await esperar(`!!__campo('Nombre')`, 'formulario de producto nuevo')
  await evaluar(`__escribir('Nombre', 'Uno de más')`)
  await evaluar(`__escribir('Precio', '30')`)
  await evaluar(`__clic('Guardar producto')`)
  await esperar(`document.querySelector('[role=alert]')?.textContent.includes('límite de tu plan')`, 'el formulario explica el límite')
  ok('el aviso del límite trae el enlace a Mi plan', await evaluar(`!!document.querySelector('[role=alert] a[href="/mi-plan"]')`))
  await captura('m13-02-limite-celular.png')

  // Pedir el plan Emprendedor por 3 meses
  await evaluar(`document.querySelector('[role=alert] a[href="/mi-plan"]').click()`)
  await esperar(`location.pathname === '/mi-plan' && document.body.innerText.includes('Plan Gratis')`, 'Mi plan en Gratis')
  ok('muestra el uso lleno del Gratis', await evaluar(`/\\d+ de 15 productos/.test(document.body.innerText) && !!document.querySelector('.medidor-lleno')`))
  await evaluar(`document.querySelector('[aria-label="Pedir el plan Emprendedor"]').click()`)
  await esperar(`!!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').innerText.includes('Foto del comprobante')`, 'el pedido abre su formulario')
  await evaluar(`[...document.querySelectorAll('dialog[open] .chip')].find(b => b.textContent.trim() === '3 meses').click()`)
  await esperar(`document.querySelector('[data-prueba=plan-total]').innerText.includes('Bs 117')`, 'el total cambia con los meses')
  ok('sin comprobante no se puede enviar', await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Enviar pedido').disabled`))
  await captura('m13-03-pedir-plan-celular.png')
  await evaluar(`__subirPng('#0b7a57')`)
  await esperar(`!__botonEn(document.querySelector('dialog[open]'), 'Enviar pedido').disabled`, 'subido el comprobante, se puede enviar')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Enviar pedido').click()`)
  await esperar(`document.body.innerText.includes('Recibimos tu comprobante') && document.body.innerText.includes('Estamos revisando tu pago del plan Emprendedor')`, 'el pedido queda en revisión')
  ok('mientras hay un pedido, no se puede pedir otro', await evaluar(`document.querySelector('[aria-label="Pedir el plan Negocio"]').disabled`))
  await captura('m13-04-en-revision-celular.png')

  // El administrador entra por la pantalla de ingreso, revisa y aprueba
  await escritorio()
  await ir('/mi-plan')
  await esperar(`!!document.querySelector('[aria-label="Cerrar sesión"]')`, 'menú con cerrar sesión')
  await evaluar(`__clic('Cerrar sesión')`)
  await esperar(`location.pathname === '/bienvenida'`, 'la dueña sale')
  await ir('/ingresar')
  await esperar(`!!__campo('Email')`, 'ingresar como administrador')
  await evaluar(`__escribir('Email', ${JSON.stringify(cred.email)})`)
  await evaluar(`__escribir('Contraseña', ${JSON.stringify(cred.password)})`)
  await evaluar(`__clic('Entrar')`)
  await esperar(`document.body.innerText.includes('Administración')`, 'el menú del administrador tiene Administración')
  await evaluar(`__clic('Administración')`)
  const filaPago = `[...document.querySelectorAll('.pago-revisar')].find(x => x.innerText.includes(${JSON.stringify(nombreDuena)}))`
  await esperar(`location.pathname === '/admin' && !!${filaPago}`, 'el pedido aparece en la cola')
  ok('la cola muestra plan, meses, monto y el comprobante', await evaluar(`(() => { const li = ${filaPago}; return li.innerText.includes('Emprendedor') && li.innerText.includes('3 meses') && li.innerText.includes('Bs 117') && !!li.querySelector('img') })()`))
  await captura('m13-05-admin-pagos-escritorio.png')
  await evaluar(`${filaPago}.querySelector('[aria-label^="Aprobar"]').click()`)
  await esperar(`document.body.innerText.includes('Activaste el plan Emprendedor de ' + ${JSON.stringify(nombreDuena)})`, 'aprobar')
  await esperar(`!${filaPago}`, 'lo aprobado sale de la cola') // la cola se vuelve a pedir después del aviso
  await evaluar(`__clic('Tiendas')`)
  await esperar(`!!__campo('Buscar tienda')`, 'pestaña Tiendas')
  await evaluar(`__escribir('Buscar tienda', '${slugDuena}')`)
  await esperar(`document.querySelectorAll('[aria-label=Tiendas] li').length === 1 && document.querySelector('[aria-label=Tiendas]').innerText.includes('Emprendedor hasta el')`, 'la tienda figura con su plan nuevo y vencimiento')
  await captura('m13-06-admin-tiendas-escritorio.png')
  await evaluar(`__clic('Planes')`)
  await esperar(`!!document.querySelector('[aria-label=Planes]')`, 'pestaña Planes')
  ok('los tres planes figuran con su precio', await evaluar(`(() => { const t = document.querySelector('[aria-label=Planes]').innerText; return t.includes('Gratis') && t.includes('Bs 39 por mes') && t.includes('Negocio') })()`))

  // La dueña vuelve: ya tiene el plan y puede seguir creando
  await evaluar(`__clic('Cerrar sesión')`)
  await esperar(`location.pathname === '/bienvenida'`, 'sale el administrador')
  await ir('/ingresar')
  await esperar(`!!__campo('Email')`, 'ingresar como dueña')
  await evaluar(`__escribir('Email', '${email}')`)
  await evaluar(`__escribir('Contraseña', '${password}')`)
  await evaluar(`__clic('Entrar')`)
  await esperar(`document.querySelector('h1')?.textContent === 'Hola, Andrea'`, 'la dueña entra')
  await ir('/mi-plan')
  await esperar(`document.body.innerText.includes('Plan Emprendedor') && document.body.innerText.includes('Vigente hasta')`, 'Mi plan ya es Emprendedor')
  ok('ya no hay pedido pendiente y el pago figura aprobado', await evaluar(`!document.body.innerText.includes('Estamos revisando') && document.body.innerText.includes('Aprobado')`))
  ok('ahora sí puede crear más de 15 productos', await evaluar(`import('/src/api/cliente.ts').then(m => m.api.POST('/api/v1/productos', { body: { nombre: 'El dieciséis', descripcion: null, precio: 10, costo: 0, categoriaId: null, visibleEnTienda: true, colores: null, tallas: null, fotoIds: null, controlaStock: false } })).then(r => r.response.status === 201)`))
  await celular()
  await ir('/mi-plan')
  await esperar(`document.body.innerText.includes('Plan Emprendedor')`, 'Mi plan en celular')
  await captura('m13-07-mi-plan-emprendedor-celular.png')

  // 8m. M12 · Conectar Instagram. Con la API apuntando al Meta FALSO (../Hermes/scripts/meta_falso.py en :5099, ver su
  // encabezado) se recorre todo con clics; si no, se verifica que el panel diga que la conexión todavía no está activada.
  await escritorio()
  await ir('/instagram')
  await esperar(`!!document.querySelector('.conexion-ig')`, 'la tarjeta de conexión con Instagram')
  const conexionIg = await evaluar(`import('/src/api/cliente.ts').then(m => m.api.GET('/api/v1/instagram/conexion')).then(r => r.data)`)
  const metaFalso = await fetch('http://localhost:5099/_prueba/pedidos').then(() => true).catch(() => false)
  if (!conexionIg.configurada || !metaFalso) {
    ok('sin app de Meta, el panel dice que la conexión todavía no está activada', await evaluar(`document.querySelector('.conexion-ig').innerText.includes('todavía no está activada')`))
  } else {
    await evaluar(`__clic('Conectar con Instagram')`)
    await esperar(`location.pathname === '/instagram' && document.body.innerText.includes('Tu cuenta quedó conectada')`, 'Instagram (falso) autoriza y vuelve conectada', 20000)
    await esperar(`document.querySelector('.conexion-ig').innerText.includes('Conectada: @tienda.falsa')`, 'la tarjeta muestra la cuenta')
    await fetch('http://localhost:5099/_prueba/publicar', { method: 'POST', body: JSON.stringify({ id: `e2e-${n}`, caption: `Bolso Andino ${n}\nBs 210\n#bolsos`, fotos: 1 }) })
    await evaluar(`__clic('Traer lo nuevo')`)
    // Bajar y procesar la foto lleva unos segundos.
    // El Meta falso guarda lo publicado en corridas anteriores: una tienda nueva lo trae todo la primera vez (cuántos, varía).
    if (!(await esperar(`/Lleg(ó 1 producto|aron \\d+ productos) a la bandeja/.test(document.querySelector('.conexion-ig').innerText)`, 'traer lo nuevo', 30000)))
      console.log('    la tarjeta decía:', JSON.stringify(await evaluar(`document.querySelector('.conexion-ig').innerText`)))
    await esperar(`[...document.querySelectorAll('.fila-venta')].some(li => li.innerText.includes('Bolso Andino ${n}') && li.innerText.includes('Llegó de tu Instagram') && !!li.querySelector('img.borrador-foto'))`, 'el borrador llega con su foto')
    await captura('m12-01-conectada-escritorio.png')
    const filaBolso = `[...document.querySelectorAll('.fila-venta')].find(li => li.innerText.includes('Bolso Andino ${n}'))`
    await evaluar(`[...${filaBolso}.querySelectorAll('a')].find(a => a.textContent.trim() === 'Revisar').click()`)
    await esperar(`__campo('Nombre')?.value === 'Bolso Andino ${n}' && document.querySelectorAll('.galeria-foto img').length === 1`, 'la revisión trae la foto de Instagram')
    const idBolso = await evaluar('location.pathname.split("/").pop()')
    ok('la revisión enlaza a la publicación', await evaluar(`!!document.querySelector('a[href^="https://www.instagram.com/p/"]')`))
    // Salir sin publicar NO borra la foto del borrador (es suya, no una subida a medio guardar).
    await ir('/instagram')
    await esperar(`!!document.querySelector('.conexion-ig')`, 'de vuelta en la bandeja')
    await dormir(800)
    await ir(`/instagram/revisar/${idBolso}`)
    await esperar(`__campo('Nombre')?.value === 'Bolso Andino ${n}' && document.querySelectorAll('.galeria-foto img').length === 1`, 'la foto sigue ahí al volver')
    ok('la foto del borrador sigue existiendo en el servidor', (await evaluar(`__estado(document.querySelector('.galeria-foto img').src)`)) === 200)
    await evaluar(`__clic('Guardar producto')`)
    await esperar(`document.body.innerText.includes('¡Guardado!')`, 'publicar el borrador de Instagram')
    ok('el producto quedó con la foto de Instagram', await evaluar(`import('/src/api/cliente.ts').then(m => m.api.GET('/api/v1/productos', { params: { query: { Buscar: 'Bolso Andino ${n}' } } })).then(r => !!r.data.items[0]?.portada)`))
    await ir('/instagram')
    await esperar(`!!document.querySelector('.conexion-ig')`, 'Desde Instagram')
    await evaluar(`__clic('Desconectar')`)
    await esperar(`document.body.innerText.includes('Desconectaste tu cuenta')`, 'desconectar')
  }

  // 8l. Carrito de la tienda pública → Pedidos del panel (el cliente pide en el sitio público; la dueña entrega y cobra)
  await escritorio()
  const pulsera = await evaluar(`import('/src/api/cliente.ts').then(m => m.api.POST('/api/v1/productos', { body: { nombre: 'Pulsera del carrito', descripcion: null, precio: 75, costo: 30, categoriaId: null, visibleEnTienda: true, colores: null, tallas: null, fotoIds: null, controlaStock: false } })).then(r => r.data.variantes[0].id)`)
  const pedidoCliente = await fetch(`http://localhost:5014/${slugDuena}/pedido`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claveIdempotencia: crypto.randomUUID(), articulos: [{ varianteId: pulsera, unidades: 2 }], nombre: 'Cliente E2E', celular: '70000001', entrega: 'Envio', direccion: 'Calle Falsa 123', sitio: '' }),
  })
  const enviado = await pedidoCliente.json()
  ok('el sitio público recibe el pedido del carrito (201) con su enlace de WhatsApp', pedidoCliente.status === 201 && enviado.whatsapp.startsWith('https://wa.me/591'))
  await ir('/')
  await esperar(`!!document.querySelector('.menu-insignia')`, 'el menú avisa el pedido nuevo')
  await esperar(`document.body.innerText.includes('de tu tienda esperando')`, 'el Inicio carga el aviso del pedido')
  ok('el Inicio avisa el pedido esperando', await evaluar(`document.body.innerText.includes('pedido de tu tienda esperando') || document.body.innerText.includes('pedidos de tu tienda esperando')`))
  await evaluar(`__clic('Pedidos')`)
  await esperar(`location.pathname === '/pedidos' && document.body.innerText.includes('#${enviado.numero} · Cliente E2E')`, 'el pedido aparece en Pedidos')
  await captura('pedidos-01-lista-escritorio.png')
  await evaluar(`document.querySelector('[aria-label="Ver el pedido #${enviado.numero} de Cliente E2E"]').click()`)
  await esperar(`!!document.querySelector('dialog[open]') && document.querySelector('dialog[open]').innerText.includes('Calle Falsa 123')`, 'el detalle muestra la entrega')
  ok('el detalle trae las líneas, el total y el botón para escribirle', await evaluar(`(() => { const d = document.querySelector('dialog[open]'); return d.innerText.includes('2 × Pulsera del carrito') && d.innerText.includes('Bs 150') && !!d.querySelector('a[href^="https://wa.me/59170000001"]') })()`))
  await captura('pedidos-02-detalle-escritorio.png')
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Entregar y cobrar').click()`)
  await esperar(`!!__botonEn(document.querySelector('dialog[open]'), 'Registrar venta')`, 'paso de cobro')
  await evaluar(`[...document.querySelectorAll('dialog[open] .chip')].find(b => b.textContent.trim() === 'QR').click()`)
  await evaluar(`__botonEn(document.querySelector('dialog[open]'), 'Registrar venta').click()`)
  await esperar(`document.body.innerText.includes('entregado: la venta quedó registrada')`, 'entregar registra la venta')
  await esperar(`!document.querySelector('.menu-insignia')`, 'la insignia del menú se apaga al atenderlo')
  ok('la venta del pedido figura en Ventas', await evaluar(`import('/src/api/cliente.ts').then(m => m.api.GET('/api/v1/ventas', { params: { query: { Limite: 5 } } })).then(r => r.data.items.some(v => v.cliente === 'Cliente E2E' && v.total === 150))`))

  // 9. Cerrar sesión (Mi tienda, celular)
  await celular()
  await ir('/mi-tienda')
  await esperar(`document.body.innerText.includes('${email}')`, 'Mi tienda muestra la cuenta')
  await captura('m1-06-mi-tienda-celular.png')
  await evaluar(`__clic('Cerrar sesión')`)
  await esperar(`location.pathname === '/bienvenida'`, 'cerrar sesión → bienvenida')
  await recargar()
  await dormir(1500)
  ok('tras cerrar sesión y recargar, no vuelve a entrar', (await ruta()) === '/bienvenida')

  // 10. Ingresar: error claro y luego entrada correcta
  await ir('/ingresar')
  await esperar(`!!__campo('Email')`, 'pantalla Ingresar')
  await evaluar(`__escribir('Email', '${email}')`)
  await evaluar(`__escribir('Contraseña', 'otra12345')`)
  await evaluar(`__clic('Entrar')`)
  await esperar(`document.querySelector('[role=alert]')?.textContent === 'Email o contraseña incorrectos.'`, 'contraseña mala muestra el error del backend')
  ok('error de login visible', (await texto()).includes('Email o contraseña incorrectos.'))
  await captura('m1-07-ingresar-error-celular.png')
  await evaluar(`__escribir('Contraseña', '${password}')`)
  await evaluar(`__clic('Entrar')`)
  await esperar(`document.querySelector('h1')?.textContent === 'Hola, Andrea'`, 'login correcto → Inicio')

  // 11. Con sesión, /ingresar redirige al panel; ruta inexistente → 404
  await ir('/ingresar')
  await esperar(`location.pathname === '/'`, 'con sesión /ingresar → /')
  await ir('/no-existe')
  await esperar(`document.body.innerText.includes('No encontramos esta página')`, 'ruta inexistente → página 404')

  // 12. Términos y privacidad: se ven con sesión (y sin ella, desde el registro)
  await ir('/terminos')
  await esperar(`document.querySelector('h1')?.textContent === 'Términos de uso'`, 'términos de uso')
  await ir('/privacidad')
  await esperar(`document.querySelector('h1')?.textContent === 'Política de privacidad'`, 'política de privacidad')
  ok('la privacidad explica qué pasa con los datos de los clientes de los pedidos', (await texto()).includes('De los clientes que te hacen pedidos'))
  ok('ningún texto legal menciona "hermes"', !/hermes/i.test(await texto()))
  await captura('legal-privacidad-celular.png')

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
