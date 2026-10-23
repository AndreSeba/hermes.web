type Props = {
  pagina: number
  totalPaginas: number
  alCambiar: (pagina: number) => void
}

// Anterior / 1 … 4 5 6 … 20 / Siguiente. Muestra la primera, la última y las vecinas de la actual.
export function Paginacion({ pagina, totalPaginas, alCambiar }: Props) {
  if (totalPaginas <= 1) return null
  const numeros = Array.from({ length: totalPaginas }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPaginas || Math.abs(n - pagina) <= 1,
  )

  return (
    <nav className="paginacion" aria-label="Páginas">
      <button type="button" className="boton boton-secundario boton-chico" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
        Anterior
      </button>
      {numeros.map((n, i) => (
        <span key={n} className="paginacion-numero-grupo">
          {i > 0 && n - numeros[i - 1] > 1 && (
            <span className="paginacion-hueco" aria-hidden="true">
              …
            </span>
          )}
          <button
            type="button"
            className="paginacion-numero"
            aria-current={n === pagina ? 'page' : undefined}
            aria-label={`Página ${n}`}
            onClick={() => alCambiar(n)}
          >
            {n}
          </button>
        </span>
      ))}
      <button
        type="button"
        className="boton boton-secundario boton-chico"
        disabled={pagina >= totalPaginas}
        onClick={() => alCambiar(pagina + 1)}
      >
        Siguiente
      </button>
    </nav>
  )
}
