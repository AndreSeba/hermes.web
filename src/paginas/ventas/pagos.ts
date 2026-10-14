import type { MetodoPago } from '../../api/cliente'

export const metodosDePago: { id: MetodoPago; etiqueta: string }[] = [
  { id: 'Efectivo', etiqueta: 'Efectivo' },
  { id: 'Qr', etiqueta: 'QR' },
  { id: 'Tarjeta', etiqueta: 'Tarjeta' },
  { id: 'Transferencia', etiqueta: 'Transf.' },
]

export const nombreDePago = (id: MetodoPago) => metodosDePago.find((m) => m.id === id)?.etiqueta ?? id

// Cuántas unidades se pueden vender de una vez (el servidor igual valida).
export const MAXIMO_POR_LINEA = 100_000
