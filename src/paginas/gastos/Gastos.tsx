import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { api, mensajeDeError, type Gasto } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { bs, leerMonto } from '../../util/dinero'
import { nombreDelMes, rangoDelMes } from '../../util/periodo'
import { cuando } from '../stock/historial'

const POR_PAGINA = 30

// Lo que gastás en el negocio sin contar la mercadería (esa son las compras): alquiler, luz, publicidad, transporte…
// El total del mes alimenta el Inicio ("ya cubriste el X % de tus gastos"). Un gasto no se borra: se anula.
export function Gastos() {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<Gasto[] | null>(null)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [aAnular, setAAnular] = useState<Gasto | null>(null)
  // `?nuevo=1` abre el formulario (lo usa el botón "Anotar un gasto" del Inicio) y se limpia de la dirección.
  const abrirNuevo = params.get('nuevo') === '1'
  const [nuevo, setNuevo] = useState(abrirNuevo)

  const mes = rangoDelMes()

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/gastos', { params: { query: { ...mes, Limite: POR_PAGINA } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setError(null)
        setItems(data.items)
        setSiguiente(data.siguiente)
        setTotal(data.total)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mes` se calcula con la fecha de hoy: no cambia entre renders
  }, [version])

  useEffect(() => {
    if (!abrirNuevo) return
    setParams({}, { replace: true })
  }, [abrirNuevo, setParams])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  async function verMas() {
    if (!siguiente) return
    setCargandoMas(true)
    try {
      const { data, error, response } = await api.GET('/api/v1/gastos', { params: { query: { ...mes, Limite: POR_PAGINA, Cursor: siguiente } } })
      if (!data) return setError(mensajeDeError(error, response))
      setItems((previos) => [...(previos ?? []), ...data.items])
      setSiguiente(data.siguiente)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setCargandoMas(false)
    }
  }

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Gastos</h1>
        <button type="button" className="boton boton-primario boton-chico" onClick={() => setNuevo(true)}>
          <Icono nombre="mas" tamano={16} />
          Nuevo gasto
        </button>
      </header>

      <section className="resumen-stock" aria-label="Gastos del mes">
        <span className="resumen-stock-chico">Gastaste en {nombreDelMes()}</span>
        <span className="resumen-stock-valor">{bs(total)}</span>
        <span className="resumen-stock-chico">Sin contar lo que le comprás a tus proveedores: eso está en Compras.</span>
      </section>

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {items === null && !error && (
        <p className="texto-suave" role="status">
          Cargando tus gastos…
        </p>
      )}

      {items?.length === 0 && (
        <section className="tarjeta vacio-inicial">
          <span className="icono-caja" aria-hidden="true">
            <Icono nombre="gastos" tamano={22} />
          </span>
          <h2 className="titulo-seccion">Todavía no anotaste gastos este mes</h2>
          <p className="texto-suave">Alquiler, luz, publicidad, transporte: anotalos y en el Inicio ves cuánto de eso ya cubriste con lo que ganás.</p>
          <button type="button" className="boton boton-primario" onClick={() => setNuevo(true)}>
            Anotar un gasto
          </button>
        </section>
      )}

      {items && items.length > 0 && (
        <>
          <ul className="lista-ventas">
            {items.map((g) => (
              <li key={g.id} className="fila-venta">
                <div className="fila-stock-cabecera fila-gasto">
                  <span className="fila-stock-datos">
                    <span className="fila-stock-nombre">{g.concepto}</span>
                    <span className="texto-suave texto-chico">{cuando(g.fecha)}</span>
                  </span>
                  <strong className="fila-venta-total">{bs(g.monto)}</strong>
                  <button type="button" className="boton boton-texto boton-chico" onClick={() => setAAnular(g)} aria-label={`Anular el gasto ${g.concepto}`}>
                    Anular
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {siguiente && (
            <button type="button" className="boton boton-secundario" onClick={verMas} disabled={cargandoMas}>
              {cargandoMas ? 'Cargando…' : 'Ver más gastos'}
            </button>
          )}
        </>
      )}

      <DialogoNuevo
        abierto={nuevo}
        alCerrar={() => setNuevo(false)}
        alListo={(g) => {
          setNuevo(false)
          setAviso(`Anotaste ${g.concepto}: ${bs(g.monto)}.`)
          setVersion((n) => n + 1)
        }}
      />
      <DialogoAnular
        gasto={aAnular}
        alCerrar={() => setAAnular(null)}
        alListo={() => {
          setAAnular(null)
          setAviso('Gasto anulado: ya no cuenta en tus números.')
          setVersion((n) => n + 1)
        }}
      />
    </div>
  )
}

function DialogoNuevo({ abierto, alCerrar, alListo }: { abierto: boolean; alCerrar: () => void; alListo: (g: Gasto) => void }) {
  return (
    <Dialogo abierto={abierto} titulo="Nuevo gasto" alCerrar={alCerrar} hoja>
      {/* Solo se monta abierto: cada vez arranca limpio y con una clave nueva. */}
      {abierto && <FormularioGasto alCerrar={alCerrar} alListo={alListo} />}
    </Dialogo>
  )
}

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SUGERENCIAS = ['Alquiler', 'Luz', 'Agua', 'Internet', 'Publicidad', 'Transporte']

function FormularioGasto({ alCerrar, alListo }: { alCerrar: () => void; alListo: (g: Gasto) => void }) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyLocal())
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Misma idea que ventas: la clave se genera al abrir y se conserva en los reintentos (un doble toque no duplica).
  const clave = useRef(crypto.randomUUID())

  const montoNumero = leerMonto(monto)
  const avisoMonto = monto.trim() !== '' && (montoNumero === null || montoNumero <= 0) ? 'Escribí un monto válido (hasta 2 decimales).' : null
  const puede = concepto.trim() !== '' && montoNumero !== null && montoNumero > 0 && !enviando

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!puede || montoNumero === null) return
    setError(null)
    setEnviando(true)
    try {
      // Hoy se manda sin fecha (la pone el servidor con la hora exacta); un día pasado, al mediodía de ESE día.
      const fechaElegida = fecha && fecha !== hoyLocal() ? new Date(`${fecha}T12:00:00`).toISOString() : null
      const { data, error, response } = await api.POST('/api/v1/gastos', {
        body: { claveIdempotencia: clave.current, concepto: concepto.trim(), monto: montoNumero, fecha: fechaElegida },
      })
      if (data) alListo(data)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <Campo etiqueta="¿En qué gastaste?" value={concepto} maxLength={120} autoComplete="off" onChange={(e) => setConcepto(e.target.value)} />
      <div className="chips" role="group" aria-label="Sugerencias">
        {SUGERENCIAS.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={concepto === s} onClick={() => setConcepto(s)}>
            {s}
          </button>
        ))}
      </div>
      <Campo etiqueta="Monto" prefijo="Bs" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} aria-invalid={!!avisoMonto} ayuda={avisoMonto ?? undefined} />
      <Campo etiqueta="Fecha" type="date" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value)} ayuda="Por defecto, hoy." />

      {error && <Aviso>{error}</Aviso>}

      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={!puede}>
          {enviando ? 'Guardando…' : 'Guardar gasto'}
        </button>
      </div>
    </form>
  )
}

function DialogoAnular({ gasto, alCerrar, alListo }: { gasto: Gasto | null; alCerrar: () => void; alListo: () => void }) {
  return (
    <Dialogo abierto={gasto !== null} titulo="¿Anular este gasto?" subtitulo={gasto ? `${gasto.concepto} · ${bs(gasto.monto)}` : undefined} alCerrar={alCerrar} hoja>
      {gasto && <FormularioAnular gasto={gasto} alCerrar={alCerrar} alListo={alListo} />}
    </Dialogo>
  )
}

function FormularioAnular({ gasto, alCerrar, alListo }: { gasto: Gasto; alCerrar: () => void; alListo: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function anular() {
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/gastos/{id}/anular', { params: { path: { id: gasto.id } } })
      if (data) alListo()
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="formulario formulario-hoja">
      <p className="texto-suave">Deja de contar en tus números del mes. No se puede deshacer.</p>
      {error && <Aviso>{error}</Aviso>}
      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          No, dejarlo
        </button>
        <button type="button" className="boton boton-primario" onClick={anular} disabled={enviando}>
          {enviando ? 'Anulando…' : 'Sí, anular'}
        </button>
      </div>
    </div>
  )
}
