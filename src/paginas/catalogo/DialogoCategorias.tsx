import { useEffect, useState, type FormEvent } from 'react'
import { api, mensajeDeError, type Categoria } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'

type Props = {
  abierto: boolean
  alCerrar: () => void
  // Para que el catálogo recargue sus filtros cuando se agrega, renombra u oculta una categoría.
  alCambiar: () => void
}

export function DialogoCategorias({ abierto, alCerrar, alCambiar }: Props) {
  return (
    <Dialogo abierto={abierto} titulo="Categorías" alCerrar={alCerrar}>
      {/* Dialogo solo monta esto mientras está abierto: cada vez carga y arranca limpio. */}
      <ListaCategorias alCerrar={alCerrar} alCambiar={alCambiar} />
    </Dialogo>
  )
}

function ListaCategorias({ alCerrar, alCambiar }: Omit<Props, 'abierto'>) {
  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [nueva, setNueva] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nombreEdicion, setNombreEdicion] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/categorias', { params: { query: { incluirInactivas: true } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (data) setCategorias(data)
        else setError(mensajeDeError(error, response))
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [version])

  // Una operación a la vez: ejecuta, muestra el error del servidor si falla y recarga la lista.
  async function ejecutar(operacion: () => Promise<{ error?: unknown; response: Response }>) {
    setError(null)
    setOcupado(true)
    try {
      const { error: fallo, response } = await operacion()
      if (fallo || !response.ok) return setError(mensajeDeError(fallo, response))
      setVersion((v) => v + 1)
      alCambiar()
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setOcupado(false)
    }
  }

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (!nueva.trim()) return
    await ejecutar(async () => {
      const r = await api.POST('/api/v1/categorias', { body: { nombre: nueva } })
      if (r.data) setNueva('')
      return r
    })
  }

  async function guardarNombre(c: Categoria) {
    await ejecutar(async () => {
      const r = await api.PUT('/api/v1/categorias/{id}', { params: { path: { id: c.id } }, body: { nombre: nombreEdicion, activa: c.activa } })
      if (r.data) setEditando(null)
      return r
    })
  }

  return (
    <div className="categorias">
      <form className="categorias-nueva" onSubmit={agregar} noValidate>
        <Campo
          etiqueta="Nueva categoría"
          placeholder="Ej.: Carteras"
          value={nueva}
          maxLength={60}
          onChange={(e) => setNueva(e.target.value)}
        />
        <button type="submit" className="boton boton-primario boton-chico" disabled={ocupado || !nueva.trim()}>
          Agregar
        </button>
      </form>

      {error && <Aviso>{error}</Aviso>}

      {categorias === null && !error && <p className="texto-suave">Cargando…</p>}
      {categorias?.length === 0 && <p className="texto-suave">Todavía no tenés categorías.</p>}

      <ul className="categorias-lista">
        {categorias?.map((c) => (
          <li key={c.id} className={c.activa ? undefined : 'categoria-oculta'}>
            {editando === c.id ? (
              <form
                className="categoria-edicion"
                onSubmit={(e) => {
                  e.preventDefault()
                  void guardarNombre(c)
                }}
              >
                <input
                  className="categoria-input"
                  aria-label={`Nuevo nombre de ${c.nombre}`}
                  value={nombreEdicion}
                  maxLength={60}
                  autoFocus
                  onChange={(e) => setNombreEdicion(e.target.value)}
                />
                <button type="submit" className="boton boton-primario boton-chico" disabled={ocupado || !nombreEdicion.trim()}>
                  Guardar
                </button>
                <button type="button" className="boton boton-texto boton-chico" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <span className="categoria-nombre">
                  {c.nombre}
                  {!c.activa && <span className="texto-suave"> · oculta</span>}
                </span>
                <button
                  type="button"
                  className="boton boton-texto boton-chico"
                  onClick={() => {
                    setEditando(c.id)
                    setNombreEdicion(c.nombre)
                  }}
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  className="boton boton-texto boton-chico"
                  disabled={ocupado}
                  onClick={() =>
                    ejecutar(() => api.PUT('/api/v1/categorias/{id}', { params: { path: { id: c.id } }, body: { nombre: c.nombre, activa: !c.activa } }))
                  }
                >
                  {c.activa ? 'Ocultar' : 'Mostrar'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <p className="texto-suave texto-chico">Ocultar una categoría no borra tus productos: solo deja de ofrecerse para productos nuevos.</p>
      <div className="acciones-fila">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Listo
        </button>
      </div>
    </div>
  )
}
