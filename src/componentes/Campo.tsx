import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icono } from './Icono'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string
  ayuda?: ReactNode
  // Antepuesto al campo, por ejemplo la base de la dirección de la tienda.
  prefijo?: string
}

// Etiqueta + campo + ayuda, siempre asociados (accesible aunque el diseño cambie).
// Un campo de contraseña trae su botón "Mostrar".
export function Campo({ etiqueta, ayuda, prefijo, type = 'text', ...resto }: Props) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const esClave = type === 'password'

  return (
    <div className="campo">
      <label htmlFor={id} className="campo-etiqueta">
        {etiqueta}
      </label>
      <div className="campo-caja">
        {prefijo && <span className="campo-prefijo">{prefijo}</span>}
        <input
          id={id}
          type={esClave && visible ? 'text' : type}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          className="campo-input"
          {...resto}
        />
        {esClave && (
          <button
            type="button"
            className="campo-accion"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
          >
            <Icono nombre="ojo" />
          </button>
        )}
      </div>
      {ayuda && (
        <p id={`${id}-ayuda`} className="campo-ayuda">
          {ayuda}
        </p>
      )}
    </div>
  )
}
