import { Icono } from '../../componentes/Icono'
import { secciones } from '../../diseno/secciones'
import { useSesion, useSesionActiva } from '../../sesion/contexto'
import { EnConstruccion } from './EnConstruccion'

// La configuración llega con M3. Mientras tanto muestra los datos de la cuenta y, en el
// celular, es el lugar para cerrar sesión (en escritorio también está en el menú lateral).
export function MiTienda() {
  const { usuario, tienda } = useSesionActiva()
  const { salir } = useSesion()
  const seccion = secciones.find((s) => s.ruta === '/mi-tienda')!

  return (
    <EnConstruccion seccion={seccion}>
      <section className="tarjeta datos-cuenta">
        <h2 className="titulo-seccion">Tu cuenta</h2>
        <dl>
          <div>
            <dt>Negocio</dt>
            <dd>{tienda.nombre}</dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>/{tienda.slug}</dd>
          </div>
          <div>
            <dt>Tu nombre</dt>
            <dd>{usuario.nombre}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{usuario.email}</dd>
          </div>
        </dl>
        <button type="button" className="boton boton-secundario" onClick={salir}>
          <Icono nombre="salir" tamano={18} />
          Cerrar sesión
        </button>
      </section>
    </EnConstruccion>
  )
}
