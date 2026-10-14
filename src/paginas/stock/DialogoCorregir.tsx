import { useState, type FormEvent } from 'react'
import { api, mensajeDeError, type ProductoStock } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Contador } from '../../componentes/Contador'
import { Dialogo } from '../../componentes/Dialogo'
import { soloEnteros } from '../../util/dinero'
import { etiquetaDeVariante } from './historial'

const MOTIVOS = ['Dañado', 'Perdido', 'Regalo', 'Conté y había otra cantidad']

type Props = {
  producto: ProductoStock | null // null = cerrado
  alCerrar: () => void
  alListo: (producto: ProductoStock, mensaje: string) => void
}

export function DialogoCorregir({ producto, alCerrar, alListo }: Props) {
  return (
    <Dialogo abierto={producto !== null} titulo="Corregir el stock" subtitulo={producto?.nombre} alCerrar={alCerrar} hoja>
      {producto && <FormularioCorregir producto={producto} alCerrar={alCerrar} alListo={alListo} />}
    </Dialogo>
  )
}

function FormularioCorregir({ producto, alCerrar, alListo }: { producto: ProductoStock; alCerrar: () => void; alListo: Props['alListo'] }) {
  // Se escribe cuánto HAY (lo que contaste), no la diferencia: es lo que la gente sabe.
  const [totales, setTotales] = useState<Record<string, string>>(
    Object.fromEntries(producto.variantes.map((v) => [v.id, String(v.stock)])),
  )
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const conVariantes = producto.variantes.length > 1 || producto.variantes.some((v) => etiquetaDeVariante(v) !== '')
  const invalidas = producto.variantes.some((v) => soloEnteros(totales[v.id] ?? '') === null)
  const hayCambios = producto.variantes.some((v) => soloEnteros(totales[v.id] ?? '') !== v.stock)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (invalidas || !hayCambios) return
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/stock/ajustes', {
        body: {
          productoId: producto.id,
          lineas: producto.variantes.map((v) => ({ varianteId: v.id, nuevoTotal: soloEnteros(totales[v.id]) ?? v.stock })),
          motivo: motivo.trim() || null,
        },
      })
      if (data) alListo(data, `Corregiste el stock de ${producto.nombre}.`)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <p className="texto-suave texto-chico">Escribí cuántas hay ahora. Las ventas ya descuentan solas: corregí solo si contaste y no coincide.</p>

      <div className="llegaron-lista">
        {producto.variantes.map((v) => (
          <div key={v.id} className="llegaron-fila">
            <span className="llegaron-nombre">{conVariantes ? etiquetaDeVariante(v) || 'Único' : 'Hay ahora'}</span>
            <Contador
              etiqueta={`Cuántas hay${conVariantes ? ` de ${etiquetaDeVariante(v) || 'Único'}` : ''}`}
              valor={totales[v.id] ?? ''}
              alCambiar={(valor) => setTotales((t) => ({ ...t, [v.id]: valor }))}
              maximo={10_000_000}
              invalido={soloEnteros(totales[v.id] ?? '') === null}
            />
          </div>
        ))}
      </div>

      <div className="campo">
        <span className="campo-etiqueta" id="motivos">
          Motivo (opcional)
        </span>
        <div className="chips" role="group" aria-labelledby="motivos">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={motivo === m} onClick={() => setMotivo(motivo === m ? '' : m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <Campo etiqueta="O escribí otro" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />

      {error && <Aviso>{error}</Aviso>}

      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={enviando || invalidas || !hayCambios}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
