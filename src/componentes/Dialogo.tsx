import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  abierto: boolean
  titulo: string
  alCerrar: () => void
  children: ReactNode
  // En el celular sube desde abajo y ocupa todo el ancho (como las hojas del prototipo); en escritorio
  // es un cuadro centrado igual que los demás.
  hoja?: boolean
  // Debajo del título, en gris (por ejemplo el nombre del producto).
  subtitulo?: string
}

// Cuadro de diálogo con el <dialog> nativo: el navegador ya se ocupa de atrapar el foco, cerrar
// con Escape y avisar a los lectores de pantalla. No reinventar esto con un div.
export function Dialogo({ abierto, titulo, alCerrar, children, hoja, subtitulo }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (abierto && !dialogo.open) dialogo.showModal()
    if (!abierto && dialogo.open) dialogo.close()
  }, [abierto])

  return (
    <dialog ref={ref} className={`dialogo${hoja ? ' dialogo-hoja' : ''}`} aria-labelledby={idTitulo} onClose={alCerrar}>
      <h2 id={idTitulo} className="titulo-seccion">
        {titulo}
      </h2>
      {subtitulo && <p className="texto-suave">{subtitulo}</p>}
      {abierto && children}
    </dialog>
  )
}
