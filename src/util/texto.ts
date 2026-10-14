export function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function primerNombre(nombre: string) {
  return nombre.trim().split(/\s+/)[0] ?? nombre
}

// "Luna Accesorios Ñandú" → "luna-accesorios-nandu". Mismo formato que exige el backend
// (Validacion.Slug): minúsculas, números y guiones, hasta 40 caracteres.
export function aSlug(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

// "martes 14 de octubre"
export function fechaLarga(fecha = new Date()) {
  return new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long' }).format(fecha)
}
