import { useEffect, useState } from 'react'
import { api, mensajeDeError, type ConfiguracionPublica } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Interruptor } from '../../componentes/Interruptor'
import { urlDeTienda } from '../../util/tienda'

const fondos: { id: ConfiguracionPublica['fondo']; etiqueta: string }[] = [
  { id: 'Claro', etiqueta: 'Claro' },
  { id: 'Crema', etiqueta: 'Crema' },
  { id: 'Oscuro', etiqueta: 'Oscuro' },
]

// "Tu tienda en internet": el enlace para compartir, qué ven tus clientes y el fondo. Cada cambio se guarda al tocarlo
// (son interruptores, no un formulario largo). El color y el logo se eligen arriba, en "Cómo se ve".
export function TiendaEnInternet({ slug, nombre, tieneWhatsapp }: { slug: string; nombre: string; tieneWhatsapp: boolean }) {
  const [config, setConfig] = useState<ConfiguracionPublica | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/tienda/publica')
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (data) setConfig(data)
        else setError(mensajeDeError(error, response))
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  async function cambiar(parte: Partial<ConfiguracionPublica>, mensaje: string) {
    if (!config || guardando) return
    setGuardando(true)
    setError(null)
    try {
      const { data, error, response } = await api.PUT('/api/v1/tienda/publica', { body: { ...config, ...parte } })
      if (data) {
        setConfig(data)
        setAviso(mensaje)
      } else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setGuardando(false)
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(urlDeTienda(slug))
      setAviso('Copiaste el enlace de tu tienda.')
    } catch {
      setError('No pudimos copiarlo solo: mantené apretado el enlace de arriba y copialo.')
    }
  }

  if (!config)
    return error ? (
      <Aviso>{error}</Aviso>
    ) : (
      <p className="texto-suave" role="status">
        Cargando tu tienda en internet…
      </p>
    )

  const enlace = urlDeTienda(slug)

  return (
    <section className="seccion tarjeta tienda-internet" aria-labelledby="internet-titulo">
      <h2 id="internet-titulo" className="seccion-titulo">
        Tu tienda en internet
      </h2>

      <Interruptor
        etiqueta="Tienda publicada"
        ayuda={config.publicada ? 'Cualquiera con el enlace puede verla.' : 'Apagada: el enlace dice "no encontrada". Tus datos no se borran.'}
        activo={config.publicada}
        alCambiar={(publicada) => cambiar({ publicada }, publicada ? 'Tu tienda está publicada.' : 'Tu tienda dejó de verse.')}
      />

      <div className="enlace-tienda">
        <span className="texto-suave texto-chico">Tu enlace para compartir</span>
        <a className="direccion" href={enlace} target="_blank" rel="noopener noreferrer">
          {enlace}
        </a>
        <div className="acciones-fila">
          <a className="boton boton-primario boton-chico" href={enlace} target="_blank" rel="noopener noreferrer">
            Ver mi tienda
          </a>
          <button type="button" className="boton boton-secundario boton-chico" onClick={copiar}>
            Copiar enlace
          </button>
          <a
            className="boton boton-secundario boton-chico"
            href={`https://wa.me/?text=${encodeURIComponent(`Mirá mi tienda ${nombre}: ${enlace}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Compartir por WhatsApp
          </a>
        </div>
      </div>

      <h3 className="seccion-subtitulo">Qué ven tus clientes</h3>
      <Interruptor
        etiqueta="Mostrar los precios"
        ayuda="Apagado, el cliente te escribe para preguntar."
        activo={config.mostrarPrecios}
        alCambiar={(mostrarPrecios) => cambiar({ mostrarPrecios }, mostrarPrecios ? 'Ahora se ven los precios.' : 'Ya no se ven los precios.')}
      />
      <Interruptor
        etiqueta="Mostrar si hay o si está agotado"
        ayuda="Nunca se muestra cuántas unidades tenés, solo si hay o no hay."
        activo={config.mostrarDisponibilidad}
        alCambiar={(mostrarDisponibilidad) => cambiar({ mostrarDisponibilidad }, mostrarDisponibilidad ? 'Ahora se ve si hay o no hay.' : 'Ya no se ve si hay o no hay.')}
      />
      <Interruptor
        etiqueta="Pedidos por WhatsApp"
        ayuda={tieneWhatsapp ? 'El cliente elige y te llega el pedido armado a tu WhatsApp.' : 'Cargá tu WhatsApp arriba, en "Cómo se ve", para que funcione.'}
        activo={config.pedidosPorWhatsapp}
        alCambiar={(pedidosPorWhatsapp) => cambiar({ pedidosPorWhatsapp }, pedidosPorWhatsapp ? 'Ahora se puede pedir por WhatsApp.' : 'Ya no se puede pedir por WhatsApp.')}
      />

      <h3 className="seccion-subtitulo">Fondo</h3>
      <div className="segmentos" role="group" aria-label="Fondo de tu tienda">
        {fondos.map((f) => (
          <button
            key={f.id}
            type="button"
            className="segmento"
            aria-pressed={config.fondo === f.id}
            disabled={guardando}
            onClick={() => config.fondo !== f.id && cambiar({ fondo: f.id }, `Fondo ${f.etiqueta.toLowerCase()}.`)}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>
      <p className="texto-suave texto-chico">El color y el logo de tu tienda se eligen arriba, en "Cómo se ve".</p>

      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
    </section>
  )
}
