import { useEffect, useState, type FormEvent } from 'react'
import { api, mensajeDeError, type FrecuenciaGasto, type GastoRecurrente } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { Interruptor } from '../../componentes/Interruptor'
import { bs, leerMonto } from '../../util/dinero'

const frecuencias: { id: FrecuenciaGasto; etiqueta: string; texto: string }[] = [
  { id: 'Semanal', etiqueta: 'Cada semana', texto: 'semanal' },
  { id: 'Quincenal', etiqueta: 'Cada 15 días', texto: 'cada 15 días' },
  { id: 'Mensual', etiqueta: 'Cada mes', texto: 'mensual' },
]
const textoDeFrecuencia = (f: FrecuenciaGasto) => frecuencias.find((x) => x.id === f)?.texto ?? f

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short' }).format(new Date(a, m - 1, d)).replace('.', '')
}

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Gastos que se repiten (alquiler, sueldos, luz). Los que se hacen solos aparecen en la lista de gastos cuando les toca; los que
// piden confirmación esperan acá para revisar el monto de esta vez.
// `alCambiar`: avisa a la pantalla de gastos que hay que volver a leer la lista (algo se registró).
export function GastosRecurrentes({ puedeGestionar, alCambiar }: { puedeGestionar: boolean; alCambiar: () => void }) {
  const [items, setItems] = useState<GastoRecurrente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [editando, setEditando] = useState<GastoRecurrente | 'nuevo' | null>(null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/gastos/recurrentes')
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setError(null)
        setItems(data)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [version])

  const recargar = () => {
    setVersion((n) => n + 1)
    alCambiar()
  }

  const porConfirmar = (items ?? []).filter((g) => g.porConfirmar)
  const hay = (items ?? []).length > 0

  return (
    <section className="tarjeta seccion recurrentes" aria-label="Gastos que se repiten">
      <header className="recurrentes-cabecera">
        <h2 className="titulo-seccion">Gastos que se repiten</h2>
        {puedeGestionar && (
          <button type="button" className="boton boton-texto boton-chico" onClick={() => setEditando('nuevo')}>
            <Icono nombre="mas" tamano={16} />
            Agregar
          </button>
        )}
      </header>

      {error && <Aviso>{error}</Aviso>}

      {porConfirmar.map((g) => (
        <PorConfirmar key={g.id} gasto={g} puedeGestionar={puedeGestionar} alListo={recargar} />
      ))}

      {items !== null && !hay && (
        <p className="texto-suave texto-chico">
          Alquiler, sueldos, luz: cargalos una vez, elegí cada cuánto se repiten y se anotan solos (o te pedimos confirmar el monto).
        </p>
      )}

      {hay && (
        <>
          <button type="button" className="boton boton-texto boton-chico recurrentes-ver" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Ocultar' : `Ver los ${items!.length} configurados`}
          </button>
          {abierto && (
            <ul className="lista-ventas">
              {items!.map((g) => (
                <li key={g.id} className="fila-venta">
                  <div className="fila-stock-cabecera fila-gasto">
                    <span className="fila-stock-datos">
                      <span className="fila-stock-nombre">{g.concepto}</span>
                      <span className="texto-suave texto-chico">
                        {textoDeFrecuencia(g.frecuencia)} · {g.activo ? `próxima: ${fechaCorta(g.proxima)}` : 'en pausa'}
                        {g.confirmarAntes ? ' · pide confirmación' : ''}
                      </span>
                    </span>
                    <strong className="fila-venta-total">{bs(g.monto)}</strong>
                    {puedeGestionar && (
                      <button type="button" className="boton boton-texto boton-chico" onClick={() => setEditando(g)} aria-label={`Editar ${g.concepto}`}>
                        Editar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialogo
        abierto={editando !== null}
        titulo={editando === 'nuevo' ? 'Nuevo gasto que se repite' : 'Editar gasto que se repite'}
        alCerrar={() => setEditando(null)}
        hoja
      >
        {editando !== null && (
          <FormularioRecurrente
            gasto={editando === 'nuevo' ? null : editando}
            alCerrar={() => setEditando(null)}
            alListo={() => {
              setEditando(null)
              recargar()
            }}
          />
        )}
      </Dialogo>
    </section>
  )
}

// Un gasto que ya venció y espera que la dueña revise el monto de esta vez.
function PorConfirmar({ gasto, puedeGestionar, alListo }: { gasto: GastoRecurrente; puedeGestionar: boolean; alListo: () => void }) {
  const [monto, setMonto] = useState(String(gasto.monto))
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const numero = leerMonto(monto)

  async function actuar(accion: 'confirmar' | 'omitir') {
    setError(null)
    setEnviando(true)
    try {
      const r =
        accion === 'confirmar'
          ? await api.POST('/api/v1/gastos/recurrentes/{id}/confirmar', { params: { path: { id: gasto.id } }, body: { monto: numero } })
          : await api.POST('/api/v1/gastos/recurrentes/{id}/omitir', { params: { path: { id: gasto.id } } })
      if (r.data) alListo()
      else setError(mensajeDeError(r.error, r.response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="por-confirmar">
      <p className="por-confirmar-titulo">
        <strong>{gasto.concepto}</strong> <span className="texto-suave texto-chico">tocaba el {fechaCorta(gasto.proxima)}: confirmá el monto</span>
      </p>
      <Campo etiqueta="Monto de esta vez" prefijo="Bs" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} aria-invalid={numero === null || numero <= 0} />
      {error && <Aviso>{error}</Aviso>}
      {puedeGestionar && (
        <div className="acciones-fila">
          <button type="button" className="boton boton-primario boton-chico" disabled={enviando || numero === null || numero <= 0} onClick={() => actuar('confirmar')}>
            Confirmar
          </button>
          <button type="button" className="boton boton-texto boton-chico" disabled={enviando} onClick={() => actuar('omitir')}>
            Omitir esta vez
          </button>
        </div>
      )}
    </div>
  )
}

function FormularioRecurrente({ gasto, alCerrar, alListo }: { gasto: GastoRecurrente | null; alCerrar: () => void; alListo: () => void }) {
  const [concepto, setConcepto] = useState(gasto?.concepto ?? '')
  const [monto, setMonto] = useState(gasto ? String(gasto.monto) : '')
  const [frecuencia, setFrecuencia] = useState<FrecuenciaGasto>(gasto?.frecuencia ?? 'Mensual')
  const [fecha, setFecha] = useState(gasto?.proxima ?? hoyLocal())
  const [confirmar, setConfirmar] = useState(gasto?.confirmarAntes ?? false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const numero = leerMonto(monto)
  const avisoMonto = monto.trim() !== '' && (numero === null || numero <= 0) ? 'Escribí un monto válido (hasta 2 decimales).' : null
  const puede = concepto.trim() !== '' && numero !== null && numero > 0 && fecha !== '' && !enviando

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!puede || numero === null) return
    setError(null)
    setEnviando(true)
    try {
      const body = { concepto: concepto.trim(), monto: numero, frecuencia, primeraFecha: fecha, confirmarAntes: confirmar }
      const r = gasto
        ? await api.PUT('/api/v1/gastos/recurrentes/{id}', { params: { path: { id: gasto.id } }, body })
        : await api.POST('/api/v1/gastos/recurrentes', { body })
      if (r.data) alListo()
      else setError(mensajeDeError(r.error, r.response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  async function pausar() {
    if (!gasto) return
    setEnviando(true)
    try {
      const r = await api.POST(gasto.activo ? '/api/v1/gastos/recurrentes/{id}/pausar' : '/api/v1/gastos/recurrentes/{id}/reanudar', {
        params: { path: { id: gasto.id } },
      })
      if (r.data) alListo()
      else setError(mensajeDeError(r.error, r.response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <Campo etiqueta="¿Qué gasto es?" value={concepto} maxLength={120} autoComplete="off" onChange={(e) => setConcepto(e.target.value)} placeholder="Alquiler, sueldos, luz…" />
      <Campo etiqueta="Monto" prefijo="Bs" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} aria-invalid={!!avisoMonto} ayuda={avisoMonto ?? undefined} />
      <div className="chips" role="group" aria-label="Cada cuánto se repite">
        {frecuencias.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={frecuencia === f.id} onClick={() => setFrecuencia(f.id)}>
            {f.etiqueta}
          </button>
        ))}
      </div>
      <Campo
        etiqueta={gasto ? 'Próxima vez' : 'Primera vez'}
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        ayuda={frecuencia === 'Mensual' ? 'Se repite el mismo día de cada mes.' : undefined}
      />
      <Interruptor
        etiqueta="Pedirme confirmar el monto"
        ayuda={confirmar ? 'Cuando toque, te preguntamos el monto antes de anotarlo (útil para la luz o el agua).' : 'Se anota solo, con este monto, el día que toca.'}
        activo={confirmar}
        alCambiar={setConfirmar}
      />

      {error && <Aviso>{error}</Aviso>}

      <div className="acciones-fila acciones-hoja">
        {gasto && (
          <button type="button" className="boton boton-texto" onClick={pausar} disabled={enviando}>
            {gasto.activo ? 'Pausar' : 'Reanudar'}
          </button>
        )}
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={!puede}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
