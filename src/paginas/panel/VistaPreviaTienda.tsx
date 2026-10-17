import type { ConfiguracionPublica, ImagenSubida, ProductoResumen } from '../../api/cliente'
import { colorDeTexto, paletaDeFondo } from '../../util/color'
import { bs } from '../../util/dinero'
import { iniciales } from '../../util/texto'
import { urlDeTienda } from '../../util/tienda'

type Props = {
  slug: string
  nombre: string
  descripcion: string
  color: string
  logo: ImagenSubida | null
  tieneWhatsapp: boolean
  config: ConfiguracionPublica
  productos: ProductoResumen[] | null
}

// Cómo ve tu tienda un cliente, en vivo: lo que escribís y elegís arriba (nombre, descripción, color, logo) y los interruptores
// de "Qué ven tus clientes" (precios, disponibilidad, WhatsApp, fondo) se reflejan al instante, con tus productos de verdad. Es
// una miniatura de la tienda pública real (mismos colores y orden): no es un dibujo aparte.
export function VistaPreviaTienda({ slug, nombre, descripcion, color, logo, tieneWhatsapp, config, productos }: Props) {
  const paleta = paletaDeFondo(config.fondo)
  const sobreMarca = colorDeTexto(color)
  const visibles = (productos ?? []).filter((p) => p.visibleEnTienda).slice(0, 4)
  const hayWhatsapp = tieneWhatsapp && config.pedidosPorWhatsapp

  return (
    <section aria-labelledby="vista-previa-titulo">
      <h2 id="vista-previa-titulo" className="seccion-titulo">
        Vista previa en vivo
      </h2>
      <div className="marco-navegador">
        <div className="marco-barra" aria-hidden="true">
          <span className="marco-punto" />
          <span className="marco-punto" />
          <span className="marco-direccion">{urlDeTienda(slug).replace(/^https?:\/\//, '')}</span>
        </div>

        <div className="vp-tienda" style={{ background: paleta.fondo, color: paleta.texto }}>
          <div className="vp-cabecera" style={{ background: color, color: sobreMarca }}>
            {logo ? (
              <img className="vp-logo" src={logo.miniatura} alt="" width={56} height={56} />
            ) : (
              <span className="vp-logo vp-logo-iniciales" aria-hidden="true">
                {(iniciales(nombre) || '?').toUpperCase()}
              </span>
            )}
            <div className="vp-cabecera-texto">
              <strong>{nombre.trim() || 'Tu tienda'}</strong>
              {descripcion.trim() && <span>{descripcion.trim()}</span>}
            </div>
          </div>

          <div className="vp-cuerpo">
            {visibles.length === 0 ? (
              <div className="vp-grilla" aria-label="Tus productos van a aparecer acá">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="vp-tarjeta">
                    <span className="vp-foto" style={{ background: paleta.superficie, borderColor: paleta.borde }} />
                    <span className="vp-linea" style={{ background: paleta.borde }} />
                    <span className="vp-linea vp-linea-corta" style={{ background: paleta.borde }} />
                  </div>
                ))}
              </div>
            ) : (
              <ul className="vp-grilla">
                {visibles.map((p) => (
                  <li key={p.id} className="vp-tarjeta">
                    <span className="vp-foto" style={{ background: paleta.superficie, borderColor: paleta.borde }}>
                      {p.portada && <img src={p.portada.catalogo} alt="" loading="lazy" />}
                      {config.mostrarDisponibilidad && p.estadoStock === 'Agotado' && <span className="vp-etiqueta">Agotado</span>}
                    </span>
                    <span className="vp-nombre">{p.nombre}</span>
                    {config.mostrarPrecios && <span className="vp-precio">{bs(p.precio)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hayWhatsapp && (
            <div className="vp-pie" style={{ borderColor: paleta.borde }}>
              <span className="vp-boton-wa">Escribinos por WhatsApp</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
