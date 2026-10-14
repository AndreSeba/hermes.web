import { useState, type FormEvent } from 'react'
import { api, mensajeDeError, type ProductoStock } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Contador } from '../../componentes/Contador'
import { Dialogo } from '../../componentes/Dialogo'
import { leerMonto, soloEnteros } from '../../util/dinero'
import { etiquetaDeVariante } from './historial'

type Props = {
  producto: ProductoStock | null // null = cerrado
  alCerrar: () => void
  alListo: (producto: ProductoStock, mensaje: string) => void
}

export function DialogoLlegaron({ producto, alCerrar, alListo }: Props) {
  return (
    <Dialogo abierto={producto !== null} titulo="¿Cuántas llegaron?" subtitulo={producto?.nombre} alCerrar={alCerrar} hoja>
      {/* Solo se monta abierto: cada vez arranca limpio. */}
      {producto && <FormularioLlegaron producto={producto} alCerrar={alCerrar} alListo={alListo} />}
    </Dialogo>
  )
}

function FormularioLlegaron({ producto, alCerrar, alListo }: { producto: ProductoStock; alCerrar: () => void; alListo: Props['alListo'] }) {
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [costo, setCosto] = useState(producto.costo > 0 ? String(producto.costo) : '')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const lineas = producto.variantes
    .map((v) => ({ varianteId: v.id, cantidad: soloEnteros(cantidades[v.id] ?? '') ?? 0 }))
    .filter((l) => l.cantidad > 0)
  const total = lineas.reduce((suma, l) => suma + l.cantidad, 0)
  const costoNumero = costo.trim() === '' ? null : leerMonto(costo)
  const avisoCosto = costo.trim() !== '' && costoNumero === null ? 'Escribí un monto válido (hasta 2 decimales).' : null
  const conVariantes = producto.variantes.length > 1 || producto.variantes.some((v) => etiquetaDeVariante(v) !== '')

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (total === 0 || avisoCosto) return
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/stock/ingresos', {
        body: { productoId: producto.id, lineas, costoUnitario: costoNumero && costoNumero > 0 ? costoNumero : null },
      })
      if (data) alListo(data, `Sumaste ${total} a ${producto.nombre}.`)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <div className="llegaron-lista">
        {producto.variantes.map((v) => (
          <div key={v.id} className="llegaron-fila">
            <span className="llegaron-nombre">{conVariantes ? etiquetaDeVariante(v) || 'Único' : 'Cantidad'}</span>
            <Contador
              etiqueta={`Cantidad que llegó${conVariantes ? ` de ${etiquetaDeVariante(v) || 'Único'}` : ''}`}
              valor={cantidades[v.id] ?? ''}
              alCambiar={(valor) => setCantidades((c) => ({ ...c, [v.id]: valor }))}
            />
          </div>
        ))}
      </div>

      <Campo
        etiqueta="Costo por unidad (opcional)"
        prefijo="Bs"
        inputMode="decimal"
        value={costo}
        onChange={(e) => setCosto(e.target.value)}
        aria-invalid={!!avisoCosto}
        ayuda={avisoCosto ?? 'Si cambió, actualizamos tu costo y la calculadora de precio.'}
      />

      {error && <Aviso>{error}</Aviso>}

      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={enviando || total === 0 || !!avisoCosto}>
          {enviando ? 'Sumando…' : total > 0 ? `Sumar ${total}` : 'Sumar'}
        </button>
      </div>
    </form>
  )
}
