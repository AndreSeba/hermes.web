import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { api, mensajeDeError, type PagoParaRevisar, type Plan, type TiendaAdmin } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { useSesionActiva } from '../../sesion/contexto'
import { bs, leerMonto, soloEnteros } from '../../util/dinero'
import { fechaLarga, limite } from '../../util/plan'

type Pestana = 'pagos' | 'tiendas' | 'planes'
const PESTANAS: { id: Pestana; nombre: string }[] = [
  { id: 'pagos', nombre: 'Pagos' },
  { id: 'tiendas', nombre: 'Tiendas' },
  { id: 'planes', nombre: 'Planes' },
]

// Panel de quien administra la plataforma: revisar pagos de planes, ver y cambiar el plan de cada tienda y editar los planes.
// Solo entra quien tiene el rol de administrador (el servidor lo vuelve a exigir en cada llamada: esto es solo comodidad).
export function Admin() {
  const { usuario } = useSesionActiva()
  const [pestana, setPestana] = useState<Pestana>('pagos')
  if (!usuario.esAdmin) return <Navigate to="/" replace />

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Administración</h1>
      </header>
      <div className="pestanas" role="tablist" aria-label="Secciones de administración">
        {PESTANAS.map((p) => (
          <a key={p.id} role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? 'active' : undefined} href={`#${p.id}`} onClick={(e) => { e.preventDefault(); setPestana(p.id) }}>
            {p.nombre}
          </a>
        ))}
      </div>
      {pestana === 'pagos' && <Pagos />}
      {pestana === 'tiendas' && <Tiendas />}
      {pestana === 'planes' && <Planes />}
    </div>
  )
}

// ───────────── Pagos por revisar ─────────────

