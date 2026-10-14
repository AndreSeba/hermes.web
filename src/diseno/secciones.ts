import type { NombreIcono } from '../componentes/Icono'

// Secciones del panel. `modulo` = el módulo de docs/PLAN.md (backend) que la construye; mientras
// no esté hecho, la ruta muestra <EnConstruccion>.
export type Seccion = {
  ruta: string
  titulo: string
  icono: NombreIcono
  descripcion: string
  modulo?: string
}

export const secciones: Seccion[] = [
  { ruta: '/', titulo: 'Inicio', icono: 'inicio', descripcion: 'Cómo va tu negocio.' },
  {
    ruta: '/ventas',
    titulo: 'Ventas',
    icono: 'ventas',
    descripcion: 'Lo que vendiste hoy, esta semana y este mes.',
    modulo: 'M6',
  },
  {
    ruta: '/instagram',
    titulo: 'Desde Instagram',
    icono: 'instagram',
    descripcion: 'Lo que publicás en Instagram se convierte en productos para revisar y confirmar.',
    modulo: 'M11',
  },
  {
    ruta: '/catalogo',
    titulo: 'Catálogo',
    icono: 'catalogo',
    descripcion: 'Tus productos con fotos, colores, tallas y precios.',
    modulo: 'M4',
  },
  {
    ruta: '/stock',
    titulo: 'Stock',
    icono: 'stock',
    descripcion: 'Cuánto te queda de cada producto y qué hay que reponer.',
    modulo: 'M5',
  },
  {
    ruta: '/compras',
    titulo: 'Compras',
    icono: 'compras',
    descripcion: 'Lo que le comprás a tus proveedores: qué llegó, qué está en camino y qué debés.',
    modulo: 'M7',
  },
  {
    ruta: '/proveedores',
    titulo: 'Proveedores',
    icono: 'proveedores',
    descripcion: 'A quién le comprás y quién te da mejor precio.',
    modulo: 'M7',
  },
  {
    ruta: '/precios',
    titulo: 'Precios',
    icono: 'precios',
    descripcion: 'Calculá un precio que te deje ganancia de verdad.',
    modulo: 'M8',
  },
  {
    ruta: '/mi-tienda',
    titulo: 'Mi tienda',
    icono: 'tienda',
    descripcion: 'Los datos y el diseño de la tienda que ven tus clientes.',
    modulo: 'M3',
  },
]

export const nuevaVenta: Seccion = {
  ruta: '/venta',
  titulo: 'Nueva venta',
  icono: 'mas',
  descripcion: 'Anotá una venta en segundos; el stock se descuenta solo.',
  modulo: 'M6',
}

// En el celular la barra inferior tiene 4 secciones + el botón central de venta.
export const seccionesCelular = ['/', '/catalogo', '/stock', '/mi-tienda']
