import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, mensajeDeError, type Borrador, type Lectura, type ProductoLeido } from '../../api/cliente'
import { AreaTexto } from '../../componentes/AreaTexto'
import { Aviso } from '../../componentes/Aviso'
import { Dialogo } from '../../componentes/Dialogo'
import { bs } from '../../util/dinero'
import { ConexionInstagram } from './ConexionInstagram'

const MAXIMO_TEXTO = 5000 // el mismo que ParserPublicacion.MaximoTexto del backend (que igual valida)
const POR_PAGINA = 20

const EJEMPLO = `Cartera de cuero Mía
Bs 180
Colores: café, negro
Tallas: S, M
Quedan 5
#carteras`

// "Desde Instagram": se pega el texto de una publicación, se ve qué entendió el lector ("Probá tu formato") y, si está bien,
// se manda a la bandeja. **Nada llega al catálogo solo**: cada producto se revisa y se publica desde la bandeja.
// Con la cuenta conectada (M12, ConexionInstagram), las publicaciones nuevas llegan solas a la misma bandeja, con sus fotos.
export function Instagram() {
  const [params] = useSearchParams()
  const conectadaRecien = params.get('conectada') === '1'
  const [texto, setTexto] = useState('')
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [items, setItems] = useState<Borrador[] | null>(null)
  const [pendientes, setPendientes] = useState(0)
  const [siguiente, setSiguiente] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [aDescartar, setADescartar] = useState<Borrador | null>(null)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/instagram/borradores', { params: { query: { Limite: POR_PAGINA } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setItems(data.items)
        setSiguiente(data.siguiente)
        setPendientes(data.pendientes)
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [version])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 7000)
    return () => clearTimeout(t)
  }, [aviso])

  function cambiarTexto(valor: string) {
    setTexto(valor)
    setLectura(null) // lo que se mostró ya no corresponde a lo que está escrito
    setError(null)
  }

  async function leer() {
    setTrabajando(true)
    setError(null)
    setAviso(null)
    try {
      const { data, error, response } = await api.POST('/api/v1/instagram/leer', { body: { texto } })
      if (data) setLectura(data)
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setTrabajando(false)
    }
  }

  async function mandar() {
    setTrabajando(true)
    setError(null)
    try {
      const { data, error, response } = await api.POST('/api/v1/instagram/importar', { body: { texto } })
      if (data) {
        setAviso(data.length === 1 ? `Mandamos «${data[0].nombre}» a la bandeja para que lo revises.` : `Mandamos ${data.length} productos a la bandeja para que los revises.`)
        setTexto('')
        setLectura(null)
        setVersion((n) => n + 1)
      } else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setTrabajando(false)
    }
  }

  async function verMas() {
    if (!siguiente) return
    setCargandoMas(true)
    try {
      const { data, error, response } = await api.GET('/api/v1/instagram/borradores', { params: { query: { Limite: POR_PAGINA, Cursor: siguiente } } })
      if (!data) return setError(mensajeDeError(error, response))
      setItems((previos) => [...(previos ?? []), ...data.items])
      setSiguiente(data.siguiente)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setCargandoMas(false)
    }
  }

  const vacio = texto.trim() === ''

  return (
    <div className="pagina">
      <header className="pagina-cabecera">
        <h1 className="titulo-pagina">Desde Instagram</h1>
      </header>

      {conectadaRecien && <Aviso tipo="exito">¡Listo! Tu cuenta quedó conectada. Tocá «Traer lo nuevo» para ver tus publicaciones en la bandeja.</Aviso>}
      <ConexionInstagram alTraer={() => setVersion((n) => n + 1)} />

      <section className="tarjeta lector" aria-labelledby="lector-titulo">
        <h2 id="lector-titulo" className="titulo-seccion">
          Pegá una publicación
        </h2>
        <p className="texto-suave texto-chico">
          Copiá el texto de tu publicación de Instagram y pegalo acá. Te mostramos qué entendimos antes de guardar nada.
        </p>
        <AreaTexto
          etiqueta="Texto de la publicación"
          value={texto}
          rows={7}
          maxLength={MAXIMO_TEXTO}
          onChange={(e) => cambiarTexto(e.target.value)}
          placeholder={EJEMPLO}
        />
        <div className="acciones-fila">
          <button type="button" className="boton boton-secundario" onClick={leer} disabled={vacio || trabajando}>
            Ver qué entendió
          </button>
          <button type="button" className="boton boton-primario" onClick={mandar} disabled={vacio || trabajando}>
            Mandar a la bandeja
          </button>
        </div>
        <details className="guia-formato">
          <summary>Cómo escribir tu publicación</summary>
          <ul>
            <li>
              <strong>Nombre:</strong> en la primera línea.
            </li>
            <li>
              <strong>Precio:</strong> «Bs 120», «120 Bs» o «Precio: 120». Para ofertas: «Antes Bs 200 · Ahora Bs 150».
            </li>
            <li>
              <strong>Colores y tallas:</strong> «Colores: rojo, negro y azul» y «Tallas: S, M, L».
            </li>
            <li>
              <strong>Cuántos quedan:</strong> «Quedan 5» o «Última unidad».
            </li>
            <li>
              <strong>Categoría:</strong> el primer hashtag, por ejemplo #carteras.
            </li>
            <li>
              <strong>Varios productos:</strong> una línea por producto con su número y precio: «1. Cartera Bs 120», «2. Aretes Bs 95».
            </li>
          </ul>
          <button type="button" className="boton boton-texto boton-chico" onClick={() => cambiarTexto(EJEMPLO)}>
            Usar este ejemplo
          </button>
        </details>

        {error && <Aviso>{error}</Aviso>}
        {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
      </section>

      {lectura && <ResultadoLectura lectura={lectura} />}

      <section aria-labelledby="bandeja-titulo" className="bandeja">
        <h2 id="bandeja-titulo" className="titulo-seccion">
          Para revisar{pendientes > 0 ? ` (${pendientes})` : ''}
        </h2>
        {items === null && !error && (
          <p className="texto-suave" role="status">
            Cargando la bandeja…
          </p>
        )}
        {items?.length === 0 && (
          <p className="vacio">No tenés nada esperando. Lo que mandes a la bandeja aparece acá para que lo revises antes de publicarlo.</p>
        )}
        {items && items.length > 0 && (
          <>
            <ul className="lista-ventas">
              {items.map((b) => (
                <li key={b.id} className="fila-venta">
                  <div className="fila-stock-cabecera fila-gasto">
                    {b.fotos && b.fotos.length > 0 && <img className="borrador-foto" src={b.fotos[0].miniatura} alt="" width={48} height={48} />}
                    <span className="fila-stock-datos">
                      <span className="fila-stock-nombre">{b.nombre}</span>
                      {b.origen === 'Instagram' && <span className="texto-suave texto-chico">Llegó de tu Instagram</span>}
                      <span className="fila-stock-linea">
                        <span className="texto-suave texto-chico">{b.precio ? bs(b.precio) : 'Sin precio'}</span>
                        {b.categoria && <span className="texto-suave texto-chico">· #{b.categoria.toLowerCase()}</span>}
                        {b.faltan.map((f) => (
                          <span key={f} className="etiqueta-stock etiqueta-stock-agotado">
                            Falta el {f}
                          </span>
                        ))}
                      </span>
                    </span>
                  </div>
                  <div className="acciones-fila">
                    <Link to={`/instagram/revisar/${b.id}`} className="boton boton-primario boton-chico">
                      Revisar
                    </Link>
                    <button type="button" className="boton boton-texto boton-chico" onClick={() => setADescartar(b)} aria-label={`Descartar ${b.nombre}`}>
                      Descartar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {siguiente && (
              <button type="button" className="boton boton-secundario" onClick={verMas} disabled={cargandoMas}>
                {cargandoMas ? 'Cargando…' : 'Ver más'}
              </button>
            )}
          </>
        )}
      </section>

      <DialogoDescartar
        borrador={aDescartar}
        alCerrar={() => setADescartar(null)}
        alListo={() => {
          setADescartar(null)
          setAviso('Lo descartaste: ya no está en la bandeja.')
          setVersion((n) => n + 1)
        }}
      />
    </div>
  )
}

function ResultadoLectura({ lectura }: { lectura: Lectura }) {
  return (
    <section className="tarjeta lector" aria-labelledby="entendio-titulo" aria-live="polite">
      <h2 id="entendio-titulo" className="titulo-seccion">
        Esto es lo que entendimos
      </h2>
      {lectura.productos.map((p, i) => (
        <Entendido key={i} producto={p} varios={lectura.productos.length > 1} numero={i + 1} />
      ))}
      <p className="texto-suave texto-chico">
        Si algo no está bien, corregí el texto y probá de nuevo, o mandalo a la bandeja y lo arreglás al revisar. Nada se publica solo.
      </p>
    </section>
  )
}

function Entendido({ producto: p, varios, numero }: { producto: ProductoLeido; varios: boolean; numero: number }) {
  const fila = (etiqueta: string, valor: string | null, falta?: string) => (
    <div className="entendido-fila">
      <dt>{etiqueta}</dt>
      <dd className={valor === null ? 'texto-peligro' : undefined}>{valor ?? falta ?? 'No lo encontramos'}</dd>
    </div>
  )
  return (
    <article className="entendido">
      {varios && <h3 className="seccion-subtitulo">Producto {numero}</h3>}
      <dl>
        {fila('Nombre', p.nombre, 'Falta el nombre')}
        {fila('Precio', p.precio ? bs(p.precio) : null, 'Falta el precio')}
        {p.precioAnterior ? fila('Antes costaba', bs(p.precioAnterior)) : null}
        {p.colores.length > 0 && fila('Colores', p.colores.join(', '))}
        {p.tallas.length > 0 && fila('Tallas', p.tallas.join(', '))}
        {p.stock !== null && fila('Quedan', String(p.stock))}
        {p.categoria && fila('Categoría', p.categoria)}
        {p.descripcion && fila('Descripción', p.descripcion)}
      </dl>
      {p.avisos.length > 0 && (
        <Aviso tipo="advertencia">
          <ul className="avisos-margen">
            {p.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}
    </article>
  )
}

function DialogoDescartar({ borrador, alCerrar, alListo }: { borrador: Borrador | null; alCerrar: () => void; alListo: () => void }) {
  return (
    <Dialogo abierto={borrador !== null} titulo="¿Descartar este producto?" subtitulo={borrador?.nombre} alCerrar={alCerrar} hoja>
      {borrador && <FormularioDescartar borrador={borrador} alCerrar={alCerrar} alListo={alListo} />}
    </Dialogo>
  )
}

function FormularioDescartar({ borrador, alCerrar, alListo }: { borrador: Borrador; alCerrar: () => void; alListo: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function descartar() {
    setError(null)
    setEnviando(true)
    try {
      const { data, error, response } = await api.POST('/api/v1/instagram/borradores/{id}/descartar', { params: { path: { id: borrador.id } } })
      if (data) alListo()
      else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="formulario formulario-hoja">
      <p className="texto-suave">Sale de la bandeja y no llega a tu catálogo. Si lo querés después, volvé a pegar la publicación.</p>
      {error && <Aviso>{error}</Aviso>}
      <div className="acciones-fila acciones-hoja">
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          No, dejarlo
        </button>
        <button type="button" className="boton boton-primario" onClick={descartar} disabled={enviando}>
          {enviando ? 'Descartando…' : 'Sí, descartar'}
        </button>
      </div>
    </div>
  )
}
