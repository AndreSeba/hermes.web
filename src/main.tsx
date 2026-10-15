import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { rutas } from './rutas'
import { ProveedorSesion } from './sesion/ProveedorSesion'

// Instalable en el celular (PWA). Solo en producción: en desarrollo un service worker guardaría versiones viejas del código.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorSesion>
      <RouterProvider router={rutas} />
    </ProveedorSesion>
  </StrictMode>,
)
