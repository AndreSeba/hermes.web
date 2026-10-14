import { useId } from 'react'

type Props = {
  etiqueta: string
  ayuda?: string
  activo: boolean
  alCambiar: (activo: boolean) => void
}

// Encendido/apagado con texto. Es un botón con role="switch": se maneja con teclado y los lectores de
// pantalla dicen "activado/desactivado". No usar un div clickeable.
export function Interruptor({ etiqueta, ayuda, activo, alCambiar }: Props) {
  const idAyuda = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-describedby={ayuda ? idAyuda : undefined}
      className="interruptor"
      onClick={() => alCambiar(!activo)}
    >
      <span className="interruptor-texto">
        <strong>{etiqueta}</strong>
        {ayuda && <span id={idAyuda}>{ayuda}</span>}
      </span>
      <span className="interruptor-pista" aria-hidden="true">
        <span className="interruptor-bola" />
      </span>
    </button>
  )
}
