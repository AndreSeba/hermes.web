import type { Venta } from '../api/cliente'
import { bs } from './dinero'
import { nombreDePago } from '../paginas/ventas/pagos'

// Ticket de una venta para impresora térmica (58 o 80 mm) usando la impresión del navegador: sin instalar nada.
// Se arma en un iframe oculto para no tocar la pantalla del panel. Más adelante, impresión directa (ESC/POS).

export type AnchoTicket = 58 | 80

const CLAVE_ANCHO = 'ticket.ancho'

export function anchoGuardado(): AnchoTicket {
  try {
    return localStorage.getItem(CLAVE_ANCHO) === '80' ? 80 : 58
  } catch {
    return 58
  }
}

export function guardarAncho(ancho: AnchoTicket) {
  try {
    localStorage.setItem(CLAVE_ANCHO, String(ancho))
  } catch {
    /* sin almacenamiento: se usa 58 mm la próxima vez */
  }
}

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const fila = (izquierda: string, derecha: string, fuerte = false) =>
  `<div class="fila${fuerte ? ' fuerte' : ''}"><span>${escapar(izquierda)}</span><span>${escapar(derecha)}</span></div>`

export function htmlDelTicket(venta: Venta, tienda: string, ancho: AnchoTicket): string {
  const fecha = new Date(venta.fecha).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })
  const lineas = venta.lineas
    .map(
      (l) =>
        `<div class="linea">${escapar(`${l.cantidad} x ${l.descripcion}`)}</div>` +
        fila(`  ${bs(l.precioUnitario)} c/u`, bs(l.subtotal)),
    )
    .join('')
  const pagos = venta.pagos ?? [{ metodo: venta.metodoPago, monto: venta.total }]
  const detallePago = pagos.map((p) => fila(nombreDePago(p.metodo), bs(p.monto))).join('')
  const efectivo =
    venta.efectivoRecibido != null
      ? fila('Recibido', bs(venta.efectivoRecibido)) + fila('Cambio', bs(venta.cambio ?? 0), true)
      : ''

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title><style>
@page { size: ${ancho}mm auto; margin: 2mm; }
* { box-sizing: border-box; }
body { margin: 0; width: ${ancho - 4}mm; font: ${ancho === 58 ? 11 : 13}px/1.35 "Courier New", monospace; color: #000; }
.centro { text-align: center; }
.tienda { font-weight: bold; font-size: 1.25em; }
.fila { display: flex; justify-content: space-between; gap: 6px; white-space: pre; }
.fuerte { font-weight: bold; }
.linea { margin-top: 3px; word-break: break-word; }
hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
</style></head><body>
<div class="centro tienda">${escapar(tienda)}</div>
<div class="centro">${escapar(fecha)}</div>
${venta.cliente ? `<div class="centro">Cliente: ${escapar(venta.cliente)}</div>` : ''}
<hr>
${lineas}
<hr>
${fila('TOTAL', bs(venta.total), true)}
${detallePago}
${efectivo}
<hr>
<div class="centro">Gracias por tu compra</div>
</body></html>`
}

// Abre el diálogo de impresión del navegador con el ticket. El iframe se saca solo al terminar.
export function imprimirTicket(venta: Venta, tienda: string, ancho: AnchoTicket = anchoGuardado()) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const documento = iframe.contentDocument
  if (!documento || !iframe.contentWindow) {
    iframe.remove()
    return
  }
  documento.open()
  documento.write(htmlDelTicket(venta, tienda, ancho))
  documento.close()
  const ventana = iframe.contentWindow
  ventana.onafterprint = () => iframe.remove()
  // Espera un instante a que el iframe pinte antes de imprimir.
  setTimeout(() => {
    ventana.focus()
    ventana.print()
    setTimeout(() => iframe.remove(), 60_000)
  }, 150)
}
