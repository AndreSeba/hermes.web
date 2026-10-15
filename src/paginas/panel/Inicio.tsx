import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, mensajeDeError, type Inicio as DatosInicio } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Icono, type NombreIcono } from '../../componentes/Icono'
import { useSesionActiva } from '../../sesion/contexto'
import { bs } from '../../util/dinero'
import { nombreDelMes, rangoDelMes } from '../../util/periodo'
import { fechaLarga, iniciales, primerNombre } from '../../util/texto'
import { cuando } from '../stock/historial'

// Sin actividad todavía (no hay ventas ni nada reciente): en vez de números en cero, los primeros pasos.
const primerosPasos: { icono: NombreIcono; titulo: string; texto: string; ruta: string }[] = [
  {
    icono: 'catalogo',
    titulo: 'Cargá tus productos',
    texto: 'Con fotos, colores y tallas. O traelos desde Instagram.',
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

const iconoActividad = { Venta: 'ventas', Compra: 'compras', Gasto: 'gastos' } as const
const verboActividad = { Venta: 'Vendiste', Compra: 'Compraste a', Gasto: 'Gastaste en' } as const
const rutaActividad = { Venta: '/ventas', Compra: '/compras', Gasto: '/gastos' } as const

export function Inicio() {
  const { usuario, tienda } = useSesionActiva()
  const [datos, setDatos] = useState<DatosInicio | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/inicio', { params: { query: rangoDelMes() } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (data) setDatos(data)
        else setError(mensajeDeError(error, response))
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [])

  // Un pedido de la tienda pública también es actividad: si no, una tienda nueva con su primer pedido no lo vería acá.
  const sinActividad = datos !== null && datos.ventas === 0 && datos.recientes.length === 0 && datos.gastos === 0 && datos.pedidosPendientes === 0

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <div className="pagina-cabecera-texto">
          <span className="texto-suave texto-chico">
            {tienda.nombre} · {fechaLarga()}
          </span>
          <h1 className="titulo-pagina">Hola, {primerNombre(usuario.nombre)}</h1>
        </div>
        <Link to="/mi-tienda" className="avatar avatar-grande solo-celular" aria-label="Mi tienda">
          {iniciales(tienda.nombre)}
        </Link>
      </header>

      {error && <Aviso>{error}</Aviso>}
      {datos === null && !error && (
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

      {datos && !sinActividad && <Resumen datos={datos} />}

      {datos && (
        <nav className="accesos" aria-label="Accesos rápidos">
          <Link to="/venta" className="boton boton-primario">
            <Icono nombre="mas" tamano={18} />
            Nueva venta
          </Link>
          <Link to="/gastos?nuevo=1" className="boton boton-secundario">
            Anotar un gasto
          </Link>
        </nav>
      )}
    </div>
  )
}

function Resumen({ datos: d }: { datos: DatosInicio }) {
  const mes = nombreDelMes()
  const cubierto = d.porcentajeCubierto

  return (
    <>
      <section className="resumen-stock" aria-label={`Tu ${mes}`}>
        <span className="resumen-stock-chico">En {mes} vendiste</span>
        <span className="resumen-stock-valor">{bs(d.totalVendido)}</span>
        <span className="resumen-stock-chico">
          {d.ventas === 1 ? '1 venta' : `${d.ventas} ventas`} · {d.unidades === 1 ? '1 unidad' : `${d.unidades} unidades`}
        </span>
        {d.ventas > 0 && (
          <div className="resumen-chips">
            <span className={`resumen-chip ${d.ganancia >= 0 ? 'resumen-chip-verde' : 'resumen-chip-rojo'}`}>
              {d.ganancia >= 0 ? `Ganaste ${bs(d.ganancia)}` : `Perdiste ${bs(Math.abs(d.ganancia))}`}
            </span>
            {d.unidadesSinCosto > 0 && (
              <span className="resumen-chip resumen-chip-ambar">
                {d.unidadesSinCosto === 1 ? '1 unidad sin costo cargado' : `${d.unidadesSinCosto} unidades sin costo cargado`}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="tarjeta medidor" aria-labelledby="medidor-titulo">
        <h2 id="medidor-titulo" className="titulo-seccion">
          Tus gastos de {mes}
        </h2>
        {cubierto === null ? (
          <p className="texto-suave">
            Todavía no anotaste gastos este mes. Anotá el alquiler, la luz y lo demás para ver cuánto de eso ya cubriste con lo que ganás.
          </p>
        ) : (
          <>
            <p>
              Gastaste <strong>{bs(d.gastos)}</strong> y ya cubriste el <strong>{cubierto} %</strong>.
            </p>
            <div className="medidor-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, cubierto)} aria-label="Gastos cubiertos con tu ganancia">
              <span className={`medidor-relleno${cubierto >= 100 ? ' medidor-completo' : ''}`} style={{ width: `${Math.min(100, cubierto)}%` }} />
            </div>
            <p className={`texto-chico ${d.resultado >= 0 ? 'texto-ok' : 'texto-suave'}`}>
              {d.resultado >= 0 ? `Ya los cubriste y te sobran ${bs(d.resultado)}.` : `Te faltan ${bs(Math.abs(d.resultado))} de ganancia para cubrirlos.`}
            </p>
          </>
        )}
        <Link to="/gastos" className="boton boton-texto boton-chico medidor-enlace">
          Ver mis gastos
        </Link>
      </section>

      {(d.pedidosPendientes > 0 || d.paraReponer.length > 0 || d.porPagar > 0 || d.enCamino > 0) && (
        <section className="tarjeta" aria-labelledby="atencion-titulo">
          <h2 id="atencion-titulo" className="titulo-seccion">
            Para atender
          </h2>
          {d.pedidosPendientes > 0 && (
            <div className="atencion-bloque">
              <span className="historial-titulo">Pedidos de tu tienda</span>
              <p className="texto-chico">
                {d.pedidosPendientes === 1 ? 'Tenés 1 pedido esperando' : `Tenés ${d.pedidosPendientes} pedidos esperando`}
              </p>
              <Link to="/pedidos" className="boton boton-primario boton-chico">
                Ver pedidos
              </Link>
            </div>
          )}
          {d.paraReponer.length > 0 && (
            <div className="atencion-bloque">
              <span className="historial-titulo">
                Para reponer ({d.agotados > 0 ? `${d.agotados} agotado${d.agotados === 1 ? '' : 's'}` : ''}
                {d.agotados > 0 && d.porAgotarse > 0 ? ' · ' : ''}
                {d.porAgotarse > 0 ? `${d.porAgotarse} por agotarse` : ''})
              </span>
              <ul className="atencion-lista">
                {d.paraReponer.map((p) => (
                  <li key={p.id}>
                    <span>{p.nombre}</span>
                    <span className={p.estado === 'Agotado' ? 'texto-peligro' : 'texto-suave'}>{p.estado === 'Agotado' ? 'Agotado' : `Quedan ${p.stock}`}</span>
                  </li>
                ))}
              </ul>
              <Link to="/stock?vista=areponer" className="boton boton-secundario boton-chico">
                Ver lo que hay que reponer
              </Link>
            </div>
          )}
          {(d.porPagar > 0 || d.enCamino > 0) && (
            <div className="atencion-bloque">
              <span className="historial-titulo">Compras</span>
              <p className="texto-chico">
                {[d.porPagar > 0 ? `Les debés ${bs(d.porPagar)} a tus proveedores` : null, d.enCamino > 0 ? (d.enCamino === 1 ? '1 pedido en camino' : `${d.enCamino} pedidos en camino`) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <Link to="/compras" className="boton boton-secundario boton-chico">
                Ver mis compras
              </Link>
            </div>
          )}
        </section>
      )}

      {d.recientes.length > 0 && (
        <section className="tarjeta" aria-labelledby="recientes-titulo">
          <h2 id="recientes-titulo" className="titulo-seccion">
            Lo último que pasó
          </h2>
          <ul className="lineas-venta recientes">
            {d.recientes.map((a) => (
              <li key={`${a.tipo}-${a.id}`}>
                <Link to={rutaActividad[a.tipo]} className="reciente">
                  <span className="icono-caja icono-caja-chica" aria-hidden="true">
                    <Icono nombre={iconoActividad[a.tipo]} tamano={16} />
                  </span>
                  <span className="reciente-texto">
                    <span>
                      {verboActividad[a.tipo]} {a.titulo}
                    </span>
                    <span className="texto-suave texto-chico">{cuando(a.fecha)}</span>
                  </span>
                  <strong>{a.tipo === 'Venta' ? '+' : '−'}{bs(a.monto)}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
