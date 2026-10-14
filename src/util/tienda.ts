// Dónde vive la tienda pública (otro sitio que el panel: renderiza en el servidor para que el enlace compartido por
// WhatsApp tenga vista previa). En desarrollo, http://localhost:5014; en producción, el dominio de las tiendas
// (VITE_TIENDA_URL, sin barra final).
const base = ((import.meta.env.VITE_TIENDA_URL as string | undefined) ?? 'http://localhost:5014').replace(/\/$/, '')

export const urlDeTienda = (slug: string) => `${base}/${slug}`
