import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, mensajeDeError, type AvisoMargen, type Compra, type CompraResumen, type ResumenCompras } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { PestanasInventario } from '../../componentes/PestanasInventario'
import { bs } from '../../util/dinero'
import { cuando } from '../stock/historial'
import { enlaceWhatsapp } from '../../util/whatsapp'
import { etiquetaEstado, textoAvisoMargen } from './margen'

const POR_PAGINA = 20

type Vista = 'todas' | 'encamino' | 'porpagar'
const vistas: { id: Vista; etiqueta: string; api: 'Todas' | 'EnCamino' | 'PorPagar' }[] = [
  { id: 'todas', etiqueta: 'Todas', api: 'Todas' },
  { id: 'encamino', etiqueta: 'En camino', api: 'EnCamino' },
  { id: 'porpagar', etiqueta: 'Por pagar', api: 'PorPagar' },
]

// Lo que le pedís a tus proveedores. "Llegó" suma el stock y actualiza tu costo (y avisa si el margen quedó flojo);
// "Pagada" marca que ya le pagaste; "Anular" deshace una compra (si ya llegó, resta el stock que sumó).
export function Compras() {
  const [params, setParams] = useSearchParams()
  const vista = (vistas.find((v) => v.id === params.get('vista'))?.id ?? 'todas') as Vista

  const [items, setItems] = useState<CompraResumen[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenCompras | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [avisosMargen, setAvisosMargen] = useState<AvisoMargen[]>([])
  const [abierta, setAbierta] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [aAnular, setAAnular] = useState<CompraResumen | null>(null)

  const consulta = { Vista: vistas.find((v) => v.id === vista)!.api, Limite: POR_PAGINA }

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/compras', { params: { query: consulta } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setError(null)
        setItems(data.items)
        setSiguiente(data.siguiente)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    api.GET('/api/v1/compras/resumen').then(({ data }) => {
      if (!cancelado && data) setResumen(data)
    })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `consulta` se arma con estos mismos valores
  }, [vista, version])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 8000)
    return () => clearTimeout(t)
  }, [aviso])

  function cambiarVista(id: Vista) {
    setParams(id === 'todas' ? {} : { vista: id }, { replace: true })
  }

  async function verMas() {
    if (!siguiente) return
    setCargandoMas(true)
    try {
      const { data, error, response } = await api.GET('/api/v1/compras', { params: { query: { ...consulta, Cursor: siguiente } } })
      if (!data) return setError(mensajeDeError(error, response))
      setItems((previos) => [...(previos ?? []), ...data.items])
      setSiguiente(data.siguiente)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setCargandoMas(false)
    }
  }

  // Después de recibir, pagar o anular: se vuelve a pedir la lista y el resumen (la compra puede cambiar de vista).
  function cambio(mensaje: string, margenes: AvisoMargen[] = []) {
    setAviso(mensaje)
    setAvisosMargen(margenes)
    setAAnular(null)
    setAbierta(null)
    setVersion((n) => n + 1)
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Compras</h1>
        <Link to="/compras/nueva" className="boton boton-primario boton-chico">
          <Icono nombre="mas" tamano={16} />
          Nueva compra
        </Link>
      </header>
      <PestanasInventario />

      {resumen && (
        <section className="resumen-stock" aria-label="Resumen de compras">
          <span className="resumen-stock-chico">Les debés a tus proveedores</span>
          <span className="resumen-stock-valor">{bs(resumen.porPagar)}</span>
          <div className="resumen-chips">
            {resumen.comprasPorPagar > 0 && (
              <span className="resumen-chip resumen-chip-ambar">
                {resumen.comprasPorPagar === 1 ? '1 compra por pagar' : `${resumen.comprasPorPagar} compras por pagar`}
              </span>
            )}
            {resumen.enCamino > 0 && (
              <span className="resumen-chip resumen-chip-verde">
                {resumen.enCamino === 1 ? '1 pedido en camino' : `${resumen.enCamino} pedidos en camino`} · {bs(resumen.valorEnCamino)}
              </span>
            )}
            {resumen.comprasPorPagar === 0 && resumen.enCamino === 0 && <span className="resumen-chip resumen-chip-verde">Todo al día</span>}
          </div>
        </section>
      )}

      <div className="segmentos" role="group" aria-label="Filtrar">
        {vistas.map((v) => (
          <button key={v.id} type="button" className="segmento" aria-pressed={vista === v.id} onClick={() => cambiarVista(v.id)}>
            {v.etiqueta}
          </button>
        ))}
      </div>

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {avisosMargen.length > 0 && (
        <Aviso tipo="advertencia">
          <strong>Revisá tus precios:</strong>
          <ul className="avisos-margen">
            {avisosMargen.map((a) => (
              <li key={a.productoId}>{textoAvisoMargen(a)}</li>
            ))}
          </ul>
          <Link to="/catalogo?filtro=revisar">Ver los productos para revisar</Link>
        </Aviso>
      )}
      {error && <Aviso>{error}</Aviso>}
      {items === null && !error && (
        <p className="texto-suave" role="status">
          Cargando tus compras…
        </p>
      )}

      {items?.length === 0 &&
        (vista === 'todas' ? (
          <section className="tarjeta vacio-inicial">
            <span className="icono-caja" aria-hidden="true">
              <Icono nombre="compras" tamano={22} />
            </span>
            <h2 className="titulo-seccion">Todavía no registraste compras</h2>
            <p className="texto-suave">Anotá lo que le comprás a tus proveedores: al recibirlo se suma al stock y se actualiza tu costo.</p>
            <Link to="/compras/nueva" className="boton boton-primario">
              Registrar una compra
            </Link>
          </section>
        ) : (
          <p className="vacio">{vista === 'encamino' ? 'No tenés pedidos en camino.' : 'No le debés nada a tus proveedores.'}</p>
        ))}

      {items && items.length > 0 && (
        <>
          <ul className="lista-ventas">
            {items.map((c) => (
              <FilaCompra
                key={c.id}
                compra={c}
                abierta={abierta === c.id}
                alAlternar={() => setAbierta(abierta === c.id ? null : c.id)}
                alCambio={cambio}
                alAnular={() => setAAnular(c)}
                alError={setError}
              />
            ))}
          </ul>
          {siguiente && (
            <button type="button" className="boton boton-secundario" onClick={verMas} disabled={cargandoMas}>
              {cargandoMas ? 'Cargando…' : 'Ver más compras'}
            </button>
          )}
        </>
      )}

      <DialogoAnular compra={aAnular} alCerrar={() => setAAnular(null)} alListo={() => cambio('Compra anulada. Si ya había llegado, el stock volvió a lo de antes.')} />
    </div>
  )
}

