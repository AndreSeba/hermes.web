import { marca } from '../marca'

// Mientras se averigua si la cookie de sesión sigue valiendo (una fracción de segundo).
export function PantallaCarga() {
  return (
    <div className="pantalla-carga" role="status" aria-live="polite">
      <img className="pantalla-carga-icono" src={marca.icono} alt="" width={64} height={64} />
      <span className="sr-only">Cargando…</span>
      <span className="pantalla-carga-lema" aria-hidden="true">
        {marca.nombre} · {marca.lema}
      </span>
    </div>
  )
}
