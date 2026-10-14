import { useEffect, useState } from 'react'
import { api, mensajeDeError, type Costeo } from '../../api/cliente'
import { Aviso } from '../../componentes/Aviso'
import { Campo } from '../../componentes/Campo'
import { bs, leerMonto, soloEnteros } from '../../util/dinero'

type Campos = { material: string; empaque: string; mano: string; fijo: string; margen: string }

const aTexto = (n: number) => (n > 0 ? String(n) : '')

// "Calculadora de precio": de qué se compone lo que te cuesta y cuánto querés ganar → cuánto cobrar. El precio
// sugerido lo calcula el SERVIDOR (acá solo se muestra) y NUNCA cambia el precio del producto solo: "Usar este
// precio" lo pone en el formulario de arriba y se guarda con Guardar. Guardar el costeo deja tu costo en el total.
export function CalculadoraPrecio({
  productoId,
  alGuardar,
  alUsarPrecio,
}: {
  productoId: string
  alGuardar: () => void
  alUsarPrecio: (precio: number) => void
}) {
  const [inicial, setInicial] = useState<Costeo | null>(null)
  const [campos, setCampos] = useState<Campos | null>(null)
  const [resultado, setResultado] = useState<Costeo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .GET('/api/v1/productos/{productoId}/costeo', { params: { path: { productoId } } })
      .then(({ data, error, response }) => {
        if (cancelado) return
        if (!data) return setError(mensajeDeError(error, response))
        setInicial(data)
        // Sin costeo, el costo que ya tenías es el punto de partida (como "material").
        setCampos(
          data.tiene
            ? { material: aTexto(data.material), empaque: aTexto(data.empaque), mano: aTexto(data.manoDeObra), fijo: aTexto(data.costoFijo), margen: String(data.margenObjetivo) }
            : { material: aTexto(data.costoTotal), empaque: '', mano: '', fijo: '', margen: String(data.margenObjetivo) },
        )
      })
      .catch(() => !cancelado && setError(mensajeDeError(null)))
    return () => {
      cancelado = true
    }
  }, [productoId])

  // Lo que se escribe, en números (vacío = 0). null si algo no es un monto válido.
  const numeros = campos && {
    material: campos.material.trim() === '' ? 0 : leerMonto(campos.material),
    empaque: campos.empaque.trim() === '' ? 0 : leerMonto(campos.empaque),
    manoDeObra: campos.mano.trim() === '' ? 0 : leerMonto(campos.mano),
    costoFijo: campos.fijo.trim() === '' ? 0 : leerMonto(campos.fijo),
    margenObjetivo: soloEnteros(campos.margen),
  }
  const cuerpo =
    numeros &&
    numeros.material !== null && numeros.empaque !== null && numeros.manoDeObra !== null && numeros.costoFijo !== null &&
    numeros.margenObjetivo !== null && numeros.margenObjetivo >= 1 && numeros.margenObjetivo <= 90
      ? { material: numeros.material, empaque: numeros.empaque, manoDeObra: numeros.manoDeObra, costoFijo: numeros.costoFijo, margenObjetivo: numeros.margenObjetivo }
      : null
  const hayCosto = cuerpo !== null && cuerpo.material + cuerpo.empaque + cuerpo.manoDeObra + cuerpo.costoFijo > 0
  const clave = hayCosto ? JSON.stringify(cuerpo) : null

  // La cuenta la hace el servidor, con una pausa mientras se escribe.
  useEffect(() => {
    if (!clave) return
    let cancelado = false
    const espera = setTimeout(() => {
      api
        .POST('/api/v1/productos/{productoId}/costeo/calcular', { params: { path: { productoId } }, body: JSON.parse(clave) })
        .then(({ data }) => {
          if (!cancelado && data) setResultado(data)
        })
        .catch(() => undefined)
    }, 300)
    return () => {
      cancelado = true
      clearTimeout(espera)
    }
  }, [clave, productoId])

  function cambiar(cambios: Partial<Campos>) {
    setAviso(null)
    setCampos((c) => (c ? { ...c, ...cambios } : c))
  }

  async function guardar() {
    if (!cuerpo || !hayCosto) return
    setTrabajando(true)
    setError(null)
    try {
      const { data, error, response } = await api.PUT('/api/v1/productos/{productoId}/costeo', { params: { path: { productoId } }, body: cuerpo })
      if (data) {
        setInicial(data)
        setAviso(`Guardamos tu costeo: tu costo ahora es ${bs(data.costoTotal)}.`)
        alGuardar()
      } else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setTrabajando(false)
    }
  }

  async function quitar() {
    setTrabajando(true)
    setError(null)
    try {
      const { error, response } = await api.DELETE('/api/v1/productos/{productoId}/costeo', { params: { path: { productoId } } })
      if (response.ok) {
        setInicial((i) => (i ? { ...i, tiene: false } : i))
        setAviso('Quitamos el costeo. Tu costo queda como está y lo podés editar de nuevo.')
        alGuardar()
      } else setError(mensajeDeError(error, response))
    } catch {
      setError(mensajeDeError(null))
    } finally {
      setTrabajando(false)
    }
  }

  if (!campos) {
    return error ? (
      <Aviso>{error}</Aviso>
    ) : (
      <p className="texto-suave" role="status">
        Cargando la calculadora…
      </p>
    )
  }

  const r = hayCosto ? resultado : null

  return (
    <section className="tarjeta calculadora" aria-labelledby="calc-titulo">
      <h2 id="calc-titulo" className="titulo-seccion">
        Calculadora de precio
      </h2>
      <p className="texto-suave texto-chico">
        Sumá lo que te cuesta cada unidad y decinos cuánto querés ganar: te sugerimos cuánto cobrar. Tu precio no cambia solo.
      </p>

      <div className="fila-doble">
        <Campo etiqueta="Material" prefijo="Bs" inputMode="decimal" placeholder="0" value={campos.material} onChange={(e) => cambiar({ material: e.target.value })} aria-invalid={numeros?.material === null} />
        <Campo etiqueta="Empaque" prefijo="Bs" inputMode="decimal" placeholder="0" value={campos.empaque} onChange={(e) => cambiar({ empaque: e.target.value })} aria-invalid={numeros?.empaque === null} />
      </div>
      <div className="fila-doble">
        <Campo etiqueta="Mano de obra" prefijo="Bs" inputMode="decimal" placeholder="0" value={campos.mano} onChange={(e) => cambiar({ mano: e.target.value })} aria-invalid={numeros?.manoDeObra === null} />
        <Campo etiqueta="Costo fijo" prefijo="Bs" inputMode="decimal" placeholder="0" value={campos.fijo} onChange={(e) => cambiar({ fijo: e.target.value })} aria-invalid={numeros?.costoFijo === null} ayuda="Tu parte de luz, alquiler…" />
      </div>
      <Campo
        etiqueta="Cuánto querés ganar (% del precio)"
        inputMode="numeric"
        value={campos.margen}
        onChange={(e) => cambiar({ margen: e.target.value.replace(/[^\d]/g, '') })}
        aria-invalid={numeros?.margenObjetivo == null || numeros.margenObjetivo < 1 || numeros.margenObjetivo > 90}
        ayuda="Entre 1 y 90. Por ejemplo, 40 % = de cada Bs 100 que cobrás, Bs 40 son ganancia."
      />

      {cuerpo === null && <p className="texto-chico texto-peligro" role="status">Revisá los números: montos con hasta 2 decimales y un margen entre 1 y 90.</p>}
      {cuerpo !== null && !hayCosto && <p className="texto-suave texto-chico">Cargá al menos un costo para calcular el precio.</p>}

      {r && (
        <div className="calculadora-resultado" role="status" aria-live="polite">
          <span className="texto-suave texto-chico">Te cuesta {bs(r.costoTotal)} por unidad</span>
          <span className="calculadora-sugerido">Cobrá {bs(r.precioSugerido)}</span>
          <span className="texto-ok texto-chico">Con ese precio ganás {bs(r.gananciaConSugerido)} por unidad.</span>
          <span className={`texto-chico ${r.precioActual === r.precioSugerido ? 'texto-suave' : r.gananciaActual <= 0 ? 'texto-peligro' : 'texto-suave'}`}>
            {r.precioActual === r.precioSugerido
              ? 'Ya cobrás justo ese precio.'
              : r.gananciaActual <= 0
                ? `Hoy cobrás ${bs(r.precioActual)} y perdés ${bs(Math.abs(r.gananciaActual))} por unidad.`
                : `Hoy cobrás ${bs(r.precioActual)} y ganás ${bs(r.gananciaActual)} (${String(r.margenActual).replace('.', ',')} %).`}
          </span>
        </div>
      )}

      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="exito">{aviso}</Aviso>}

      <div className="acciones-fila">
        <button type="button" className="boton boton-primario boton-chico" onClick={guardar} disabled={!hayCosto || trabajando}>
          {trabajando ? 'Guardando…' : 'Guardar costeo'}
        </button>
        {r && r.precioActual !== r.precioSugerido && (
          <button type="button" className="boton boton-secundario boton-chico" onClick={() => alUsarPrecio(r.precioSugerido)}>
            Usar este precio
          </button>
        )}
        {inicial?.tiene && (
          <button type="button" className="boton boton-texto boton-chico" onClick={quitar} disabled={trabajando}>
            Quitar costeo
          </button>
        )}
      </div>
    </section>
  )
}
