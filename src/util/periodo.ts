// El mes de quien mira (no el del servidor): desde la medianoche del día 1 hasta la del día 1 siguiente, en la hora
// del celular. Se mandan como instantes; el servidor toma Desde incluido y Hasta excluido.
export function rangoDelMes(ahora = new Date()) {
  const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const hasta = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1)
  return { Desde: desde.toISOString(), Hasta: hasta.toISOString() }
}

export function nombreDelMes(ahora = new Date()) {
  return new Intl.DateTimeFormat('es-BO', { month: 'long' }).format(ahora)
}
