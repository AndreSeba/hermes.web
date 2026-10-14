import type { EstadoPrecio } from '../api/cliente'
import { bs } from '../util/dinero'

// Cuánto deja el producto. El estado y la ganancia los calcula el SERVIDOR (MargenProducto): acá solo
// se muestran, así la regla (Pierde / Bajo / Ok) vive en un único lugar.
export function EtiquetaMargen({ estado, ganancia }: { estado: EstadoPrecio; ganancia: number }) {
  const texto =
    estado === 'SinCosto'
      ? 'Cargá tu costo'
      : estado === 'Pierde'
        ? ganancia === 0
          ? 'No ganás nada'
          : `Perdés ${bs(Math.abs(ganancia))}`
        : estado === 'Bajo'
          ? `Ganás solo ${bs(ganancia)}`
          : `Ganás ${bs(ganancia)}`
  return <span className={`etiqueta etiqueta-${estado.toLowerCase()}`}>{texto}</span>
}
