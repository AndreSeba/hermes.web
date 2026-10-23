import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, mensajeDeError, type Proveedor, type ProveedorDetalle } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { PestanasInventario } from '../../componentes/PestanasInventario'
import { AreaTexto } from '../../componentes/AreaTexto'
import { bs } from '../../util/dinero'
import { enlaceWhatsapp } from '../../util/whatsapp'

// A quién le comprás: lo que le debés, lo que está en camino y lo último que le pagaste por cada producto.
// "Pedirle por WhatsApp" abre el chat con el mensaje ya escrito.
export function Proveedores() {
  const [params, setParams] = useSearchParams()
  const conInactivos = params.get('inactivos') === '1'

  const [items, setItems] = useState<Proveedor[] | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [editando, setEditando] = useState<Proveedor | 'nuevo' | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/proveedores', { params: { query: { incluirInactivos: conInactivos } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setError(null)
        setItems(data)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [conInactivos, version])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  function alternarInactivos() {
    setParams(conInactivos ? {} : { inactivos: '1' }, { replace: true })
  }

  async function cambiarActivo(p: Proveedor, activo: boolean) {
    const { data, error, response } = await api.POST(activo ? '/api/v1/proveedores/{id}/activar' : '/api/v1/proveedores/{id}/desactivar', {
      params: { path: { id: p.id } },
    })
    if (!data) return setError(mensajeDeError(error, response))
    setAviso(activo ? `${p.nombre} volvió a tu lista.` : `${p.nombre} salió de tu lista. Sus compras siguen guardadas.`)
    setAbierto(null)
    setVersion((n) => n + 1)
  }

  function guardado(p: Proveedor, nuevo: boolean) {
    setEditando(null)
    setAviso(nuevo ? `Agregaste a ${p.nombre}.` : `Guardamos los cambios de ${p.nombre}.`)
    setVersion((n) => n + 1)
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Proveedores</h1>
        <button type="button" className="boton boton-primario boton-chico" onClick={() => setEditando('nuevo')}>
          <Icono nombre="mas" tamano={16} />
          Nuevo proveedor
        </button>
      </header>
      <PestanasInventario />

      <div className="chips">
        <button type="button" className="chip" aria-pressed={conInactivos} onClick={alternarInactivos}>
          Mostrar desactivados
        </button>
      </div>

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {items === null && !error && (
        <p className="texto-suave" role="status">
          Cargando tus proveedores…
        </p>
      )}

      {items?.length === 0 && (
        <section className="tarjeta vacio-inicial">
          <span className="icono-caja" aria-hidden="true">
            <Icono nombre="proveedores" tamano={22} />
          </span>
          <h2 className="titulo-seccion">Todavía no cargaste proveedores</h2>
          <p className="texto-suave">Anotá a quién le comprás para saber qué le debés, qué viene en camino y quién te da mejor precio.</p>
          <button type="button" className="boton boton-primario" onClick={() => setEditando('nuevo')}>
            Agregar un proveedor
          </button>
        </section>
      )}

      {items && items.length > 0 && (
        <ul className="lista-ventas">
          {items.map((p) => (
            <FilaProveedor
              key={p.id}
              proveedor={p}
              abierto={abierto === p.id}
              alAlternar={() => setAbierto(abierto === p.id ? null : p.id)}
              alEditar={() => setEditando(p)}
              alCambiarActivo={(activo) => cambiarActivo(p, activo)}
            />
          ))}
        </ul>
      )}

      <DialogoProveedor proveedor={editando} alCerrar={() => setEditando(null)} alListo={guardado} />
    </div>
  )
}

function FilaProveedor({
  proveedor: p,
  abierto,
  alAlternar,
  alEditar,
  alCambiarActivo,
}: {
  proveedor: Proveedor
  abierto: boolean
  alAlternar: () => void
  alEditar: () => void
  alCambiarActivo: (activo: boolean) => void
}) {
  const resumen =
    p.porPagar > 0 || p.enCamino > 0
      ? [p.porPagar > 0 ? `Le debés ${bs(p.porPagar)}` : null, p.enCamino > 0 ? (p.enCamino === 1 ? '1 pedido en camino' : `${p.enCamino} pedidos en camino`) : null]
          .filter(Boolean)
          .join(' · ')
      : p.compras > 0
        ? 'Sin deudas'
        : 'Todavía no le compraste'

  return (
    <li className={`fila-venta${p.activo ? '' : ' fila-venta-anulada'}`}>
      <button type="button" className="fila-stock-cabecera" aria-expanded={abierto} aria-label={`${abierto ? 'Cerrar' : 'Ver detalle de'} ${p.nombre}`} onClick={alAlternar}>
        <span className="fila-stock-datos">
          <span className="fila-stock-nombre">{p.nombre}</span>
          <span className={`texto-chico ${p.porPagar > 0 ? 'texto-peligro' : 'texto-suave'}`}>{resumen}</span>
        </span>
        {!p.activo && <span className="etiqueta etiqueta-sincosto">Desactivado</span>}
        <Icono nombre="chevron" tamano={18} />
      </button>
      {abierto && <DetalleProveedor proveedor={p} alEditar={alEditar} alCambiarActivo={alCambiarActivo} />}
    </li>
  )
}

