import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, mensajeDeError, type Producto } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { CalculadoraPrecio } from './CalculadoraPrecio'
import { FormularioProducto } from './FormularioProducto'

export function EditarProducto() {
  const { id } = useParams()
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
    api.GET('/api/v1/productos/{productoId}/costeo', { params: { path: { productoId: id } } }).then(({ data }) => {
      if (!cancelado && data) setConCosteo(data.tiene)
    })
    return () => {
      cancelado = true
    }
  }, [id, version])

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
  // key: si se pasa de un producto a otro (o cambió el costo o se propuso un precio), el formulario arranca de cero.
  const inicial = precioPropuesto === null ? producto : { ...producto, precio: precioPropuesto }
  return (
    <>
      {/* La clave depende de lo que llega del servidor (costo, costeo), no de `version`: si no, el formulario se
          remontaría con el producto VIEJO antes de que llegue el nuevo. */}
      <FormularioProducto key={`${producto.id}-${producto.costo}-${conCosteo}-${precioPropuesto}`} inicial={inicial} costoBloqueado={conCosteo} />
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
    </>
  )
}
