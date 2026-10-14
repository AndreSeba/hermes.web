import { createBrowserRouter } from 'react-router'
import { Armazon } from './diseno/Armazon'
import { nuevaVenta, secciones } from './diseno/secciones'
import { Bienvenida } from './paginas/acceso/Bienvenida'
import { Ingresar } from './paginas/acceso/Ingresar'
import { Registro } from './paginas/acceso/Registro'
import { NoEncontrada } from './paginas/NoEncontrada'
import { EnConstruccion } from './paginas/panel/EnConstruccion'
import { Inicio } from './paginas/panel/Inicio'
import { MiTienda } from './paginas/panel/MiTienda'
import { RequiereSesion, SoloAnonimo } from './sesion/Guardias'

// Secciones cuyo módulo todavía no está hecho: <EnConstruccion>. Al construir un módulo, su ruta
// pasa a tener su página propia (como Inicio o Mi tienda).
const pendientes = [...secciones, nuevaVenta].filter((s) => s.ruta !== '/' && s.ruta !== '/mi-tienda')

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
          ...pendientes.map((s) => ({ path: s.ruta, element: <EnConstruccion seccion={s} /> })),
        ],
      },
    ],
  },
  { path: '*', element: <NoEncontrada /> },
])
