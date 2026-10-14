import { Link } from 'react-router'
import { Icono, type NombreIcono } from '../../componentes/Icono'
import { useSesionActiva } from '../../sesion/contexto'
import { fechaLarga, iniciales, primerNombre } from '../../util/texto'

// Sin datos todavía (no hay productos ni ventas): en vez de números inventados, los primeros
// pasos. Las métricas reales llegan con el módulo M9 (Inicio y gastos).
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
    ruta: '/precios',
  },
]

export function Inicio() {
  const { usuario, tienda } = useSesionActiva()

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

      <section className="tarjeta tarjeta-destacada">
        <h2 className="titulo-seccion">Tu cuenta está lista</h2>
        <p>
          Tu tienda va a estar en <strong>/{tienda.slug}</strong>. Estos son los primeros pasos para empezar a vender.
        </p>
      </section>

      <Link to="/ventas" className="tarjeta paso">
        <span className="icono-caja" aria-hidden="true">
          <Icono nombre="ventas" />
        </span>
        <span className="paso-texto">
          <strong>Mis ventas</strong>
          <span className="texto-suave">Lo que vendiste hoy, esta semana y este mes.</span>
        </span>
        <Icono nombre="chevron" />
      </Link>

      <ol className="lista-pasos">
        {primerosPasos.map((p) => (
          <li key={p.ruta}>
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
    </div>
  )
}
