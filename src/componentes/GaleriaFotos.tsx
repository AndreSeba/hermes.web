import { useId, useState, type ChangeEvent } from 'react'
import { api, mensajeDeError, type ImagenSubida } from '../api/cliente'
import { Aviso } from './Aviso'
import { Icono } from './Icono'

// Mismo tope que el backend (Producto.MaximoFotos). El servidor igual lo valida.
export const MAXIMO_FOTOS = 8
const MAXIMO_MB = 15
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

type Props = {
  fotos: ImagenSubida[]
  // Se llaman de a una y con funciones: las subidas son asíncronas y el padre actualiza su estado con
  // la versión más reciente (si se le pasara la lista completa, dos subidas seguidas se pisarían).
  alAgregar: (foto: ImagenSubida) => void
  alQuitar: (foto: ImagenSubida) => void
  alHacerPortada: (foto: ImagenSubida) => void
}

// Hasta 8 fotos; la primera es la portada. Se pueden elegir varias juntas (el celular abre la galería).
// Cada foto se sube en el momento y queda "sin guardar" hasta que el formulario se guarda: quien usa
// este componente decide qué hacer con las que se sacan (borrarlas del servidor si nunca se guardaron).
export function GaleriaFotos({ fotos, alAgregar, alQuitar, alHacerPortada }: Props) {
  const id = useId()
  const [subiendo, setSubiendo] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const lugares = MAXIMO_FOTOS - fotos.length - subiendo

  async function elegidas(e: ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? [])
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (archivos.length === 0) return

    setError(null)
    const aSubir = archivos.slice(0, Math.max(lugares, 0))
    if (aSubir.length < archivos.length) setError(`Entran hasta ${MAXIMO_FOTOS} fotos: las demás no se subieron.`)

    // De a una: así el celular no manda 8 fotos grandes en paralelo con una conexión floja.
    for (const archivo of aSubir) {
      if (!TIPOS.includes(archivo.type)) {
        setError('Elegí fotos JPG, PNG o WEBP.')
        continue
      }
      if (archivo.size > MAXIMO_MB * 1024 * 1024) {
        setError(`Una foto pesa demasiado (máximo ${MAXIMO_MB} MB).`)
        continue
      }
      setSubiendo((n) => n + 1)
      try {
        const formulario = new FormData()
        formulario.append('archivo', archivo)
        const { data, error, response } = await api.POST('/api/v1/imagenes', { body: {}, bodySerializer: () => formulario })
        if (data) alAgregar(data)
        else setError(mensajeDeError(error, response))
      } catch {
        setError(mensajeDeError(null))
      } finally {
        setSubiendo((n) => n - 1)
      }
    }
  }

  return (
    <div className="galeria">
      <ul className="galeria-grilla">
        {fotos.map((foto, i) => (
          <li key={foto.id} className="galeria-foto">
            <img src={foto.miniatura} alt={i === 0 ? 'Foto de portada' : `Foto ${i + 1}`} width={120} height={120} />
            {i === 0 && <span className="galeria-portada">Portada</span>}
            <button
              type="button"
              className="galeria-boton galeria-quitar"
              onClick={() => alQuitar(foto)}
              aria-label={`Quitar la foto ${i + 1}`}
            >
              <Icono nombre="cerrar" tamano={16} />
            </button>
            {i > 0 && (
              <button
                type="button"
                className="galeria-boton galeria-estrella"
                onClick={() => alHacerPortada(foto)}
                aria-label={`Usar la foto ${i + 1} como portada`}
                title="Hacer portada"
              >
                <Icono nombre="estrella" tamano={16} />
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: subiendo }, (_, i) => (
          <li key={`subiendo-${i}`} className="galeria-foto galeria-subiendo" role="status">
            <span>Subiendo…</span>
          </li>
        ))}
        {lugares > 0 && (
          <li className="galeria-agregar">
            <input id={id} type="file" accept={TIPOS.join(',')} multiple className="sr-only" onChange={elegidas} />
            <label htmlFor={id}>
              <Icono nombre="camara" tamano={24} />
              Foto
            </label>
          </li>
        )}
      </ul>
      {error && <Aviso>{error}</Aviso>}
    </div>
  )
}