function FilaCompra({
  compra: c,
  abierta,
  alAlternar,
  alCambio,
  alAnular,
  alError,
}: {
  compra: CompraResumen
  abierta: boolean
  alAlternar: () => void
  alCambio: (mensaje: string, margenes?: AvisoMargen[]) => void
  alAnular: () => void
  alError: (mensaje: string | null) => void
}) {
  return (
    <li className={`fila-venta${c.estado === 'Anulada' ? ' fila-venta-anulada' : ''}`}>
      <button
        type="button"
        className="fila-stock-cabecera"
        aria-expanded={abierta}
        aria-label={`${abierta ? 'Cerrar' : 'Ver detalle de'} la compra a ${c.proveedor} de ${bs(c.total)}`}
        onClick={alAlternar}
      >
        <span className="fila-stock-datos">
          <span className="fila-stock-nombre">{c.proveedor}</span>
          <span className="texto-suave texto-chico">{c.detalle}</span>
          <span className="fila-stock-linea">
            <span className={`etiqueta-stock etiqueta-stock-${c.estado === 'EnCamino' ? 'pocos' : c.estado === 'Recibida' ? 'ok' : 'sincontrol'}`}>{etiquetaEstado[c.estado]}</span>
            {c.estado !== 'Anulada' && (
              <span className={`etiqueta-stock etiqueta-stock-${c.pagada ? 'ok' : 'agotado'}`}>{c.pagada ? 'Pagada' : 'Por pagar'}</span>
            )}
            <span className="texto-suave texto-chico">{cuando(c.fecha)}</span>
          </span>
        </span>
        <strong className="fila-venta-total">{bs(c.total)}</strong>
      </button>
      {abierta && <DetalleCompra id={c.id} alCambio={alCambio} alAnular={alAnular} alError={alError} />}
    </li>
  )
}

