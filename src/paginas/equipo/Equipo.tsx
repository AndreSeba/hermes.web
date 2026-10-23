import { useEffect, useState, type FormEvent } from 'react'
import { api, mensajeDeError, type EquipoDelNegocio, type Miembro, type Rol } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { useSesionActiva } from '../../sesion/contexto'
import { PestanasEquipo } from './PestanasEquipo'

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })

// Las personas que trabajan en el negocio. El dueño crea la cuenta (email + contraseña provisional) y elige el rol;
// la persona cambia la contraseña la primera vez que entra.
export function Equipo() {
  const { usuario } = useSesionActiva()
  const [equipo, setEquipo] = useState<EquipoDelNegocio | null>(null)
  const [roles, setRoles] = useState<Rol[]>([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [editando, setEditando] = useState<Miembro | null>(null)
  const [clave, setClave] = useState<Miembro | null>(null)

  useEffect(() => {
    let cancelado = false
    Promise.all([api.GET('/api/v1/equipo'), api.GET('/api/v1/roles', { params: { query: {} } })])
      .then(([e, r]) => {
        if (cancelado) return
        if (!e.data) return setError(mensajeDeError(e.error, e.response))
        setError(null)
        setEquipo(e.data)
        if (r.data) setRoles(r.data.roles)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [version])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  const recargar = () => setVersion((n) => n + 1)
  const lleno = equipo?.maxUsuarios != null && equipo.usuarios >= equipo.maxUsuarios

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Equipo</h1>
        <button type="button" className="boton boton-primario boton-chico" onClick={() => setAgregando(true)} disabled={lleno}>
          <Icono nombre="mas" tamano={16} />
          Agregar persona
        </button>
      </header>
      <PestanasEquipo />

      {equipo && (
        <p className="texto-suave texto-chico">
          {equipo.maxUsuarios == null
            ? `${equipo.usuarios} ${equipo.usuarios === 1 ? 'persona' : 'personas'} en tu negocio (plan ${equipo.plan}, sin límite).`
            : `${equipo.usuarios} de ${equipo.maxUsuarios} personas (plan ${equipo.plan}).`}
          {lleno && ' Llegaste al límite de tu plan: para sumar a alguien más hay que pasar a un plan más grande.'}
        </p>
      )}

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {!equipo && !error && (
        <p className="texto-suave" role="status">
          Cargando tu equipo…
        </p>
      )}

      {equipo && (
        <ul className="lista-ventas">
          {equipo.miembros.map((m) => (
            <li key={m.id} className={`fila-venta${m.activo ? '' : ' fila-venta-anulada'}`}>
              <button
                type="button"
                className="fila-stock-cabecera"
                aria-expanded={abierto === m.id}
                aria-label={`${abierto === m.id ? 'Cerrar' : 'Ver detalle de'} ${m.nombre}`}
                onClick={() => setAbierto(abierto === m.id ? null : m.id)}
              >
                <span className="fila-stock-datos">
                  <span className="fila-stock-nombre">
                    {m.nombre}
                    {m.usuarioId === usuario.id && ' (vos)'}
                  </span>
                  <span className="texto-chico texto-suave">
                    {m.rol} · {m.email}
                  </span>
                </span>
                {!m.activo && <span className="etiqueta etiqueta-sincosto">Sin acceso</span>}
                <Icono nombre="chevron" tamano={18} />
              </button>
              {abierto === m.id && (
                <div className="fila-stock-detalle">
                  <span className="texto-suave texto-chico">
                    {m.ultimoLoginEn ? `Último ingreso: ${fechaCorta(m.ultimoLoginEn)}` : 'Todavía no entró'}
                  </span>
                  {!m.esDueno && (
                    <div className="acciones-fila">
                      <button type="button" className="boton boton-secundario boton-chico" onClick={() => setEditando(m)}>
                        Cambiar rol o acceso
                      </button>
                      <button type="button" className="boton boton-texto boton-chico" onClick={() => setClave(m)}>
                        Nueva contraseña
                      </button>
                    </div>
                  )}
                  {m.esDueno && <span className="texto-chico">Dueño del negocio: tiene todos los permisos.</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialogo abierto={agregando} titulo="Agregar persona" alCerrar={() => setAgregando(false)} hoja>
        <FormularioPersona
          roles={roles.filter((r) => r.activo)}
          alCerrar={() => setAgregando(false)}
          alListo={(m) => {
            setAgregando(false)
            setAviso(`Agregaste a ${m.nombre}. Pasale su email y la contraseña provisional.`)
            recargar()
          }}
        />
      </Dialogo>

      <Dialogo abierto={editando !== null} titulo="Rol y acceso" subtitulo={editando?.nombre} alCerrar={() => setEditando(null)} hoja>
        {editando && (
          <FormularioAcceso
            miembro={editando}
            esUno={editando.usuarioId === usuario.id}
            roles={roles.filter((r) => r.activo || r.id === editando.rolId)}
            alCerrar={() => setEditando(null)}
            alListo={(m) => {
              setEditando(null)
              setAviso(m.activo ? `Guardamos los cambios de ${m.nombre}.` : `${m.nombre} ya no puede entrar.`)
              recargar()
            }}
          />
        )}
      </Dialogo>

      <Dialogo abierto={clave !== null} titulo="Nueva contraseña" subtitulo={clave?.nombre} alCerrar={() => setClave(null)} hoja>
        {clave && (
          <FormularioClave
            miembro={clave}
            alCerrar={() => setClave(null)}
            alListo={(m) => {
              setClave(null)
              setAviso(`Le pusiste una contraseña nueva a ${m.nombre}. Tiene que elegir la suya al entrar.`)
              recargar()
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

function SelectorDeRol({ roles, valor, alCambiar }: { roles: Rol[]; valor: string; alCambiar: (id: string) => void }) {
  return (
    <div className="campo">
      <label htmlFor="rol-persona" className="campo-etiqueta">
        Rol
      </label>
      <select id="rol-persona" className="seleccion" value={valor} onChange={(e) => alCambiar(e.target.value)}>
        <option value="">Elegí un rol</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
            {r.activo ? '' : ' (desactivado)'}
          </option>
        ))}
      </select>
      <p className="campo-ayuda">{roles.find((r) => r.id === valor)?.descripcion ?? 'Define qué puede ver y hacer.'}</p>
    </div>
  )
}

function Botones({ enviando, alCerrar, texto }: { enviando: boolean; alCerrar: () => void; texto: string }) {
  return (
    <div className="acciones-fila acciones-hoja">
      <button type="button" className="boton boton-secundario" onClick={alCerrar}>
        Cancelar
      </button>
      <button type="submit" className="boton boton-primario" disabled={enviando}>
        {enviando ? 'Guardando…' : texto}
      </button>
    </div>
  )
}

function FormularioPersona({ roles, alCerrar, alListo }: { roles: Rol[]; alCerrar: () => void; alListo: (m: Miembro) => void }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rolId, setRolId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !email.trim() || !password || !rolId) return setError('Completá el nombre, el email, la contraseña y el rol.')
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/equipo', { body: { nombre: nombre.trim(), email: email.trim(), password, rolId } })
      if (data) alListo(data)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <Campo etiqueta="Nombre" value={nombre} maxLength={120} autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
      <Campo etiqueta="Email" type="email" inputMode="email" autoComplete="off" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
      <Campo
        etiqueta="Contraseña provisional"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        ayuda="Entre 8 y 72 caracteres, con letra y número. La persona la cambia al entrar."
      />
      <SelectorDeRol roles={roles} valor={rolId} alCambiar={setRolId} />
      {error && <Aviso>{error}</Aviso>}
      <Botones enviando={enviando} alCerrar={alCerrar} texto="Agregar" />
    </form>
  )
}

function FormularioAcceso({
  miembro,
  esUno,
  roles,
  alCerrar,
  alListo,
}: {
  miembro: Miembro
  esUno: boolean
  roles: Rol[]
  alCerrar: () => void
  alListo: (m: Miembro) => void
}) {
  const [rolId, setRolId] = useState(miembro.rolId ?? '')
  const [activo, setActivo] = useState(miembro.activo)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!rolId) return setError('Elegí un rol.')
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.PUT('/api/v1/equipo/{id}', { params: { path: { id: miembro.id } }, body: { rolId, activo } })
      if (data) alListo(data)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <SelectorDeRol roles={roles} valor={rolId} alCambiar={setRolId} />
      {!esUno && (
        <label className="casilla">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Puede entrar al sistema
        </label>
      )}
      <p className="campo-ayuda">Los cambios se aplican enseguida: si está conectada, la próxima vez que toque algo.</p>
      {error && <Aviso>{error}</Aviso>}
      <Botones enviando={enviando} alCerrar={alCerrar} texto="Guardar" />
    </form>
  )
}

function FormularioClave({ miembro, alCerrar, alListo }: { miembro: Miembro; alCerrar: () => void; alListo: (m: Miembro) => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!password) return setError('Escribí la contraseña provisional.')
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/equipo/{id}/password', {
        params: { path: { id: miembro.id } },
        body: { password },
      })
      if (data) alListo(data)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <Campo
        etiqueta="Contraseña provisional"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        ayuda="Se le cierran las sesiones abiertas y tiene que elegir una propia al entrar."
      />
      {error && <Aviso>{error}</Aviso>}
      <Botones enviando={enviando} alCerrar={alCerrar} texto="Guardar" />
    </form>
  )
}
