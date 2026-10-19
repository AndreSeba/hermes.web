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

// ───────────── Hoy / Semana / Mes (el selector del Inicio) ─────────────

export type Periodo = 'hoy' | 'semana' | 'mes'

const dia = (d: Date, mas = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + mas)
const aTexto = (desde: Date, hasta: Date) => ({ Desde: desde.toISOString(), Hasta: hasta.toISOString() })

// Hoy = desde la medianoche de quien mira; Semana = hoy y los 6 días anteriores; Mes = el mes en curso.
export function rangoDe(periodo: Periodo, ahora = new Date()) {
  if (periodo === 'mes') return rangoDelMes(ahora)
  return aTexto(periodo === 'hoy' ? dia(ahora) : dia(ahora, -6), dia(ahora, 1))
}

// El mismo tramo del período anterior, con la MISMA duración transcurrida: a las 3 de la tarde se compara contra ayer hasta las
// 3, y el día 10 del mes contra los primeros 10 días del mes pasado (si no, siempre saldría "perdiste" a principio de período).
export function rangoAnterior(periodo: Periodo, ahora = new Date()) {
  const desdeActual = periodo === 'hoy' ? dia(ahora) : periodo === 'semana' ? dia(ahora, -6) : new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const desde = periodo === 'hoy' ? dia(ahora, -1) : periodo === 'semana' ? dia(ahora, -13) : new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
  const hasta = new Date(Math.min(desde.getTime() + (ahora.getTime() - desdeActual.getTime()), desdeActual.getTime()))
  return aTexto(desde, hasta)
}

// "ayer", "la semana pasada", "septiembre"
export function nombreDelPeriodoAnterior(periodo: Periodo, ahora = new Date()) {
  if (periodo === 'hoy') return 'ayer'
  if (periodo === 'semana') return 'la semana pasada'
  return nombreDelMes(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1))
}

// "los gastos de octubre", "los gastos de hoy", "los gastos de la semana"
export function nombreDelPeriodo(periodo: Periodo, ahora = new Date()) {
  return periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'la semana' : nombreDelMes(ahora)
}

// Los últimos `dias` días (incluido hoy) para el gráfico: Desde = la medianoche del primero, y el desfase horario del
// navegador para que el servidor sepa dónde empieza y termina cada día de quien mira.
export function rangoPorDia(dias = 14, ahora = new Date()) {
  return { Desde: dia(ahora, -(dias - 1)).toISOString(), Dias: dias, DesfaseMinutos: ahora.getTimezoneOffset() }
}