function DetalleCompra({
  id,
  alCambio,
  alAnular,
  alError,
}: {
  id: string
  alCambio: (mensaje: string, margenes?: AvisoMargen[]) => void
  alAnular: () => void
  alError: (mensaje: string | null) => void
}) {
  const [compra, setCompra] = useState<Compra | null>(null)
  const [fallo, setFallo] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/compras/{id}', { params: { path: { id } } })
      .then(({ data }) => {
        if (cancelado) return
        if (data) setCompra(data)
        else setFallo(true)
      })
      .catch(() => !cancelado && setFallo(true))
    return () => {
      cancelado = true
    }
  }, [id])

  async function recibir() {
    setTrabajando(true)
    alError(null)
    try {
      const { data, error, response } = await api.POST('/api/v1/compras/{id}/recibir', { params: { path: { id } } })
      if (data) alCambio('Anotamos que llegó: sumamos el stock y actualizamos tu costo.', data.avisos)
      else alError(mensajeDeError(error, response))
    } catch {
      alError(mensajeDeError(null))
    } finally {
      setTrabajando(false)
    }
  }

  async function pagar() {
    setTrabajando(true)
    alError(null)
    try {
      const { data, error, response } = await api.POST('/api/v1/compras/{id}/pagar', { params: { path: { id } } })
      if (data) alCambio('Marcada como pagada.')
      else alError(mensajeDeError(error, response))
    } catch {
      alError(mensajeDeError(null))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="fila-stock-detalle">
      {fallo && <span className="texto-suave texto-chico">No pudimos cargar el detalle.</span>}
      {!fallo && !compra && <span className="texto-suave texto-chico">Cargando…</span>}
      {compra && (
        <>
          <ul className="lineas-venta">
            {compra.lineas.map((l) => (
              <li key={l.id}>
                <span>
                  {l.cantidad} × {l.descripcion}
                  <span className="texto-suave texto-chico"> · {bs(l.costoUnitario)} c/u</span>
                </span>
                <strong>{bs(l.subtotal)}</strong>
              </li>
            ))}
          </ul>
          {compra.notas && <p className="texto-suave texto-chico">{compra.notas}</p>}

          {compra.estado !== 'Anulada' && (
            <div className="acciones-fila">
              {compra.estado === 'EnCamino' && (
                <button type="button" className="boton boton-primario boton-chico" onClick={recibir} disabled={trabajando}>
                  Llegó
                </button>
              )}
              {!compra.pagada && (
                <button type="button" className="boton boton-secundario boton-chico" onClick={pagar} disabled={trabajando}>
                  Marcar pagada
                </button>
              )}
              {compra.estado === 'EnCamino' && compra.proveedorTelefono && (
                <a
                  className="boton boton-secundario boton-chico"
                  href={enlaceWhatsapp(compra.proveedorTelefono, `Hola ${compra.proveedor}, ¿cómo va mi pedido?`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Preguntarle por WhatsApp
                </a>
              )}
              <button type="button" className="boton boton-texto boton-chico" onClick={alAnular} disabled={trabajando}>
                Anular compra
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DialogoAnular({ compra, alCerrar, alListo }: { compra: CompraResumen | null; alCerrar: () => void; alListo: () => void }) {
  return (
    <Dialogo abierto={compra !== null} titulo="¿Anular esta compra?" subtitulo={compra ? `${compra.proveedor} · ${bs(compra.total)}` : undefined} alCerrar={alCerrar} hoja>
      {compra && <FormularioAnular compra={compra} alCerrar={alCerrar} alListo={alListo} />}
    </Dialogo>
  )
}

function FormularioAnular({ compra, alCerrar, alListo }: { compra: CompraResumen; alCerrar: () => void; alListo: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function anular() {
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/compras/{id}/anular', { params: { path: { id: compra.id } } })
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
      <p className="texto-suave">
        {compra.estado === 'Recibida'
          ? 'Ya llegó: al anularla se resta del stock lo que había sumado. Si ya vendiste esas unidades, no se va a poder. Tu costo no vuelve al anterior.'
          : 'Todavía no llegó, así que no cambia tu stock.'}{' '}
        No se puede deshacer.
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
