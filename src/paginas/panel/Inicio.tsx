import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, mensajeDeError, type Inicio as DatosInicio, type MasVendido, type ProductoResumen, type VentaDia, type VentaResumen } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Icono, type NombreIcono } from '../../componentes/Icono'
import { usePermisos, useSesionActiva } from '../../sesion/contexto'
import { INSTAGRAM_LISTO } from '../../diseno/secciones'
import { P } from '../../sesion/permisos'
import { bs } from '../../util/dinero'
import { nombreDelPeriodo, nombreDelPeriodoAnterior, rangoAnterior, rangoDe, rangoPorDia, type Periodo } from '../../util/periodo'
import { fechaLarga, iniciales, primerNombre } from '../../util/texto'
import { cuando } from '../stock/historial'
import { nombreDePago } from '../ventas/pagos'
import { GraficoVentasPorDia } from './GraficoVentasPorDia'

// Sin actividad todavía (no hay ventas ni nada reciente): en vez de números en cero, los primeros pasos.
const primerosPasos: { icono: NombreIcono; titulo: string; texto: string; ruta: string }[] = [
  {
    icono: 'catalogo',
    titulo: 'Cargá tus productos',
    texto: 'Con fotos, colores y tallas.',
    ruta: '/catalogo',
  },
  {
    icono: 'tienda',
    titulo: 'Prepará tu tienda',
    texto: 'Tu WhatsApp, tus colores y tu logo para compartirla.',
    ruta: '/mi-tienda',
  },
  {
    icono: 'precios',
    titulo: 'Revisá tus precios',
    texto: 'Calculá cuánto cobrar para que cada venta te deje ganancia.',
    ruta: '/catalogo',
  },
]

const periodos: { id: Periodo; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'mes', etiqueta: 'Mes' },
]

