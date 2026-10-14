// Prueba de punta a punta del front con Edge headless vía Chrome DevTools Protocol (sin
// dependencias: Node 24 trae WebSocket). Necesita la API (perfil http) y `pnpm dev` corriendo.
// Uso: pnpm e2e [carpeta-de-capturas]   (por defecto ../Hermes/docs/capturas)
// Cubre M1 (sesión y armazón). Cada módulo nuevo agrega sus pasos acá.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const salida = process.argv[2] ?? '../Hermes/docs/capturas'
mkdirSync(salida, { recursive: true })
const BASE = 'http://localhost:5173'
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const esperar = async (expr, desc, ms = 10000) => {
  const fin = Date.now() + ms
  while (Date.now() < fin) { try { if (await evaluar(expr)) return true } catch {} ; await dormir(150) }
  ok(`${desc} (no pasó en ${ms} ms)`, false)
  return false
}
const ir = async (ruta) => { await cdp('Page.navigate', { url: BASE + ruta }); await dormir(300) }
const ruta = () => evaluar('location.pathname')
const texto = () => evaluar('document.body.innerText')
const captura = async (nombre) => {
  await dormir(350) // fuentes y transiciones
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(join(salida, nombre), Buffer.from(data, 'base64'))
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
  await esperar(`location.pathname === '/bienvenida'`, 'sin sesión /catalogo → /bienvenida')
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
  await captura('m1-02-registro-celular.png')

  // 3. Crear cuenta → Inicio
  await evaluar(`__clic('Crear mi cuenta')`)
  await esperar(`document.querySelector('h1')?.textContent === 'Hola, Andrea'`, 'registro → Inicio con saludo')
  ok('registro entra al Inicio', (await ruta()) === '/')
  await esperar(`document.body.innerText.includes('Tu cuenta está lista')`, 'el Inicio de una tienda sin actividad muestra los primeros pasos')
  const t = await texto()
  ok('Inicio muestra la tienda y su dirección', t.includes(`Ñandú Accesorios ${n}`) && t.includes(`/nandu-accesorios-${n}`))
  ok('ningún texto visible menciona "hermes"', !/hermes/i.test(t) && !/hermes/i.test(await evaluar('document.title')))
  await captura('m1-03-inicio-celular.png')

  // 4. Recargar: la sesión sigue (cookie HttpOnly + refresh)
  await cdp('Page.reload')
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

  await evaluar(`__escribir('WhatsApp donde recibís los pedidos', '12345')`)
  await esperar(`__campo('WhatsApp donde recibís los pedidos').getAttribute('aria-invalid') === 'true'`, 'WhatsApp inválido se marca')
  ok('WhatsApp inválido: aviso y Guardar desactivado',
    (await texto()).includes('8 dígitos que empiecen con 6 o 7') && await evaluar(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Guardar cambios').disabled`))

  await evaluar(`__escribir('Nombre de la tienda', 'Luna ${n}')`)
  await evaluar(`__escribir('Descripción corta', 'Accesorios hechos a mano · Cochabamba')`)
  await evaluar(`__escribir('WhatsApp donde recibís los pedidos', '712 34567')`)
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

  await cdp('Page.reload')
  await esperar(`__campo('Nombre de la tienda')?.value === 'Luna ${n}'`, 'tras recargar, el nombre guardado sigue')
  ok('persiste la descripción', (await evaluar(`__campo('Descripción corta').value`)) === 'Accesorios hechos a mano · Cochabamba')
  ok('persiste el WhatsApp (solo los 8 dígitos, el +591 va fijo)', (await evaluar(`__campo('WhatsApp donde recibís los pedidos').value`)) === '71234567')
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
  await esperar(`location.pathname === '/catalogo/nuevo'`, 'Producto → formulario nuevo')
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
  await cdp('Page.reload')
  await esperar(`__campo('Precio')?.value === '200'`, 'el cambio persiste tras recargar')
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
  await esperar(`!!document.querySelector('.resumen-stock') && !!document.querySelector('.medidor')`, 'el Inicio con actividad muestra el resumen y el medidor')
  const resumenInicio = await evaluar(`document.querySelector('.resumen-stock').innerText`)
  ok('el resumen del mes suma lo vendido (2 ventas vigentes, la anulada no cuenta: Bs 660)', resumenInicio.includes('Bs 660') && resumenInicio.includes('2 ventas'))
  ok('avisa las unidades sin costo cargado', resumenInicio.includes('unidades sin costo cargado'))
  ok('sin gastos explica qué hacer', await evaluar(`document.querySelector('.medidor').innerText.includes('Todavía no anotaste gastos este mes')`))
  ok('«Para atender» trae los productos para reponer', await evaluar(`(() => { const t = document.body.innerText; return t.includes('Para reponer') && t.includes('Agotado') && !!document.querySelector('a[href="/stock?vista=areponer"]') })()`))
  ok('«Lo último que pasó» mezcla ventas y compras', await evaluar(`(() => { const t = document.querySelector('.recientes').innerText; return t.includes('Vendiste') && t.includes('Compraste a Cueros Don Beto') })()`))
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
  ok('dice cuánto gastaste y que cubriste 0 % (todo se vendió sin costo cargado)', await evaluar(`(() => { const t = document.querySelector('.medidor').innerText; return t.includes('Gastaste Bs 800') && t.includes('cubriste el 0 %') && t.includes('Te faltan Bs 800') })()`))
  ok('el medidor es una barra de progreso accesible', await evaluar(`document.querySelector('.medidor-barra').getAttribute('role') === 'progressbar' && document.querySelector('.medidor-barra').getAttribute('aria-valuenow') === '0'`))
  ok('lo último incluye el gasto', await evaluar(`document.querySelector('.recientes').innerText.includes('Gastaste en Alquiler')`))
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

  // 9. Cerrar sesión (Mi tienda, celular)
  await celular()
  await ir('/mi-tienda')
  await esperar(`document.body.innerText.includes('${email}')`, 'Mi tienda muestra la cuenta')
  await captura('m1-06-mi-tienda-celular.png')
  await evaluar(`__clic('Cerrar sesión')`)
  await esperar(`location.pathname === '/bienvenida'`, 'cerrar sesión → bienvenida')
  await cdp('Page.reload')
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
