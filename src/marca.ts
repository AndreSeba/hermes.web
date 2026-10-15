// Único lugar con la identidad visible de la app. El nombre del producto TODAVÍA NO ESTÁ DEFINIDO
// ("Hermes" es solo el nombre en clave del proyecto): mientras sea null, la interfaz no muestra
// ningún nombre. Nunca escribas el nombre a mano en componentes, títulos ni textos.
// Cuando se defina el nombre, cambiarlo también en public/manifest.webmanifest (name / short_name): es un archivo estático.
export const marca = {
  nombre: null as string | null,
  lema: 'Tu negocio, simple.',
}

export const tituloDePagina = (seccion?: string) =>
  [seccion, marca.nombre].filter(Boolean).join(' · ') || marca.lema
