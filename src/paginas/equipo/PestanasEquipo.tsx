import { NavLink } from 'react-router'
import { usePermisos } from '../../sesion/contexto'
import { P } from '../../sesion/permisos'

// Las dos pantallas del equipo: las personas y los roles (esta última solo con permiso para crearlos).
export function PestanasEquipo() {
  const { tiene } = usePermisos()
  return (
    <nav aria-label="Secciones del equipo" className="pestanas">
      <NavLink to="/equipo" end>
        Personas
      </NavLink>
      {tiene(P.rolesGestionar) && <NavLink to="/equipo/roles">Roles</NavLink>}
    </nav>
  )
}
