import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Aviso } from '../../componentes/Aviso'
import { urlDeTienda } from '../../util/tienda'

// La tarjeta oscura de arriba de "Mi tienda": el enlace que se comparte, su código QR y los botones para copiarlo, bajar el
// QR y mandarlo por WhatsApp. El QR se dibuja en el navegador (no sale a ningún servicio de afuera) y apunta al mismo enlace.
export function TarjetaEnlace({ slug, nombre }: { slug: string; nombre: string }) {
  const enlace = urlDeTienda(slug)
  const [qr, setQr] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    // Alta resolución (el PNG que se descarga se imprime en carteles); en pantalla se achica con CSS.
    QRCode.toDataURL(enlace, { margin: 1, width: 640, errorCorrectionLevel: 'M' })
      .then((url) => !cancelado && setQr(url))
      .catch(() => !cancelado && setQr(null))
    return () => {
      cancelado = true
    }
  }, [enlace])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  async function copiar() {
    setError(null)
    try {
      await navigator.clipboard.writeText(enlace)
      setAviso('Copiaste el enlace de tu tienda.')
    } catch {
      setError('No pudimos copiarlo solo: mantené apretado el enlace de arriba y copialo.')
    }
  }

  return (
    <section className="tarjeta-enlace" aria-label="El enlace de tu tienda">
      <div className="tarjeta-enlace-qr">
        {qr ? <img src={qr} alt={`Código QR de tu tienda: ${enlace}`} width={112} height={112} /> : <span className="texto-suave texto-chico">QR…</span>}
      </div>
      <div className="tarjeta-enlace-texto">
        <span className="tarjeta-enlace-pista">Tu enlace, abierto para todos sin registrarse</span>
        <a className="direccion-enlace" href={enlace} target="_blank" rel="noopener noreferrer">
          {enlace.replace(/^https?:\/\//, '')}
        </a>
        <div className="acciones-fila">
          <button type="button" className="boton boton-ambar" onClick={copiar}>
            Copiar enlace
          </button>
          {qr ? (
            <a className="boton boton-contorno-claro" href={qr} download={`qr-${slug}.png`}>
              Descargar QR
            </a>
          ) : (
            <span className="boton boton-contorno-claro boton-inactivo">Descargar QR</span>
          )}
          <a
            className="boton boton-contorno-claro"
            href={`https://wa.me/?text=${encodeURIComponent(`Mirá mi tienda ${nombre}: ${enlace}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Compartir por WhatsApp
          </a>
        </div>
        {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
        {error && <Aviso>{error}</Aviso>}
      </div>
    </section>
  )
}
