import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { api } from '../api/cliente'
import { Icono } from '../componentes/Icono'
import { useSesion, useSesionActiva } from '../sesion/contexto'
import { iniciales } from '../util/texto'
import { nuevaVenta, PEDIDOS_CAMBIARON, secciones, seccionesCelular } from './secciones'

// Escritorio: menú lateral. Celular: barra inferior con el botón central de venta.
// Las dos navegaciones están en el DOM y el CSS muestra una u otra (ver .menu-lateral / .barra-inferior).
// La identidad que se ve es la de la TIENDA del usuario, nunca un nombre de producto (ver marca.ts).
export function Armazon() {
  const { usuario, tienda } = useSesionActiva()
  const { salir } = useSesion()
  const ubicacion = useLocation()
  const [pedidos, setPedidos] = useState(0)

  // Cuántos pedidos esperan (insignia del menú). Se vuelve a preguntar al cambiar de pantalla y cuando la pantalla de
  // Pedidos avisa que atendió uno (evento PEDIDOS_CAMBIARON).
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const alCambiar = () => setRevision((n) => n + 1)
    window.addEventListener(PEDIDOS_CAMBIARON, alCambiar)
    return () => window.removeEventListener(PEDIDOS_CAMBIARON, alCambiar)
  }, [])
  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/pedidos/resumen')
      .then(({ data }) => !cancelado && data && setPedidos(data.nuevos + data.confirmados))
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [ubicacion.pathname, revision])

  return (
    <div className="armazon">
      <aside className="menu-lateral">
        <div className="menu-tienda">
          <span className="avatar" aria-hidden="true">
            {iniciales(tienda.nombre)}
          </span>
          <span className="menu-tienda-nombre">{tienda.nombre}</span>
        </div>

        <NavLink to={nuevaVenta.ruta} className="boton boton-primario">
          <Icono nombre="mas" tamano={18} />
          {nuevaVenta.titulo}
        </NavLink>

        <nav aria-label="Menú principal" className="menu-enlaces">
          {secciones.map((s) => (
            <NavLink key={s.ruta} to={s.ruta} end={s.ruta === '/'} className="menu-enlace">
              <Icono nombre={s.icono} />
              {s.titulo}
              {s.ruta === '/pedidos' && pedidos > 0 && (
                <span className="menu-insignia" aria-label={`${pedidos} por atender`}>
                  {pedidos}
                </span>
              )}
            </NavLink>
          ))}
          {usuario.esAdmin && (
            <NavLink to="/admin" className="menu-enlace">
              <Icono nombre="precios" />
              Administración
            </NavLink>
          )}
        </nav>

        <div className="menu-usuario">
          <span className="menu-usuario-datos">
            <span className="menu-usuario-nombre">{usuario.nombre}</span>
            <span className="menu-usuario-email">{usuario.email}</span>
          </span>
          <button type="button" className="boton-icono" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión">
            <Icono nombre="salir" />
          </button>
        </div>
      </aside>

      <main className="contenido">
        <Outlet />
      </main>

      <nav aria-label="Navegación principal" className="barra-inferior">
        {seccionesCelular.slice(0, 2).map((ruta) => (
          <EnlaceBarra key={ruta} ruta={ruta} />
        ))}
        <NavLink to={nuevaVenta.ruta} className="barra-venta" aria-label={nuevaVenta.titulo}>
          <Icono nombre="mas" tamano={26} />
        </NavLink>
        {seccionesCelular.slice(2).map((ruta) => (
          <EnlaceBarra key={ruta} ruta={ruta} />
        ))}
      </nav>
    </div>
  )
}

function EnlaceBarra({ ruta }: { ruta: string }) {
  const s = secciones.find((x) => x.ruta === ruta)!
  return (
    <NavLink to={s.ruta} end={s.ruta === '/'} className="barra-enlace">
      <Icono nombre={s.icono} tamano={22} />
      {s.titulo}
    </NavLink>
  )
}
