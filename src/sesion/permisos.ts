// Códigos de permiso (los mismos del backend: Hermes.Domain/Seguridad/Permisos.cs). Se pueden juntar con «|»: alcanza con tener uno.
export const P = {
  inicioVer: 'inicio.ver',
  productosVer: 'productos.ver',
  productosCrear: 'productos.crear',
  productosEditar: 'productos.editar',
  productosArchivar: 'productos.archivar',
  costosVer: 'costos.ver',
  costosEditar: 'costos.editar',
  categoriasVer: 'categorias.ver',
  categoriasGestionar: 'categorias.gestionar',
  stockVer: 'stock.ver',
  stockAjustar: 'stock.ajustar',
  ventasVer: 'ventas.ver',
  ventasRegistrar: 'ventas.registrar',
  ventasAnular: 'ventas.anular',
  comprasVer: 'compras.ver',
  comprasGestionar: 'compras.gestionar',
  proveedoresVer: 'proveedores.ver',
  proveedoresGestionar: 'proveedores.gestionar',
  gastosVer: 'gastos.ver',
  gastosGestionar: 'gastos.gestionar',
  pedidosVer: 'pedidos.ver',
  pedidosGestionar: 'pedidos.gestionar',
  instagramGestionar: 'instagram.gestionar',
  tiendaGestionar: 'tienda.gestionar',
  planGestionar: 'plan.gestionar',
  equipoGestionar: 'equipo.gestionar',
  rolesGestionar: 'roles.gestionar',
} as const

// Quien registra ventas ve las suyas aunque no pueda ver las de todos (la API las acota sola).
export const VER_VENTAS = `${P.ventasVer}|${P.ventasRegistrar}|${P.inicioVer}`
