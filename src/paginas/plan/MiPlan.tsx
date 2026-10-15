import { useEffect, useState, type FormEvent } from 'react'
import { api, mensajeDeError, type ImagenSubida, type MiPlan as MiPlanDto, type PagoPlan, type Plan, type PlanesOfrecidos } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Dialogo } from '../../componentes/Dialogo'
import { SubirFoto } from '../../componentes/SubirFoto'
import { bs } from '../../util/dinero'
import { fechaLarga, limite } from '../../util/plan'

const METODOS = [
  { valor: 'Qr', nombre: 'QR' },
  { valor: 'Transferencia', nombre: 'Transferencia' },
] as const


// Qué plan tiene la tienda, cuánto usa de cada límite y cómo pasar a uno más grande: se paga por QR o transferencia, se sube la
// foto del comprobante y la plataforma lo revisa a mano (no hay cobro automático todavía). Nada se borra al vencer un plan:
// solo deja de dejar agregar más de lo que permite el Gratis.
export function MiPlan() {
  const [mi, setMi] = useState<MiPlanDto | null>(null)
  const [ofrecidos, setOfrecidos] = useState<PlanesOfrecidos | null>(null)
  const [pagos, setPagos] = useState<PagoPlan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [pidiendo, setPidiendo] = useState<Plan | null>(null)

  useEffect(() => {
    let cancelado = false
    Promise.all([api.GET('/api/v1/plan'), api.GET('/api/v1/planes'), api.GET('/api/v1/plan/pagos')])
      .then(([a, b, c]) => {
        if (cancelado) return
        if (!a.data || !b.data || !c.data) return setError(mensajeDeError(a.error ?? b.error ?? c.error, a.response))
        setError(null)
        setMi(a.data)
        setOfrecidos(b.data)
        setPagos(c.data)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [version])

  const rechazado = !mi?.pendiente ? pagos.find((p) => p.estado === 'Rechazado') : undefined
  const elegibles = ofrecidos?.planes.filter((p) => p.precioMensual > 0 && p.activo) ?? []

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Mi plan</h1>
      </header>

      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {!mi && !error && (
        <p className="texto-suave" role="status">
          Cargando tu plan…
        </p>
      )}

      {mi && (
        <section className="tarjeta medidor" aria-label="Tu plan actual">
          <h2 className="titulo-seccion">Plan {mi.plan.nombre}</h2>
          <p className="texto-suave" data-prueba="plan-vence">
            {mi.hasta ? `Vigente hasta el ${fechaLarga(mi.hasta)}.` : mi.plan.precioMensual > 0 ? 'Sin fecha de vencimiento.' : 'Es el plan de inicio: gratis para siempre.'}
          </p>
          <Uso titulo="Productos" usado={mi.productos} maximo={mi.plan.maxProductos} texto={`${mi.productos} de ${limite(mi.plan.maxProductos, 'productos')}`} />
          <Uso
            titulo="Espacio de fotos"
            usado={mi.almacenamientoMb}
            maximo={mi.plan.maxAlmacenamientoMb}
            texto={`${mi.almacenamientoMb.toLocaleString('es-BO')} MB de ${limite(mi.plan.maxAlmacenamientoMb, 'MB')}`}
          />
          <p className="texto-suave texto-chico">Si tu plan vence no perdés nada: tus productos y fotos quedan, solo no podés agregar más que lo que permite el plan Gratis.</p>
        </section>
      )}

      {mi?.pendiente && (
        <Aviso tipo="advertencia">
          Estamos revisando tu pago del plan {mi.pendiente.plan} ({bs(mi.pendiente.monto)} por {mi.pendiente.meses} {mi.pendiente.meses === 1 ? 'mes' : 'meses'}). Apenas lo confirmemos se activa.
        </Aviso>
      )}
      {rechazado && (
        <Aviso>
          No pudimos confirmar tu último pago ({rechazado.plan}): {rechazado.motivo ?? 'sin motivo'}. Podés volver a pedirlo.
        </Aviso>
      )}

      {mi && elegibles.length > 0 && (
        <section aria-label="Planes" className="planes-grilla">
          {elegibles.map((p) => {
            const actual = p.id === mi.plan.id
            return (
              <article key={p.id} className={`tarjeta tarjeta-plan${actual ? ' tarjeta-destacada' : ''}`}>
                <h2 className="titulo-seccion">{p.nombre}</h2>
                <p className="plan-precio">
                  <strong>{bs(p.precioMensual)}</strong> <span className="texto-suave">por mes</span>
                </p>
                <ul className="plan-lista">
                  <li>{limite(p.maxProductos, 'productos')}</li>
                  <li>{limite(p.maxAlmacenamientoMb, 'MB')} de fotos</li>
                </ul>
                <button
                  type="button"
                  className="boton boton-primario"
                  disabled={!!mi.pendiente}
                  onClick={() => setPidiendo(p)}
                  aria-label={`${actual ? 'Renovar' : 'Pedir'} el plan ${p.nombre}`}
                >
                  {actual ? 'Renovar' : 'Pedir este plan'}
                </button>
              </article>
            )
          })}
        </section>
      )}

      {pagos.length > 0 && (
        <section className="tarjeta" aria-label="Mis pagos">
          <h2 className="titulo-seccion">Mis pagos</h2>
          <ul className="lista-ventas">
            {pagos.map((p) => (
              <li key={p.id} className="fila-venta">
                <div className="fila-stock-cabecera fila-gasto">
                  <span className="fila-stock-datos">
                    <span className="fila-stock-nombre">
                      {p.plan} · {p.meses} {p.meses === 1 ? 'mes' : 'meses'}
                    </span>
                    <span className="texto-suave texto-chico">
                      {fechaLarga(p.creadoEn)} · {p.estado === 'Pendiente' ? 'En revisión' : p.estado === 'Aprobado' ? 'Aprobado' : `Rechazado${p.motivo ? `: ${p.motivo}` : ''}`}
                    </span>
                  </span>
                  <strong className="fila-venta-total">{bs(p.monto)}</strong>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialogo abierto={pidiendo !== null} titulo={pidiendo ? `Plan ${pidiendo.nombre}` : ''} alCerrar={() => setPidiendo(null)} hoja>
        {pidiendo && ofrecidos && (
          <FormularioPedido
            plan={pidiendo}
            meses={ofrecidos.meses}
            instrucciones={ofrecidos.instruccionesDePago}
            alCerrar={() => setPidiendo(null)}
            alListo={() => {
              setPidiendo(null)
              setAviso('Recibimos tu comprobante. Lo revisamos y te activamos el plan.')
              setVersion((n) => n + 1)
            }}
          />
        )}
      </Dialogo>
    </div>
  )
}

function Uso({ titulo, usado, maximo, texto }: { titulo: string; usado: number; maximo: number | null | undefined; texto: string }) {
  const porcentaje = maximo ? Math.min(100, Math.round((usado / maximo) * 100)) : 0
  return (
    <div className="medidor">
      <span className="texto-chico">
        <strong>{titulo}</strong> · {texto}
      </span>
      {maximo ? (
        <div className="medidor-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje} aria-label={titulo}>
          <span className={`medidor-relleno${porcentaje >= 100 ? ' medidor-lleno' : ''}`} style={{ width: `${porcentaje}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function FormularioPedido({ plan, meses, instrucciones, alCerrar, alListo }: { plan: Plan; meses: number[]; instrucciones: string; alCerrar: () => void; alListo: () => void }) {
  const [cuantos, setCuantos] = useState(meses[0] ?? 1)
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]['valor']>('Qr')
  const [comprobante, setComprobante] = useState<ImagenSubida | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!comprobante || enviando) return
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/plan/solicitar', {
        body: { planId: plan.id, meses: cuantos, metodo, comprobanteImagenId: comprobante.id },
      })
      if (data) alListo()
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario formulario-hoja" onSubmit={enviar} noValidate>
      <fieldset className="campo">
        <legend className="campo-etiqueta">¿Por cuántos meses?</legend>
        <div className="chips" role="group" aria-label="Meses">
          {meses.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={cuantos === m} onClick={() => setCuantos(m)}>
              {m} {m === 1 ? 'mes' : 'meses'}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="plan-total" data-prueba="plan-total">
        Total a pagar: <strong>{bs(plan.precioMensual * cuantos)}</strong>
      </p>

      <fieldset className="campo">
        <legend className="campo-etiqueta">¿Cómo vas a pagar?</legend>
        <div className="chips" role="group" aria-label="Forma de pago">
          {METODOS.map((m) => (
            <button key={m.valor} type="button" className="chip" aria-pressed={metodo === m.valor} onClick={() => setMetodo(m.valor)}>
              {m.nombre}
            </button>
          ))}
        </div>
      </fieldset>

      <Aviso tipo="advertencia">{instrucciones}</Aviso>

      <div className="campo">
        <span className="campo-etiqueta">Foto del comprobante</span>
        <SubirFoto comprobante etiqueta="comprobante" imagen={comprobante} alCambiar={setComprobante} vacio={{ iniciales: 'Bs', fondo: 'var(--apagado)', texto: 'var(--texto-suave)' }} />
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={!comprobante || enviando}>
          {enviando ? 'Enviando…' : 'Enviar pedido'}
        </button>
      </div>
    </form>
  )
}
