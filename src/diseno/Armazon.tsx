import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { api } from '../api/cliente'
import { Dialogo } from '../componentes/Dialogo'
import { Icono } from '../componentes/Icono'
import { SelectorDeTema } from '../tema/SelectorDeTema'
import { useSesion, useSesionActiva, usePermisos } from '../sesion/contexto'
import { iniciales } from '../util/texto'
import { nuevaVenta, PEDIDOS_CAMBIARON, respaldoCelular, secciones, seccionesCelular } from './secciones'

// Escritorio: menú lateral. Celular: barra inferior con el botón central de venta.
// Las dos navegaciones están en el DOM y el CSS muestra una u otra (ver .menu-lateral / .barra-inferior).
// La identidad que se ve es la de la TIENDA del usuario, nunca un nombre de producto (ver marca.ts).
export function Armazon() {
  const { usuario, tienda } = useSesionActiva()
  const { salir } = useSesion()
  const { tiene } = usePermisos()
  const visibles = secciones.filter((s) => !s.permiso || tiene(s.permiso))
  const puedeVender = !nuevaVenta.permiso || tiene(nuevaVenta.permiso)
  // Barra del celular: las de siempre que la persona puede ver y, si faltan, las de respaldo (un vendedor no ve el Inicio).
  const rutasCelular = [...seccionesCelular, ...respaldoCelular]
    .filter((ruta) => visibles.some((s) => s.ruta === ruta))
    .slice(0, 3)
  const ubicacion = useLocation()
  const [pedidos, setPedidos] = useState(0)
  const [apariencia, setApariencia] = useState(false)
  const [menuCelular, setMenuCelular] = useState(false)

  // Cuántos pedidos esperan (insignia del menú). Se vuelve a preguntar al cambiar de pantalla y cuando la pantalla de
  // Pedidos avisa que atendió uno (evento PEDIDOS_CAMBIARON).
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const alCambiar = () => setRevision((n) => n + 1)
    window.addEventListener(PEDIDOS_CAMBIARON, alCambiar)
    return () => window.removeEventListener(PEDIDOS_CAMBIARON, alCambiar)
  }, [])
  const veLosPedidos = tiene('pedidos.ver')
  useEffect(() => {
    if (!veLosPedidos) return
    let cancelado = false
    api
      .GET('/api/v1/pedidos/resumen')
      .then(({ data }) => !cancelado && data && setPedidos(data.nuevos + data.confirmados))
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [ubicacion.pathname, revision, veLosPedidos])

  return (
    <div className="armazon">
      <aside className="menu-lateral">
        <div className="menu-tienda">
          <span className="avatar" aria-hidden="true">
            {iniciales(tienda.nombre)}
          </span>
          <span className="menu-tienda-nombre">{tienda.nombre}</span>
        </div>

        {puedeVender && (
          <NavLink to={nuevaVenta.ruta} className="boton boton-primario">
            <Icono nombre="mas" tamano={18} />
            {nuevaVenta.titulo}
          </NavLink>
        )}

        <nav aria-label="Menú principal" className="menu-enlaces">
          {visibles.map((s) => (
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
          <button type="button" className="boton-icono" onClick={() => setApariencia(true)} aria-label="Apariencia" title="Apariencia">
            <Icono nombre="paleta" />
          </button>
          <button type="button" className="boton-icono" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión">
            <Icono nombre="salir" />
          </button>
        </div>
      </aside>

      <main className="contenido">
        <Outlet />
      </main>

      <Dialogo abierto={apariencia} titulo="Apariencia" subtitulo="Cómo se ve tu panel en este dispositivo." alCerrar={() => setApariencia(false)}>
        <SelectorDeTema />
      </Dialogo>

      <nav aria-label="Navegación principal" className="barra-inferior">
        {rutasCelular.slice(0, 2).map((ruta) => (
          <EnlaceBarra key={ruta} ruta={ruta} />
        ))}
        {puedeVender && (
          <NavLink to={nuevaVenta.ruta} className="barra-venta" aria-label={nuevaVenta.titulo}>
            <Icono nombre="mas" tamano={26} />
          </NavLink>
        )}
        {rutasCelular.slice(2).map((ruta) => (
          <EnlaceBarra key={ruta} ruta={ruta} />
        ))}
        <button type="button" className="barra-enlace" aria-haspopup="dialog" onClick={() => setMenuCelular(true)}>
          <Icono nombre="menu" tamano={22} />
          Menú
        </button>
      </nav>

      {/* Todas las secciones en el celular: la barra solo lleva las más usadas. */}
      <Dialogo abierto={menuCelular} titulo="Menú" subtitulo={tienda.nombre} alCerrar={() => setMenuCelular(false)} hoja>
        <nav aria-label="Todas las secciones" className="menu-hoja">
          {[...visibles, ...(usuario.esAdmin ? [{ ruta: '/admin', titulo: 'Administración', icono: 'precios' as const }] : [])].map((s) => (
            <NavLink key={s.ruta} to={s.ruta} end={s.ruta === '/'} className="menu-hoja-enlace" onClick={() => setMenuCelular(false)}>
              <Icono nombre={s.icono} />
              {s.titulo}
              {s.ruta === '/pedidos' && pedidos > 0 && <span className="menu-insignia">{pedidos}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="acciones-fila">
          <button
            type="button"
            className="boton boton-secundario"
            onClick={() => {
              setMenuCelular(false)
              setApariencia(true)
            }}
          >
            <Icono nombre="paleta" tamano={18} />
            Apariencia
          </button>
          <button type="button" className="boton boton-texto" onClick={salir}>
            <Icono nombre="salir" tamano={18} />
            Cerrar sesión
          </button>
        </div>
      </Dialogo>
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
