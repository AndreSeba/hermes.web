import { useId, type TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  etiqueta: string
  ayuda?: string
  // Con `maxLength` muestra "12/500" para que no se corte el texto sin avisar.
  value: string
}

export function AreaTexto({ etiqueta, ayuda, value, maxLength, rows = 3, ...resto }: Props) {
  const id = useId()
  return (
    <div className="campo">
      <label htmlFor={id} className="campo-etiqueta">
        {etiqueta}
      </label>
      <div className="campo-caja campo-caja-alta">
        <textarea
          id={id}
          className="campo-input campo-area"
          value={value}
          rows={rows}
          maxLength={maxLength}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          {...resto}
        />
      </div>
      <p id={`${id}-ayuda`} className="campo-ayuda campo-ayuda-fila">
        <span>{ayuda}</span>
        {maxLength && (
          <span aria-hidden="true">
            {value.length}/{maxLength}
          </span>
        )}
      </p>
    </div>
  )
}
