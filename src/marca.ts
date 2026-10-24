// Único lugar con la identidad visible de la app. El nombre del producto es "Mi Casero" (2026-10-24; "Hermes" quedó solo como nombre
// en clave interno del proyecto, no se muestra en ninguna pantalla). Nunca escribas el nombre a mano en componentes, títulos ni textos.
// Si cambia, cambiarlo también en index.html (title), public/manifest.webmanifest (name / short_name) y en el pie de las tiendas
// públicas (Hermes.Public/Pages/Shared/_Layout.cshtml): son archivos estáticos.
export const marca = {
  nombre: 'Mi Casero' as string | null,
  lema: 'Tu negocio, simple.',
}

export const tituloDePagina = (seccion?: string) =>
  [seccion, marca.nombre].filter(Boolean).join(' · ') || marca.lema
