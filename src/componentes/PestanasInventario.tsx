import { NavLink } from 'react-router'

// Las tres pantallas del inventario (como el prototipo): Stock, Compras y Proveedores. En el celular es
// la única forma de llegar a Compras y Proveedores (la barra inferior no las trae).
export function PestanasInventario() {
  return (
    <nav aria-label="Secciones de inventario" className="pestanas">
      <NavLink to="/stock">Stock</NavLink>
      <NavLink to="/compras">Compras</NavLink>
      <NavLink to="/proveedores">Proveedores</NavLink>
    </nav>
  )
}
