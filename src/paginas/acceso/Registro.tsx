import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, mensajeDeError } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { useSesion } from '../../sesion/contexto'
import { aSlug } from '../../util/texto'

// Mismas reglas que el backend (Validacion.Password / Validacion.Slug). El backend igual
// valida: esto es solo para avisar antes de enviar.
function problemaDePassword(p: string) {
  if (p.length < 8) return 'Usá al menos 8 caracteres.'
  if (p.length > 72) return 'Usá como máximo 72 caracteres.'
  if (!/\p{L}/u.test(p) || !/\d/.test(p)) return 'Combiná letras y números.'
  return null
}

export function Registro() {
  const { entrar } = useSesion()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombreTienda, setNombreTienda] = useState('')
  const [slug, setSlug] = useState('')
  // Mientras no toque la dirección a mano, se arma sola desde el nombre de la tienda.
  const [slugEditado, setSlugEditado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const slugFinal = slugEditado ? slug : aSlug(nombreTienda)
  const avisoPassword = password ? problemaDePassword(password) : null
  const completo = nombre.trim() && email.trim() && password && nombreTienda.trim() && slugFinal.length >= 2

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (avisoPassword) return setError(`Contraseña: ${avisoPassword}`)
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/auth/registro', {
        body: { nombre, email, password, nombreTienda, slug: slugFinal },
      })
      if (data) entrar(data)
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
            ← Volver
          </Link>
          <h1 className="titulo-grande">Creá tu cuenta</h1>
          <p className="texto-suave">Dos minutos y tu negocio queda listo para empezar.</p>
        </header>

        <fieldset className="tarjeta formulario">
          <legend className="formulario-titulo">Vos</legend>
          <Campo
            etiqueta="Tu nombre"
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
            required
          />
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            ayuda={avisoPassword ?? 'Al menos 8 caracteres, con letras y números.'}
            aria-invalid={!!avisoPassword}
            required
          />
        </fieldset>

        <fieldset className="tarjeta formulario">
          <legend className="formulario-titulo">Tu tienda</legend>
          <Campo
            etiqueta="Nombre de tu negocio"
            placeholder="Ej.: Luna Accesorios"
            value={nombreTienda}
            onChange={(e) => setNombreTienda(e.target.value)}
            maxLength={120}
            required
          />
          <Campo
            etiqueta="Dirección de tu tienda"
            prefijo="/"
            autoCapitalize="none"
            spellCheck={false}
            value={slugFinal}
            onChange={(e) => {
              setSlugEditado(true)
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))
            }}
            ayuda="Así te van a encontrar tus clientes. Solo minúsculas, números y guiones."
            required
          />
        </fieldset>

        {error && <Aviso>{error}</Aviso>}

        <div className="acceso-acciones">
          <button type="submit" className="boton boton-primario boton-grande" disabled={enviando || !completo}>
            {enviando ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
          </button>
          <p className="texto-suave texto-centro">
            ¿Ya tenés cuenta? <Link to="/ingresar">Entrá acá</Link>
          </p>
        </div>
      </form>
    </div>
  )
}
