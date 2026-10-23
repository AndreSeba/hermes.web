import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, mensajeDeError, type PermisoDelCatalogo, type Rol } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { AreaTexto } from '../../componentes/AreaTexto'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { PestanasEquipo } from './PestanasEquipo'

// Los roles del negocio: cada uno es un conjunto de permisos. Se editan a gusto; el dueño siempre tiene todo.
export function Roles() {
  const [roles, setRoles] = useState<Rol[] | null>(null)
  const [catalogo, setCatalogo] = useState<PermisoDelCatalogo[]>([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [editando, setEditando] = useState<Rol | 'nuevo' | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/roles', { params: { query: { incluirInactivos: true } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setError(null)
        setRoles(data.roles)
        setCatalogo(data.permisos)
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

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Equipo</h1>
        <button type="button" className="boton boton-primario boton-chico" onClick={() => setEditando('nuevo')}>
          <Icono nombre="mas" tamano={16} />
          Nuevo rol
        </button>
      </header>
      <PestanasEquipo />
      <p className="texto-suave texto-chico">
        Un rol dice qué puede ver y hacer cada persona. El dueño siempre puede todo. Si cambiás un rol, se aplica enseguida a todos los que lo tienen.
      </p>

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {!roles && !error && (
        <p className="texto-suave" role="status">
          Cargando los roles…
        </p>
      )}

      {roles && (
        <ul className="lista-ventas">
          {roles.map((r) => (
            <li key={r.id} className={`fila-venta${r.activo ? '' : ' fila-venta-anulada'}`}>
              <button type="button" className="fila-stock-cabecera" aria-label={`Editar el rol ${r.nombre}`} onClick={() => setEditando(r)}>
                <span className="fila-stock-datos">
                  <span className="fila-stock-nombre">{r.nombre}</span>
                  <span className="texto-chico texto-suave">
                    {r.personas === 1 ? '1 persona' : `${r.personas} personas`} · {r.permisos.length} permisos
                  </span>
                </span>
                {!r.activo && <span className="etiqueta etiqueta-sincosto">Desactivado</span>}
                <Icono nombre="chevron" tamano={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialogo abierto={editando !== null} titulo={editando === 'nuevo' ? 'Nuevo rol' : 'Editar rol'} alCerrar={() => setEditando(null)} hoja>
        {editando && (
          <FormularioRol
            rol={editando === 'nuevo' ? null : editando}
            catalogo={catalogo}
            alCerrar={() => setEditando(null)}
            alListo={(r, nuevo) => {
              setEditando(null)
              setAviso(nuevo ? `Creaste el rol ${r.nombre}.` : `Guardamos el rol ${r.nombre}.`)
              setVersion((n) => n + 1)
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

function FormularioRol({
  rol,
  catalogo,
  alCerrar,
  alListo,
}: {
  rol: Rol | null
  catalogo: PermisoDelCatalogo[]
  alCerrar: () => void
  alListo: (r: Rol, nuevo: boolean) => void
}) {
  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '')
  const [permisos, setPermisos] = useState<Set<string>>(new Set(rol?.permisos ?? []))
  const [activo, setActivo] = useState(rol?.activo ?? true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Agrupados por módulo, en el orden del catálogo.
  const grupos = useMemo(() => {
    const mapa = new Map<string, PermisoDelCatalogo[]>()
    for (const p of catalogo) mapa.set(p.modulo, [...(mapa.get(p.modulo) ?? []), p])
    return [...mapa.entries()]
  }, [catalogo])

  function alternar(codigo: string) {
    setPermisos((previo) => {
      const nuevo = new Set(previo)
      if (nuevo.has(codigo)) nuevo.delete(codigo)
      else nuevo.add(codigo)
      return nuevo
    })
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return setError('Escribí el nombre del rol.')
    setError(null)
    setEnviando(true)
    try {
      const body = { nombre: nombre.trim(), descripcion: descripcion.trim() || null, permisos: catalogo.map((p) => p.codigo).filter((c) => permisos.has(c)), activo }
      const { data, error, response } = rol
        ? await api.PUT('/api/v1/roles/{id}', { params: { path: { id: rol.id } }, body })
        : await api.POST('/api/v1/roles', { body })
      if (data) alListo(data, !rol)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <Campo etiqueta="Nombre" value={nombre} maxLength={60} autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
      <AreaTexto etiqueta="Para qué sirve (opcional)" value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} />

      {grupos.map(([modulo, items]) => (
        <fieldset key={modulo} className="seccion">
          <legend className="seccion-subtitulo">{modulo}</legend>
          {items.map((p) => (
            <label key={p.codigo} className="casilla">
              <input type="checkbox" checked={permisos.has(p.codigo)} onChange={() => alternar(p.codigo)} /> {p.descripcion}
            </label>
          ))}
        </fieldset>
      ))}

      {rol && (
        <label className="casilla">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Se puede asignar a personas nuevas
        </label>
      )}

      {error && <Aviso>{error}</Aviso>}

      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