function Pagos() {
  const [items, setItems] = useState<PagoParaRevisar[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [aRechazar, setARechazar] = useState<PagoParaRevisar | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/admin/pagos', { params: { query: { Estado: 'Pendiente' } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setError(null)
        setItems(data.items)
        setSiguiente(data.siguiente)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [version])

  async function verMas() {
    if (!siguiente) return
    const { data, error, response } = await api.GET('/api/v1/admin/pagos', { params: { query: { Estado: 'Pendiente', Cursor: siguiente } } })
    if (!data) return setError(mensajeDeError(error, response))
    setItems((previos) => [...(previos ?? []), ...data.items])
    setSiguiente(data.siguiente)
  }

  async function aprobar(p: PagoParaRevisar) {
    setError(null)
    setTrabajando(p.pago.id)
    try {
      const { data, error, response } = await api.POST('/api/v1/admin/pagos/{id}/aprobar', { params: { path: { id: p.pago.id } } })
      if (data) {
        setAviso(`Activaste el plan ${p.pago.plan} de ${p.tienda}.`)
        setVersion((n) => n + 1)
      } else {
        setError(mensajeDeError(error, response))
        if (response?.status === 409) setVersion((n) => n + 1) // ya lo resolvió otra persona
      }
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setTrabajando(null)
    }
  }

  return (
    <>
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {items === null && !error && <p className="texto-suave" role="status">Cargando pagos…</p>}
      {items?.length === 0 && (
        <section className="tarjeta vacio-inicial">
          <h2 className="titulo-seccion">No hay pagos esperando revisión</h2>
          <p className="texto-suave">Cuando una tienda pida un plan, aparece acá con su comprobante.</p>
        </section>
      )}
      {items && items.length > 0 && (
        <ul className="lista-ventas" aria-label="Pagos por revisar">
          {items.map((p) => (
            <li key={p.pago.id} className="tarjeta pago-revisar">
              <div className="fila-stock-datos">
                <span className="fila-stock-nombre">{p.tienda}</span>
                <span className="texto-suave texto-chico">{p.email} · /{p.slug}</span>
                <span>
                  Plan <strong>{p.pago.plan}</strong> · {p.pago.meses} {p.pago.meses === 1 ? 'mes' : 'meses'} · <strong>{bs(p.pago.monto)}</strong> por {p.pago.metodo === 'Qr' ? 'QR' : p.pago.metodo}
                </span>
                <span className="texto-suave texto-chico">Pedido el {fechaLarga(p.pago.creadoEn)}</span>
              </div>
              {p.pago.comprobante && (
                <a href={p.pago.comprobante.detalle} target="_blank" rel="noreferrer" className="pago-comprobante">
                  <img src={p.pago.comprobante.catalogo} alt={`Comprobante de ${p.tienda}`} width={140} />
                </a>
              )}
              <div className="acciones-fila">
                <button type="button" className="boton boton-secundario boton-chico" onClick={() => setARechazar(p)} disabled={trabajando === p.pago.id}>
                  Rechazar
                </button>
                <button type="button" className="boton boton-primario boton-chico" onClick={() => aprobar(p)} disabled={trabajando === p.pago.id} aria-label={`Aprobar el pago de ${p.tienda}`}>
                  {trabajando === p.pago.id ? 'Activando…' : 'Aprobar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {siguiente && (
        <button type="button" className="boton boton-secundario" onClick={verMas}>
          Ver más pagos
        </button>
      )}

      <Dialogo abierto={aRechazar !== null} titulo="Rechazar el pago" subtitulo={aRechazar ? `${aRechazar.tienda} · ${aRechazar.pago.plan}` : undefined} alCerrar={() => setARechazar(null)} hoja>
        {aRechazar && (
          <FormularioRechazo
            pago={aRechazar}
            alCerrar={() => setARechazar(null)}
            alListo={() => {
              setARechazar(null)
              setAviso('Rechazaste el pago. La dueña verá el motivo.')
              setVersion((n) => n + 1)
            }}
          />
        )}
      </Dialogo>
    </>
  )
}

function FormularioRechazo({ pago, alCerrar, alListo }: { pago: PagoParaRevisar; alCerrar: () => void; alListo: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!motivo.trim() || enviando) return
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/admin/pagos/{id}/rechazar', { params: { path: { id: pago.pago.id } }, body: { motivo: motivo.trim() } })
      if (data) alListo()
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <Campo etiqueta="Motivo (lo lee la dueña)" value={motivo} maxLength={300} autoComplete="off" onChange={(e) => setMotivo(e.target.value)} ayuda="Por ejemplo: el monto no coincide, el comprobante no se ve." />
      {error && <Aviso>{error}</Aviso>}
      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={!motivo.trim() || enviando}>
          {enviando ? 'Rechazando…' : 'Rechazar pago'}
        </button>
      </div>
    </form>
  )
}

// ───────────── Tiendas ─────────────

function Tiendas() {
  const [buscar, setBuscar] = useState('')
  const [consulta, setConsulta] = useState('')
  const [items, setItems] = useState<TiendaAdmin[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [planes, setPlanes] = useState<Plan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [aCambiar, setACambiar] = useState<TiendaAdmin | null>(null)

  useEffect(() => {
    const espera = setTimeout(() => setConsulta(buscar.trim()), 300)
    return () => clearTimeout(espera)
  }, [buscar])

  useEffect(() => {
    let cancelado = false
    Promise.all([api.GET('/api/v1/admin/tiendas', { params: { query: { Buscar: consulta || undefined } } }), api.GET('/api/v1/admin/planes')])
      .then(([t, p]) => {
        if (cancelado) return
        if (!t.data || !p.data) return setError(mensajeDeError(t.error ?? p.error, t.response))
        setError(null)
        setItems(t.data.items)
        setSiguiente(t.data.siguiente)
        setPlanes(p.data)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [consulta, version])

  async function verMas() {
    if (!siguiente) return
    const { data, error, response } = await api.GET('/api/v1/admin/tiendas', { params: { query: { Buscar: consulta || undefined, Cursor: siguiente } } })
    if (!data) return setError(mensajeDeError(error, response))
    setItems((previos) => [...(previos ?? []), ...data.items])
    setSiguiente(data.siguiente)
  }

  return (
    <>
      <Campo etiqueta="Buscar tienda" type="search" value={buscar} autoComplete="off" onChange={(e) => setBuscar(e.target.value)} ayuda="Por nombre, dirección o email de la dueña." />
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {items === null && !error && <p className="texto-suave" role="status">Cargando tiendas…</p>}
      {items?.length === 0 && <p className="texto-suave">No hay tiendas con ese dato.</p>}
      {items && items.length > 0 && (
        <ul className="lista-ventas" aria-label="Tiendas">
          {items.map((t) => (
            <li key={t.id} className="fila-venta">
              <div className="fila-stock-cabecera fila-gasto">
                <span className="fila-stock-datos">
                  <span className="fila-stock-nombre">{t.nombre}</span>
                  <span className="texto-suave texto-chico">{t.email} · /{t.slug}</span>
                  <span className="texto-chico">
                    Plan <strong>{t.plan}</strong>
                    {t.hasta ? ` hasta el ${fechaLarga(t.hasta)}` : ''} · {t.productos} productos · {t.almacenamientoMb} MB
                  </span>
                </span>
                <button type="button" className="boton boton-secundario boton-chico" onClick={() => setACambiar(t)} aria-label={`Cambiar el plan de ${t.nombre}`}>
                  Cambiar plan
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {siguiente && (
        <button type="button" className="boton boton-secundario" onClick={verMas}>
          Ver más tiendas
        </button>
      )}

      <Dialogo abierto={aCambiar !== null} titulo="Cambiar el plan" subtitulo={aCambiar?.nombre} alCerrar={() => setACambiar(null)} hoja>
        {aCambiar && (
          <FormularioAsignar
            tienda={aCambiar}
            planes={planes.filter((p) => p.activo)}
            alCerrar={() => setACambiar(null)}
            alListo={(t) => {
              setACambiar(null)
              setAviso(`${t.nombre} ahora tiene el plan ${t.plan}.`)
              setVersion((n) => n + 1)
            }}
          />
        )}
      </Dialogo>
    </>
  )
}

const DURACIONES: { meses: number | null; nombre: string }[] = [
  { meses: null, nombre: 'Sin vencimiento' },
  { meses: 1, nombre: '1 mes' },
  { meses: 3, nombre: '3 meses' },
  { meses: 6, nombre: '6 meses' },
  { meses: 12, nombre: '12 meses' },
]

function FormularioAsignar({ tienda, planes, alCerrar, alListo }: { tienda: TiendaAdmin; planes: Plan[]; alCerrar: () => void; alListo: (t: TiendaAdmin) => void }) {
  const [planId, setPlanId] = useState(planes.find((p) => p.nombre === tienda.plan)?.id ?? planes[0]?.id ?? '')
  const [meses, setMeses] = useState<number | null>(1)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!planId || enviando) return
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.PUT('/api/v1/admin/tiendas/{id}/plan', { params: { path: { id: tienda.id } }, body: { planId, meses } })
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
      <fieldset className="campo">
        <legend className="campo-etiqueta">Plan</legend>
        <div className="chips" role="group" aria-label="Plan">
          {planes.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={planId === p.id} onClick={() => setPlanId(p.id)}>
              {p.nombre}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="campo">
        <legend className="campo-etiqueta">Por cuánto tiempo</legend>
        <div className="chips" role="group" aria-label="Duración">
          {DURACIONES.map((d) => (
            <button key={d.nombre} type="button" className="chip" aria-pressed={meses === d.meses} onClick={() => setMeses(d.meses)}>
              {d.nombre}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="texto-suave texto-chico">El plan que tiene ahora se cierra hoy. Sirve también para dar una cortesía.</p>
      {error && <Aviso>{error}</Aviso>}
      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={!planId || enviando}>
          {enviando ? 'Guardando…' : 'Cambiar plan'}
        </button>
      </div>
    </form>
  )
}

// ───────────── Planes ─────────────

function Planes() {
  const [planes, setPlanes] = useState<Plan[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [aEditar, setAEditar] = useState<Plan | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/admin/planes')
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setError(null)
        setPlanes(data)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [version])

  return (
    <>
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {planes && (
        <ul className="lista-ventas" aria-label="Planes">
          {planes.map((p) => (
            <li key={p.id} className="fila-venta">
              <div className="fila-stock-cabecera fila-gasto">
                <span className="fila-stock-datos">
                  <span className="fila-stock-nombre">
                    {p.nombre}
                    {!p.activo && ' (desactivado)'}
                  </span>
                  <span className="texto-suave texto-chico">
                    {bs(p.precioMensual)} por mes · {limite(p.maxProductos, 'productos')} · {limite(p.maxAlmacenamientoMb, 'MB')} de fotos
                  </span>
                </span>
                <button type="button" className="boton boton-secundario boton-chico" onClick={() => setAEditar(p)} aria-label={`Editar el plan ${p.nombre}`}>
                  Editar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialogo abierto={aEditar !== null} titulo="Editar el plan" subtitulo={aEditar?.nombre} alCerrar={() => setAEditar(null)} hoja>
        {aEditar && (
          <FormularioPlan
            plan={aEditar}
            alCerrar={() => setAEditar(null)}
            alListo={(p) => {
              setAEditar(null)
              setAviso(`Guardaste el plan ${p.nombre}. Rige desde ya para todas las tiendas.`)
              setVersion((n) => n + 1)
            }}
          />
        )}
      </Dialogo>
    </>
  )
}

function FormularioPlan({ plan, alCerrar, alListo }: { plan: Plan; alCerrar: () => void; alListo: (p: Plan) => void }) {
  const [precio, setPrecio] = useState(String(plan.precioMensual))
  const [productos, setProductos] = useState(plan.maxProductos == null ? '' : String(plan.maxProductos))
  const [mb, setMb] = useState(plan.maxAlmacenamientoMb == null ? '' : String(plan.maxAlmacenamientoMb))
  const [activo, setActivo] = useState(plan.activo)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const precioNumero = leerMonto(precio)
  const productosNumero = productos.trim() === '' ? null : soloEnteros(productos)
  const mbNumero = mb.trim() === '' ? null : soloEnteros(mb)
  const valido = precioNumero !== null && (productos.trim() === '' || productosNumero !== null) && (mb.trim() === '' || mbNumero !== null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!valido || precioNumero === null || enviando) return
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.PUT('/api/v1/admin/planes/{id}', {
        params: { path: { id: plan.id } },
        body: { precioMensual: precioNumero, maxProductos: productosNumero, maxAlmacenamientoMb: mbNumero, activo },
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
      <Campo etiqueta="Precio por mes" prefijo="Bs" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      <Campo etiqueta="Máximo de productos" inputMode="numeric" value={productos} onChange={(e) => setProductos(e.target.value)} ayuda="Vacío = sin límite." />
      <Campo etiqueta="Espacio de fotos (MB)" inputMode="numeric" value={mb} onChange={(e) => setMb(e.target.value)} ayuda="Vacío = sin límite." />
      <label className="casilla">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Se puede contratar
      </label>
      {error && <Aviso>{error}</Aviso>}
      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={!valido || enviando}>
          {enviando ? 'Guardando…' : 'Guardar plan'}
        </button>
      </div>
    </form>
  )
}