function DetalleProveedor({
  proveedor: p,
  alEditar,
  alCambiarActivo,
}: {
  proveedor: Proveedor
  alEditar: () => void
  alCambiarActivo: (activo: boolean) => void
}) {
  const [detalle, setDetalle] = useState<ProveedorDetalle | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/proveedores/{id}', { params: { path: { id: p.id } } })
      .then(({ data }) => {
        if (cancelado) return
        if (data) setDetalle(data)
        else setFallo(true)
      })
      .catch(() => !cancelado && setFallo(true))
    return () => {
      cancelado = true
    }
  }, [p.id, p.porPagar, p.compras])

  return (
    <div className="fila-stock-detalle">
      {p.telefono && <span className="texto-suave texto-chico">WhatsApp {p.telefono.replace('+591', '+591 ')}</span>}
      {p.correo && <span className="texto-suave texto-chico">Correo {p.correo}</span>}
      {p.notas && <span className="texto-chico">{p.notas}</span>}

      <div className="historial">
        <span className="historial-titulo">Lo último que le pagaste</span>
        {fallo && <span className="texto-suave texto-chico">No pudimos cargar los precios.</span>}
        {!fallo && !detalle && <span className="texto-suave texto-chico">Cargando…</span>}
        {detalle?.ultimosPrecios.length === 0 && <span className="texto-suave texto-chico">Todavía no hay compras con este proveedor.</span>}
        {detalle?.ultimosPrecios.map((u) => (
          <span key={u.productoId} className="historial-linea">
            <span className="historial-cuando">{bs(u.costoUnitario)}</span>
            {u.producto}
          </span>
        ))}
      </div>

      <div className="acciones-fila">
        {p.activo && p.telefono && (
          <a
            className="boton boton-primario boton-chico"
            href={enlaceWhatsapp(p.telefono, `Hola ${p.nombre}, ¿cómo estás? Quería hacerte un pedido.`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Pedirle por WhatsApp
          </a>
        )}
        {p.activo && (
          <Link to={`/compras/nueva?proveedor=${p.id}`} className="boton boton-secundario boton-chico">
            Nueva compra
          </Link>
        )}
        <button type="button" className="boton boton-secundario boton-chico" onClick={alEditar}>
          Editar
        </button>
        <button type="button" className="boton boton-texto boton-chico" onClick={() => alCambiarActivo(!p.activo)}>
          {p.activo ? 'Desactivar' : 'Volver a activar'}
        </button>
      </div>
    </div>
  )
}

function DialogoProveedor({
  proveedor,
  alCerrar,
  alListo,
}: {
  proveedor: Proveedor | 'nuevo' | null
  alCerrar: () => void
  alListo: (p: Proveedor, nuevo: boolean) => void
}) {
  return (
    <Dialogo abierto={proveedor !== null} titulo={proveedor === 'nuevo' ? 'Nuevo proveedor' : 'Editar proveedor'} alCerrar={alCerrar} hoja>
      {/* Solo se monta abierto: cada vez arranca con lo que corresponde. */}
      {proveedor && <FormularioProveedor proveedor={proveedor === 'nuevo' ? null : proveedor} alCerrar={alCerrar} alListo={alListo} />}
    </Dialogo>
  )
}

function FormularioProveedor({
  proveedor,
  alCerrar,
  alListo,
}: {
  proveedor: Proveedor | null
  alCerrar: () => void
  alListo: (p: Proveedor, nuevo: boolean) => void
}) {
  const [nombre, setNombre] = useState(proveedor?.nombre ?? '')
  const [telefono, setTelefono] = useState(proveedor?.telefono?.replace('+591', '') ?? '')
  const [correo, setCorreo] = useState(proveedor?.correo ?? '')
  const [notas, setNotas] = useState(proveedor?.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return setError('Escribí el nombre del proveedor.')
    setError(null)
    setEnviando(true)
    try {
      const body = { nombre: nombre.trim(), telefono: telefono.trim() || null, correo: correo.trim() || null, notas: notas.trim() || null }
      const { data, error, response } = proveedor
        ? await api.PUT('/api/v1/proveedores/{id}', { params: { path: { id: proveedor.id } }, body })
        : await api.POST('/api/v1/proveedores', { body })
      if (data) alListo(data, !proveedor)
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
      <Campo
        etiqueta="WhatsApp (opcional)"
        prefijo="+591"
        inputMode="tel"
        value={telefono}
        maxLength={20}
        onChange={(e) => setTelefono(e.target.value)}
        ayuda="Para pedirle desde acá con un toque."
      />
      <Campo
        etiqueta="Correo (opcional)"
        type="email"
        inputMode="email"
        autoComplete="off"
        value={correo}
        maxLength={254}
        onChange={(e) => setCorreo(e.target.value)}
      />
      <AreaTexto etiqueta="Notas (opcional)" value={notas} maxLength={300} onChange={(e) => setNotas(e.target.value)} />

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
