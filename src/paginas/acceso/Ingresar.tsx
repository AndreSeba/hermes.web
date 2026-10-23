import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, mensajeDeError } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { useSesion } from '../../sesion/contexto'
import { Icono } from '../../componentes/Icono'

export function Ingresar() {
  const { entrar } = useSesion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/auth/login', { body: { email, password } })
      if (data) entrar(data) // <SoloAnonimo> redirige al panel
      else setError(mensajeDeError(error, response))
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
          <Link to="/bienvenida" className="enlace-volver">
            <Icono nombre="atras" tamano={18} />
            Volver
          </Link>
          <h1 className="titulo-grande">Hola de nuevo</h1>
          <p className="texto-suave">Entrá para ver cómo va tu negocio.</p>
        </header>

        <div className="tarjeta formulario">
          <Campo
            etiqueta="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Campo
            etiqueta="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <Aviso>{error}</Aviso>}
        </div>

        <div className="acceso-acciones">
          <button type="submit" className="boton boton-primario boton-grande" disabled={enviando || !email || !password}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="texto-suave texto-centro">
            ¿Todavía no tenés cuenta? <Link to="/registro">Creala acá</Link>
          </p>
        </div>
      </form>
    </div>
  )
}
