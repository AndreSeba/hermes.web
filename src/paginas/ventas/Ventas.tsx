import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, mensajeDeError, type ResumenVentas, type Venta, type VentaPorVendedor, type VentaResumen } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { usePermisos } from '../../sesion/contexto'
import { P } from '../../sesion/permisos'
import { bs } from '../../util/dinero'
import { cuando } from '../stock/historial'
import { nombreDePago } from './pagos'

const POR_PAGINA = 20

type Periodo = 'hoy' | 'semana' | 'mes'
const periodos: { id: Periodo; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'mes', etiqueta: 'Mes' },
]

// Los límites se calculan en la hora de quien mira: "hoy" es desde la medianoche de su celular. Hasta es
// exclusivo (el servidor lo toma así). Semana = hoy y los 6 días anteriores.
function rango(periodo: Periodo, ahora = new Date()) {
  const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const manana = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1)
  const desde =
    periodo === 'hoy'
      ? dia
      : periodo === 'semana'
        ? new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - 6)
        : new Date(dia.getFullYear(), dia.getMonth(), 1)
  return { Desde: desde.toISOString(), Hasta: manana.toISOString() }
}

const hora = (iso: string) => new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

export function Ventas() {
  const { tiene } = usePermisos()
  const verNumeros = tiene(`${P.ventasVer}|${P.inicioVer}`) // los números del período
  const veTodas = tiene(P.ventasVer) // sin esto solo se ven las ventas propias
  const veCostos = tiene(P.costosVer)
  const puedeAnular = tiene(P.ventasAnular)
  const puedeVender = tiene(P.ventasRegistrar)
  const [params, setParams] = useSearchParams()
  const periodo = (periodos.find((p) => p.id === params.get('periodo'))?.id ?? 'hoy') as Periodo
  const conAnuladas = params.get('anuladas') === '1'

  const [items, setItems] = useState<VentaResumen[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenVentas | null>(null)
  const [porVendedor, setPorVendedor] = useState<VentaPorVendedor[]>([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [aAnular, setAAnular] = useState<VentaResumen | null>(null)

  useEffect(() => {
    let cancelado = false
    const limites = rango(periodo)
    api
      .GET('/api/v1/ventas', { params: { query: { ...limites, IncluirAnuladas: conAnuladas, Limite: POR_PAGINA } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setError(null)
        setItems(data.items)
        setSiguiente(data.siguiente)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    if (verNumeros) {
      api.GET('/api/v1/ventas/resumen', { params: { query: limites } }).then(({ data }) => {
        if (!cancelado && data) setResumen(data)
      })
    }
    if (veTodas) {
      api.GET('/api/v1/ventas/por-vendedor', { params: { query: limites } }).then(({ data }) => {
        if (!cancelado && data) setPorVendedor(data)
      })
    }
    return () => {
      cancelado = true
    }
  }, [periodo, conAnuladas, version, verNumeros, veTodas])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  function cambiar(cambios: Record<string, string | null>) {
    setParams(
      (previos) => {
        const nuevos = new URLSearchParams(previos)
        for (const [clave, valor] of Object.entries(cambios)) {
          if (valor) nuevos.set(clave, valor)
          else nuevos.delete(clave)
        }
        return nuevos
      },
      { replace: true },
    )
  }

  async function verMas() {
    if (!siguiente) return
    setCargandoMas(true)
    try {
      const { data, error, response } = await api.GET('/api/v1/ventas', {
        params: { query: { ...rango(periodo), IncluirAnuladas: conAnuladas, Limite: POR_PAGINA, Cursor: siguiente } },
      })
      if (!data) return setError(mensajeDeError(error, response))
      setItems((previos) => [...(previos ?? []), ...data.items])
      setSiguiente(data.siguiente)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setCargandoMas(false)
    }
  }

  function anulada(v: Venta) {
    setAAnular(null)
    setAbierta(null)
    setAviso('Venta anulada. Si llevaba stock, ya volvió.')
    setItems((previos) => (previos ?? []).map((x) => (x.id === v.id ? { ...x, anulada: true } : x)).filter((x) => conAnuladas || !x.anulada))
    setVersion((n) => n + 1)
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">{veTodas ? 'Ventas' : 'Mis ventas'}</h1>
        {puedeVender && (
          <Link to="/venta" className="boton boton-primario boton-chico">
            <Icono nombre="mas" tamano={16} />
            Nueva venta
          </Link>
        )}
      </header>

      <div className="segmentos" role="group" aria-label="Período">
        {periodos.map((p) => (
          <button
            key={p.id}
            type="button"
            className="segmento"
            aria-pressed={periodo === p.id}
            onClick={() => cambiar({ periodo: p.id === 'hoy' ? null : p.id })}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {resumen && (
        <section className="resumen-stock" aria-label="Resumen de ventas">
          <span className="resumen-stock-chico">Vendiste</span>
          <span className="resumen-stock-valor">{bs(resumen.total)}</span>
          <span className="resumen-stock-chico">
            {resumen.ventas === 1 ? '1 venta' : `${resumen.ventas} ventas`} · {resumen.unidades === 1 ? '1 unidad' : `${resumen.unidades} unidades`}
          </span>
          {resumen.ventas > 0 && veCostos && (
            <div className="resumen-chips">
              <span className="resumen-chip resumen-chip-verde">Ganaste {bs(resumen.ganancia)}</span>
              {resumen.unidadesSinCosto > 0 && (
                <span className="resumen-chip resumen-chip-ambar">
                  {resumen.unidadesSinCosto === 1 ? '1 unidad sin costo cargado' : `${resumen.unidadesSinCosto} unidades sin costo cargado`}
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {porVendedor.length > 1 && (
        <section className="tarjeta" aria-label="Ventas por vendedor">
          <h2 className="titulo-seccion">Quién vendió</h2>
          <ul className="lineas-venta">
            {porVendedor.map((x) => (
              <li key={x.usuarioId ?? x.vendedor}>
                <span>
                  {x.vendedor}
                  <span className="texto-suave texto-chico"> · {x.ventas === 1 ? '1 venta' : `${x.ventas} ventas`}</span>
                </span>
                <strong>{bs(x.total)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="chips">
        <button type="button" className="chip" aria-pressed={conAnuladas} onClick={() => cambiar({ anuladas: conAnuladas ? null : '1' })}>
          Mostrar anuladas{resumen && resumen.anuladas > 0 ? ` (${resumen.anuladas})` : ''}
        </button>
      </div>

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {items === null && !error && (
        <p className="texto-suave" role="status">
          Cargando tus ventas…
        </p>
      )}

      {items?.length === 0 && (
        <section className="tarjeta vacio-inicial">
          <span className="icono-caja" aria-hidden="true">
            <Icono nombre="ventas" tamano={22} />
          </span>
          <h2 className="titulo-seccion">{periodo === 'hoy' ? 'Hoy todavía no vendiste' : 'No hay ventas en este período'}</h2>
          <p className="texto-suave">Anotá una venta en segundos: el stock se descuenta solo.</p>
          <Link to="/venta" className="boton boton-primario">
            Nueva venta
          </Link>
        </section>
      )}

      {items && items.length > 0 && (
        <>
          <ul className="lista-ventas">
            {items.map((v) => (
              <FilaVenta
                key={v.id}
                venta={v}
                abierta={abierta === v.id}
                alAlternar={() => setAbierta(abierta === v.id ? null : v.id)}
                alAnular={() => setAAnular(v)}
                veCostos={veCostos}
                puedeAnular={puedeAnular}
              />
            ))}
          </ul>
          {siguiente && (
            <button type="button" className="boton boton-secundario" onClick={verMas} disabled={cargandoMas}>
              {cargandoMas ? 'Cargando…' : 'Ver más ventas'}
            </button>
          )}
        </>
      )}

      <DialogoAnular venta={aAnular} alCerrar={() => setAAnular(null)} alListo={anulada} />
    </div>
  )
}

function FilaVenta({
  venta: v,
  abierta,
  alAlternar,
  alAnular,
  veCostos,
  puedeAnular,
}: {
  venta: VentaResumen
  abierta: boolean
  alAlternar: () => void
  alAnular: () => void
  veCostos: boolean
  puedeAnular: boolean
}) {
  return (
    <li className={`fila-venta${v.anulada ? ' fila-venta-anulada' : ''}`}>
      <button
        type="button"
        className="fila-stock-cabecera"
        aria-expanded={abierta}
        aria-label={`${abierta ? 'Cerrar' : 'Ver detalle de'} la venta de ${bs(v.total)}`}
        onClick={alAlternar}
      >
        <span className="fila-stock-datos">
          <span className="fila-stock-nombre">{v.detalle}</span>
          <span className="texto-suave texto-chico">
            {cuando(v.fecha)} {hora(v.fecha)} · {nombreDePago(v.metodoPago)}
            {v.cliente ? ` · ${v.cliente}` : ''}
            {v.vendedor ? ` · Vendió ${v.vendedor}` : ''}
          </span>
        </span>
        <span className="fila-venta-total">
          {v.anulada && <span className="etiqueta etiqueta-pierde">Anulada</span>}
          <strong>{bs(v.total)}</strong>
        </span>
      </button>
      {abierta && <DetalleVenta id={v.id} anulada={v.anulada} alAnular={alAnular} veCostos={veCostos} puedeAnular={puedeAnular} />}
    </li>
  )
}

function DetalleVenta({
  id,
  anulada,
  alAnular,
  veCostos,
  puedeAnular,
}: {
  id: string
  anulada: boolean
  alAnular: () => void
  veCostos: boolean
  puedeAnular: boolean
}) {
  const [venta, setVenta] = useState<Venta | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/ventas/{id}', { params: { path: { id } } })
      .then(({ data }) => {
        if (cancelado) return
        if (data) setVenta(data)
        else setFallo(true)
      })
      .catch(() => !cancelado && setFallo(true))
    return () => {
      cancelado = true
    }
  }, [id])

  return (
    <div className="fila-stock-detalle">
      {fallo && <span className="texto-suave texto-chico">No pudimos cargar el detalle.</span>}
      {!fallo && !venta && <span className="texto-suave texto-chico">Cargando…</span>}
      {venta && (
        <>
          <ul className="lineas-venta">
            {venta.lineas.map((l) => (
              <li key={l.id}>
                <span>
                  {l.cantidad} × {l.descripcion}
                  <span className="texto-suave texto-chico"> · {bs(l.precioUnitario)} c/u</span>
                </span>
                <strong>{bs(l.subtotal)}</strong>
              </li>
            ))}
          </ul>
          {veCostos && (
            <p className="texto-suave texto-chico">
              {venta.ganancia === null ? 'Sin costo cargado en algún producto: no se puede calcular la ganancia.' : `Ganaste ${bs(venta.ganancia)} con esta venta.`}
            </p>
          )}
          {!anulada && puedeAnular && (
            <div className="acciones-fila">
              <button type="button" className="boton boton-secundario" onClick={alAnular}>
                Anular venta
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DialogoAnular({ venta, alCerrar, alListo }: { venta: VentaResumen | null; alCerrar: () => void; alListo: (v: Venta) => void }) {
  return (
    <Dialogo abierto={venta !== null} titulo="¿Anular esta venta?" subtitulo={venta?.detalle} alCerrar={alCerrar} hoja>
      {venta && <FormularioAnular venta={venta} alCerrar={alCerrar} alListo={alListo} />}
    </Dialogo>
  )
}

function FormularioAnular({ venta, alCerrar, alListo }: { venta: VentaResumen; alCerrar: () => void; alListo: (v: Venta) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function anular() {
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/ventas/{id}/anular', { params: { path: { id: venta.id } } })
      if (data) alListo(data)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="formulario formulario-hoja">
      <p className="texto-suave">
        La venta de {bs(venta.total)} deja de contar en tus números y, si llevaba stock, las unidades vuelven. No se puede deshacer.
      </p>
      {error && <Aviso>{error}</Aviso>}
      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          No, dejarla
        </button>
        <button type="button" className="boton boton-primario" onClick={anular} disabled={enviando}>
          {enviando ? 'Anulando…' : 'Sí, anular'}
        </button>
      </div>
    </div>
  )
}
