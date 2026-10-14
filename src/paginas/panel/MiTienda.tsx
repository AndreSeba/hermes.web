import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, mensajeDeError, type ImagenSubida, type Tienda } from '../../api/cliente'
import { AreaTexto } from '../../componentes/AreaTexto'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { Icono } from '../../componentes/Icono'
import { SelectorColor } from '../../componentes/SelectorColor'
import { SubirFoto } from '../../componentes/SubirFoto'
import { useSesion, useSesionActiva } from '../../sesion/contexto'
import { colorDeTexto } from '../../util/color'
import { iniciales } from '../../util/texto'

type Formulario = {
  nombre: string
  descripcion: string
  whatsapp: string // solo los 8 dígitos; el +591 va fijo en pantalla
  color: string
  logo: ImagenSubida | null
}

const aFormulario = (t: Tienda): Formulario => ({
  nombre: t.nombre,
  descripcion: t.descripcion ?? '',
  whatsapp: (t.whatsapp ?? '').replace(/^\+591/, ''),
  color: t.color,
  logo: t.logo,
})

// Mismas reglas que el backend (Validacion.Whatsapp); el backend igual valida.
const soloDigitos = (s: string) => s.replace(/[\s\-().]/g, '')
const whatsappValido = (s: string) => soloDigitos(s) === '' || /^[67]\d{7}$/.test(soloDigitos(s))
const limpiarSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)

export function MiTienda() {
  const { usuario } = useSesionActiva()
  const { salir, actualizarTienda } = useSesion()

  const [servidor, setServidor] = useState<Tienda | null>(null)
  const [form, setForm] = useState<Formulario | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [dialogo, setDialogo] = useState(false)

  // `intento` sube al tocar "Reintentar" y vuelve a disparar la carga.
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    let cancelado = false // StrictMode monta dos veces: solo vale la respuesta de la última
    api
      .GET('/api/v1/tienda')
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setErrorCarga(mensajeDeError(error, response))
        setServidor(data)
        setForm(aFormulario(data))
      })
      .catch(() => !cancelado && setErrorCarga(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [intento])

  const reintentar = () => {
    setErrorCarga(null)
    setIntento((n) => n + 1)
  }

  // Una foto subida que todavía no se guardó (la dueña la eligió pero no tocó "Guardar"). Si la
  // reemplaza, la descarta o sale de la pantalla, se borra: así no quedan fotos sin dueño.
  const sinGuardar = useRef<string | null>(null)
  useEffect(() => {
    sinGuardar.current = form?.logo && form.logo.id !== servidor?.logo?.id ? form.logo.id : null
  }, [form?.logo, servidor?.logo?.id])
  useEffect(
    () => () => {
      if (sinGuardar.current) void api.DELETE('/api/v1/imagenes/{id}', { params: { path: { id: sinGuardar.current } } })
    },
    [],
  )
  const borrarSiNoSeGuardo = (id: string | undefined) => {
    if (id && id !== servidor?.logo?.id) void api.DELETE('/api/v1/imagenes/{id}', { params: { path: { id } } })
  }

  if (errorCarga)
    return (
      <div className="pagina">
        <Aviso>{errorCarga}</Aviso>
        <button type="button" className="boton boton-secundario" onClick={reintentar}>
          Reintentar
        </button>
      </div>
    )
  if (!servidor || !form)
    return (
      <div className="pagina" role="status" aria-live="polite">
        <h1 className="titulo-pagina">Mi tienda</h1>
        <p className="texto-suave">Cargando tu tienda…</p>
      </div>
    )

  const cambiar = (parte: Partial<Formulario>) => {
    setGuardado(false)
    setError(null)
    setForm({ ...form, ...parte })
  }
  const hayCambios = JSON.stringify({ ...form, logo: form.logo?.id }) !== JSON.stringify({ ...aFormulario(servidor), logo: servidor.logo?.id })
  const avisoWhatsapp = whatsappValido(form.whatsapp) ? null : 'Ingresá tu celular de Bolivia: 8 dígitos que empiecen con 6 o 7.'
  const puedeGuardar = hayCambios && !guardando && !avisoWhatsapp && form.nombre.trim().length > 0

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!form || !puedeGuardar) return
    setError(null)
    setGuardando(true)
    try {
      const { data, error, response } = await api.PUT('/api/v1/tienda', {
        body: {
          nombre: form.nombre,
          descripcion: form.descripcion.trim() || null,
          whatsapp: soloDigitos(form.whatsapp) || null,
          color: form.color,
          logoImagenId: form.logo?.id ?? null,
        },
      })
      if (!data) return setError(mensajeDeError(error, response))
      setServidor(data)
      setForm(aFormulario(data))
      actualizarTienda({ id: data.id, nombre: data.nombre, slug: data.slug })
      setGuardado(true)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setGuardando(false)
    }
  }

  function descartar() {
    if (!servidor || !form) return
    borrarSiNoSeGuardo(form.logo?.id)
    setForm(aFormulario(servidor))
    setError(null)
    setGuardado(false)
  }

  return (
    <div className="pagina pagina-angosta">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Mi tienda</h1>
      </header>

      <form className="seccion tarjeta" onSubmit={guardar} noValidate>
        <h2 className="seccion-titulo">Cómo se ve</h2>

        <SubirFoto
          etiqueta="logo"
          imagen={form.logo}
          alCambiar={(logo) => {
            borrarSiNoSeGuardo(form.logo?.id)
            cambiar({ logo })
          }}
          vacio={{ iniciales: iniciales(form.nombre) || '?', fondo: form.color, texto: colorDeTexto(form.color) }}
        />

        <Campo
          etiqueta="Nombre de la tienda"
          value={form.nombre}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          maxLength={120}
          autoComplete="organization"
          required
        />
        <AreaTexto
          etiqueta="Descripción corta"
          value={form.descripcion}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
          maxLength={500}
          ayuda="Aparece debajo del nombre en tu tienda."
        />
        <SelectorColor etiqueta="Color de tu tienda" valor={form.color} alCambiar={(color) => cambiar({ color })} />

        <Campo
          etiqueta="WhatsApp donde recibís los pedidos"
          prefijo="+591"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="71234567"
          value={form.whatsapp}
          onChange={(e) => cambiar({ whatsapp: e.target.value })}
          aria-invalid={!!avisoWhatsapp}
          ayuda={avisoWhatsapp ?? 'Tus clientes te escriben a este número desde tu tienda.'}
        />

        {error && <Aviso>{error}</Aviso>}
        {guardado && <Aviso tipo="exito">Guardado. Ya está actualizado.</Aviso>}

        <div className="acciones-fila">
          <button type="submit" className="boton boton-primario" disabled={!puedeGuardar}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {hayCambios && !guardando && (
            <button type="button" className="boton boton-texto" onClick={descartar}>
              Descartar
            </button>
          )}
        </div>
      </form>

      <section className="seccion tarjeta">
        <h2 className="seccion-titulo">Dirección de tu tienda</h2>
        <p className="direccion">/{servidor.slug}</p>
        <p className="texto-suave texto-chico">Es lo que usan tus clientes para encontrarte.</p>
        <div>
          <button type="button" className="boton boton-secundario boton-chico" onClick={() => setDialogo(true)}>
            Cambiar dirección
          </button>
        </div>
      </section>

      <section className="seccion tarjeta datos-cuenta">
        <h2 className="seccion-titulo">Tu cuenta</h2>
        <dl>
          <div>
            <dt>Tu nombre</dt>
            <dd>{usuario.nombre}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{usuario.email}</dd>
          </div>
        </dl>
        <button type="button" className="boton boton-secundario" onClick={salir}>
          <Icono nombre="salir" tamano={18} />
          Cerrar sesión
        </button>
      </section>

      <section className="tarjeta en-construccion">
        <span className="icono-caja icono-caja-ambar" aria-hidden="true">
          <Icono nombre="obras" tamano={22} />
        </span>
        <div>
          <h2 className="titulo-seccion">Próximamente</h2>
          <p className="texto-suave">
            El enlace para compartir, el código QR y el diseño de tu tienda llegan con la tienda pública.
          </p>
        </div>
      </section>

      <CambiarDireccion
        abierto={dialogo}
        actual={servidor.slug}
        alCerrar={() => setDialogo(false)}
        alCambiar={(t) => {
          // Solo la dirección: lo que la dueña tenga a medio editar en el formulario no se toca.
          setServidor((s) => (s ? { ...s, slug: t.slug } : s))
          actualizarTienda({ id: t.id, nombre: t.nombre, slug: t.slug })
          setDialogo(false)
        }}
      />
    </div>
  )
}

