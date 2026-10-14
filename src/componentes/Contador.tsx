import { useId } from 'react'
import { soloEnteros } from '../util/dinero'

type Props = {
  etiqueta: string // lo que dice el lector de pantalla ("Cantidad de café")
  valor: string // texto del campo: se puede escribir directamente
  alCambiar: (valor: string) => void
  maximo?: number
  invalido?: boolean
}

// − [número] +: para cantidades enteras. Se puede escribir (desde el celular es lo más rápido para 40) o
// tocar − / +. El texto se guarda tal cual; quien lo usa decide si es válido (`soloEnteros`).
export function Contador({ etiqueta, valor, alCambiar, maximo = 1_000_000, invalido }: Props) {
  const id = useId()
  const actual = soloEnteros(valor) ?? 0
  const mover = (delta: number) => alCambiar(String(Math.min(maximo, Math.max(0, actual + delta))))

  return (
    <div className="contador" role="group" aria-labelledby={id}>
      <span id={id} className="sr-only">
        {etiqueta}
      </span>
      <button type="button" className="contador-boton" onClick={() => mover(-1)} disabled={actual <= 0} aria-label="Uno menos">
        −
      </button>
      <input
        className="contador-campo"
        inputMode="numeric"
        value={valor}
        placeholder="0"
        aria-label={etiqueta}
        aria-invalid={invalido}
        onChange={(e) => alCambiar(e.target.value.replace(/[^\d]/g, ''))}
      />
      <button type="button" className="contador-boton contador-mas" onClick={() => mover(1)} aria-label="Uno más">
        +
      </button>
    </div>
  )
}
