import type { ReactNode } from 'react'
import { Icono } from '../../componentes/Icono'
import type { Seccion } from '../../diseno/secciones'

// Lugar reservado para una sección cuyo módulo todavía no está construido (ver docs/PLAN.md).
export function EnConstruccion({ seccion, children }: { seccion: Seccion; children?: ReactNode }) {
  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">{seccion.titulo}</h1>
      </header>
      <section className="tarjeta en-construccion">
        <span className="icono-caja icono-caja-ambar" aria-hidden="true">
          <Icono nombre="obras" tamano={22} />
        </span>
        <div>
          <h2 className="titulo-seccion">Estamos construyendo esta sección</h2>
          <p className="texto-suave">{seccion.descripcion}</p>
        </div>
      </section>
      {children}
    </div>
  )
}
