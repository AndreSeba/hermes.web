export const fechaLarga = (iso: string) => new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))

// null = sin límite.
export const limite = (valor: number | null | undefined, unidad: string) => (valor == null ? 'sin límite' : `${valor.toLocaleString('es-BO')} ${unidad}`)