type PropsDireccion = {
  abierto: boolean
  actual: string
  alCerrar: () => void
  alCambiar: (t: Tienda) => void
}

function CambiarDireccion({ abierto, actual, alCerrar, alCambiar }: PropsDireccion) {
  return (
    <Dialogo abierto={abierto} titulo="Cambiar la dirección" alCerrar={alCerrar}>
      {/* Dialogo solo monta esto mientras está abierto: cada vez arranca con el estado limpio. */}
      <FormularioDireccion actual={actual} alCerrar={alCerrar} alCambiar={alCambiar} />
    </Dialogo>
  )
}

function FormularioDireccion({ actual, alCerrar, alCambiar }: Omit<PropsDireccion, 'abierto'>) {
  const [slug, setSlug] = useState(actual)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.PUT('/api/v1/tienda/direccion', { body: { slug } })
      if (data) alCambiar(data)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <Aviso tipo="advertencia">
        Los enlaces que ya compartiste con <strong>/{actual}</strong> van a dejar de funcionar. Tendrás que volver a
        compartir el nuevo.
      </Aviso>
      <Campo
        etiqueta="Nueva dirección"
        prefijo="/"
        autoCapitalize="none"
        spellCheck={false}
        value={slug}
        onChange={(e) => setSlug(limpiarSlug(e.target.value))}
        ayuda="Solo minúsculas, números y guiones."
      />
      {error && <Aviso>{error}</Aviso>}
      <div className="acciones-fila">
        <button type="submit" className="boton boton-primario" disabled={enviando || slug === actual || slug.length < 2}>
          {enviando ? 'Cambiando…' : 'Cambiar dirección'}
        </button>
        <button type="button" className="boton boton-texto" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
