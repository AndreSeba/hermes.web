import type { Movimiento } from '../../api/cliente'

// Mismo texto que usa el servidor cuando la dueña no escribe un motivo (StockService.MotivoPorDefecto):
// no se repite en el historial porque no dice nada.
const MOTIVO_POR_DEFECTO = 'Corrección de stock'

export function etiquetaDeVariante(v: { color: string | null; talla: string | null }) {
  return [v.color, v.talla].filter(Boolean).join(' · ')
}

// "Hoy", "Ayer" o "8 oct", según el día en la zona horaria de quien mira.
export function cuando(iso: string, ahora = new Date()) {
  const fecha = new Date(iso)
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((dia(ahora) - dia(fecha)) / 86_400_000)
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  return new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short' }).format(fecha).replace('.', '')
}

// Lo que pasó, en lenguaje de todos los días ("Llegaron 4 (Negro)", "Corregiste a 5 · Dañado").
// `conVariantes`: solo se aclara la variante si el producto tiene más de una.
export function descripcion(m: Movimiento, conVariantes: boolean) {
  const variante = conVariantes ? etiquetaDeVariante(m) : ''
  const sufijo = variante ? ` (${variante})` : ''
  switch (m.tipo) {
    case 'Ingreso':
      return `Llegaron ${m.cantidad}${sufijo}`
    case 'Venta':
      return `Vendiste ${-m.cantidad}${sufijo}`
    case 'Devolucion':
      return `Devolvieron ${m.cantidad}${sufijo}`
    case 'Reversion':
      return `Se anuló una compra: restaron ${-m.cantidad}${sufijo}`
    case 'Ajuste': {
      const motivo = m.nota && m.nota !== MOTIVO_POR_DEFECTO ? ` · ${m.nota}` : ''
      return `Corregiste a ${m.saldo}${sufijo}${motivo}`
    }
  }
}
