import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// La API (../Hermes, perfil "http") corre en http://localhost:5013. En desarrollo el front
// llama a rutas relativas (/api/..., /public/...) y Vite las reenvía: sin CORS ni certificados.
const api = 'http://localhost:5013'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': api,
      '/public': api,
    },
  },
})
