import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, mensajeDeError, type Categoria, type ProductoResumen } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { EtiquetaMargen } from '../../componentes/EtiquetaMargen'
import { Icono } from '../../componentes/Icono'
import { Paginacion } from '../../componentes/Paginacion'
import { usePermisos } from '../../sesion/contexto'
import { P } from '../../sesion/permisos'
import { bs } from '../../util/dinero'
import { DialogoCategorias } from './DialogoCategorias'

const POR_PAGINA = 20

// Los filtros viven en la dirección (?q=…&categoria=…&filtro=revisar&archivados=1): al volver desde un
// producto el catálogo queda como estaba, y un enlace lleva a la misma vista.
export function Catalogo() {
  const { tiene } = usePermisos()
  const veCostos = tiene(P.costosVer)
  const puedeCrear = tiene(P.productosCrear)
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const categoria = params.get('categoria')
  const revisar = params.get('filtro') === 'revisar'
  const archivados = params.get('archivados') === '1'
  const hayFiltro = !!(q || categoria || revisar || archivados)
  const pagina = Math.max(1, Number.parseInt(params.get('pagina') ?? '1', 10) || 1)

  const [texto, setTexto] = useState(q)
  const [items, setItems] = useState<ProductoResumen[] | null>(null)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState(false)
  const [version, setVersion] = useState(0) // sube cuando cambian las categorías

  // Los nombres van como los declara el esquema de la API (mayúscula inicial).
  const consulta = {
    Buscar: q || undefined,
    CategoriaId: categoria ?? undefined,
    RevisarPrecio: revisar || undefined,
    Archivados: archivados || undefined,
    Limite: POR_PAGINA,
    Pagina: pagina,
  }

  // La búsqueda espera 300 ms después de la última letra: no se pide al servidor en cada tecla. Mientras
  // llega la respuesta se sigue viendo la lista anterior (sin parpadeo); `cancelado` descarta respuestas viejas.
  useEffect(() => {
    let cancelado = false
    const espera = setTimeout(
      () => {
        api
          .GET('/api/v1/productos', { params: { query: consulta } })
          .then(({ data, error, response }) => {
            if (cancelado) return
            if (!data) return setError(mensajeDeError(error, response))
            setError(null)
            setItems(data.items)
            setTotalPaginas(data.totalPaginas)
            // Una página fuera de rango (por ejemplo después de archivar productos) vuelve a la última que existe.
            if (data.pagina !== pagina) cambiar({ pagina: data.pagina > 1 ? String(data.pagina) : null })
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
  }, [q, categoria, revisar, archivados, pagina, version])

  useEffect(() => {
    let cancelado = false
    api.GET('/api/v1/categorias', { params: { query: {} } }).then(({ data }) => {
      if (!cancelado && data) setCategorias(data)
    })
    return () => {
      cancelado = true
    }
  }, [version])

  function cambiar(cambios: Record<string, string | null>) {
    setParams(
      (previos) => {
        const nuevos = new URLSearchParams(previos)
        for (const [clave, valor] of Object.entries(cambios)) {
          if (valor) nuevos.set(clave, valor)
          else nuevos.delete(clave)
        }
        // Cambiar un filtro o la búsqueda vuelve a la primera página.
        if (!('pagina' in cambios)) nuevos.delete('pagina')
        return nuevos
      },
      { replace: true },
    )
  }

  const sinFiltros = { categoria: null, filtro: null, archivados: null }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Catálogo</h1>
        <div className="cabecera-acciones">
          {tiene(P.categoriasGestionar) && (
            <button type="button" className="boton boton-texto boton-chico" onClick={() => setDialogo(true)}>
              Categorías
            </button>
          )}
          {puedeCrear && (
            <Link to="/catalogo/nuevo" className="boton boton-oscuro boton-chico">
              <Icono nombre="mas" tamano={16} />
              Producto
            </Link>
          )}
        </div>
      </header>

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
        <div className="chips" role="group" aria-label="Filtrar">
          <button type="button" className="chip" aria-pressed={!hayFiltro} onClick={() => cambiar(sinFiltros)}>
            Todos
          </button>
          {veCostos && (
            <button
              type="button"
              className="chip"
              aria-pressed={revisar}
              onClick={() => cambiar({ ...sinFiltros, filtro: revisar ? null : 'revisar' })}
            >
              Revisar precio
            </button>
          )}
          {categorias.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={categoria === c.id}
              onClick={() => cambiar({ ...sinFiltros, categoria: categoria === c.id ? null : c.id })}
            >
              {c.nombre}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            aria-pressed={archivados}
            onClick={() => cambiar({ ...sinFiltros, archivados: archivados ? null : '1' })}
          >
            Archivados
          </button>
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      {items === null && !error && (
        <p className="texto-suave" role="status">
          Cargando tu catálogo…
        </p>
      )}

      {items?.length === 0 &&
        (hayFiltro ? (
          <p className="vacio">No encontramos productos con ese filtro.</p>
        ) : (
          <section className="tarjeta vacio-inicial">
            <span className="icono-caja" aria-hidden="true">
              <Icono nombre="bolsa" tamano={22} />
            </span>
            <h2 className="titulo-seccion">Todavía no cargaste productos</h2>
            <p className="texto-suave">
              {puedeCrear ? 'Cargá el primero con sus fotos, colores y precio. Después aparece en tu tienda.' : 'Cuando se carguen productos, los vas a ver acá.'}
            </p>
            {puedeCrear && (
              <Link to="/catalogo/nuevo" className="boton boton-primario">
                Cargar mi primer producto
              </Link>
            )}
          </section>
        ))}

      {items && items.length > 0 && (
        <>
          <ul className="grilla-productos" aria-busy={false}>
            {items.map((p) => (
              <li key={p.id}>
                <Link to={`/catalogo/${p.id}`} className="tarjeta-producto">
                  <span className="producto-foto">
                    {p.portada ? (
                      <img src={p.portada.catalogo} alt="" loading="lazy" width={300} height={300} />
                    ) : (
                      <Icono nombre="bolsa" tamano={38} />
                    )}
                    {!p.visibleEnTienda && <span className="producto-oculto">Oculto</span>}
                    {p.estadoStock !== 'SinControl' && (
                      <span className={`producto-stock${p.estadoStock === 'Agotado' ? ' producto-stock-agotado' : ''}`}>
                        {p.estadoStock === 'Agotado' ? 'Agotado' : `Quedan ${p.stock}`}
                      </span>
                    )}
                  </span>
                  <span className="producto-datos">
                    <span className="producto-nombre">{p.nombre}</span>
                    <span className="producto-precio">{bs(p.precio)}</span>
                    {veCostos && <EtiquetaMargen estado={p.estadoPrecio} ganancia={p.ganancia} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            alCambiar={(n) => {
              cambiar({ pagina: n > 1 ? String(n) : null })
              window.scrollTo({ top: 0 })
            }}
          />
        </>
      )}

      <DialogoCategorias abierto={dialogo} alCerrar={() => setDialogo(false)} alCambiar={() => setVersion((v) => v + 1)} />
    </div>
  )
}
