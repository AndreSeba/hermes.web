import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  api,
  mensajeDeError,
  type MetodoPago,
  type ProductoVendible,
  type Venta,
  type VarianteVendible,
} from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Contador } from '../../componentes/Contador'
import { Icono } from '../../componentes/Icono'
import { usePermisos } from '../../sesion/contexto'
import { P } from '../../sesion/permisos'
import { bs, soloEnteros } from '../../util/dinero'
import { rangoDelMes } from '../../util/periodo'
import { etiquetaDeVariante } from '../stock/historial'
import { MAXIMO_POR_LINEA, metodosDePago, nombreDePago } from './pagos'

const POR_PAGINA = 20
const CLAVE_PAGO = 'venta.pago'

type Linea = { producto: ProductoVendible; variante: VarianteVendible; cantidad: number }

function pagoGuardado(): MetodoPago {
  try {
    const guardado = localStorage.getItem(CLAVE_PAGO)
    return metodosDePago.find((m) => m.id === guardado)?.id ?? 'Efectivo'
  } catch {
    return 'Efectivo'
  }
}

// Cuántas unidades de esta variante se pueden vender: las que hay, o sin tope si el producto no lleva stock.
const tope = (p: ProductoVendible, v: VarianteVendible) => (p.controlaStock ? (v.stock ?? 0) : MAXIMO_POR_LINEA)

// "Venta rápida": se eligen productos y cantidades, se marca cómo pagaron y listo. El cliente es opcional.
// Cada intento de registrar lleva una clave propia (generada acá): si el celular reenvía por mala señal,
// el servidor devuelve la misma venta en vez de duplicarla.
export function NuevaVenta() {
  const { tiene } = usePermisos()
  const veCostos = tiene(P.costosVer)
  const veInicio = tiene(P.inicioVer)
  const [texto, setTexto] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<ProductoVendible[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [lineas, setLineas] = useState<Record<string, Linea>>({})
  const [pago, setPago] = useState<MetodoPago>(pagoGuardado)
  const [cliente, setCliente] = useState('')
  const [conCliente, setConCliente] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorVenta, setErrorVenta] = useState<string | null>(null)
  const [hecha, setHecha] = useState<Venta | null>(null)
  // "Este mes ya cubriste el X % de tus gastos": se pide después de vender, para que cuente esta venta.
  const [cubierto, setCubierto] = useState<number | null>(null)
  const clave = useRef(crypto.randomUUID())

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
  }, [q, version])

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
    setErrorVenta(null)
    setLineas((previas) => {
      const nuevas = { ...previas }
      if (cantidad > 0) nuevas[variante.id] = { producto, variante, cantidad: Math.min(cantidad, tope(producto, variante)) }
      else delete nuevas[variante.id]
      return nuevas
    })
  }

  const elegidas = Object.values(lineas)
  const unidades = elegidas.reduce((n, l) => n + l.cantidad, 0)
  const total = elegidas.reduce((n, l) => n + l.cantidad * l.producto.precio, 0)
  // Si algún producto no tiene costo cargado, no se inventa la ganancia. Sin permiso de costos, tampoco se muestra
  // (el servidor ya manda el costo en 0).
  const ganancia = !veCostos || elegidas.some((l) => l.producto.costo <= 0)
    ? null
    : elegidas.reduce((n, l) => n + l.cantidad * (l.producto.precio - l.producto.costo), 0)

  async function registrar() {
    if (elegidas.length === 0 || enviando) return
    setEnviando(true)
    setErrorVenta(null)
    try {
      const { data, error, response } = await api.POST('/api/v1/ventas', {
        body: {
          claveIdempotencia: clave.current,
          lineas: elegidas.map((l) => ({ varianteId: l.variante.id, cantidad: l.cantidad })),
          metodoPago: pago,
          cliente: cliente.trim() || null,
        },
      })
      if (!data) {
        setErrorVenta(mensajeDeError(error, response))
        // El stock puede haber cambiado (otra venta, otro celular): se vuelve a mostrar lo que hay.
        if (response?.status === 409) setVersion((n) => n + 1)
        return
      }
      try {
        localStorage.setItem(CLAVE_PAGO, pago)
      } catch {
        /* sin almacenamiento: se usa Efectivo la próxima vez */
      }
      clave.current = crypto.randomUUID()
      setHecha(data)
      if (veInicio) {
        api
          .GET('/api/v1/inicio', { params: { query: rangoDelMes() } })
          .then(({ data: inicio }) => setCubierto(inicio?.porcentajeCubierto ?? null))
          .catch(() => undefined)
      }
    } catch {
      // Sin señal: la clave se conserva, así que tocar de nuevo reintenta la MISMA venta.
      setErrorVenta(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  function otra() {
    setHecha(null)
    setCubierto(null)
    setLineas({})
    setCliente('')
    setConCliente(false)
    setTexto('')
    setQ('')
    setVersion((n) => n + 1)
  }

  if (hecha) {
    return (
      <div className="pagina pagina-angosta">
        <section className="tarjeta venta-lista" aria-live="polite">
          <span className="icono-caja icono-ok" aria-hidden="true">
            <Icono nombre="ok" tamano={26} />
          </span>
          <h1 className="titulo-pagina">¡Venta registrada!</h1>
          <p className="venta-lista-total">{bs(hecha.total)}</p>
          <p className="texto-suave">
            {hecha.unidades === 1 ? '1 unidad' : `${hecha.unidades} unidades`} · {nombreDePago(hecha.metodoPago)}
            {hecha.cliente ? ` · ${hecha.cliente}` : ''}
          </p>
          {hecha.ganancia !== null && <p className="texto-ok">Ganaste {bs(hecha.ganancia)}</p>}
          {cubierto !== null && (
            <p className="texto-suave texto-chico" role="status">
              {cubierto >= 100 ? `Este mes ya cubriste tus gastos (${cubierto} %).` : `Este mes ya cubriste el ${cubierto} % de tus gastos.`}
            </p>
          )}
          <div className="venta-lista-acciones">
            <button type="button" className="boton boton-primario boton-grande" onClick={otra}>
              Registrar otra venta
            </button>
            <Link to="/ventas" className="boton boton-secundario">
              Ver mis ventas
            </Link>
            {veInicio && (
              <Link to="/" className="boton boton-texto">
                Volver al inicio
              </Link>
            )}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Nueva venta</h1>
      </header>

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
            <span className="icono-caja" aria-hidden="true">
              <Icono nombre="catalogo" tamano={22} />
            </span>
            <h2 className="titulo-seccion">Todavía no tenés productos para vender</h2>
            <p className="texto-suave">Cargá tu primer producto en el catálogo y volvé a anotar la venta.</p>
            <Link to="/catalogo/nuevo" className="boton boton-primario">
              Cargar un producto
            </Link>
          </section>
        ))}

      {items && items.length > 0 && (
        <>
          <ul className="lista-vender">
            {items.map((p) => (
              <FilaVender key={p.id} producto={p} lineas={lineas} alPoner={poner} />
            ))}
          </ul>
          {siguiente && (
            <button type="button" className="boton boton-secundario" onClick={verMas} disabled={cargandoMas}>
              {cargandoMas ? 'Cargando…' : 'Ver más productos'}
            </button>
          )}
        </>
      )}

      <section className="pie-venta" aria-label="Cobro">
        <div className="pie-venta-fila">
          <div className="chips" role="group" aria-label="Cómo pagó">
            {metodosDePago.map((m) => (
              <button key={m.id} type="button" className="chip" aria-pressed={pago === m.id} onClick={() => setPago(m.id)}>
                {m.etiqueta}
              </button>
            ))}
          </div>
        </div>
        {conCliente || cliente ? (
          <Campo
            etiqueta="Cliente (opcional)"
            value={cliente}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => setCliente(e.target.value)}
          />
        ) : (
          <button type="button" className="boton boton-texto boton-chico pie-venta-agregar" onClick={() => setConCliente(true)}>
            + Agregar cliente (opcional)
          </button>
        )}
        {errorVenta && <Aviso>{errorVenta}</Aviso>}
        <div className="pie-venta-fila pie-venta-total">
          <div>
            <span className="texto-suave texto-chico">{unidades === 0 ? 'Elegí lo que vendiste' : unidades === 1 ? '1 unidad' : `${unidades} unidades`}</span>
            <strong className="pie-venta-monto">{bs(total)}</strong>
            {ganancia !== null && unidades > 0 && <span className="texto-ok texto-chico">Ganás {bs(ganancia)}</span>}
          </div>
          <button type="button" className="boton boton-primario boton-grande" disabled={unidades === 0 || enviando} onClick={registrar}>
            {enviando ? 'Registrando…' : 'Registrar venta'}
          </button>
        </div>
      </section>
    </div>
  )
}

