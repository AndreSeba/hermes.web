import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, mensajeDeError, type Borrador } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Dialogo } from '../../componentes/Dialogo'
import { FormularioProducto } from '../catalogo/FormularioProducto'

// Revisar un producto de la bandeja: el formulario de siempre, con lo que se entendió ya escrito (y las fotos, si vino de la
// cuenta conectada: M12) y, arriba, el texto original y lo que el lector no estuvo seguro. Al guardar se publica.
export function RevisarBorrador() {
  const { id } = useParams()
  const navegar = useNavigate()
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null)
  const [publicado, setPublicado] = useState(false)
  const [descartando, setDescartando] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelado = false
    api
      .GET('/api/v1/instagram/borradores/{id}', { params: { path: { id } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (data) setBorrador(data)
        else setError({ mensaje: mensajeDeError(error, response), noExiste: response.status === 404 || response.status === 400 })
      })
      .catch(() => !cancelado && setError({ mensaje: mensajeDeError(null), noExiste: false }))
    return () => {
      cancelado = true
    }
  }, [id])

  if (error)
    return (
      <div className="pagina pagina-angosta">
        <Aviso>{error.noExiste ? 'No encontramos ese producto en la bandeja.' : error.mensaje}</Aviso>
        <Link to="/instagram" className="boton boton-secundario">
          Volver a la bandeja
        </Link>
      </div>
    )
  if (!borrador)
    return (
      <div className="pagina pagina-angosta" role="status" aria-live="polite">
        <p className="texto-suave">Cargando el producto…</p>
      </div>
    )
  if (borrador.estado !== 'Pendiente' && !publicado)
    return (
      <div className="pagina pagina-angosta">
        <Aviso tipo="advertencia">
          {borrador.estado === 'Publicado' ? 'Este producto ya está en tu catálogo.' : 'Este producto ya lo descartaste.'}
        </Aviso>
        <Link to="/instagram" className="boton boton-secundario">
          Volver a la bandeja
        </Link>
      </div>
    )

  return (
    <>
      {!publicado && (
        <div className="pagina pagina-angosta panel-borrador">
          {borrador.avisos.length > 0 && (
            <Aviso tipo="advertencia">
              <strong>Revisá esto:</strong>
              <ul className="avisos-margen">
                {borrador.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Aviso>
          )}
          {borrador.stock !== null && (
            <p className="texto-suave texto-chico">
              La publicación decía que quedan {borrador.stock}: lo cargamos al publicar (si el producto tiene una sola opción).
            </p>
          )}
          <details className="guia-formato">
            <summary>Ver el texto original</summary>
            <p className="texto-original">{borrador.texto}</p>
          </details>
          {borrador.enlace && (
            <a href={borrador.enlace} target="_blank" rel="noopener noreferrer" className="boton boton-texto boton-chico">
              Ver la publicación en Instagram
            </a>
          )}
          <div className="acciones-fila">
            <button type="button" className="boton boton-texto boton-chico" onClick={() => setDescartando(true)}>
              Descartar este producto
            </button>
          </div>
        </div>
      )}

      {/* La clave: si se pasa de un borrador a otro, el formulario arranca de cero. */}
      <FormularioProducto key={borrador.id} borrador={borrador} alPublicar={() => setPublicado(true)} />

      <Dialogo abierto={descartando} titulo="¿Descartar este producto?" subtitulo={borrador.nombre} alCerrar={() => setDescartando(false)} hoja>
        {descartando && <ConfirmarDescarte id={borrador.id} alCerrar={() => setDescartando(false)} alListo={() => navegar('/instagram')} />}
      </Dialogo>
    </>
  )
}

function ConfirmarDescarte({ id, alCerrar, alListo }: { id: string; alCerrar: () => void; alListo: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function descartar() {
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/instagram/borradores/{id}/descartar', { params: { path: { id } } })
      if (data) alListo()
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="formulario formulario-hoja">
      <p className="texto-suave">Sale de la bandeja y no llega a tu catálogo.</p>
      {error && <Aviso>{error}</Aviso>}
      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          No, dejarlo
        </button>
        <button type="button" className="boton boton-primario" onClick={descartar} disabled={enviando}>
          {enviando ? 'Descartando…' : 'Sí, descartar'}
        </button>
      </div>
    </div>
  )
}
