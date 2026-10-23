import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, mensajeDeError, type Producto } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Icono } from '../../componentes/Icono'
import { usePermisos } from '../../sesion/contexto'
import { P } from '../../sesion/permisos'
import { bs } from '../../util/dinero'
import { CalculadoraPrecio } from './CalculadoraPrecio'
import { FormularioProducto } from './FormularioProducto'

export function EditarProducto() {
  const { id } = useParams()
  const { tiene } = usePermisos()
  const puedeEditar = tiene(P.productosEditar)
  const veCostos = tiene(P.costosVer)
  const puedeCalcular = tiene(P.costosEditar)
  const [producto, setProducto] = useState<Producto | null>(null)
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null)
  // Sube cuando el costeo cambió el costo del producto: se vuelve a pedir y el formulario arranca con lo nuevo.
  const [version, setVersion] = useState(0)
  // "Usar este precio" de la calculadora: llega al formulario como un precio ya escrito (sin guardar).
  const [precioPropuesto, setPrecioPropuesto] = useState<number | null>(null)
  const [conCosteo, setConCosteo] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelado = false
    api
      .GET('/api/v1/productos/{id}', { params: { path: { id } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (data) setProducto(data)
        else setError({ mensaje: mensajeDeError(error, response), noExiste: response.status === 404 || response.status === 400 })
      })
      .catch(() => !cancelado && setError({ mensaje: mensajeDeError(null), noExiste: false }))
    if (veCostos) {
      api.GET('/api/v1/productos/{productoId}/costeo', { params: { path: { productoId: id } } }).then(({ data }) => {
        if (!cancelado && data) setConCosteo(data.tiene)
      })
    }
    return () => {
      cancelado = true
    }
  }, [id, version, veCostos])

  if (error)
    return (
      <div className="pagina pagina-angosta">
        <Aviso>{error.noExiste ? 'No encontramos este producto. Puede que ya no exista.' : error.mensaje}</Aviso>
        <Link to="/catalogo" className="boton boton-secundario">
          Volver al catálogo
        </Link>
      </div>
    )
  if (!producto)
    return (
      <div className="pagina pagina-angosta" role="status" aria-live="polite">
        <p className="texto-suave">Cargando el producto…</p>
      </div>
    )
  if (!puedeEditar) return <FichaProducto producto={producto} />
  // key: si se pasa de un producto a otro (o cambió el costo o se propuso un precio), el formulario arranca de cero.
  const inicial = precioPropuesto === null ? producto : { ...producto, precio: precioPropuesto }
  return (
    <>
      {/* La clave depende de lo que llega del servidor (costo, costeo), no de `version`: si no, el formulario se
          remontaría con el producto VIEJO antes de que llegue el nuevo. */}
      <FormularioProducto key={`${producto.id}-${producto.costo}-${conCosteo}-${precioPropuesto}`} inicial={inicial} costoBloqueado={conCosteo} />
      {puedeCalcular && (
        <div className="pagina pagina-angosta">
          <CalculadoraPrecio
            productoId={producto.id}
            alGuardar={() => {
              setPrecioPropuesto(null)
              setVersion((n) => n + 1)
            }}
            alUsarPrecio={setPrecioPropuesto}
          />
        </div>
      )}
    </>
  )
}

// Para quien puede ver el catálogo pero no cambiarlo: la ficha del producto, sin formularios.
function FichaProducto({ producto: p }: { producto: Producto }) {
  return (
    <div className="pagina pagina-angosta">
      <header className="pagina-cabecera">
        <Link to="/catalogo" className="boton-icono" aria-label="Volver al catálogo">
          <Icono nombre="atras" tamano={22} />
        </Link>
        <h1 className="titulo-pagina titulo-chico">{p.nombre}</h1>
      </header>
      {p.fotos[0] && <img src={p.fotos[0].detalle} alt="" className="ficha-foto" width={p.fotos[0].ancho} height={p.fotos[0].alto} />}
      <section className="tarjeta seccion">
        <p className="producto-precio">{bs(p.precio)}</p>
        {p.descripcion && <p>{p.descripcion}</p>}
        {p.variantes.length > 0 && (
          <ul className="variantes-stock">
            {p.variantes.map((v) => (
              <li key={v.id}>{[v.color, v.talla].filter(Boolean).join(' · ') || 'Único'}</li>
            ))}
          </ul>
        )}
        {p.archivado && <Aviso tipo="advertencia">Este producto está archivado.</Aviso>}
      </section>
    </div>
  )
}
