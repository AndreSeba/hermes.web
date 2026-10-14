import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, mensajeDeError, type Categoria, type ImagenSubida, type Producto } from '../../api/cliente'
import { AreaTexto } from '../../componentes/AreaTexto'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { Dialogo } from '../../componentes/Dialogo'
import { GaleriaFotos } from '../../componentes/GaleriaFotos'
import { Icono } from '../../componentes/Icono'
import { Interruptor } from '../../componentes/Interruptor'
import { bs, leerMonto, listaDeTextos } from '../../util/dinero'

type Estado = {
  nombre: string
  descripcion: string
  precio: string
  costo: string
  categoriaId: string // '' = sin categoría
  colores: string // "café, negro"
  tallas: string
  visible: boolean
  fotos: ImagenSubida[]
}

const vacio: Estado = { nombre: '', descripcion: '', precio: '', costo: '', categoriaId: '', colores: '', tallas: '', visible: true, fotos: [] }

const unicos = (valores: (string | null)[]) => [...new Set(valores.filter((v): v is string => !!v))].join(', ')

const desdeProducto = (p: Producto): Estado => ({
  nombre: p.nombre,
  descripcion: p.descripcion ?? '',
  precio: String(p.precio),
  costo: p.costo > 0 ? String(p.costo) : '',
  categoriaId: p.categoriaId ?? '',
  colores: unicos(p.variantes.map((v) => v.color)),
  tallas: unicos(p.variantes.map((v) => v.talla)),
  visible: p.visibleEnTienda,
  fotos: p.fotos,
})

const firma = (e: Estado) => JSON.stringify({ ...e, fotos: e.fotos.map((f) => f.id) })

const MAXIMO_VARIANTES = 60 // el servidor lo valida también (Producto.MaximoVariantes)
const NUEVA_CATEGORIA = '__nueva'

const borrarFoto = (id: string) => void api.DELETE('/api/v1/imagenes/{id}', { params: { path: { id } } })

