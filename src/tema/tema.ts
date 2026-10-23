// Apariencia del panel de la dueña: color de acento y modo claro / oscuro. Se guarda en ESTE navegador (localStorage):
// no es el color de la tienda pública (ese está en Mi tienda) y no viaja al servidor.

export type Modo = 'auto' | 'claro' | 'oscuro'

export type Acento = { id: string; nombre: string; base: string; oscuro: string }

export const ACENTOS: Acento[] = [
  { id: 'verde', nombre: 'Verde', base: '#0b7a57', oscuro: '#08583f' },
  { id: 'azul', nombre: 'Azul', base: '#1d5fd1', oscuro: '#16479e' },
  { id: 'violeta', nombre: 'Violeta', base: '#6d4ae0', oscuro: '#5236b3' },
  { id: 'naranja', nombre: 'Naranja', base: '#c2540a', oscuro: '#8f3c05' },
  { id: 'rosa', nombre: 'Rosa', base: '#c2255c', oscuro: '#8f1a44' },
  { id: 'grafito', nombre: 'Grafito', base: '#3d3f45', oscuro: '#17181c' },
]

export type Tema = { modo: Modo; acento: string }

const CLAVE = 'hermes:tema'
export const TEMA_POR_DEFECTO: Tema = { modo: 'auto', acento: 'verde' }

export function leerTema(): Tema {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Partial<Tema> | null
    const modo = guardado?.modo === 'claro' || guardado?.modo === 'oscuro' || guardado?.modo === 'auto' ? guardado.modo : TEMA_POR_DEFECTO.modo
    const acento = ACENTOS.some((a) => a.id === guardado?.acento) ? guardado!.acento! : TEMA_POR_DEFECTO.acento
    return { modo, acento }
  } catch {
    return TEMA_POR_DEFECTO
  }
}

function esOscuro(modo: Modo) {
  return modo === 'oscuro' || (modo === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

// Pone el tema en <html>: `data-modo` activa los colores oscuros del CSS y las variables de acento se calculan acá.
export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement
  const oscuro = esOscuro(tema.modo)
  const a = ACENTOS.find((x) => x.id === tema.acento) ?? ACENTOS[0]
  raiz.dataset.modo = oscuro ? 'oscuro' : 'claro'
  raiz.style.colorScheme = oscuro ? 'dark' : 'light'
  if (tema.acento === TEMA_POR_DEFECTO.acento && !oscuro) {
    // El verde de siempre en modo claro: se usan los valores del CSS.
    for (const v of ['--acento', '--acento-oscuro', '--acento-suave']) raiz.style.removeProperty(v)
    return
  }
  // En oscuro el acento se aclara para que se lea sobre fondo oscuro; el "suave" es un velo del mismo color.
  const base = oscuro ? `color-mix(in srgb, ${a.base} 72%, white)` : a.base
  raiz.style.setProperty('--acento', base)
  raiz.style.setProperty('--acento-oscuro', oscuro ? `color-mix(in srgb, ${a.base} 55%, white)` : a.oscuro)
  raiz.style.setProperty('--acento-suave', oscuro ? `color-mix(in srgb, ${a.base} 24%, #1b1c21)` : `color-mix(in srgb, ${a.base} 12%, white)`)
}

export function guardarTema(tema: Tema) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(tema))
  } catch {
    // Sin almacenamiento (modo privado): el tema vale hasta cerrar la pestaña.
  }
  aplicarTema(tema)
}

// Al arrancar, y cada vez que el sistema cambia de claro a oscuro mientras el modo es "auto".
export function iniciarTema() {
  aplicarTema(leerTema())
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (leerTema().modo === 'auto') aplicarTema(leerTema())
  })
}
