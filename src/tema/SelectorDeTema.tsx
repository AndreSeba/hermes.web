import { useState } from 'react'
import { Icono } from '../componentes/Icono'
import { ACENTOS, guardarTema, leerTema, type Modo } from './tema'

const MODOS: { id: Modo; nombre: string }[] = [
  { id: 'auto', nombre: 'Automático' },
  { id: 'claro', nombre: 'Claro' },
  { id: 'oscuro', nombre: 'Oscuro' },
]

// Elegir cómo se ve el panel. Se aplica y se guarda al tocar (no hay botón de guardar).
export function SelectorDeTema() {
  const [tema, setTema] = useState(leerTema)

  function cambiar(cambios: Partial<typeof tema>) {
    const nuevo = { ...tema, ...cambios }
    setTema(nuevo)
    guardarTema(nuevo)
  }

  return (
    <div className="selector-tema">
      <div role="group" aria-label="Modo">
        <span className="selector-tema-titulo">Modo</span>
        <div className="chips">
          {MODOS.map((m) => (
            <button key={m.id} type="button" className="chip" aria-pressed={tema.modo === m.id} onClick={() => cambiar({ modo: m.id })}>
              {m.nombre}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Color del panel">
        <span className="selector-tema-titulo">Color</span>
        <div className="selector-tema-colores">
          {ACENTOS.map((a) => (
            <button
              key={a.id}
              type="button"
              className="muestra-color"
              style={{ background: a.base }}
              aria-pressed={tema.acento === a.id}
              aria-label={a.nombre}
              title={a.nombre}
              onClick={() => cambiar({ acento: a.id })}
            >
              {tema.acento === a.id && <Icono nombre="ok" tamano={18} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
