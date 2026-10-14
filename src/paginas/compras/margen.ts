import type { AvisoMargen, Compra } from '../../api/cliente'
import { bs } from '../../util/dinero'

// El estado (Pierde / Bajo) lo decide el servidor: acá solo se escribe en lenguaje de todos los días.
export function textoAvisoMargen(a: AvisoMargen) {
  const ganancia = a.precio - a.costo
  return a.estado === 'Pierde'
    ? `${a.producto}: con el costo nuevo (${bs(a.costo)}) y tu precio (${bs(a.precio)}) perdés ${bs(Math.abs(ganancia))} por unidad.`
    : `${a.producto}: con el costo nuevo (${bs(a.costo)}) ganás poco, ${bs(ganancia)} por unidad.`
}

export const etiquetaEstado: Record<Compra['estado'], string> = {
  EnCamino: 'En camino',
  Recibida: 'Recibida',
  Anulada: 'Anulada',
}
