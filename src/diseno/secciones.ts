import type { NombreIcono } from '../componentes/Icono'
import { P, VER_VENTAS } from '../sesion/permisos'

// Secciones del panel. `modulo` = el módulo de docs/PLAN.md (backend) que la construye; mientras
// no esté hecho, la ruta muestra <EnConstruccion>.
export type Seccion = {
  ruta: string
  titulo: string
  icono: NombreIcono
  descripcion: string
  modulo?: string
  // Quién la ve en el menú y puede entrar (varios con «|»: alcanza uno). Sin esto, todos.
  permiso?: string
}

// "Mi plan" está oculto por ahora (menú, ruta y enlaces). Para mostrarlo de nuevo, ponerlo en true.
export const MOSTRAR_MI_PLAN = false

// "Desde Instagram" sigue en el menú, pero mientras sea false la pantalla dice que se está construyendo (como Precios).
// Para habilitarla (cuando haya una app de Meta aprobada), ponerlo en true.
export const INSTAGRAM_LISTO = false

export const secciones: Seccion[] = [
  { ruta: '/', titulo: 'Inicio', icono: 'inicio', descripcion: 'Cómo va tu negocio.', permiso: P.inicioVer },
  {
    ruta: '/ventas',
    titulo: 'Ventas',
    icono: 'ventas',
    descripcion: 'Lo que vendiste hoy, esta semana y este mes.',
    modulo: 'M6',
    permiso: VER_VENTAS,
  },
  {
    ruta: '/pedidos',
    titulo: 'Pedidos',
    icono: 'bolsa',
    descripcion: 'Lo que tus clientes piden desde el carrito de tu tienda.',
    permiso: P.pedidosVer,
  },
  {
    ruta: '/gastos',
    titulo: 'Gastos',
    icono: 'gastos',
    descripcion: 'Alquiler, luz, publicidad: lo que gastás en tu negocio.',
    modulo: 'M9',
    permiso: P.gastosVer,
  },
  {
    ruta: '/instagram',
    titulo: 'Desde Instagram',
    icono: 'instagram',
    descripcion: 'Lo que publicás en Instagram se convierte en productos para revisar y confirmar.',
    modulo: 'M11',
    permiso: P.instagramGestionar,
  },
  {
    ruta: '/catalogo',
    titulo: 'Catálogo',
    icono: 'catalogo',
    descripcion: 'Tus productos con fotos, colores, tallas y precios.',
    modulo: 'M4',
    permiso: P.productosVer,
  },
  {
    ruta: '/stock',
    titulo: 'Stock',
    icono: 'stock',
    descripcion: 'Cuánto te queda de cada producto y qué hay que reponer.',
    modulo: 'M5',
    permiso: P.stockVer,
  },
  {
    ruta: '/compras',
    titulo: 'Compras',
    icono: 'compras',
    descripcion: 'Lo que le comprás a tus proveedores: qué llegó, qué está en camino y qué debés.',
    modulo: 'M7',
    permiso: P.comprasVer,
  },
  {
    ruta: '/proveedores',
    titulo: 'Proveedores',
    icono: 'proveedores',
    descripcion: 'A quién le comprás y quién te da mejor precio.',
    modulo: 'M7',
    permiso: P.proveedoresVer,
  },
  {
    ruta: '/precios',
    titulo: 'Precios',
    icono: 'precios',
    descripcion: 'Calculá un precio que te deje ganancia de verdad.',
    modulo: 'M8',
    permiso: P.costosVer,
  },
  {
    ruta: '/mi-tienda',
    titulo: 'Mi tienda',
    icono: 'tienda',
    descripcion: 'Los datos y el diseño de la tienda que ven tus clientes.',
    modulo: 'M3',
    permiso: P.tiendaGestionar,
  },
  {
    ruta: '/equipo',
    titulo: 'Equipo',
    icono: 'equipo',
    descripcion: 'Quién trabaja con vos y qué puede hacer cada uno.',
    permiso: P.equipoGestionar, // «Roles» se abre desde adentro (pestaña) si además tiene roles.gestionar
  },
  ...(MOSTRAR_MI_PLAN
    ? [
        {
          ruta: '/mi-plan',
          titulo: 'Mi plan',
          icono: 'estrella' as const,
          descripcion: 'Qué plan tenés, cuánto usás y cómo pasar a uno más grande.',
          modulo: 'M13',
          permiso: P.planGestionar,
        },
      ]
    : []),
]

export const nuevaVenta: Seccion = {
  ruta: '/venta',
  titulo: 'Nueva venta',
  icono: 'mas',
  descripcion: 'Anotá una venta en segundos; el stock se descuenta solo.',
  modulo: 'M6',
  permiso: P.ventasRegistrar,
}

// Evento de `window` que dispara la pantalla de Pedidos al atender uno: el menú actualiza su insignia.
export const PEDIDOS_CAMBIARON = 'pedidos-cambiaron'

// En el celular la barra inferior tiene 3 secciones, el botón central de venta y "Menú" (con todas las demás). Si a la persona le faltan permisos,
// los lugares libres se completan con las de `respaldoCelular` (por ejemplo un vendedor, que no ve el Inicio).
export const seccionesCelular = ['/', '/catalogo', '/stock']
export const respaldoCelular = ['/ventas', '/pedidos', '/equipo']

// A dónde ir al abrir la app: la primera sección que la persona puede ver ("/" si tiene el Inicio).
export function rutaDeEntrada(tiene: (permiso: string) => boolean): string {
  if (tiene(P.inicioVer)) return '/'
  if (tiene(P.ventasRegistrar)) return nuevaVenta.ruta
  return secciones.find((s) => s.permiso && tiene(s.permiso))?.ruta ?? '/sin-acceso'
}
