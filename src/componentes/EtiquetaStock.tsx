import type { EstadoStock } from '../api/cliente'

const textos: Record<EstadoStock, string> = {
  Agotado: 'Agotado',
  Pocos: 'Por agotarse',
  Ok: 'Bien',
  SinControl: 'Por encargo',
}

// El estado lo calcula el SERVIDOR (ReglaStock): acá solo se muestra.
export function EtiquetaStock({ estado }: { estado: EstadoStock }) {
  return <span className={`etiqueta-stock etiqueta-stock-${estado.toLowerCase()}`}>{textos[estado]}</span>
}
