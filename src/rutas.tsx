import { createBrowserRouter, Outlet, type RouteObject } from 'react-router'
import { Armazon } from './diseno/Armazon'
import { MOSTRAR_MI_PLAN, nuevaVenta, secciones } from './diseno/secciones'
import { Bienvenida } from './paginas/acceso/Bienvenida'
import { Catalogo } from './paginas/catalogo/Catalogo'
import { EditarProducto } from './paginas/catalogo/EditarProducto'
import { NuevoProducto } from './paginas/catalogo/NuevoProducto'
import { Stock } from './paginas/stock/Stock'
import { Admin } from './paginas/admin/Admin'
import { MiPlan } from './paginas/plan/MiPlan'
import { Pedidos } from './paginas/pedidos/Pedidos'
import { Gastos } from './paginas/gastos/Gastos'
import { Instagram } from './paginas/instagram/Instagram'
import { RevisarBorrador } from './paginas/instagram/RevisarBorrador'
import { ConectadoInstagram } from './paginas/instagram/ConectadoInstagram'
import { Compras } from './paginas/compras/Compras'
import { NuevaCompra } from './paginas/compras/NuevaCompra'
import { Proveedores } from './paginas/compras/Proveedores'
import { NuevaVenta } from './paginas/ventas/NuevaVenta'
import { Ventas } from './paginas/ventas/Ventas'
import { Ingresar } from './paginas/acceso/Ingresar'
import { Registro } from './paginas/acceso/Registro'
import { NoEncontrada } from './paginas/NoEncontrada'
import { Privacidad, Terminos } from './paginas/legal/Legal'
import { EnConstruccion } from './paginas/panel/EnConstruccion'
import { Inicio } from './paginas/panel/Inicio'
import { MiTienda } from './paginas/panel/MiTienda'
import { Equipo } from './paginas/equipo/Equipo'
import { Roles } from './paginas/equipo/Roles'
import { SinAcceso } from './paginas/panel/SinAcceso'
import { RequierePermiso, RequiereSesion, SoloAnonimo } from './sesion/Guardias'
import { P, VER_VENTAS } from './sesion/permisos'

// Un grupo de rutas que exige un permiso ('' = sin exigir nada). Lo que no se puede ver no aparece en el menú ni se abre
// escribiendo la dirección; la API igual lo vuelve a exigir.
const con = (permiso: string, children: RouteObject[]): RouteObject => ({
  element: permiso ? <RequierePermiso permiso={permiso} /> : <Outlet />,
  children,
})

// Secciones cuyo módulo todavía no está hecho: <EnConstruccion>. Al construir un módulo, su ruta
// pasa a tener su página propia (como Inicio o Mi tienda).
const hechas = ['/', '/equipo','/mi-tienda', '/catalogo', '/stock', '/venta', '/ventas', '/compras', '/proveedores', '/gastos', '/instagram', '/mi-plan', '/pedidos']
const pendientes = [...secciones, nuevaVenta].filter((s) => !hechas.includes(s.ruta))

export const rutas = createBrowserRouter([
  {
    element: <SoloAnonimo />,
    children: [
      { path: '/bienvenida', element: <Bienvenida /> },
      { path: '/ingresar', element: <Ingresar /> },
      { path: '/registro', element: <Registro /> },
    ],
  },
  {
    element: <RequiereSesion />,
    children: [
      {
        element: <Armazon />,
        children: [
          con(P.inicioVer, [{ index: true, element: <Inicio /> }]),
          con(P.tiendaGestionar, [{ path: '/mi-tienda', element: <MiTienda /> }]),
          con(P.productosVer, [
            { path: '/catalogo', element: <Catalogo /> },
            { path: '/catalogo/:id', element: <EditarProducto /> },
          ]),
          con(P.productosCrear, [{ path: '/catalogo/nuevo', element: <NuevoProducto /> }]),
          con(P.stockVer, [{ path: '/stock', element: <Stock /> }]),
          con(P.ventasRegistrar, [{ path: '/venta', element: <NuevaVenta /> }]),
          con(VER_VENTAS, [{ path: '/ventas', element: <Ventas /> }]),
          con(P.gastosVer, [{ path: '/gastos', element: <Gastos /> }]),
          con(P.instagramGestionar, [
            { path: '/instagram', element: <Instagram /> },
            { path: '/instagram/revisar/:id', element: <RevisarBorrador /> },
            { path: '/instagram/conectado', element: <ConectadoInstagram /> },
          ]),
          con(P.comprasVer, [{ path: '/compras', element: <Compras /> }]),
          con(P.comprasGestionar, [{ path: '/compras/nueva', element: <NuevaCompra /> }]),
          con(P.proveedoresVer, [{ path: '/proveedores', element: <Proveedores /> }]),
          ...(MOSTRAR_MI_PLAN ? [con(P.planGestionar, [{ path: '/mi-plan', element: <MiPlan /> }])] : []),
          con(P.pedidosVer, [{ path: '/pedidos', element: <Pedidos /> }]),
          con(P.equipoGestionar, [{ path: '/equipo', element: <Equipo /> }]),
          con(P.rolesGestionar, [{ path: '/equipo/roles', element: <Roles /> }]),
          { path: '/sin-acceso', element: <SinAcceso /> },
          { path: '/admin', element: <Admin /> },
          ...pendientes.map((s) => con(s.permiso ?? '', [{ path: s.ruta, element: <EnConstruccion seccion={s} /> }])),
        ],
      },
    ],
  },
  // Se ven con o sin sesión (el registro y la tienda pública enlazan acá).
  { path: '/terminos', element: <Terminos /> },
  { path: '/privacidad', element: <Privacidad /> },
  { path: '*', element: <NoEncontrada /> },
])
