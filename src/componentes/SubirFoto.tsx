import { useId, useRef, useState, type ChangeEvent } from 'react'
import { api, mensajeDeError, type ImagenSubida } from '../api/cliente'
import { Aviso } from './Aviso'
import { Icono } from './Icono'

const MAXIMO_MB = 15
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

type Props = {
  etiqueta: string // "logo"
  imagen: ImagenSubida | null
  alCambiar: (nueva: ImagenSubida | null) => void
  // Lo que se ve mientras no hay foto.
  vacio: { iniciales: string; fondo: string; texto: string }
  // Comprobante de pago de un plan: no cuenta en el espacio de fotos (si no, una tienda llena no podría pagar para tener más).
  comprobante?: boolean
}

// Elegir una foto (galería o cámara, lo decide el celular) y subirla en el momento: el servidor la
// procesa y devuelve las urls. La foto queda sin usar hasta que la pantalla que la contiene guarde.
export function SubirFoto({ etiqueta, imagen, alCambiar, vacio, comprobante }: Props) {
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function elegida(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!archivo) return

    // Revisión rápida para no gastar datos en una foto que el servidor igual va a rechazar.
    // (El servidor decide por el contenido real; esto es solo cortesía.)
    if (!TIPOS.includes(archivo.type)) return setError('Elegí una foto JPG, PNG o WEBP.')
    if (archivo.size > MAXIMO_MB * 1024 * 1024) return setError(`La foto pesa demasiado (máximo ${MAXIMO_MB} MB).`)

    setError(null)
    setSubiendo(true)
    try {
      const formulario = new FormData()
      formulario.append('archivo', archivo)
      const { data, error, response } = await api.POST('/api/v1/imagenes', {
        params: { query: { comprobante: comprobante ?? false } },
        body: {},
        bodySerializer: () => formulario,
      })
      if (data) alCambiar(data)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="subir-foto">
      <div className="subir-foto-fila">
        <span
          className="foto-redonda"
          style={imagen ? undefined : { background: vacio.fondo, color: vacio.texto }}
          aria-hidden={!imagen}
        >
          {imagen ? <img src={imagen.miniatura} alt={`Tu ${etiqueta}`} width={72} height={72} /> : vacio.iniciales}
        </span>

        <div className="subir-foto-botones">
          <input
            ref={entrada}
            id={id}
            type="file"
            accept={TIPOS.join(',')}
            className="sr-only"
            onChange={elegida}
            disabled={subiendo}
          />
          <label htmlFor={id} className={`boton boton-secundario boton-chico${subiendo ? ' boton-inactivo' : ''}`}>
            <Icono nombre="camara" tamano={18} />
            {subiendo ? 'Subiendo…' : imagen ? `Cambiar ${etiqueta}` : `Elegir ${etiqueta}`}
          </label>
          {imagen && !subiendo && (
            <button type="button" className="boton boton-texto boton-chico" onClick={() => alCambiar(null)}>
              Quitar
            </button>
          )}
        </div>
      </div>
      {error && <Aviso>{error}</Aviso>}
    </div>
  )
}
