import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { api, mensajeDeError, type MetodoPago, type Pedido, type PedidoResumen, type VistaPedidos } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { PEDIDOS_CAMBIARON } from '../../diseno/secciones'
import { useSesionActiva } from '../../sesion/contexto'
import { bs } from '../../util/dinero'
import { cuando } from '../stock/historial'
import { metodosDePago } from '../ventas/pagos'

const POR_PAGINA = 20

const vistas: { id: VistaPedidos; etiqueta: string }[] = [
  { id: 'Pendientes', etiqueta: 'Por atender' },
  { id: 'Entregados', etiqueta: 'Entregados' },
  { id: 'Cancelados', etiqueta: 'Cancelados' },
]

const hora = (iso: string) => new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

const etiquetaEstado: Record<Pedido['estado'], string> = {
  Nuevo: 'Nuevo',
  Confirmado: 'Confirmado',
  Entregado: 'Entregado',
  Cancelado: 'Cancelado',
}

// Los pedidos que llegan del carrito de la tienda pública. Pedir no descuenta stock: recién "Entregar y cobrar" registra la
// venta (y ahí se descuenta). Un pedido no se borra: se entrega o se cancela.
export function Pedidos() {
  const [params, setParams] = useSearchParams()
  const vista = (vistas.find((v) => v.id === params.get('vista'))?.id ?? 'Pendientes') as VistaPedidos

  const [items, setItems] = useState<PedidoResumen[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/pedidos', { params: { query: { Vista: vista, Limite: POR_PAGINA } } })
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
  }, [vista, version])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  async function verMas() {
    if (!siguiente) return
    setCargandoMas(true)
    try {
      const { data, error, response } = await api.GET('/api/v1/pedidos', { params: { query: { Vista: vista, Limite: POR_PAGINA, Cursor: siguiente } } })
      if (!data) return setError(mensajeDeError(error, response))
      setItems((previos) => [...(previos ?? []), ...data.items])
      setSiguiente(data.siguiente)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setCargandoMas(false)
    }
  }

  function cambiarVista(id: VistaPedidos) {
    setItems(null)
    setParams(id === 'Pendientes' ? {} : { vista: id }, { replace: true })
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Pedidos</h1>
      </header>

      <div className="pestanas" role="tablist" aria-label="Qué pedidos ver">
        {vistas.map((v) => (
          <a
            key={v.id}
            role="tab"
            aria-selected={vista === v.id}
            className={vista === v.id ? 'active' : undefined}
            href={`?vista=${v.id}`}
            onClick={(e) => {
              e.preventDefault()
              cambiarVista(v.id)
            }}
          >
            {v.etiqueta}
          </a>
        ))}
      </div>

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {items === null && !error && (
        <p className="texto-suave" role="status">
          Cargando pedidos…
        </p>
      )}

      {items?.length === 0 && (
        <section className="tarjeta vacio-inicial">
          <span className="icono-caja" aria-hidden="true">
            <Icono nombre="bolsa" tamano={22} />
          </span>
          <h2 className="titulo-seccion">{vista === 'Pendientes' ? 'No tenés pedidos por atender' : vista === 'Entregados' ? 'Todavía no entregaste pedidos' : 'No hay pedidos cancelados'}</h2>
          {vista === 'Pendientes' && (
            <p className="texto-suave">Cuando un cliente arme su carrito en tu tienda y lo envíe, el pedido aparece acá (y te llega su aviso por WhatsApp).</p>
          )}
        </section>
      )}

      {items && items.length > 0 && (
        <>
          <ul className="lista-ventas" aria-label="Pedidos">
            {items.map((p) => (
              <li key={p.id} className="fila-venta">
                <button type="button" className="fila-stock-cabecera fila-pedido" onClick={() => setAbierto(p.id)} aria-label={`Ver el pedido #${p.numero} de ${p.clienteNombre}`}>
                  <span className="fila-stock-datos">
                    <span className="fila-stock-nombre">
                      #{p.numero} · {p.clienteNombre}
                    </span>
                    <span className="texto-suave texto-chico">{p.detalle}</span>
                    <span className="texto-suave texto-chico">
                      {cuando(p.fecha)} {hora(p.fecha)} · {p.entrega === 'Envio' ? 'Envío' : 'Retira'}
                    </span>
                  </span>
                  <span className="fila-pedido-derecha">
                    <strong className="fila-venta-total">{bs(p.total)}</strong>
                    <span className={`etiqueta etiqueta-pedido-${p.estado.toLowerCase()}`}>{etiquetaEstado[p.estado]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {siguiente && (
            <button type="button" className="boton boton-secundario" onClick={verMas} disabled={cargandoMas}>
              {cargandoMas ? 'Cargando…' : 'Ver más pedidos'}
            </button>
          )}
        </>
      )}

      <Dialogo abierto={abierto !== null} titulo="Pedido" alCerrar={() => setAbierto(null)} hoja>
        {abierto && (
          <DetallePedido
            id={abierto}
            alCerrar={() => setAbierto(null)}
            alCambiar={(texto) => {
              setAbierto(null)
              setAviso(texto)
              setVersion((n) => n + 1)
              window.dispatchEvent(new Event(PEDIDOS_CAMBIARON))
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

type Paso = 'ver' | 'entregar' | 'cancelar'

function DetallePedido({ id, alCerrar, alCambiar }: { id: string; alCerrar: () => void; alCambiar: (aviso: string) => void }) {
  const { tienda } = useSesionActiva()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paso, setPaso] = useState<Paso>('ver')
  const [metodo, setMetodo] = useState<MetodoPago>('Efectivo')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/pedidos/{id}', { params: { path: { id } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (data) setPedido(data)
        else setError(mensajeDeError(error, response))
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [id])

  async function accion(hacer: () => Promise<{ data?: Pedido; error?: unknown; response: Response }>, aviso: (p: Pedido) => string) {
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await hacer()
      if (data) alCambiar(aviso(data))
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  if (!pedido) return error ? <Aviso>{error}</Aviso> : <p className="texto-suave">Cargando…</p>

  const abierto = pedido.estado === 'Nuevo' || pedido.estado === 'Confirmado'
  const cambioPrecio = abierto && pedido.lineas.some((l) => l.precioActual !== l.precioUnitario)
  const totalHoy = pedido.lineas.reduce((s, l) => s + l.precioActual * l.cantidad, 0)
  const digitos = pedido.clienteCelular.replace(/\D/g, '')
  const mensaje = `Hola ${pedido.clienteNombre}! Te escribo de ${tienda.nombre} por tu pedido #${pedido.numero}.`

  return (
    <div className="formulario formulario-hoja detalle-pedido">
      <p className="detalle-pedido-cabecera">
        <strong>
          #{pedido.numero} · {pedido.clienteNombre}
        </strong>
        <span className={`etiqueta etiqueta-pedido-${pedido.estado.toLowerCase()}`}>{etiquetaEstado[pedido.estado]}</span>
      </p>
      <p className="texto-suave texto-chico">
        {cuando(pedido.fecha)} {hora(pedido.fecha)}
      </p>

      <a className="boton boton-secundario boton-chico" href={`https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer">
        <Icono nombre="whatsapp" tamano={16} />
        Escribirle ({pedido.clienteCelular.replace('+591', '')})
      </a>

      <div className="detalle-pedido-bloque">
        <span className="historial-titulo">Entrega</span>
        {pedido.entrega === 'Envio' ? (
          <p>
            Envío a <strong>{pedido.direccion}</strong>
            {pedido.referencia && <span className="texto-suave"> · {pedido.referencia}</span>}
          </p>
        ) : (
          <p>Pasa a retirarlo.</p>
        )}
        {pedido.nota && <p className="texto-suave">“{pedido.nota}”</p>}
      </div>

      <ul className="lineas-venta">
        {pedido.lineas.map((l, i) => (
          <li key={`${l.varianteId}-${i}`}>
            <span>
              {l.cantidad} × {l.descripcion}
            </span>
            <span>{bs(l.subtotal)}</span>
          </li>
        ))}
        <li className="lineas-venta-total">
          <span>Total</span>
          <strong>{bs(pedido.total)}</strong>
        </li>
      </ul>

      {cambioPrecio && (
        <Aviso tipo="advertencia">
          Cambiaste precios desde que llegó el pedido: hoy suma {bs(totalHoy)}. La venta se registra con los precios de hoy.
        </Aviso>
      )}
      {pedido.estado === 'Cancelado' && pedido.motivoCancelacion && <p className="texto-suave">Motivo: {pedido.motivoCancelacion}</p>}
      {error && <Aviso>{error}</Aviso>}

      {abierto && paso === 'ver' && (
        <div className="acciones-pedido">
          <button type="button" className="boton boton-primario" onClick={() => setPaso('entregar')}>
            Entregar y cobrar
          </button>
          <div className="acciones-fila">
            {pedido.estado === 'Nuevo' && (
              <button
                type="button"
                className="boton boton-secundario"
                disabled={enviando}
                onClick={() => accion(() => api.POST('/api/v1/pedidos/{id}/confirmar', { params: { path: { id } } }), (p) => `Confirmaste el pedido #${p.numero}.`)}
              >
                Confirmar
              </button>
            )}
            <button type="button" className="boton boton-secundario" onClick={() => setPaso('cancelar')}>
              Cancelar pedido
            </button>
          </div>
        </div>
      )}

      {abierto && paso === 'entregar' && (
        <form
          className="formulario"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            accion(
              () => api.POST('/api/v1/pedidos/{id}/entregar', { params: { path: { id } }, body: { metodoPago: metodo } }),
              (p) => `Pedido #${p.numero} entregado: la venta quedó registrada y el stock se descontó.`,
            )
          }}
        >
          <fieldset className="campo">
            <legend className="campo-etiqueta">¿Cómo te pagó?</legend>
            <div className="chips" role="group" aria-label="Forma de pago">
              {metodosDePago.map((m) => (
                <button key={m.id} type="button" className="chip" aria-pressed={metodo === m.id} onClick={() => setMetodo(m.id)}>
                  {m.etiqueta}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="texto-suave texto-chico">Se registra como una venta y se descuenta del stock.</p>
          <div className="acciones-fila acciones-hoja">
            <button type="button" className="boton boton-secundario" onClick={() => setPaso('ver')}>
              Volver
            </button>
            <button type="submit" className="boton boton-primario" disabled={enviando}>
              {enviando ? 'Registrando…' : `Registrar venta de ${bs(totalHoy)}`}
            </button>
          </div>
        </form>
      )}

      {abierto && paso === 'cancelar' && (
        <form
          className="formulario"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            accion(
              () => api.POST('/api/v1/pedidos/{id}/cancelar', { params: { path: { id } }, body: { motivo: motivo.trim() || null } }),
              (p) => `Cancelaste el pedido #${p.numero}.`,
            )
          }}
        >
          <Campo etiqueta="Motivo (opcional)" value={motivo} maxLength={300} autoComplete="off" onChange={(e) => setMotivo(e.target.value)} ayuda="Por ejemplo: el cliente no respondió." />
          <div className="acciones-fila acciones-hoja">
            <button type="button" className="boton boton-secundario" onClick={() => setPaso('ver')}>
              Volver
            </button>
            <button type="submit" className="boton boton-primario" disabled={enviando}>
              {enviando ? 'Cancelando…' : 'Sí, cancelar pedido'}
            </button>
          </div>
        </form>
      )}

      {!abierto && (
        <div className="acciones-fila acciones-hoja">
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
