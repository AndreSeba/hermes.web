import { Icono } from '../../componentes/Icono'

// La persona no tiene permiso para nada del panel (por ejemplo un rol sin permisos o desactivado a medias).
export function SinAcceso() {
  return (
    <div className="pagina">
      <section className="tarjeta vacio-inicial">
        <span className="icono-caja" aria-hidden="true">
          <Icono nombre="equipo" tamano={22} />
        </span>
        <h2 className="titulo-seccion">No tenés acceso a esta pantalla</h2>
        <p className="texto-suave">Pedile a quien administra el negocio que te dé los permisos que necesitás.</p>
      </section>
    </div>
  )
}
