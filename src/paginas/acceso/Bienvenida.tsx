import { Link } from 'react-router'
import { Icono, type NombreIcono } from '../../componentes/Icono'
import { marca } from '../../marca'

const beneficios: { icono: NombreIcono; titulo: string; texto: string }[] = [
  {
    icono: 'stock',
    titulo: 'Tu stock siempre al día',
    texto: 'Cada venta descuenta sola y te avisamos antes de que se te acabe algo.',
  },
  {
    icono: 'calculadora',
    titulo: 'Sabés cuánto ganás',
    texto: 'Te sugerimos un precio que cubra tus costos y te avisamos si un producto te hace perder.',
  },
  {
    icono: 'whatsapp',
    titulo: 'Vendés por WhatsApp',
    texto: 'Tu tienda online para compartir; tus clientes piden sin registrarse.',
  },
]

export function Bienvenida() {
  return (
    <div className="acceso">
      <div className="acceso-columna">
        <header className="acceso-cabecera">
          <p className="marca-nombre">{marca.nombre}</p>
          <h1 className="titulo-grande">{marca.lema}</h1>
          <p className="texto-suave">
            Catálogo, stock, ventas y tu tienda online, en un solo lugar y pensado para que lo manejes desde el celular.
          </p>
        </header>

        <ul className="beneficios">
          {beneficios.map((b) => (
            <li key={b.titulo} className="tarjeta beneficio">
              <span className="icono-caja" aria-hidden="true">
                <Icono nombre={b.icono} tamano={22} />
              </span>
              <span className="beneficio-texto">
                <strong>{b.titulo}</strong>
                <span className="texto-suave">{b.texto}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="acceso-acciones">
          <Link to="/registro" className="boton boton-primario boton-grande">
            Crear mi cuenta
            <Icono nombre="flecha" tamano={18} />
          </Link>
          <Link to="/ingresar" className="boton boton-secundario boton-grande">
            Ya tengo cuenta
          </Link>
        </div>
      </div>
    </div>
  )
}
