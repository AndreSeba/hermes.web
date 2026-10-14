import { Link } from 'react-router'

export function NoEncontrada() {
  return (
    <div className="acceso">
      <div className="acceso-columna">
        <header className="acceso-cabecera">
          <h1 className="titulo-grande">No encontramos esta página</h1>
          <p className="texto-suave">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
        </header>
        <Link to="/" className="boton boton-primario boton-grande">
          Ir al inicio
        </Link>
      </div>
    </div>
  )
}
