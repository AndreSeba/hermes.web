// Dinero en Bolivianos. Sin decimales cuando el monto es redondo ("Bs 180"), con dos cuando no
// ("Bs 58,50"): igual que los precios del prototipo.
export function bs(monto: number) {
  const formato = new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: Number.isInteger(monto) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `Bs ${formato.format(monto)}`
}

// "180", "180,5" y "180.50" son 180, 180.5 y 180.5. null si no es un monto válido (hasta 2 decimales).
// Mismas reglas que el backend (Validacion.Monto), que igual valida.
export function leerMonto(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  return /^\d+(\.\d{1,2})?$/.test(limpio) ? Number(limpio) : null
}

// "café, Negro,  café" → ["café", "Negro"]: sin vacíos ni repetidos (sin distinguir mayúsculas), como
// Validacion.ListaDeTextos del backend.
export function listaDeTextos(texto: string): string[] {
  const resultado: string[] = []
  for (const parte of texto.split(',')) {
    const limpio = parte.trim()
    if (limpio && !resultado.some((r) => r.toLowerCase() === limpio.toLowerCase())) resultado.push(limpio)
  }
  return resultado
}
