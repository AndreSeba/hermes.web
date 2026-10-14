import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type Movimiento, type ProductoStock } from '../../api/cliente'
import { EtiquetaStock } from '../../componentes/EtiquetaStock'
import { Icono } from '../../componentes/Icono'
import { bs } from '../../util/dinero'
import { cuando, descripcion, etiquetaDeVariante } from './historial'

type Props = {
  producto: ProductoStock
  abierto: boolean
  alAlternar: () => void
  // Sube cuando cambió el stock de este producto: el historial abierto se vuelve a pedir.
  version: number
  alLlegaronMas: () => void
  alCorregir: () => void
}

export function FilaStock({ producto: p, abierto, alAlternar, version, alLlegaronMas, alCorregir }: Props) {
  const conVariantes = p.variantes.length > 1 || p.variantes.some((v) => etiquetaDeVariante(v) !== '')
  const detalle =
    p.estado === 'SinControl'
      ? 'No lleva stock'
      : conVariantes
        ? p.variantes.map((v) => `${etiquetaDeVariante(v) || 'Único'} ${v.stock}`).join(' · ')
        : bs(p.precio)

  return (
    <li className={`fila-stock fila-stock-${p.estado.toLowerCase()}`}>
      <button
        type="button"
        className="fila-stock-cabecera"
        aria-expanded={abierto}
        aria-label={`${abierto ? 'Cerrar' : 'Ver detalle de'} ${p.nombre}`}
        onClick={alAlternar}
      >
        <span className="fila-stock-foto">
          {p.portada ? <img src={p.portada.miniatura} alt="" loading="lazy" width={44} height={44} /> : <Icono nombre="bolsa" tamano={22} />}
        </span>
        <span className="fila-stock-datos">
          <span className="fila-stock-nombre">{p.nombre}</span>
          <span className="fila-stock-linea">
            <EtiquetaStock estado={p.estado} />
            <span className="texto-suave texto-chico">{detalle}</span>
          </span>
        </span>
        <span className="fila-stock-total" aria-label={p.stock === null ? 'Sin control de stock' : `${p.stock} en stock`}>
          {p.stock ?? '—'}
        </span>
      </button>

      {abierto && (
        <div className="fila-stock-detalle">
          {p.controlaStock && conVariantes && (
            <ul className="variantes-stock">
              {p.variantes.map((v) => (
                <li key={v.id} className={v.stock <= p.stockMinimo ? 'variante-poca' : undefined}>
                  <span>{etiquetaDeVariante(v) || 'Único'}</span>
                  <strong>{v.stock}</strong>
                </li>
              ))}
            </ul>
          )}

          <Historial productoId={p.id} version={version} conVariantes={conVariantes} />

          {p.controlaStock ? (
            <div className="acciones-fila">
              <button type="button" className="boton boton-primario" onClick={alLlegaronMas}>
                Llegaron más
              </button>
              <button type="button" className="boton boton-secundario" onClick={alCorregir}>
                Corregir
              </button>
            </div>
          ) : (
            <p className="texto-suave texto-chico">
              Este producto no cuenta unidades: siempre figura disponible. Si querés controlarlo,{' '}
              <Link to={`/catalogo/${p.id}`}>activá el control de stock</Link>.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

// "Lo último que pasó": los 3 movimientos más nuevos (se piden al abrir la fila, no con la lista).
function Historial({ productoId, version, conVariantes }: { productoId: string; version: number; conVariantes: boolean }) {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/stock/{productoId}/movimientos', { params: { path: { productoId }, query: { Limite: 3 } } })
      .then(({ data }) => {
        if (cancelado) return
        if (data) setMovimientos(data.items)
        else setFallo(true)
      })
      .catch(() => !cancelado && setFallo(true))
    return () => {
      cancelado = true
    }
  }, [productoId, version])

  return (
    <div className="historial">
      <span className="historial-titulo">Lo último que pasó</span>
      {fallo && <span className="texto-suave texto-chico">No pudimos cargar el historial.</span>}
      {!fallo && movimientos === null && <span className="texto-suave texto-chico">Cargando…</span>}
      {movimientos?.length === 0 && <span className="texto-suave texto-chico">Todavía no hubo movimientos.</span>}
      {movimientos?.map((m) => (
        <span key={m.id} className="historial-linea">
          <span className="historial-cuando">{cuando(m.fecha)}</span>
          {descripcion(m, conVariantes)}
        </span>
      ))}
    </div>
  )
}
