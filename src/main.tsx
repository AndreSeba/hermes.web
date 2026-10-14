import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { rutas } from './rutas'
import { ProveedorSesion } from './sesion/ProveedorSesion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorSesion>
      <RouterProvider router={rutas} />
    </ProveedorSesion>
  </StrictMode>,
)