const hora = (iso: string) => new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`)
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// Lo que se pide para armar el tablero (todo junto; el período lo elige quien mira).
type Tablero = {
  datos: DatosInicio
  anterior: DatosInicio | null
  dias: VentaDia[]
  masVendidos: MasVendido[]
  ultimas: VentaResumen[]
  revisar: ProductoResumen[]
  hayMasParaRevisar: boolean
}

// El Inicio: cómo va el negocio en el período que elijas (hoy, la semana o el mes), lo que hay que atender y lo último que
// pasó. Los números salen del servidor (la ganancia, "ya cubriste X %", las reglas de margen y de stock): acá solo se muestran.
export function Inicio() {
  const { usuario, tienda } = useSesionActiva()
  const { tiene } = usePermisos()
  const puedeRevisarPrecios = tiene(P.costosVer) && tiene(P.productosVer)
  const [params, setParams] = useSearchParams()
  const periodo = (periodos.find((p) => p.id === params.get('periodo'))?.id ?? 'mes') as Periodo
  const [tablero, setTablero] = useState<Tablero | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    Promise.all([
      api.GET('/api/v1/inicio', { params: { query: rangoDe(periodo) } }),
      api.GET('/api/v1/inicio', { params: { query: rangoAnterior(periodo) } }),
      api.GET('/api/v1/ventas/por-dia', { params: { query: rangoPorDia(14) } }),
      api.GET('/api/v1/ventas/mas-vendidos', { params: { query: { ...rangoDe(periodo), Limite: 5 } } }),
      api.GET('/api/v1/ventas', { params: { query: { Limite: 5 } } }),
      // Los precios para revisar son costos y margen: solo con ese permiso (y el del catálogo).
      puedeRevisarPrecios ? api.GET('/api/v1/productos', { params: { query: { RevisarPrecio: true, Limite: 20 } } }) : Promise.resolve(null),
    ])
      .then(([actual, anterior, dias, top, ultimas, revisar]) => {
        if (cancelado) return
        if (!actual.data) return setError(mensajeDeError(actual.error, actual.response))
        setError(null)
        setTablero({
          datos: actual.data,
          anterior: anterior.data ?? null,
          dias: dias.data ?? [],
          masVendidos: top.data ?? [],
          ultimas: ultimas.data?.items ?? [],
          revisar: revisar?.data?.items ?? [],
          hayMasParaRevisar: !!revisar?.data?.siguiente,
        })
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [periodo, puedeRevisarPrecios])

  const datos = tablero?.datos ?? null
  // Un pedido de la tienda pública o algo esperando en la bandeja también es actividad: si no, una tienda nueva con su primer
  // pedido no lo vería acá.
  const sinActividad =
    datos !== null &&
    datos.ventas === 0 &&
    datos.recientes.length === 0 &&
    datos.gastos === 0 &&
    datos.pedidosPendientes === 0 &&
    datos.borradoresListos + datos.borradoresSinPrecio === 0 &&
    tablero!.ultimas.length === 0

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <div className="pagina-cabecera-texto">
          <span className="texto-suave texto-chico">{mayuscula(fechaLarga())}</span>
          <h1 className="titulo-pagina">Hola, {primerNombre(usuario.nombre)}</h1>
        </div>
        {!sinActividad && (
          <div className="segmentos selector-periodo" role="group" aria-label="Período">
            {periodos.map((p) => (
              <button
                key={p.id}
                type="button"
                className="segmento"
                aria-pressed={periodo === p.id}
                onClick={() => setParams(p.id === 'mes' ? {} : { periodo: p.id }, { replace: true })}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        )}
        <Link to="/mi-tienda" className="avatar avatar-grande solo-celular" aria-label="Mi tienda">
          {iniciales(tienda.nombre)}
        </Link>
      </header>

      {error && <Aviso>{error}</Aviso>}
      {tablero === null && !error && (
        <p className="texto-suave" role="status">
          Cargando tu negocio…
        </p>
      )}

      {sinActividad && (
        <>
          <section className="tarjeta tarjeta-destacada">
            <h2 className="titulo-seccion">Tu cuenta está lista</h2>
            <p>
              Tu tienda va a estar en <strong>/{tienda.slug}</strong>. Estos son los primeros pasos para empezar a vender.
            </p>
          </section>
          <ol className="lista-pasos">
            {primerosPasos.map((p) => (
              <li key={p.titulo}>
                <Link to={p.ruta} className="tarjeta paso">
                  <span className="icono-caja" aria-hidden="true">
                    <Icono nombre={p.icono} />
                  </span>
                  <span className="paso-texto">
                    <strong>{p.titulo}</strong>
                    <span className="texto-suave">{p.texto}</span>
                  </span>
                  <Icono nombre="chevron" />
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}

      {tablero && !sinActividad && <Panel tablero={tablero} periodo={periodo} />}

      {tablero && (
        <nav className="accesos" aria-label="Accesos rápidos">
          {tiene(P.ventasRegistrar) && (
            <Link to="/venta" className="boton boton-primario">
              <Icono nombre="mas" tamano={18} />
              Nueva venta
            </Link>
          )}
          {tiene(P.gastosGestionar) && (
            <Link to="/gastos?nuevo=1" className="boton boton-secundario">
              Anotar un gasto
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}

function Panel({ tablero, periodo }: { tablero: Tablero; periodo: Periodo }) {
  const { datos: d, anterior, dias, masVendidos, ultimas, revisar, hayMasParaRevisar } = tablero
  const { tiene } = usePermisos()
  const veCostos = tiene(P.costosVer) // la ganancia y todo lo que sale de ella
  const veGastos = veCostos && tiene(P.gastosVer)
  const cubierto = d.porcentajeCubierto
  const nombrePeriodo = nombreDelPeriodo(periodo)
  const ticket = d.ventas > 0 ? d.totalVendido / d.ventas : 0
  // "+18 % vs. septiembre": solo si el período anterior tuvo ganancia (dividir por cero o por una pérdida no dice nada).
  const variacion = anterior && anterior.ganancia > 0 && d.ventas > 0 ? Math.round(((d.ganancia - anterior.ganancia) / anterior.ganancia) * 100) : null
  const bandeja = d.borradoresListos + d.borradoresSinPrecio
  const primeroARevisar = revisar[0]
  const primeroAReponer = d.paraReponer[0]

  return (
    <>
      {INSTAGRAM_LISTO && bandeja > 0 && (
        <section className="banner-ig" aria-label="Instagram">
          <span className="banner-ig-icono" aria-hidden="true">
            <Icono nombre="instagram" tamano={22} />
          </span>
          <div className="banner-ig-texto">
            <strong>{plural(bandeja, 'producto nuevo esperando en tu bandeja de Instagram', 'productos nuevos esperando en tu bandeja de Instagram')}</strong>
            <span>
              {[d.borradoresListos > 0 ? `${plural(d.borradoresListos, 'listo', 'listos')} para agregar` : null, d.borradoresSinPrecio > 0 ? `${d.borradoresSinPrecio} sin precio` : null]
                .filter(Boolean)
                .join(' y ')}
            </span>
          </div>
          <Link to="/instagram" className="boton boton-secundario boton-chico">
            Revisar ahora
          </Link>
        </section>
      )}

      <section className="kpis" aria-label={`Tu ${nombrePeriodo}`}>
        <Kpi etiqueta="Vendiste" valor={bs(d.totalVendido)} pie={plural(d.ventas, 'venta', 'ventas')} />
        {veCostos && (
          <Kpi
            verde
            etiqueta="Ganaste"
            valor={d.ventas > 0 ? (d.ganancia >= 0 ? bs(d.ganancia) : `−${bs(Math.abs(d.ganancia))}`) : bs(0)}
            pie={
              variacion !== null
                ? `${variacion >= 0 ? '+' : '−'}${Math.abs(variacion)} % vs. ${nombreDelPeriodoAnterior(periodo)}`
                : d.unidadesSinCosto > 0
                  ? `${plural(d.unidadesSinCosto, 'unidad sin costo cargado', 'unidades sin costo cargado')}`
                  : ''
            }
          />
        )}
        <Kpi etiqueta="Ventas" valor={String(d.ventas)} pie={d.ventas > 0 ? `ticket promedio ${bs(Math.round(ticket))}` : ''} />
        <Kpi etiqueta="Productos vendidos" valor={String(d.unidades)} pie={d.unidadesDeLaTienda > 0 ? `${d.unidadesDeLaTienda} desde la tienda web` : ''} />
      </section>

      <div className="tablero-medio">
        <GraficoVentasPorDia dias={dias} />

        <div className="tablero-lateral">
          {veGastos && (
          <section className="tarjeta gastos-cubiertos" aria-labelledby="gastos-titulo">
            <div className="gastos-cubiertos-cabecera">
              <h2 id="gastos-titulo" className="titulo-seccion">
                Gastos de {nombrePeriodo} cubiertos
              </h2>
              {cubierto !== null && <strong className="gastos-cubiertos-porcentaje">{cubierto >= 100 ? '100 %+' : `${cubierto} %`}</strong>}
            </div>
            {cubierto === null ? (
              <p className="texto-suave">
                Todavía no anotaste gastos {periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'}. Anotá el alquiler, la luz y lo demás para ver cuánto de eso ya cubriste con lo que ganás.
              </p>
            ) : (
              <>
                <div className="medidor-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, cubierto)} aria-label="Gastos cubiertos con tu ganancia">
                  <span className={`medidor-relleno${cubierto >= 100 ? ' medidor-completo' : ''}`} style={{ width: `${Math.min(100, cubierto)}%` }} />
                </div>
                <p className="texto-suave">
                  {d.resultado >= 0 ? (
                    <>
                      Ya cubriste tus gastos ({bs(d.gastos)}) y te sobran <strong>{bs(d.resultado)}</strong>.
                    </>
                  ) : (
                    <>
                      Te faltan <strong>{bs(Math.abs(d.resultado))} de ganancia</strong> para cubrir tus gastos ({bs(d.gastos)}).
                    </>
                  )}
                </p>
              </>
            )}
            <Link to="/gastos" className="boton boton-texto boton-chico medidor-enlace">
              Ver mis gastos
            </Link>
          </section>
          )}

          {d.pedidosPendientes > 0 && (
            <FilaAviso
              ruta="/pedidos"
              icono="bolsa"
              titulo={d.pedidosPendientes === 1 ? 'Tenés 1 pedido de tu tienda esperando' : `Tenés ${d.pedidosPendientes} pedidos de tu tienda esperando`}
              texto="Confirmalos y registrá la entrega cuando los cobres"
            />
          )}
          {veCostos && primeroARevisar && (
            <FilaAviso
              ruta="/catalogo?filtro=revisar"
              icono="alerta"
              ambar
              titulo={`${hayMasParaRevisar ? 'Más de ' : ''}${plural(revisar.length, 'producto con precio para revisar', 'productos con precio para revisar')}`}
              texto={primeroARevisar.estadoPrecio === 'Pierde' ? `${primeroARevisar.nombre} pierde ${bs(Math.abs(primeroARevisar.ganancia))} por venta` : `${primeroARevisar.nombre} te deja poca ganancia`}
            />
          )}
          {primeroAReponer && (
            <FilaAviso
              ruta="/stock?vista=areponer"
              icono="stock"
              rojo
              titulo={primeroAReponer.estado === 'Agotado' ? `Se agotó ${primeroAReponer.nombre}` : `Quedan ${primeroAReponer.stock} ${primeroAReponer.nombre}`}
              texto={`${[d.agotados > 0 ? `${plural(d.agotados, 'agotado', 'agotados')}` : null, d.porAgotarse > 0 ? `${d.porAgotarse} por agotarse` : null].filter(Boolean).join(' y ')} · ¿llegaron más?`}
            />
          )}
          {(d.porPagar > 0 || d.enCamino > 0) && (
            <FilaAviso
              ruta="/compras"
              icono="compras"
              titulo={d.porPagar > 0 ? `Les debés ${bs(d.porPagar)} a tus proveedores` : plural(d.enCamino, 'pedido en camino', 'pedidos en camino')}
              texto={d.porPagar > 0 && d.enCamino > 0 ? plural(d.enCamino, 'pedido en camino', 'pedidos en camino') : 'Mirá tus compras'}
            />
          )}
        </div>
      </div>

      <div className="tablero-pie">
        <section className="tarjeta tabla-tarjeta" aria-labelledby="mas-vendido-titulo">
          <div className="tabla-cabecera">
            <h2 id="mas-vendido-titulo" className="titulo-seccion">
              Lo que más se vende
            </h2>
            <Link to="/catalogo" className="enlace-verde">
              Ver catálogo
            </Link>
          </div>
          {masVendidos.length === 0 ? (
            <p className="texto-suave">Cuando vendas, acá ves qué es lo que más sale en {nombrePeriodo === 'hoy' ? 'el día' : nombrePeriodo === 'la semana' ? 'la semana' : 'el mes'}.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col" className="num">
                    Vendidos
                  </th>
                  {veCostos && (
                    <th scope="col" className="num">
                      Ganancia
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {masVendidos.map((p) => (
                  <tr key={p.productoId}>
                    <td className="tabla-fuerte">{p.nombre}</td>
                    <td className="num">{p.unidades}</td>
                    {veCostos && <td className="num tabla-ganancia">{p.ganancia === null ? '—' : bs(p.ganancia)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="tarjeta tabla-tarjeta" aria-labelledby="ultimas-titulo">
          <div className="tabla-cabecera">
            <h2 id="ultimas-titulo" className="titulo-seccion">
              Últimas ventas
            </h2>
            <Link to="/ventas" className="enlace-verde">
              Ver ventas
            </Link>
          </div>
          {ultimas.length === 0 ? (
            <p className="texto-suave">Todavía no registraste ventas.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Productos</th>
                  <th scope="col">Pago</th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {ultimas.map((v) => (
                  <tr key={v.id}>
                    <td className="texto-suave tabla-hora">{cuando(v.fecha) === 'Hoy' ? hora(v.fecha) : `${cuando(v.fecha)} ${hora(v.fecha)}`}</td>
                    <td>{v.detalle}</td>
                    <td>
                      <span className="etiqueta-pago">{nombreDePago(v.metodoPago)}</span>
                    </td>
                    <td className="num tabla-fuerte">{bs(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}

function Kpi({ etiqueta, valor, pie, verde }: { etiqueta: string; valor: string; pie: string; verde?: boolean }) {
  return (
    <div className={`kpi${verde ? ' kpi-verde' : ''}`}>
      <span className="kpi-etiqueta">{etiqueta}</span>
      <strong className="kpi-valor">{valor}</strong>
      <span className="kpi-pie">{pie || ' '}</span>
    </div>
  )
}

function FilaAviso({ ruta, icono, titulo, texto, ambar, rojo }: { ruta: string; icono: NombreIcono; titulo: ReactNode; texto: ReactNode; ambar?: boolean; rojo?: boolean }) {
  return (
    <Link to={ruta} className={`fila-aviso${ambar ? ' fila-aviso-ambar' : ''}`}>
      <span className={`icono-caja${ambar ? ' icono-caja-ambar' : rojo ? ' icono-caja-roja' : ''}`} aria-hidden="true">
        <Icono nombre={icono} tamano={20} />
      </span>
      <span className="fila-aviso-texto">
        <strong>{titulo}</strong>
        <span>{texto}</span>
      </span>
      <Icono nombre="chevron" tamano={18} />
    </Link>
  )
}
