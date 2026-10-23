import { useState, type FormEvent } from 'react'
import { api, mensajeDeError, renovarSesion } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { useSesion } from '../../sesion/contexto'

// Quien entra con la contraseña provisional que le puso el dueño tiene que elegir una propia antes de usar el panel.
export function CambiarPassword() {
  const { salir } = useSesion()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (nueva !== repetida) return setError('Las dos contraseñas nuevas no son iguales.')
    setError(null)
    setEnviando(true)
    try {
      const { error, response } = await api.POST('/api/v1/auth/cambiar-password', { body: { passwordActual: actual, passwordNueva: nueva } })
      if (response.ok) {
        // La sesión se renueva con la cookie: el nuevo token ya no pide cambiar la contraseña y el panel se abre solo.
        if (!(await renovarSesion())) await salir()
      } else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="acceso">
      <form className="acceso-columna" onSubmit={enviar} noValidate>
        <header className="acceso-cabecera">
          <h1 className="titulo-grande">Elegí tu contraseña</h1>
          <p className="texto-suave">Entraste con una contraseña provisional. Poné una que solo sepas vos para seguir.</p>
        </header>

        <div className="tarjeta formulario">
          <Campo etiqueta="Contraseña provisional" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
          <Campo
            etiqueta="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            ayuda="Entre 8 y 72 caracteres, con al menos una letra y un número."
          />
          <Campo etiqueta="Repetí la contraseña nueva" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
          {error && <Aviso>{error}</Aviso>}
        </div>

        <div className="acceso-acciones">
          <button type="submit" className="boton boton-primario boton-grande" disabled={enviando || !actual || !nueva || !repetida}>
            {enviando ? 'Guardando…' : 'Guardar y entrar'}
          </button>
          <button type="button" className="boton boton-texto" onClick={() => void salir()}>
            Salir
          </button>
        </div>
      </form>
    </div>
  )
}
