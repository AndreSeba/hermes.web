import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  api,
  mensajeDeError,
  type AvisoMargen,
  type Compra,
  type PrecioProveedor,
  type ProductoVendible,
  type Proveedor,
  type VarianteVendible,
} from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Contador } from '../../componentes/Contador'
import { Icono } from '../../componentes/Icono'
import { bs, leerMonto, soloEnteros } from '../../util/dinero'
import { enlaceWhatsapp } from '../../util/whatsapp'
import { etiquetaDeVariante } from '../stock/historial'
import { textoAvisoMargen } from './margen'

const POR_PAGINA = 20
const MAXIMO_POR_LINEA = 100_000

type Linea = { producto: ProductoVendible; variante: VarianteVendible; cantidad: number }

// Registrar lo que le pedís (o ya te llegó) a un proveedor. El costo se escribe UNA vez por producto (vale para
// todos sus colores y talles). "Ya llegó" suma el stock y actualiza tu costo en el momento y te avisa si el margen
// queda flojo; "Ya la pagué" la deja pagada. Igual que en ventas, cada intento lleva una clave propia: un reintento
// por mala señal no duplica la compra.
export function NuevaCompra() {
  const [params] = useSearchParams()
  const [proveedores, setProveedores] = useState<Proveedor[] | null>(null)
  const [proveedorId, setProveedorId] = useState(params.get('proveedor') ?? '')

  const [texto, setTexto] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<ProductoVendible[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [lineas, setLineas] = useState<Record<string, Linea>>({})
  const [costos, setCostos] = useState<Record<string, string>>({})
  const [precios, setPrecios] = useState<Record<string, PrecioProveedor[]>>({})
  const [yaLlego, setYaLlego] = useState(false)
  const [yaPagada, setYaPagada] = useState(false)
  const [notas, setNotas] = useState('')
  const [conNotas, setConNotas] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorCompra, setErrorCompra] = useState<string | null>(null)
  const [hecha, setHecha] = useState<{ compra: Compra; avisos: AvisoMargen[]; sinRecibir: boolean } | null>(null)
  const clave = useRef(crypto.randomUUID())

  useEffect(() => {
    let cancelado = false
    api.GET('/api/v1/proveedores', { params: { query: {} } }).then(({ data, error, response }) => {
      if (cancelado) return
      if (!data) return setError(mensajeDeError(error, response))
      setProveedores(data)
      // Con un solo proveedor no hay nada que elegir.
      setProveedorId((actual) => actual || (data.length === 1 ? data[0].id : ''))
    })
    return () => {
      cancelado = true
    }
  }, [])

  useEffect(() => {
    const espera = setTimeout(() => setQ(texto.trim()), 300)
    return () => clearTimeout(espera)
  }, [texto])

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/ventas/productos', { params: { query: { Buscar: q || undefined, Limite: POR_PAGINA } } })
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
  }, [q])

  async function verMas() {
    if (!siguiente) return
    setCargandoMas(true)
    try {
      const { data, error, response } = await api.GET('/api/v1/ventas/productos', {
        params: { query: { Buscar: q || undefined, Limite: POR_PAGINA, Cursor: siguiente } },
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

  function poner(producto: ProductoVendible, variante: VarianteVendible, cantidad: number) {
    setErrorCompra(null)
    setLineas((previas) => {
      const nuevas = { ...previas }
      if (cantidad > 0) nuevas[variante.id] = { producto, variante, cantidad: Math.min(cantidad, MAXIMO_POR_LINEA) }
      else delete nuevas[variante.id]
      return nuevas
    })
    if (cantidad > 0 && costos[producto.id] === undefined) {
      setCostos((c) => ({ ...c, [producto.id]: producto.costo > 0 ? String(producto.costo) : '' }))
      // El comparador: a quién le conviene comprarle este producto (se pide la primera vez que se elige).
      api.GET('/api/v1/compras/comparador/{productoId}', { params: { path: { productoId: producto.id } } }).then(({ data }) => {
        if (data) setPrecios((p) => ({ ...p, [producto.id]: data }))
      })
    }
  }

  const elegidas = Object.values(lineas)
  const productosElegidos = [...new Map(elegidas.map((l) => [l.producto.id, l.producto])).values()]
  const costoDe = (productoId: string) => leerMonto(costos[productoId] ?? '')
  const costosInvalidos = productosElegidos.filter((p) => {
    const c = costoDe(p.id)
    return c === null || c <= 0
  })
  const unidades = elegidas.reduce((n, l) => n + l.cantidad, 0)
  const total = elegidas.reduce((n, l) => n + l.cantidad * (costoDe(l.producto.id) ?? 0), 0)
  const proveedor = proveedores?.find((p) => p.id === proveedorId)
  const puedeRegistrar = !!proveedor && unidades > 0 && costosInvalidos.length === 0 && !enviando

  async function registrar() {
    if (!puedeRegistrar || !proveedor) return
    setEnviando(true)
    setErrorCompra(null)
    try {
      const { data, error, response } = await api.POST('/api/v1/compras', {
        body: {
          claveIdempotencia: clave.current,
          proveedorId: proveedor.id,
          lineas: elegidas.map((l) => ({ varianteId: l.variante.id, cantidad: l.cantidad, costoUnitario: costoDe(l.producto.id) ?? 0 })),
          notas: notas.trim() || null,
          // Se registra en camino y después se recibe (abajo): así el servidor devuelve los avisos de margen.
          recibida: false,
          pagada: yaPagada,
        },
      })
      if (!data) return setErrorCompra(mensajeDeError(error, response))
      clave.current = crypto.randomUUID()

      // "Ya llegó": se registra y enseguida se recibe (así el servidor nos devuelve los avisos de margen). Si esto
      // último falla, la compra igual quedó guardada: se puede marcar "Llegó" desde Compras.
      if (yaLlego) {
        const recibida = await api.POST('/api/v1/compras/{id}/recibir', { params: { path: { id: data.id } } })
        if (recibida.data) return setHecha({ compra: recibida.data.compra, avisos: recibida.data.avisos, sinRecibir: false })
        return setHecha({ compra: data, avisos: [], sinRecibir: true })
      }
      setHecha({ compra: data, avisos: [], sinRecibir: false })
    } catch {
      // Sin señal: la clave se conserva, así que tocar de nuevo reintenta la MISMA compra.
      setErrorCompra(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  function otra() {
    setHecha(null)
    setLineas({})
    setCostos({})
    setPrecios({})
    setYaLlego(false)
    setYaPagada(false)
    setNotas('')
    setConNotas(false)
    setTexto('')
    setQ('')
  }

  if (hecha) {
    const { compra, avisos, sinRecibir } = hecha
    return (
      <div className="pagina pagina-angosta">
        <section className="tarjeta venta-lista" aria-live="polite">
          <span className="icono-caja icono-ok" aria-hidden="true">
            <Icono nombre="ok" tamano={26} />
          </span>
          <h1 className="titulo-pagina">¡Compra registrada!</h1>
          <p className="venta-lista-total">{bs(compra.total)}</p>
          <p className="texto-suave">
            {compra.proveedor} · {compra.unidades === 1 ? '1 unidad' : `${compra.unidades} unidades`} ·{' '}
            {compra.estado === 'Recibida' ? 'Ya llegó' : 'En camino'} · {compra.pagada ? 'Pagada' : 'Por pagar'}
          </p>
          {sinRecibir && (
            <Aviso tipo="advertencia">
              La compra quedó guardada, pero no pudimos marcarla como recibida. Abrila en Compras y tocá «Llegó».
            </Aviso>
          )}
          {avisos.length > 0 && (
            <Aviso tipo="advertencia">
              <strong>Revisá tus precios:</strong>
              <ul className="avisos-margen">
                {avisos.map((a) => (
                  <li key={a.productoId}>{textoAvisoMargen(a)}</li>
                ))}
              </ul>
            </Aviso>
          )}
          <div className="venta-lista-acciones">
            <button type="button" className="boton boton-primario boton-grande" onClick={otra}>
              Registrar otra compra
            </button>
            <Link to="/compras" className="boton boton-secundario">
              Ver mis compras
            </Link>
            {compra.estado === 'EnCamino' && compra.proveedorTelefono && (
              <a
                className="boton boton-secundario"
                href={enlaceWhatsapp(
                  compra.proveedorTelefono,
                  `Hola ${compra.proveedor}, te quiero pedir: ${compra.lineas.map((l) => `${l.cantidad} ${l.descripcion}`).join(', ')}.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                Pedirle por WhatsApp
              </a>
            )}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Nueva compra</h1>
      </header>

      {proveedores?.length === 0 ? (
        <section className="tarjeta vacio-inicial">
          <span className="icono-caja" aria-hidden="true">
            <Icono nombre="proveedores" tamano={22} />
          </span>
          <h2 className="titulo-seccion">Primero cargá a tu proveedor</h2>
          <p className="texto-suave">Para anotar una compra necesitamos saber a quién se la hiciste.</p>
          <Link to="/proveedores" className="boton boton-primario">
            Agregar un proveedor
          </Link>
        </section>
      ) : (
        <>
          <div className="campo">
            <label htmlFor="proveedor" className="campo-etiqueta">
              ¿A quién le comprás?
            </label>
            <select id="proveedor" className="seleccion" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Elegí un proveedor</option>
              {proveedores?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="busqueda">
            <label className="busqueda-caja">
              <Icono nombre="buscar" tamano={18} />
              <span className="sr-only">Buscar producto</span>
              <input type="search" placeholder="Buscar producto" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </label>
          </div>

          {error && <Aviso>{error}</Aviso>}
          {items === null && !error && (
            <p className="texto-suave" role="status">
              Cargando tus productos…
            </p>
          )}
          {items?.length === 0 &&
            (q ? (
              <p className="vacio">No encontramos productos con ese nombre.</p>
            ) : (
              <section className="tarjeta vacio-inicial">
                <h2 className="titulo-seccion">Todavía no tenés productos</h2>
                <p className="texto-suave">Cargá el producto en el catálogo y después anotá la compra.</p>
                <Link to="/catalogo/nuevo" className="boton boton-primario">
                  Cargar un producto
                </Link>
              </section>
            ))}

          {items && items.length > 0 && (
            <>
              <ul className="lista-vender">
                {items.map((p) => (
                  <FilaComprar
                    key={p.id}
                    producto={p}
                    lineas={lineas}
                    costo={costos[p.id]}
                    precios={precios[p.id]}
                    proveedorId={proveedorId}
                    alPoner={poner}
                    alCostar={(valor) => setCostos((c) => ({ ...c, [p.id]: valor }))}
                  />
                ))}
              </ul>
              {siguiente && (
                <button type="button" className="boton boton-secundario" onClick={verMas} disabled={cargandoMas}>
                  {cargandoMas ? 'Cargando…' : 'Ver más productos'}
                </button>
              )}
            </>
          )}

          <section className="pie-venta" aria-label="Resumen de la compra">
            <div className="chips" role="group" aria-label="Estado de la compra">
              <button type="button" className="chip" aria-pressed={yaLlego} onClick={() => setYaLlego((v) => !v)}>
                Ya llegó
              </button>
              <button type="button" className="chip" aria-pressed={yaPagada} onClick={() => setYaPagada((v) => !v)}>
                Ya la pagué
              </button>
            </div>
            {yaLlego && <p className="texto-suave texto-chico">Al registrarla sumamos el stock y actualizamos tu costo.</p>}
            {conNotas || notas ? (
              <Campo etiqueta="Nota (opcional)" value={notas} maxLength={300} autoComplete="off" onChange={(e) => setNotas(e.target.value)} />
            ) : (
              <button type="button" className="boton boton-texto boton-chico pie-venta-agregar" onClick={() => setConNotas(true)}>
                + Agregar una nota (opcional)
              </button>
            )}
            {errorCompra && <Aviso>{errorCompra}</Aviso>}
            {costosInvalidos.length > 0 && (
              <p className="texto-chico texto-peligro" role="status">
                Escribí el costo de {costosInvalidos.map((p) => p.nombre).join(', ')} (mayor a 0, hasta 2 decimales).
              </p>
            )}
            <div className="pie-venta-fila pie-venta-total">
              <div>
                <span className="texto-suave texto-chico">
                  {unidades === 0 ? 'Elegí lo que compraste' : unidades === 1 ? '1 unidad' : `${unidades} unidades`}
                </span>
                <strong className="pie-venta-monto">{bs(total)}</strong>
              </div>
              <button type="button" className="boton boton-primario boton-grande" disabled={!puedeRegistrar} onClick={registrar}>
                {enviando ? 'Registrando…' : 'Registrar compra'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function FilaComprar({
  producto: p,
  lineas,
  costo,
  precios,
  proveedorId,
  alPoner,
  alCostar,
}: {
  producto: ProductoVendible
  lineas: Record<string, Linea>
  costo: string | undefined
  precios: PrecioProveedor[] | undefined
  proveedorId: string
  alPoner: (p: ProductoVendible, v: VarianteVendible, cantidad: number) => void
  alCostar: (valor: string) => void
}) {
  const conVariantes = p.variantes.length > 1 || p.variantes.some((v) => etiquetaDeVariante(v) !== '')
  const elegido = p.variantes.some((v) => (lineas[v.id]?.cantidad ?? 0) > 0)
  const costoNumero = leerMonto(costo ?? '')
  const invalido = elegido && (costoNumero === null || costoNumero <= 0)

  const contador = (v: VarianteVendible, etiqueta: string) => (
    <Contador
      etiqueta={etiqueta}
      valor={lineas[v.id]?.cantidad ? String(lineas[v.id].cantidad) : ''}
      maximo={MAXIMO_POR_LINEA}
      alCambiar={(valor) => alPoner(p, v, soloEnteros(valor) ?? 0)}
    />
  )

  // Lo más barato que le pagaste a alguien por este producto (si no es el proveedor elegido, conviene saberlo).
  const mejor = precios?.[0]
  const miPrecio = precios?.find((x) => x.proveedorId === proveedorId)

  return (
    <li className="fila-vender">
      <div className="fila-vender-cabecera">
        <span className="fila-stock-foto">
          {p.portada ? <img src={p.portada.miniatura} alt="" loading="lazy" width={44} height={44} /> : <Icono nombre="bolsa" tamano={22} />}
        </span>
        <span className="fila-stock-datos">
          <span className="fila-stock-nombre">{p.nombre}</span>
          <span className="texto-suave texto-chico">
            Tu costo hoy: {p.costo > 0 ? bs(p.costo) : 'sin cargar'}
            {p.controlaStock ? ` · Tenés ${p.stock ?? 0}` : ''}
          </span>
        </span>
        {!conVariantes && contador(p.variantes[0], `Cantidad de ${p.nombre}`)}
      </div>

      {conVariantes && (
        <ul className="variantes-vender">
          {p.variantes.map((v) => {
            const nombre = etiquetaDeVariante(v) || 'Único'
            return (
              <li key={v.id} className="variante-vender">
                <span>
                  {nombre}
                  {p.controlaStock && <span className="texto-suave texto-chico"> · Tenés {v.stock ?? 0}</span>}
                </span>
                {contador(v, `Cantidad de ${p.nombre} (${nombre})`)}
              </li>
            )
          })}
        </ul>
      )}

      {elegido && (
        <div className="costo-compra">
          <Campo
            etiqueta={`Costo por unidad de ${p.nombre}`}
            prefijo="Bs"
            inputMode="decimal"
            value={costo ?? ''}
            onChange={(e) => alCostar(e.target.value)}
            aria-invalid={invalido}
          />
          {mejor && (
            <span className="texto-suave texto-chico">
              {mejor.proveedorId === proveedorId
                ? `Es tu proveedor más barato para esto (${bs(mejor.costoUnitario)}).`
                : `Lo más barato que pagaste: ${mejor.proveedor}, ${bs(mejor.costoUnitario)}${miPrecio ? ` (a este le pagaste ${bs(miPrecio.costoUnitario)})` : ''}.`}
            </span>
          )}
        </div>
      )}
    </li>
  )
}
