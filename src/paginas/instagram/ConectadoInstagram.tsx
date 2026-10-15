import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, mensajeDeError } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'

// Adonde vuelve Instagram después de que la dueña autoriza (Instagram:RedirectUri): ?code=…&state=… (o ?error=… si dijo
// que no). Se manda el código al servidor, que lo canjea por el token (el token nunca pasa por el navegador).
export function ConectadoInstagram() {
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const code = params.get('code')
  const state = params.get('state')
  // Si Instagram volvió sin autorización, el error se sabe de entrada (no hay nada que mandar al servidor).
  const errorDeEntrada =
    params.get('error') || !code || !state
      ? params.get('error') === 'access_denied'
        ? 'No diste permiso en Instagram, así que no conectamos nada.'
        : 'Instagram no devolvió la autorización. Probá conectar de nuevo.'
      : null
  const [errorDelServidor, setError] = useState<string | null>(null)
  const error = errorDeEntrada ?? errorDelServidor
  const enviado = useRef(false) // StrictMode monta dos veces: el código de Instagram sirve UNA sola vez

  useEffect(() => {
    if (enviado.current || !code || !state || errorDeEntrada) return
    enviado.current = true
    api
      .POST('/api/v1/instagram/conexion', { body: { code, state } })
      .then(({ data, error, response }) => {
        if (data) navegar('/instagram?conectada=1', { replace: true })
        else setError(mensajeDeError(error, response))
      })
      .catch(() => setError(mensajeDeError(null)))
  }, [code, state, errorDeEntrada, navegar])

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Conectando con Instagram</h1>
      </header>
      {error ? (
        <>
          <Aviso>{error}</Aviso>
          <Link to="/instagram" className="boton boton-secundario">
            Volver
          </Link>
        </>
      ) : (
        <p className="texto-suave" role="status">
          Un momento…
        </p>
      )}
    </div>
  )
}
