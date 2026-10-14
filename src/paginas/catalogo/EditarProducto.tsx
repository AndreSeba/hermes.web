import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, mensajeDeError, type Producto } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { FormularioProducto } from './FormularioProducto'

export function EditarProducto() {
  const { id } = useParams()
  const [producto, setProducto] = useState<Producto | null>(null)
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null)

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
    return () => {
      cancelado = true
    }
  }, [id])

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
  // key: si se pasa de un producto a otro, el formulario arranca de cero.
  return <FormularioProducto key={producto.id} inicial={producto} />
}
