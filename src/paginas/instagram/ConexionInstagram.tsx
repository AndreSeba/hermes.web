import { useEffect, useState } from 'react'
import { api, mensajeDeError, type InstagramConexion } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Icono } from '../../componentes/Icono'
import { cuando } from '../stock/historial'

const hora = (iso: string) => new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

// M12: la cuenta de Instagram de la tienda. Conectada, las publicaciones nuevas llegan SOLAS a la bandeja (cada media hora,
// o al tocar "Traer lo nuevo"), con sus fotos. Igual nada llega al catálogo sin revisión.
// Si la plataforma no tiene una app de Meta configurada, se dice y se sigue con el texto pegado a mano.
export function ConexionInstagram({ alTraer }: { alTraer: () => void }) {
  const [estado, setEstado] = useState<InstagramConexion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/instagram/conexion')
      .then(({ data }) => !cancelado && data && setEstado(data))
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [version])

  async function conectar() {
    setError(null)
    setTrabajando(true)
    try {
      const { data, error, response } = await api.GET('/api/v1/instagram/conexion/url')
      if (data) window.location.assign(data.url) // a Instagram; vuelve a /instagram/conectado
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setTrabajando(false)
    }
  }

  async function traer() {
    setError(null)
    setAviso(null)
    setTrabajando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/instagram/conexion/sincronizar')
      if (data) {
        setAviso(
          data.productos > 0
            ? data.productos === 1
              ? 'Llegó 1 producto a la bandeja.'
              : `Llegaron ${data.productos} productos a la bandeja.`
            : data.avisos[0] ?? 'No hay publicaciones nuevas con productos.',
        )
        alTraer()
      } else setError(mensajeDeError(error, response))
      setVersion((n) => n + 1)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setTrabajando(false)
    }
  }

  async function desconectar() {
    setTrabajando(true)
    try {
      await api.DELETE('/api/v1/instagram/conexion')
      setAviso('Desconectaste tu cuenta. Lo que ya está en la bandeja se queda.')
      setVersion((n) => n + 1)
    } finally {
      setTrabajando(false)
    }
  }

  if (!estado) return null

  return (
    <section className="tarjeta conexion-ig" aria-labelledby="conexion-titulo">
      <div className="conexion-ig-cabecera">
        <span className="icono-caja" aria-hidden="true">
          <Icono nombre="instagram" tamano={20} />
        </span>
        <div>
          <h2 id="conexion-titulo" className="titulo-seccion">
            {estado.conectada ? `Conectada: @${estado.usuario}` : 'Conectá tu cuenta de Instagram'}
          </h2>
          <p className="texto-suave texto-chico">
            {!estado.configurada
              ? 'La conexión automática todavía no está activada. Mientras tanto, pegá el texto de tu publicación acá abajo.'
              : estado.conectada
                ? estado.ultimaSincronizacion
                  ? `Lo que publiques llega solo a la bandeja. Última revisión: ${cuando(estado.ultimaSincronizacion).toLowerCase()} ${hora(estado.ultimaSincronizacion)}.`
                  : 'Lo que publiques llega solo a la bandeja (con sus fotos). Todavía no revisamos tu cuenta.'
                : 'Lo que publiques con precio llega solo a la bandeja, con sus fotos. Necesitás una cuenta profesional (de empresa o de creador).'}
          </p>
        </div>
      </div>

      {estado.necesitaReconectar && <Aviso tipo="advertencia">{estado.ultimoError ?? 'La conexión se venció: volvé a conectar tu cuenta.'}</Aviso>}
      {!estado.necesitaReconectar && estado.ultimoError && <Aviso tipo="advertencia">{estado.ultimoError}</Aviso>}
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      {error && <Aviso>{error}</Aviso>}

      {estado.configurada && (
        <div className="acciones-fila">
          {(!estado.conectada || estado.necesitaReconectar) && (
            <button type="button" className="boton boton-primario" onClick={conectar} disabled={trabajando}>
              {estado.necesitaReconectar ? 'Volver a conectar' : 'Conectar con Instagram'}
            </button>
          )}
          {estado.conectada && !estado.necesitaReconectar && (
            <button type="button" className="boton boton-primario" onClick={traer} disabled={trabajando}>
              {trabajando ? 'Revisando…' : 'Traer lo nuevo'}
            </button>
          )}
          {estado.conectada && (
            <button type="button" className="boton boton-texto boton-chico" onClick={desconectar} disabled={trabajando}>
              Desconectar
            </button>
          )}
        </div>
      )}
    </section>
  )
}
