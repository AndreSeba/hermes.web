import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  abierto: boolean
  titulo: string
  alCerrar: () => void
  children: ReactNode
}

// Cuadro de diálogo con el <dialog> nativo: el navegador ya se ocupa de atrapar el foco, cerrar
// con Escape y avisar a los lectores de pantalla. No reinventar esto con un div.
export function Dialogo({ abierto, titulo, alCerrar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()

  useEffect(() => {
    const dialogo = ref.current
    if (!dialogo) return
    if (abierto && !dialogo.open) dialogo.showModal()
    if (!abierto && dialogo.open) dialogo.close()
  }, [abierto])

  return (
    <dialog ref={ref} className="dialogo" aria-labelledby={idTitulo} onClose={alCerrar}>
      <h2 id={idTitulo} className="titulo-seccion">
        {titulo}
      </h2>
      {abierto && children}
    </dialog>
  )
}
