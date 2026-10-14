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
  window.__campo = (etiqueta) => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === etiqueta); return l && document.getElementById(l.htmlFor) };
  window.__escribir = (etiqueta, v) => { const el = __campo(etiqueta); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  window.__subirPng = async (color) => { const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 300, 300); g.fillStyle = '#fff'; g.fillRect(100, 100, 100, 100); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'logo.png', { type: 'image/png' })); const i = document.querySelector('input[type=file]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); };
  // cache 'reload' salta la caché del navegador: las fotos se sirven con caché inmutable de un año y sin
  // esto una foto ya borrada seguiría respondiendo 200 desde la copia local. (Sin comillas invertidas
  // acá: todo este bloque es un texto entre comillas invertidas.)
  window.__estado = (url) => fetch(url, { cache: 'reload' }).then(r => r.status);
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
  ok('Catálogo muestra "en construcción"', (await texto()).includes('Estamos construyendo esta sección'))
  ok('la barra marca la sección actual', await evaluar(`document.querySelector('.barra-inferior a[aria-current="page"]')?.textContent.trim() === 'Catálogo'`))
  await captura('m1-04-catalogo-celular.png')
  await evaluar(`__clic('Nueva venta')`)
  await esperar(`location.pathname === '/venta'`, 'botón central → Nueva venta')

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
