// Enlace para abrir un chat de WhatsApp con un mensaje ya escrito. El teléfono viene del servidor como
// "+591XXXXXXXX" (Validacion.Whatsapp): wa.me quiere solo los dígitos.
export function enlaceWhatsapp(telefono: string, mensaje: string) {
  return `https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`
}