function FilaVender({
  producto: p,
  lineas,
  alPoner,
}: {
  producto: ProductoVendible
  lineas: Record<string, Linea>
  alPoner: (p: ProductoVendible, v: VarianteVendible, cantidad: number) => void
}) {
  const agotado = p.controlaStock && (p.stock ?? 0) <= 0
  const conVariantes = p.variantes.length > 1 || p.variantes.some((v) => etiquetaDeVariante(v) !== '')

  const contador = (v: VarianteVendible, etiqueta: string) => {
    const cantidad = lineas[v.id]?.cantidad ?? 0
    return (
      <Contador
        etiqueta={etiqueta}
        valor={cantidad ? String(cantidad) : ''}
        maximo={tope(p, v)}
        alCambiar={(valor) => alPoner(p, v, soloEnteros(valor) ?? 0)}
      />
    )
  }

  return (
    <li className={`fila-vender${agotado ? ' fila-vender-agotada' : ''}`}>
      <div className="fila-vender-cabecera">
        <span className="fila-stock-foto">
          {p.portada ? <img src={p.portada.miniatura} alt="" loading="lazy" width={44} height={44} /> : <Icono nombre="bolsa" tamano={22} />}
        </span>
        <span className="fila-stock-datos">
          <span className="fila-stock-nombre">{p.nombre}</span>
          <span className="texto-suave texto-chico">
            {bs(p.precio)}
            {p.controlaStock && (agotado ? ' · Agotado' : ` · Quedan ${p.stock}`)}
          </span>
        </span>
        {!conVariantes && !agotado && contador(p.variantes[0], `Cantidad de ${p.nombre}`)}
      </div>

      {conVariantes && (
        <ul className="variantes-vender">
          {p.variantes.map((v) => {
            const sinStock = p.controlaStock && (v.stock ?? 0) <= 0
            const nombre = etiquetaDeVariante(v) || 'Único'
            return (
              <li key={v.id} className="variante-vender">
                <span>
                  {nombre}
                  {p.controlaStock && <span className="texto-suave texto-chico"> · {sinStock ? 'Agotado' : `Quedan ${v.stock}`}</span>}
                </span>
                {!sinStock && contador(v, `Cantidad de ${p.nombre} (${nombre})`)}
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
