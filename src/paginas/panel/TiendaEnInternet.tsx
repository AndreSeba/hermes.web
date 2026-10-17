import { useEffect, useState } from 'react'
import { api, mensajeDeError, type ConfiguracionPublica } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Interruptor } from '../../componentes/Interruptor'

const fondos: { id: ConfiguracionPublica['fondo']; etiqueta: string }[] = [
  { id: 'Claro', etiqueta: 'Claro' },
  { id: 'Crema', etiqueta: 'Crema' },
  { id: 'Oscuro', etiqueta: 'Oscuro' },
]

type Props = {
  config: ConfiguracionPublica
  // La configuración vive en "Mi tienda" (la vista previa en vivo también la lee): al guardar un cambio se la devuelve.
  alCambiarConfig: (config: ConfiguracionPublica) => void
  tieneWhatsapp: boolean
}

// "Diseño y lo que ven tus clientes": publicar, precios, disponibilidad, pedidos por WhatsApp y el fondo. Cada cambio se guarda
// al tocarlo (son interruptores, no un formulario largo). El enlace y el QR están en la tarjeta de arriba; el color y el logo se
// eligen en "Cómo se ve".
export function TiendaEnInternet({ config, alCambiarConfig, tieneWhatsapp }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  async function cambiar(parte: Partial<ConfiguracionPublica>, mensaje: string) {
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      const { data, error, response } = await api.PUT('/api/v1/tienda/publica', { body: { ...config, ...parte } })
      if (data) {
        alCambiarConfig(data)
        setAviso(mensaje)
      } else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section id="diseno" className="seccion tarjeta tienda-internet" aria-labelledby="internet-titulo">
      <h2 id="internet-titulo" className="seccion-titulo">
        Diseño y lo que ven tus clientes
      </h2>

      <Interruptor
        etiqueta="Tienda publicada"
        ayuda={config.publicada ? 'Cualquiera con el enlace puede verla.' : 'Apagada: el enlace dice "no encontrada". Tus datos no se borran.'}
        activo={config.publicada}
        alCambiar={(publicada) => cambiar({ publicada }, publicada ? 'Tu tienda está publicada.' : 'Tu tienda dejó de verse.')}
      />

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
