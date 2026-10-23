import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icono } from '../../componentes/Icono'

// Términos y privacidad. BORRADOR redactado sin abogado: antes de abrir al público, que lo revise un abogado en Bolivia
// (ver docs/DECISIONES.md). Sin nombre de producto (src/marca.ts): se dice "la plataforma".
const ACTUALIZADO = '14 de octubre de 2026'

function Documento({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="acceso">
      <article className="acceso-columna legal">
        <Link to="/" className="enlace-volver">
          <Icono nombre="atras" tamano={18} />
          Volver
        </Link>
        <header className="acceso-cabecera">
          <h1 className="titulo-grande">{titulo}</h1>
          <p className="texto-suave">Última actualización: {ACTUALIZADO}</p>
        </header>
        {children}
        <p className="texto-suave texto-chico">
          ¿Dudas? Escribinos desde el panel o por los medios de contacto de la plataforma. Ver también{' '}
          {titulo === 'Términos de uso' ? <Link to="/privacidad">la política de privacidad</Link> : <Link to="/terminos">los términos de uso</Link>}.
        </p>
      </article>
    </div>
  )
}

export function Terminos() {
  return (
    <Documento titulo="Términos de uso">
      <section>
        <h2 className="titulo-seccion">1. Qué es la plataforma</h2>
        <p>
          Una herramienta para emprendedores de Bolivia: catálogo, stock, compras, ventas, gastos, precio sugerido y una tienda en internet donde tus
          clientes ven tus productos y te hacen pedidos por WhatsApp. No vende nada por vos ni cobra a tus clientes: los pedidos y los pagos los
          arreglás vos con ellos.
        </p>
      </section>
      <section>
        <h2 className="titulo-seccion">2. Tu cuenta</h2>
        <p>
          Sos responsable de lo que se haga con tu cuenta: cuidá tu contraseña y no la compartas. Los datos que cargás (productos, precios, stock,
          ventas) son tuyos; la plataforma solo los guarda y los muestra donde vos elegís.
        </p>
      </section>
      <section>
        <h2 className="titulo-seccion">3. Lo que publicás</h2>
        <p>
          Solo podés publicar productos que podés vender legalmente en Bolivia, con fotos y textos que te pertenecen o que tenés derecho a usar. Podemos
          ocultar una tienda que publique algo ilegal, engañoso o que dañe a otros, avisándote.
        </p>
      </section>
      <section>
        <h2 className="titulo-seccion">4. Planes y pagos</h2>
        <p>
          Hay un plan gratuito con límites y planes pagos por mes. Los pagos se hacen por QR o transferencia y se activan cuando confirmamos el
          comprobante. Si un plan vence, no se borra nada: tu cuenta vuelve al plan gratuito y no podés agregar más de lo que este permite. Los precios
          pueden cambiar; lo que ya pagaste se respeta hasta que venza.
        </p>
      </section>
      <section>
        <h2 className="titulo-seccion">5. Disponibilidad</h2>
        <p>
          Hacemos lo posible para que la plataforma funcione siempre y respaldamos los datos todos los días, pero puede haber cortes o errores. Te
          recomendamos no depender de ella como único registro de algo crítico.
        </p>
      </section>
      <section>
        <h2 className="titulo-seccion">6. Cambios y baja</h2>
        <p>
          Si cambiamos estos términos te avisamos en el panel. Podés dejar de usar la plataforma cuando quieras y pedirnos que borremos tu cuenta y tus
          datos.
        </p>
      </section>
    </Documento>
  )
}

export function Privacidad() {
  return (
    <Documento titulo="Política de privacidad">
      <section>
        <h2 className="titulo-seccion">Qué datos guardamos</h2>
        <ul>
          <li>De tu cuenta: nombre, email y contraseña (la contraseña nunca se guarda tal cual, solo de forma cifrada que no se puede revertir).</li>
          <li>De tu negocio: lo que cargás (productos, fotos, stock, compras, ventas, gastos, proveedores) y los datos de tu tienda (nombre, WhatsApp, logo).</li>
          <li>
            De los clientes que te hacen pedidos desde tu tienda: el nombre, el celular, la dirección de entrega (si piden envío) y lo que pidieron. Esos
            datos solo los ves vos, para atender el pedido.
          </li>
          <li>Datos técnicos mínimos para que funcione y para frenar abusos (por ejemplo, la dirección IP en los registros, por un tiempo limitado).</li>
        </ul>
      </section>
      <section>
        <h2 className="titulo-seccion">Para qué los usamos</h2>
        <p>
          Solo para que la plataforma funcione: mostrar tu tienda, registrar tus operaciones, procesar los pedidos y avisarte de lo importante. No vendemos
          ni cedemos tus datos ni los de tus clientes, y no los usamos para publicidad.
        </p>
      </section>
      <section>
        <h2 className="titulo-seccion">Quién más los ve</h2>
        <p>
          Nadie más que vos ve los datos de tu negocio: cada tienda está separada de las demás. Lo que aparece en tu tienda pública (productos, precios
          si los mostrás) lo ve cualquiera con el enlace; nunca se muestran tus costos, tu ganancia ni tu stock exacto. Usamos proveedores de servidores y,
          si está activado, un servicio para registrar errores técnicos sin datos personales.
        </p>
      </section>
      <section>
        <h2 className="titulo-seccion">Tus derechos</h2>
        <p>
          Podés pedirnos ver, corregir o borrar tus datos, o llevarte una copia. Las sesiones vencen solas y podés cerrarlas cuando quieras. Si sos cliente de
          una tienda y querés que se borren tus datos de un pedido, pedíselo a esa tienda o escribinos.
        </p>
      </section>
    </Documento>
  )
}