// Crear y editar un producto: la misma pantalla. Sin `inicial` es un producto nuevo.
export function FormularioProducto({ inicial }: { inicial?: Producto }) {
  const [servidor, setServidor] = useState<Producto | null>(inicial ?? null)
  const [form, setForm] = useState<Estado>(inicial ? desdeProducto(inicial) : vacio)
  const [creado, setCreado] = useState<Producto | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [nuevaCategoria, setNuevaCategoria] = useState<string | null>(null) // null = no se está creando una
  const [errorCategoria, setErrorCategoria] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [dialogoArchivar, setDialogoArchivar] = useState(false)

  const esNuevo = servidor === null
  const cambiar = (parte: Partial<Estado>) => {
    setGuardado(false)
    setError(null)
    setForm((f) => ({ ...f, ...parte }))
  }

  useEffect(() => {
    let cancelado = false
    api.GET('/api/v1/categorias', { params: { query: {} } }).then(({ data }) => {
      if (!cancelado && data) setCategorias(data)
    })
    return () => {
      cancelado = true
    }
  }, [])

  // Fotos subidas que todavía no se guardaron con el producto: si se sacan, se descartan o se sale de la
  // pantalla, se borran del servidor para no dejar fotos huérfanas (cerrar la pestaña sí deja alguna:
  // limpieza en M14). `guardadas` = las que ya son del producto.
  const guardadas = new Set(servidor?.fotos.map((f) => f.id))
  const sinGuardar = useRef<string[]>([])
  useEffect(() => {
    sinGuardar.current = form.fotos.filter((f) => !guardadas.has(f.id)).map((f) => f.id)
  })
  useEffect(
    () => () => {
      sinGuardar.current.forEach(borrarFoto)
    },
    [],
  )

  const quitarFoto = (foto: ImagenSubida) => {
    cambiar({ fotos: form.fotos.filter((f) => f.id !== foto.id) })
    if (!guardadas.has(foto.id)) borrarFoto(foto.id)
  }

  // ───────────── Lo que se calcula del formulario ─────────────
  const precio = leerMonto(form.precio)
  const costo = form.costo.trim() === '' ? 0 : leerMonto(form.costo)
  const colores = listaDeTextos(form.colores)
  const tallas = listaDeTextos(form.tallas)
  const variantes = colores.length && tallas.length ? colores.length * tallas.length : Math.max(colores.length, tallas.length, 1)
  const hayCambios = !servidor || firma(form) !== firma(desdeProducto(servidor))

  const avisoPrecio = form.precio.trim() && (precio === null || precio <= 0) ? 'Escribí un precio mayor a 0 (hasta 2 decimales).' : null
  const avisoCosto = costo === null ? 'Escribí un monto válido (hasta 2 decimales) o dejalo vacío.' : null
  const avisoVariantes = variantes > MAXIMO_VARIANTES ? `Son demasiadas combinaciones (${variantes}). El máximo es ${MAXIMO_VARIANTES}.` : null
  const puedeGuardar =
    !guardando && form.nombre.trim() !== '' && precio !== null && precio > 0 && costo !== null && !avisoVariantes && hayCambios

  // Aritmética pura (no la regla de "ganás poco"): esa la decide el servidor y se ve en el catálogo.
  const ganancia = precio !== null && precio > 0 && costo !== null && costo > 0 ? precio - costo : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!puedeGuardar || precio === null || costo === null) return
    setError(null)
    setGuardando(true)
    try {
      const body = {
        nombre: form.nombre,
        descripcion: form.descripcion.trim() || null,
        precio,
        costo,
        categoriaId: form.categoriaId || null,
        visibleEnTienda: form.visible,
        colores,
        tallas,
        fotoIds: form.fotos.map((f) => f.id),
      }
      const { data, error, response } = servidor
        ? await api.PUT('/api/v1/productos/{id}', { params: { path: { id: servidor.id } }, body })
        : await api.POST('/api/v1/productos', { body })
      if (!data) return setError(mensajeDeError(error, response))
      const eraNuevo = servidor === null
      setServidor(data)
      setForm(desdeProducto(data))
      if (eraNuevo) setCreado(data)
      else setGuardado(true)
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setGuardando(false)
    }
  }

  function descartar() {
    if (!servidor) return
    form.fotos.filter((f) => !guardadas.has(f.id)).forEach((f) => borrarFoto(f.id))
    setForm(desdeProducto(servidor))
    setError(null)
    setGuardado(false)
  }

  async function crearCategoria(e: FormEvent) {
    e.preventDefault()
    if (!nuevaCategoria?.trim()) return
    setErrorCategoria(null)
    try {
      const { data, error, response } = await api.POST('/api/v1/categorias', { body: { nombre: nuevaCategoria } })
      if (!data) return setErrorCategoria(mensajeDeError(error, response))
      setCategorias((c) => [...c, data])
      cambiar({ categoriaId: data.id })
      setNuevaCategoria(null)
    } catch {
      setErrorCategoria(mensajeDeError(null))
    }
  }

  async function archivar(archivar: boolean) {
    if (!servidor) return
    setError(null)
    try {
      const ruta = archivar ? '/api/v1/productos/{id}/archivar' : '/api/v1/productos/{id}/desarchivar'
      const { data, error, response } = await api.POST(ruta, { params: { path: { id: servidor.id } } })
      if (!data) return setError(mensajeDeError(error, response))
      setServidor(data)
      setDialogoArchivar(false)
    } catch {
      setError(mensajeDeError(null))
    }
  }

  function otroProducto() {
    setServidor(null)
    setCreado(null)
    setForm(vacio)
    setGuardado(false)
  }

  // ───────────── Producto guardado (solo al crear) ─────────────
  if (creado)
    return (
      <div className="pagina pagina-angosta">
        <section className="exito" role="status">
          <span className="exito-icono" aria-hidden="true">
            <Icono nombre="ok" tamano={46} />
          </span>
          <h1 className="titulo-pagina">¡Guardado!</h1>
          <p className="texto-suave">{creado.nombre} ya está en tu catálogo.</p>
          <div className="exito-acciones">
            <Link to="/catalogo" className="boton boton-primario boton-grande">
              Ver mi catálogo
            </Link>
            <button type="button" className="boton boton-texto" onClick={otroProducto}>
              Cargar otro producto
            </button>
          </div>
        </section>
      </div>
    )

  const categoriaOculta = form.categoriaId !== '' && !categorias.some((c) => c.id === form.categoriaId)

  return (
    <form className="pagina pagina-angosta" onSubmit={guardar} noValidate>
      <header className="cabecera-formulario">
        <Link to="/catalogo" className="boton-icono" aria-label="Volver al catálogo">
          <Icono nombre="atras" tamano={22} />
        </Link>
        <h1 className="titulo-pagina titulo-chico">{esNuevo ? 'Nuevo producto' : 'Editar producto'}</h1>
      </header>

      {servidor?.archivado && (
        <Aviso tipo="advertencia">
          Este producto está archivado: no se ve en tu catálogo ni en tu tienda.{' '}
          <button type="button" className="enlace-boton" onClick={() => archivar(false)}>
            Desarchivar
          </button>
        </Aviso>
      )}

      <GaleriaFotos
        fotos={form.fotos}
        alAgregar={(foto) => cambiar({ fotos: [...form.fotos, foto] })}
        alQuitar={quitarFoto}
        alHacerPortada={(foto) => cambiar({ fotos: [foto, ...form.fotos.filter((f) => f.id !== foto.id)] })}
      />

      <section className="seccion tarjeta">
        <Campo
          etiqueta="Nombre"
          value={form.nombre}
          maxLength={120}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          required
        />

        <div className="fila-doble">
          <Campo
            etiqueta="Precio"
            prefijo="Bs"
            inputMode="decimal"
            placeholder="180"
            value={form.precio}
            onChange={(e) => cambiar({ precio: e.target.value })}
            aria-invalid={!!avisoPrecio}
            ayuda={avisoPrecio ?? undefined}
            required
          />
          <Campo
            etiqueta="Tu costo"
            prefijo="Bs"
            inputMode="decimal"
            placeholder="Opcional"
            value={form.costo}
            onChange={(e) => cambiar({ costo: e.target.value })}
            aria-invalid={!!avisoCosto}
            ayuda={avisoCosto ?? undefined}
          />
        </div>
        {ganancia !== null && (
          <p className={`texto-chico ${ganancia > 0 ? 'texto-ok' : 'texto-peligro'}`} role="status">
            {ganancia > 0
              ? `Te quedan ${bs(ganancia)} de ganancia por unidad.`
              : ganancia === 0
                ? 'Con este precio no ganás nada: solo recuperás lo que te costó.'
                : `Con este precio perdés ${bs(Math.abs(ganancia))} por unidad.`}
          </p>
        )}
        {ganancia === null && <p className="texto-suave texto-chico">Cargá tu costo y te avisamos si un precio te hace perder plata.</p>}

        <div className="campo">
          <label htmlFor="categoria" className="campo-etiqueta">
            Categoría
          </label>
          <select
            id="categoria"
            className="seleccion"
            value={nuevaCategoria !== null ? NUEVA_CATEGORIA : form.categoriaId}
            onChange={(e) => {
              if (e.target.value === NUEVA_CATEGORIA) setNuevaCategoria('')
              else {
                setNuevaCategoria(null)
                cambiar({ categoriaId: e.target.value })
              }
            }}
          >
            <option value="">Sin categoría</option>
            {categoriaOculta && <option value={form.categoriaId}>(categoría oculta)</option>}
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
            <option value={NUEVA_CATEGORIA}>＋ Nueva categoría…</option>
          </select>
        </div>
        {nuevaCategoria !== null && (
          <div className="categoria-nueva">
            <Campo
              etiqueta="Nombre de la categoría"
              value={nuevaCategoria}
              maxLength={60}
              autoFocus
              onChange={(e) => setNuevaCategoria(e.target.value)}
              aria-invalid={!!errorCategoria}
              ayuda={errorCategoria ?? undefined}
            />
            <div className="acciones-fila">
              <button type="button" className="boton boton-secundario boton-chico" disabled={!nuevaCategoria.trim()} onClick={crearCategoria}>
                Crear categoría
              </button>
              <button type="button" className="boton boton-texto boton-chico" onClick={() => setNuevaCategoria(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <Campo
          etiqueta="Colores (separados por coma)"
          placeholder="café, negro"
          value={form.colores}
          onChange={(e) => cambiar({ colores: e.target.value })}
        />
        <Campo
          etiqueta="Tallas (separadas por coma)"
          placeholder="S, M, L"
          value={form.tallas}
          onChange={(e) => cambiar({ tallas: e.target.value })}
          aria-invalid={!!avisoVariantes}
          ayuda={
            avisoVariantes ??
            (colores.length || tallas.length
              ? `${variantes} ${variantes === 1 ? 'variante' : 'variantes'}${colores.length && tallas.length ? ` (${colores.length} × ${tallas.length})` : ''}.`
              : 'Si no tiene colores ni tallas, dejalo vacío.')
          }
        />
        <AreaTexto
          etiqueta="Descripción"
          value={form.descripcion}
          maxLength={1000}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
        />
      </section>

      <section className="tarjeta">
        <Interruptor
          etiqueta="Mostrar en mi tienda"
          ayuda="Apagado, queda solo en tu catálogo."
          activo={form.visible}
          alCambiar={(visible) => cambiar({ visible })}
        />
      </section>

      {!esNuevo && !servidor.archivado && (
        <div>
          <button type="button" className="boton boton-texto" onClick={() => setDialogoArchivar(true)}>
            Archivar este producto
          </button>
        </div>
      )}

      {error && <Aviso>{error}</Aviso>}
      {guardado && <Aviso tipo="exito">Guardado. Ya está actualizado.</Aviso>}

      <div className="barra-guardar">
        <button type="submit" className="boton boton-primario boton-grande" disabled={!puedeGuardar}>
          {guardando ? 'Guardando…' : esNuevo ? 'Guardar producto' : 'Guardar cambios'}
        </button>
        {!esNuevo && hayCambios && !guardando && (
          <button type="button" className="boton boton-texto" onClick={descartar}>
            Descartar
          </button>
        )}
      </div>

      <Dialogo abierto={dialogoArchivar} titulo="¿Archivar este producto?" alCerrar={() => setDialogoArchivar(false)}>
        <div className="formulario">
          <p className="texto-suave">
            Deja de verse en tu catálogo y en tu tienda. No se pierde nada: lo encontrás en “Archivados” y lo podés
            desarchivar cuando quieras.
          </p>
          <div className="acciones-fila">
            <button type="button" className="boton boton-primario" onClick={() => archivar(true)}>
              Archivar
            </button>
            <button type="button" className="boton boton-texto" onClick={() => setDialogoArchivar(false)}>
              Cancelar
            </button>
          </div>
        </div>
      </Dialogo>
    </form>
  )
}
