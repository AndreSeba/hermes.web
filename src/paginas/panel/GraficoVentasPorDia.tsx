import { useState } from 'react'
import type { components } from '../../api/esquema'
import { bs } from '../../util/dinero'

type Dia = components['schemas']['VentaDiaDto']

// "2026-10-12" → una fecha local (sin pasar por UTC: new Date("2026-10-12") caería en el día anterior en Bolivia).
const fechaLocal = (texto: string) => {
  const [a, m, d] = texto.split('-').map(Number)
  return new Date(a!, m! - 1, d)
}
const letras = (f: Date) => new Intl.DateTimeFormat('es-BO', { weekday: 'short' }).format(f).replace('.', '').slice(0, 2).toLowerCase()
const mesCorto = (f: Date) => new Intl.DateTimeFormat('es-BO', { month: 'short' }).format(f).replace('.', '')

// Barras de lo vendido en cada uno de los últimos días, con una línea punteada en el promedio. Tocar (o pasar el mouse / foco)
// una barra muestra el día y el monto arriba a la derecha; por defecto, el de hoy.
export function GraficoVentasPorDia({ dias }: { dias: Dia[] }) {
  const [elegido, setElegido] = useState<number | null>(null)
  const maximo = Math.max(...dias.map((d) => d.total), 0)
  const promedio = dias.length ? dias.reduce((s, d) => s + d.total, 0) / dias.length : 0
  const activo = elegido ?? dias.length - 1
  const actual = dias[activo]
  const fecha = actual ? fechaLocal(actual.fecha) : null

  return (
    <section className="tarjeta grafico" aria-labelledby="grafico-titulo">
      <div className="grafico-cabecera">
        <h2 id="grafico-titulo" className="titulo-seccion">
          Ventas por día · últimas {Math.round(dias.length / 7) === 2 ? '2 semanas' : `${dias.length} días`}
        </h2>
        {actual && fecha && (
          <span className="texto-suave texto-chico" aria-live="polite">
            {letras(fecha)} {fecha.getDate()} {mesCorto(fecha)}: {bs(actual.total)}
          </span>
        )}
      </div>

      {maximo === 0 ? (
        <p className="texto-suave grafico-vacio">Todavía no hay ventas en estos días. Apenas vendas, las ves acá.</p>
      ) : (
        <div className="grafico-barras" role="group" aria-label="Ventas de cada día">
          {promedio > 0 && <span className="grafico-promedio" style={{ bottom: `calc(28px + (100% - 28px) * ${promedio / maximo})` }} aria-hidden="true" />}
          {dias.map((d, i) => {
            const f = fechaLocal(d.fecha)
            return (
              <button
                key={d.fecha}
                type="button"
                className="grafico-columna"
                aria-pressed={i === activo}
                aria-label={`${letras(f)} ${f.getDate()} ${mesCorto(f)}: ${bs(d.total)}`}
                onMouseEnter={() => setElegido(i)}
                onFocus={() => setElegido(i)}
                onClick={() => setElegido(i)}
                onMouseLeave={() => setElegido(null)}
              >
                <span className="grafico-pista">
                  <span className="grafico-barra" style={{ height: `${d.total > 0 ? Math.max(4, (d.total / maximo) * 100) : 0}%` }} />
                </span>
                <span className={`grafico-dia${i === dias.length - 1 ? ' grafico-dia-hoy' : ''}`}>{letras(f)}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
