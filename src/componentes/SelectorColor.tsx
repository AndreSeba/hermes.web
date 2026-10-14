import { useId } from 'react'
import { coloresDeTienda } from '../util/color'

type Props = {
  etiqueta: string
  valor: string // "#RRGGBB"
  alCambiar: (hex: string) => void
}

// Los 5 colores del prototipo y un sexto "Otro" que abre el selector del sistema.
export function SelectorColor({ etiqueta, valor, alCambiar }: Props) {
  const idTitulo = useId()
  const actual = valor.toUpperCase()
  const esPropio = !coloresDeTienda.some((c) => c.hex === actual)

  return (
    <div className="campo">
      <span id={idTitulo} className="campo-etiqueta">
        {etiqueta}
      </span>
      <div role="group" aria-labelledby={idTitulo} className="colores">
        {coloresDeTienda.map((c) => (
          <button
            key={c.hex}
            type="button"
            className="color-muestra"
            style={{ background: c.hex }}
            aria-label={c.nombre}
            aria-pressed={actual === c.hex}
            onClick={() => alCambiar(c.hex)}
          />
        ))}
        <label className="color-muestra color-otro" data-activo={esPropio} style={esPropio ? { background: actual } : undefined}>
          <span className="sr-only">Otro color</span>
          <input type="color" value={actual} onChange={(e) => alCambiar(e.target.value.toUpperCase())} />
          {!esPropio && <span aria-hidden="true">+</span>}
        </label>
      </div>
    </div>
  )
}
