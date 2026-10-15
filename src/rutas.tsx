import { createBrowserRouter } from 'react-router'
import { Armazon } from './diseno/Armazon'
import { nuevaVenta, secciones } from './diseno/secciones'
import { Bienvenida } from './paginas/acceso/Bienvenida'
import { Catalogo } from './paginas/catalogo/Catalogo'
import { EditarProducto } from './paginas/catalogo/EditarProducto'
import { NuevoProducto } from './paginas/catalogo/NuevoProducto'
import { Stock } from './paginas/stock/Stock'
import { Admin } from './paginas/admin/Admin'
import { MiPlan } from './paginas/plan/MiPlan'
import { Gastos } from './paginas/gastos/Gastos'
import { Instagram } from './paginas/instagram/Instagram'
import { RevisarBorrador } from './paginas/instagram/RevisarBorrador'
import { Compras } from './paginas/compras/Compras'
import { NuevaCompra } from './paginas/compras/NuevaCompra'
import { Proveedores } from './paginas/compras/Proveedores'
import { NuevaVenta } from './paginas/ventas/NuevaVenta'
import { Ventas } from './paginas/ventas/Ventas'
import { Ingresar } from './paginas/acceso/Ingresar'
import { Registro } from './paginas/acceso/Registro'
import { NoEncontrada } from './paginas/NoEncontrada'
import { EnConstruccion } from './paginas/panel/EnConstruccion'
import { Inicio } from './paginas/panel/Inicio'
import { MiTienda } from './paginas/panel/MiTienda'
import { RequiereSesion, SoloAnonimo } from './sesion/Guardias'

// Secciones cuyo módulo todavía no está hecho: <EnConstruccion>. Al construir un módulo, su ruta
// pasa a tener su página propia (como Inicio o Mi tienda).
const hechas = ['/', '/mi-tienda', '/catalogo', '/stock', '/venta', '/ventas', '/compras', '/proveedores', '/gastos', '/instagram', '/mi-plan']
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
          { index: true, element: <Inicio /> },
          { path: '/mi-tienda', element: <MiTienda /> },
          { path: '/catalogo', element: <Catalogo /> },
          { path: '/catalogo/nuevo', element: <NuevoProducto /> },
          { path: '/catalogo/:id', element: <EditarProducto /> },
          { path: '/stock', element: <Stock /> },
          { path: '/venta', element: <NuevaVenta /> },
          { path: '/ventas', element: <Ventas /> },
          { path: '/gastos', element: <Gastos /> },
          { path: '/instagram', element: <Instagram /> },
          { path: '/instagram/revisar/:id', element: <RevisarBorrador /> },
          { path: '/compras', element: <Compras /> },
          { path: '/compras/nueva', element: <NuevaCompra /> },
          { path: '/proveedores', element: <Proveedores /> },
          { path: '/mi-plan', element: <MiPlan /> },
          { path: '/admin', element: <Admin /> },
          ...pendientes.map((s) => ({ path: s.ruta, element: <EnConstruccion seccion={s} /> })),
        ],
      },
    ],
  },
  { path: '*', element: <NoEncontrada /> },
])
