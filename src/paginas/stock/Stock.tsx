import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, mensajeDeError, type ProductoStock, type ResumenStock } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Icono } from '../../componentes/Icono'
import { PestanasInventario } from '../../componentes/PestanasInventario'
import { usePermisos } from '../../sesion/contexto'
import { P } from '../../sesion/permisos'
import { bs } from '../../util/dinero'
import { DialogoCorregir } from './DialogoCorregir'
import { DialogoLlegaron } from './DialogoLlegaron'
import { FilaStock } from './FilaStock'

const POR_PAGINA = 24

type Vista = 'todos' | 'areponer' | 'encargo'
const vistas: { id: Vista; etiqueta: string; api: 'Todos' | 'AReponer' | 'PorEncargo' }[] = [
  { id: 'todos', etiqueta: 'Todos', api: 'Todos' },
  { id: 'areponer', etiqueta: 'A reponer', api: 'AReponer' },
  { id: 'encargo', etiqueta: 'Por encargo', api: 'PorEncargo' },
]

// Lo más urgente primero (el servidor ya lo ordena): agotados, por agotarse, bien y por encargo. La vista y
// la búsqueda viven en la dirección (?vista=areponer&q=…); `?llegaron=<id>` abre "Llegaron más" de un
// producto (lo usa la pantalla de "¡Guardado!" del catálogo).
export function Stock() {
  const veCostos = usePermisos().tiene(P.costosVer)
  const [params, setParams] = useSearchParams()
  const vista = (vistas.find((v) => v.id === params.get('vista'))?.id ?? 'todos') as Vista
  const q = params.get('q') ?? ''
  const llegaronId = params.get('llegaron')

  const [texto, setTexto] = useState(q)
  const [items, setItems] = useState<ProductoStock[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenStock | null>(null)
  const [versionResumen, setVersionResumen] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [versiones, setVersiones] = useState<Record<string, number>>({})
  const [llegaron, setLlegaron] = useState<ProductoStock | null>(null)
  const [corregir, setCorregir] = useState<ProductoStock | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)

  const consulta = {
    Buscar: q || undefined,
    Vista: vistas.find((v) => v.id === vista)!.api,
    Limite: POR_PAGINA,
  }

  // Misma mecánica que el catálogo: la búsqueda espera 300 ms, la lista anterior se ve hasta que llega la nueva.
  useEffect(() => {
    let cancelado = false
    const espera = setTimeout(
      () => {
        api
          .GET('/api/v1/stock', { params: { query: consulta } })
          .then(({ data, error, response }) => {
            if (cancelado) return
            if (!data) return setError(mensajeDeError(error, response))
            setError(null)
            setItems(data.items)
            setSiguiente(data.siguiente)
          })
          .catch(() => !cancelado && setError(mensajeDeError(null)))
      },
      q ? 300 : 0,
    )
    return () => {
      cancelado = true
      clearTimeout(espera)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `consulta` se arma con estos mismos valores
  }, [q, vista])

  useEffect(() => {
    let cancelado = false
    api.GET('/api/v1/stock/resumen').then(({ data }) => {
      if (!cancelado && data) setResumen(data)
    })
    return () => {
      cancelado = true
    }
  }, [versionResumen])

  // "Llegaron más" pedido desde afuera (?llegaron=<id>): se busca el producto y se abre el diálogo.
  useEffect(() => {
    if (!llegaronId) return
    let cancelado = false
    api.GET('/api/v1/stock/{productoId}', { params: { path: { productoId: llegaronId } } }).then(({ data }) => {
      if (cancelado) return
      if (data?.controlaStock) setLlegaron(data)
      setParams(
        (previos) => {
          const nuevos = new URLSearchParams(previos)
          nuevos.delete('llegaron')
          return nuevos
        },
        { replace: true },
      )
    })
    return () => {
      cancelado = true
    }
  }, [llegaronId, setParams])

  // El aviso de "Sumaste 7…" se va solo.
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
      const { data, error, response } = await api.GET('/api/v1/stock', { params: { query: { ...consulta, Cursor: siguiente } } })
      if (!data) return setError(mensajeDeError(error, response))
      setItems((previos) => [...(previos ?? []), ...data.items])
      setSiguiente(data.siguiente)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setCargandoMas(false)
    }
  }

  // Después de sumar o corregir: la fila se reemplaza en su lugar (no salta de posición mientras se mira);
  // en "A reponer" sale si ya no hace falta reponerlo.
  function actualizado(p: ProductoStock, mensaje: string) {
    setItems((previos) =>
      (previos ?? [])
        .map((x) => (x.id === p.id ? p : x))
        .filter((x) => vista !== 'areponer' || x.estado === 'Agotado' || x.estado === 'Pocos'),
    )
    setVersiones((v) => ({ ...v, [p.id]: (v[p.id] ?? 0) + 1 }))
    setVersionResumen((n) => n + 1)
    setAviso(mensaje)
    setLlegaron(null)
    setCorregir(null)
  }

  const hayFiltro = vista !== 'todos' || q !== ''

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Stock</h1>
      </header>
      <PestanasInventario />

      {resumen && (
        <section className="resumen-stock" aria-label="Resumen del stock">
          {veCostos ? (
            <>
              <span className="resumen-stock-chico">Tenés en mercadería</span>
              <span className="resumen-stock-valor">{bs(resumen.valorCosto)}</span>
              <span className="resumen-stock-chico">Vendiendo todo, entrarían {bs(resumen.valorVenta)}</span>
            </>
          ) : (
            <>
              <span className="resumen-stock-chico">Vendiendo todo, entrarían</span>
              <span className="resumen-stock-valor">{bs(resumen.valorVenta)}</span>
            </>
          )}
          <div className="resumen-chips">
            {resumen.agotados > 0 && (
              <span className="resumen-chip resumen-chip-rojo">{resumen.agotados === 1 ? '1 agotado' : `${resumen.agotados} agotados`}</span>
            )}
            {resumen.porAgotarse > 0 && (
              <span className="resumen-chip resumen-chip-ambar">
                {resumen.porAgotarse === 1 ? '1 por agotarse' : `${resumen.porAgotarse} por agotarse`}
              </span>
            )}
            {resumen.agotados === 0 && resumen.porAgotarse === 0 && <span className="resumen-chip resumen-chip-verde">Todo en orden</span>}
          </div>
        </section>
      )}

      <div className="busqueda">
        <label className="busqueda-caja">
          <Icono nombre="buscar" tamano={18} />
          <span className="sr-only">Buscar producto</span>
          <input
            type="search"
            placeholder="Buscar producto"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              cambiar({ q: e.target.value.trim() || null })
            }}
          />
        </label>
        <div className="segmentos" role="group" aria-label="Filtrar">
          {vistas.map((v) => (
            <button
              key={v.id}
              type="button"
              className="segmento"
              aria-pressed={vista === v.id}
              onClick={() => cambiar({ vista: v.id === 'todos' ? null : v.id })}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {items === null && !error && (
        <p className="texto-suave" role="status">
          Cargando tu stock…
        </p>
      )}

      {items?.length === 0 &&
        (hayFiltro ? (
          <p className="vacio">{vista === 'areponer' && !q ? 'No hay nada para reponer. ¡Todo en orden!' : 'No encontramos productos con ese filtro.'}</p>
        ) : (
          <section className="tarjeta vacio-inicial">
            <span className="icono-caja" aria-hidden="true">
              <Icono nombre="stock" tamano={22} />
            </span>
            <h2 className="titulo-seccion">Todavía no hay productos para contar</h2>
            <p className="texto-suave">Cargá tus productos en el catálogo y acá vas a ver cuántos te quedan de cada uno.</p>
            <Link to="/catalogo/nuevo" className="boton boton-primario">
              Cargar un producto
            </Link>
          </section>
        ))}

      {items && items.length > 0 && (
        <>
          <ul className="lista-stock">
            {items.map((p) => (
              <FilaStock
                key={p.id}
                producto={p}
                abierto={abierto === p.id}
                alAlternar={() => setAbierto(abierto === p.id ? null : p.id)}
                version={versiones[p.id] ?? 0}
                alLlegaronMas={() => setLlegaron(p)}
                alCorregir={() => setCorregir(p)}
              />
            ))}
          </ul>
          {siguiente && (
            <button type="button" className="boton boton-secundario" onClick={verMas} disabled={cargandoMas}>
              {cargandoMas ? 'Cargando…' : 'Ver más productos'}
            </button>
          )}
          <p className="texto-suave texto-chico texto-centro">Las ventas descuentan solas. Corregí solo si contaste y hay otra cantidad.</p>
        </>
      )}

      <DialogoLlegaron producto={llegaron} alCerrar={() => setLlegaron(null)} alListo={actualizado} />
      <DialogoCorregir producto={corregir} alCerrar={() => setCorregir(null)} alListo={actualizado} />
    </div>
  )
}
