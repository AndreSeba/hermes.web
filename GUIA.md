# Hermes.Web — guía del proyecto

> Frontend de Hermes (SaaS simple para emprendedores bolivianos). Lee este archivo antes de
> tocar código. Si el código pide una decisión que no está documentada acá, preguntá antes de
> asumir. Contexto de producto: `../Hermes/docs/CONTEXTO.md`. Plan por módulos: `../Hermes/docs/PLAN.md`.

## Propósito

Interfaz React para `../Hermes` (el backend, repo Git **separado** a propósito, misma
estructura que CMP: `InventoryPlatform` + `InventoryPlatform.Web`). Este repo **nunca** toca la
base de datos: todo pasa por HTTP contra la API.

## Stack

- React 19 + TypeScript + Vite 8 + **react-router 8** (modo librería: `createBrowserRouter`), lint con oxlint.
- **pnpm, no npm** (decisión del usuario por seguridad). `pnpm-workspace.yaml` exige que una
  versión tenga ≥ 7 días publicada (`minimumReleaseAge`) y pnpm bloquea los scripts de
  instalación por defecto. Antes de agregar una dependencia: ¿hace falta de verdad? Preferir
  pocas y conocidas. Correr `pnpm audit` después. Hoy: `react`, `react-dom`, `react-router`, `openapi-fetch`.
- Sin librería de componentes ni de íconos: componentes propios en `src/componentes/`, íconos en
  `Icono.tsx` (trazos del prototipo), estilos en `src/index.css` (tokens + clases, sin Tailwind).
- Celular primero (390 px); a partir de 900 px, escritorio. Sin modo oscuro (el prototipo no lo tiene).

## Estructura

```
src/
├── api/          cliente.ts (cliente tipado + sesión), esquema.d.ts (GENERADO)
├── sesion/       contexto.ts (useSesion/useSesionActiva), ProveedorSesion.tsx, Guardias.tsx
├── diseno/       Armazon.tsx (menú lateral / barra inferior), secciones.ts (menú + módulo de cada sección)
├── componentes/  Campo, AreaTexto, Aviso, Contador, Dialogo, EtiquetaMargen, EtiquetaStock, GaleriaFotos, Icono,
│                 Interruptor, PantallaCarga, PestanasInventario, SelectorColor, SubirFoto
├── paginas/      acceso/ (Bienvenida, Ingresar, Registro), catalogo/ (Catalogo, FormularioProducto, NuevoProducto,
│                 EditarProducto, DialogoCategorias), stock/ (Stock, FilaStock, DialogoLlegaron, DialogoCorregir,
│                 historial.ts), panel/ (Inicio, MiTienda, EnConstruccion), NoEncontrada
├── util/         texto.ts (iniciales, aSlug, fechaLarga…), color.ts (5 colores de tienda, colorDeTexto),
│                 dinero.ts (bs, leerMonto, listaDeTextos)
├── marca.ts      identidad visible (nombre SIN DEFINIR)
└── rutas.tsx     todas las rutas
scripts/e2e.mjs   prueba de punta a punta (pnpm e2e)
```

## Relación con el backend — contrato tipado, nunca a mano

- **Los tipos de la API se generan** desde su OpenAPI: `pnpm api:tipos` (con la API corriendo en
  el perfil `http`) reescribe `src/api/esquema.d.ts`. **No lo edites a mano** ni dupliques DTOs:
  es el equivalente de la referencia a `Inventory.Application` que tiene el front de CMP.
  Si el backend cambia un contrato, regenerar y dejar que TypeScript marque lo que se rompió.
- `src/api/cliente.ts`: cliente `openapi-fetch` tipado (`api.GET('/api/v1/categorias')`). Los errores
  llegan como `ProblemDetails`; `mensajeDeError(error, response)` saca el `detail` (y cubre 429 sin cuerpo).
- **Proxy de Vite**: en desarrollo el front llama a rutas relativas (`/api`, `/public`, `/archivos`) y Vite las
  reenvía a `http://localhost:5013`. `/archivos/...` son las fotos subidas (la API devuelve las urls de
  miniatura/catálogo/detalle en `ImagenDto`; con Cloudflare R2 pasarán a ser de otro dominio, así que
  usar siempre la url que viene en el DTO, nunca armarla a mano). Sin CORS ni certificados. El puerto del front es fijo (5173),
  porque el backend lo tiene en `CorsOrigenesPermitidos`.

## Sesión (M1, 2026-10-14)

- **El token de acceso vive en memoria** (`cliente.ts`), nunca en `localStorage`. La sesión larga la
  sostiene el refresh token en la cookie HttpOnly `hermes_refresh` (la pone el backend; JS no la ve).
- `ProveedorSesion`: estado `cargando | anonimo | activa`. Al abrir la app intenta `renovarSesion()`
  (si la cookie sirve, entra directo); renueva solo **1 min antes** de que venza el token (15 min).
- `fetchConSesion`: si un pedido vuelve **401**, renueva y lo **repite una vez**. No se reintentan
  `login`, `registro`, `refresh` ni `logout` (ahí 401 = credenciales malas). **Trampa ya pisada**:
  excluir todo `/api/v1/auth/` rompía `/auth/yo`, que sí usa el token.
- **`renovarSesion()` es una sola a la vez por pestaña** (promesa compartida). Sin eso, StrictMode
  (monta dos veces) o dos 401 juntos mandaban dos refresh con la misma cookie y el segundo parecía
  un robo para el backend. Si el refresh da 401 reintenta una vez a los 400 ms: otra pestaña pudo
  rotar la cookie un instante antes (el backend tolera esa carrera 30 s, ver su docs/GUIA.md).
- Guardias (`Guardias.tsx`): `RequiereSesion` manda a `/bienvenida` recordando la ruta pedida;
  `SoloAnonimo` saca del acceso a quien ya tiene sesión.

## Mi tienda y subida de fotos (M3, 2026-10-14)

- `SubirFoto` es el componente para **cualquier foto** (logo hoy; fotos de producto en M4): el campo
  `<input type="file" accept="image/jpeg,image/png,image/webp">` (en el celular abre cámara o galería; iOS
  convierte HEIC a JPEG por el `accept`), sube **al elegir** con `FormData` y devuelve el `ImagenDto`.
  Muestra `imagen.miniatura`. Las urls salen SIEMPRE del DTO (con Cloudflare R2 serán de otro dominio).
- **La foto subida no es del formulario hasta guardar.** `MiTienda` lleva la cuenta: si la dueña reemplaza,
  descarta (`Descartar`) o sale de la pantalla con una foto subida sin guardar, la **borra del servidor**
  (`DELETE /api/v1/imagenes/{id}`) para no dejar fotos huérfanas. Cerrar la pestaña sí deja una: limpieza
  en M14. Mismo patrón para M4.
- Formulario con detección de cambios (`Guardar` desactivado sin cambios o con WhatsApp inválido),
  **`Descartar`**, y aviso `Guardado`. Al guardar se llama a `actualizarTienda()` del contexto de sesión:
  el menú muestra el nombre nuevo sin recargar. Cambiar la dirección toca solo `slug`: lo que esté a medio
  editar en el formulario no se pierde.
- Carga de datos con **cancelación** (`let cancelado` en el efecto): StrictMode monta dos veces. El linter
  (`react/set-state-in-effect`) rechaza llamar a un `useCallback` que cambia estado desde un efecto: cargar
  dentro del efecto con `.then`, y reiniciar un estado de diálogo montando el formulario solo mientras está
  abierto (`Dialogo` no renderiza sus hijos cerrado), no con un efecto.
- `Dialogo` usa el `<dialog>` nativo (foco, Escape y lectores de pantalla gratis).
- `SelectorColor`: los 5 colores del prototipo (Mostaza, Verde, Terracota, Azul, Grafito) + "Otro" con el
  selector del sistema. `colorDeTexto()` elige texto claro u oscuro según la luminancia del fondo.
- **WhatsApp**: el `+591` va fijo en pantalla y el campo lleva solo los 8 dígitos; el backend normaliza.
- **Pendiente**: el avatar del menú es siempre ámbar (la sesión no trae el color ni el logo de la tienda).
- La tienda pública (M10) traerá el enlace para compartir, el QR y "Ver tienda"; hoy `MiTienda` lo avisa
  como "Próximamente".

## Catálogo (M4, 2026-10-14)

Rutas: `/catalogo` (lista), `/catalogo/nuevo`, `/catalogo/:id` (editar). Crear y editar son **la misma
pantalla** (`FormularioProducto`; sin `inicial` es nuevo). Referencia de diseño: prototipo (Catálogo, Nuevo producto).

- **Los filtros viven en la dirección** (`?q=…&categoria=…&filtro=revisar&archivados=1`, `useSearchParams` con
  `replace`): al volver desde un producto el catálogo queda igual y un enlace lleva a la misma vista. La búsqueda
  espera 300 ms tras la última letra; mientras llega la respuesta se sigue viendo la lista anterior (sin
  parpadeo) y las respuestas viejas se descartan (`cancelado`). **Pendiente**: el texto de búsqueda no se
  sincroniza si se vuelve atrás en el historial (los resultados sí).
- **Paginación**: "Ver más productos" pide la siguiente página con `Cursor` y **agrega** (24 por página).
- Los parámetros de consulta se escriben como los declara el esquema: `Buscar`, `CategoriaId`, `RevisarPrecio`,
  `Archivados`, `Cursor`, `Limite` (mayúscula inicial).
- **Variantes**: dos campos de texto, "Colores" y "Tallas" separados por coma (como el prototipo y como leerá el
  lector de Instagram: "Colores: …", "Tallas: …"). `listaDeTextos` (sin vacíos ni repetidos, sin distinguir
  mayúsculas) refleja la regla del backend y muestra "4 variantes (2 × 2)" en vivo; el servidor igual valida.
- **La etiqueta de margen la decide el servidor** (`EtiquetaMargen` solo muestra `estadoPrecio` + `ganancia`).
  En el formulario se calcula en vivo solo la resta (precio − costo, "Te quedan Bs 70…" / "perdés Bs 2…"): la regla
  de "ganás poco" NO se duplica acá. Sin costo cargado la tarjeta dice "Cargá tu costo".
- **`GaleriaFotos`** (hasta 8, la primera es la portada; "Hacer portada" mueve al frente; el celular permite
  elegir varias juntas). Sube **de a una** (no 8 fotos grandes en paralelo con una conexión floja) y avisa al
  padre foto por foto con funciones (`alAgregar`…), no con la lista completa, porque las subidas son asíncronas y
  se pisarían. Mismo criterio de fotos huérfanas que Mi tienda: lo subido que no se guardó se borra al quitarlo,
  descartar o salir (ref + efecto de limpieza); cerrar la pestaña deja una (M14). El borrado real de las que se
  sacan de un producto ya guardado lo hace el servidor al guardar.
- Categoría: `<select>` con "＋ Nueva categoría…" (se crea ahí mismo) y diálogo **Categorías** (agregar,
  renombrar, ocultar; ocultar no borra productos). Una categoría oculta de un producto existente se ve como
  "(categoría oculta)".
- Archivar pide confirmación (`Dialogo`); un producto archivado muestra un aviso con "Desarchivar" y se ve desde el
  filtro "Archivados". Al crear, pantalla de éxito con "Ver mi catálogo" / "Cargar otro producto".
- `Interruptor` (`role="switch"`) para "Mostrar en mi tienda"; `bs()` formatea "Bs 180" / "Bs 58,50".
- La tarjeta muestra "Quedan N" / "Agotado" (sobre la foto) solo si el producto lleva control de stock (M5).
- **Pendiente**: insignia de Instagram (M11), proveedor (M7).

## Stock (M5, 2026-10-14)

Ruta `/stock` (referencia: prototipo "Stock"). Reglas del backend en `../Hermes/docs/GUIA.md` ("Stock (M5)").

- **Control por producto**: el formulario de producto tiene el interruptor "Llevar control de stock" (encendido por
  defecto) y "Avisarme cuando queden N" (3; solo con el control encendido). Apagado = "por encargo": sin número,
  "No lleva stock", y en Stock/catálogo no se ofrece cargar cantidades. Los estados (`Agotado`, `Pocos`, `Ok`,
  `SinControl`) los manda el servidor: **no recalcular la regla en el front** (`EtiquetaStock` solo muestra).
- La pantalla trae: tarjeta oscura con "Tenés en mercadería Bs X / entrarían Bs Y" y avisos (`resumen`), vistas
  Todos / A reponer / Por encargo, buscador y filas expandibles (variantes + "Lo último que pasó", pedido al abrir,
  3 movimientos). Lista ordenada por urgencia por el servidor, paginada con cursor ("Ver más productos"). Vista,
  búsqueda y `?llegaron=<id>` viven en la dirección.
- **`?llegaron=<id>` abre "Llegaron más"** de un producto (lo usa "Cargar cuántas tenés" de la pantalla de éxito al
  crear un producto) y se limpia de la dirección.
- **Llegaron más** / **Corregir** son *hojas* (`Dialogo hoja`: suben desde abajo a todo el ancho en celular, cuadro
  centrado en escritorio). Llegaron más: un `Contador` por variante (se puede escribir o tocar −/+), costo por unidad
  opcional prefilled con el del producto ("si cambió, actualizamos tu costo"), botón "Sumar N". Corregir: se escribe
  cuánto HAY (no la diferencia), motivo con atajos (Dañado, Perdido, Regalo…) + texto libre; Guardar desactivado sin
  cambios. Nada de −/+ que escriban movimientos en cada toque (llenaría el historial de ruido).
- Después de sumar o corregir la fila se reemplaza **en su lugar** (no salta mientras se mira); en "A reponer" sale
  si ya no hace falta. El aviso verde ("Sumaste 6 a …") se va solo a los 6 s.
- `Contador`: el valor es texto (permite vacío) y `soloEnteros` (en `util/dinero.ts`) decide si vale. **Trampa en las
  pruebas**: dos `.click()` seguidos en la MISMA tarea no dejan que React redibuje y el segundo ve el valor viejo;
  separarlos (una persona toca en momentos distintos).
- Sub-navegación Stock / Compras / Proveedores (`PestanasInventario`): en el celular es la única forma de llegar a
  Compras y Proveedores (M7).
- **Pendiente**: insignia con la cantidad de agotados en el menú, proveedor en "Llegaron más" (M7).

## Ventas (M6, 2026-10-14)

Rutas `/venta` (nueva venta, el botón verde central de la barra y del menú) y `/ventas` (historial). Reglas del
backend en `../Hermes/docs/GUIA.md` ("Ventas (M6)"). Código en `src/paginas/ventas/`.

- **Nueva venta** (`NuevaVenta.tsx`): buscador, lista de productos (`GET /ventas/productos`: vendibles primero, agotados
  al final y sin contador) con `Contador` por variante (un producto sin variantes lleva el contador en su fila). El
  contador **no deja pasar de lo que queda** (`tope`) y los productos por encargo no tienen tope. Abajo, un **pie fijo**
  (`.pie-venta`, pegado sobre la barra inferior en el celular): forma de pago en chips, cliente detrás de "+ Agregar
  cliente (opcional)" (que no estorbe: casi siempre no se usa), total y "Ganás Bs X". **La ganancia no se muestra si
  algún producto elegido no tiene costo cargado**: no se inventa (misma regla que el servidor).
- **Clave de idempotencia**: `crypto.randomUUID()` guardada en un `useRef`; se manda en cada intento y **solo se
  regenera tras un éxito**. Si falla por falta de señal, tocar de nuevo reintenta la MISMA venta (el servidor devuelve
  la ya registrada, no duplica). Un 409 (sin stock) vuelve a pedir la lista para mostrar lo que hay ahora.
- Después de registrar: pantalla "¡Venta registrada!" (total, unidades, método, cliente, "Ganaste Bs X") con
  "Registrar otra venta" (vuelve a pedir los productos: el stock cambió), "Ver mis ventas" y "Volver al inicio".
  El último método de pago se recuerda en `localStorage` (`venta.pago`, siempre con try/catch).
- **Ventas** (`Ventas.tsx`): chips Hoy / Semana / Mes (`?periodo=`; "Hoy" = desde la medianoche **del celular**, los
  límites se mandan como instantes y `Hasta` es exclusivo), tarjeta oscura de resumen ("Vendiste Bs X", ventas y
  unidades, "Ganaste Bs Y", aviso ámbar si hay unidades sin costo), "Mostrar anuladas" (`?anuladas=1`), filas
  expandibles que piden el detalle al abrir, **Anular venta** con confirmación en hoja (no se puede deshacer; las
  unidades con control de stock vuelven). Tras anular, la fila sale (o se marca) en su lugar y se recarga el resumen.
- Entrada "Ventas" en el menú (no en la barra del celular: ahí está el botón central) y tarjeta "Mis ventas" en Inicio.
- Ojo con el CSS: `.boton-texto` es un modificador que se usa junto a `.boton` (sola, el botón sale con el borde del
  navegador).
- **Pendiente**: medidor de gastos del mes en la pantalla de venta (M9), descuentos / precio editable / fecha manual.

## Proveedores y compras (M7, 2026-10-14)

Rutas `/proveedores`, `/compras` y `/compras/nueva`, con las pestañas Stock / Compras / Proveedores
(`PestanasInventario`). Reglas del backend en `../Hermes/docs/GUIA.md` ("Proveedores y compras (M7)"). Código en
`src/paginas/compras/`.

- **Proveedores** (`Proveedores.tsx`): lista por nombre con "Le debés Bs X · N pedidos en camino" (o "Sin deudas" /
  "Todavía no le compraste"); fila expandible que pide al abrir "Lo último que le pagaste" por producto; acciones
  **Pedirle por WhatsApp** (enlace `wa.me` con el mensaje escrito, `util/whatsapp.ts`, `target=_blank` con
  `noopener`), **Nueva compra** (llega con el proveedor ya elegido: `?proveedor=<id>`), Editar y Desactivar. "Mostrar
  desactivados" (`?inactivos=1`). El formulario (hoja) crea y edita; el WhatsApp se escribe sin el +591.
- **Compras** (`Compras.tsx`): tarjeta oscura "Les debés a tus proveedores Bs X" con chips (compras por pagar, pedidos
  en camino con su valor), vistas Todas / En camino / Por pagar (`?vista=`), filas con etiquetas de estado y de pago.
  Al abrir una fila (detalle pedido aparte): **Llegó** (suma stock y costo; si el margen queda flojo, muestra el aviso
  "Revisá tus precios" con enlace a `/catalogo?filtro=revisar`), **Marcar pagada**, "Preguntarle por WhatsApp" y
  **Anular compra** (hoja de confirmación que explica qué pasa con el stock y que el costo no vuelve al anterior).
  Después de cada acción se recarga la lista y el resumen (la compra puede cambiar de vista).
- **Nueva compra** (`NuevaCompra.tsx`): proveedor (un `<select>`; con uno solo viene elegido; sin ninguno, invita a
  cargarlo), buscador y lista de productos (reusa `GET /ventas/productos`) con `Contador` por variante y **un costo por
  producto** (vale para todos sus colores/talles; viene con el costo actual, vacío si no hay). Debajo del costo, el
  **comparador** ("Lo más barato que pagaste: X, Bs N"), pedido la primera vez que se elige el producto. El pie lleva
  los chips **Ya llegó** / **Ya la pagué**, nota detrás de "+ Agregar una nota", total y "Registrar compra" (desactivado
  mientras falte un costo válido, y lo dice). Misma **clave antidoble toque** que ventas (`useRef` con
  `crypto.randomUUID()`, solo se regenera tras un éxito). **"Ya llegó" = registrar en camino y después llamar a
  `/recibir`** (así el servidor devuelve los avisos de margen); si ese segundo paso falla, la compra queda guardada y la
  pantalla lo dice (se marca "Llegó" desde Compras). Éxito: "¡Compra registrada!" con avisos de margen y, si está en
  camino y el proveedor tiene WhatsApp, "Pedirle por WhatsApp" con lo pedido.
- El historial de stock muestra las anulaciones de compra ("Se anuló una compra: restaron N"). Textos de los avisos de
  margen en `paginas/compras/margen.ts` (el estado lo decide el servidor).
- Estilos nuevos mínimos: se reusan los de ventas (`.fila-venta`, `.fila-vender`, `.pie-venta`, `.venta-lista`).
- **Pendiente**: proveedor en "Llegaron más", fecha manual, pagos parciales.

## Calculadora de precio (M8, 2026-10-14)

`src/paginas/catalogo/CalculadoraPrecio.tsx`, debajo del formulario en **Editar producto** (no en producto nuevo: hace
falta el producto guardado). Reglas del backend en `../Hermes/docs/GUIA.md` ("Costeo y precio sugerido (M8)").

- Campos Material / Empaque / Mano de obra / Costo fijo y "Cuánto querés ganar (% del precio)" (1–90). Sin costeo, el
  costo que ya tenía el producto es el punto de partida (como Material). **La cuenta la hace el servidor**
  (`POST .../costeo/calcular`, con pausa de 300 ms mientras se escribe): no se duplica la fórmula en el front. Muestra
  "Te cuesta Bs X", **"Cobrá Bs Y"**, la ganancia con ese precio y la comparación con tu precio de hoy.
- **El precio no cambia solo**: "Usar este precio" lo escribe en el formulario de arriba (sin guardar; hay que tocar
  Guardar cambios). "Guardar costeo" deja tu costo en el total y **bloquea el campo "Tu costo"** del formulario ("Sale de
  tu costeo"); "Quitar costeo" lo libera conservando el último costo.
- **Trampa ya pisada (la encontró el e2e)**: `EditarProducto` remonta el formulario con una `key` para que arranque con
  lo nuevo; esa clave tiene que depender de lo que llega del servidor (`producto.costo`, si hay costeo), NO de un
  contador que sube antes de que lleguen los datos (remontaba con el producto viejo y el costo no se actualizaba). Usar
  "Usar este precio" o guardar el costeo remonta el formulario: lo que estuviera escrito sin guardar se pierde.
- **Pendiente**: la calculadora también en el producto nuevo, sugerido en la pantalla de aviso de margen de Compras.

## Inicio y gastos (M9, 2026-10-14)

Rutas `/` (Inicio) y `/gastos`. Reglas del backend en `../Hermes/docs/GUIA.md` ("Gastos e Inicio (M9)").

- **Inicio** (`paginas/panel/Inicio.tsx`): pide `GET /inicio` con el mes de quien mira (`util/periodo.ts`, `rangoDelMes`).
  Tarjeta oscura "En octubre vendiste Bs X" (ventas, unidades, "Ganaste Bs Y", aviso ámbar de unidades sin costo),
  **medidor de gastos** ("Gastaste Bs X y ya cubriste el N %": barra de progreso con `role="progressbar"`, ámbar y verde
  al llegar a 100; sin gastos explica qué hacer), **Para atender** (los productos para reponer con enlace a
  `/stock?vista=areponer`, y lo que se debe / está en camino con enlace a Compras) y **Lo último que pasó** (ventas,
  compras y gastos mezclados, cada uno lleva a su pantalla). Accesos: Nueva venta y "Anotar un gasto". **Una tienda sin
  actividad (nada vendido, nada reciente, sin gastos) ve los primeros pasos en vez de ceros.** Todo viene del servidor:
  el front no calcula nada (ni el porcentaje).
- **Gastos** (`paginas/gastos/Gastos.tsx`): total del mes en la tarjeta oscura, lista del mes (paginada), "Nuevo gasto" en
  hoja (concepto con sugerencias Alquiler / Luz / Agua…, monto, fecha opcional que por defecto es hoy; hoy se manda sin
  fecha y un día pasado al mediodía de ESE día) y **Anular** con confirmación. `?nuevo=1` abre el formulario directo (lo
  usa "Anotar un gasto" del Inicio) y se limpia de la dirección. La clave antidoble toque se genera al abrir la hoja.
- **"¡Venta registrada!"** ahora dice "Este mes ya cubriste el X % de tus gastos" (se pide después de vender, para que
  cuente esa venta; solo si hay gastos).
- Entrada "Gastos" en el menú lateral (no en la barra del celular) y en `secciones.ts`.
- **Pendiente**: editar un gasto, categorías de gasto, mes anterior / otros períodos en el Inicio.

## Tienda en internet (M10, 2026-10-14)

La tienda pública **no vive en este repo**: es un sitio renderizado en el servidor (`../Hermes/src/Hermes.Public`, Razor
Pages) para que el enlace compartido por WhatsApp tenga vista previa con foto. Acá solo está el panel que la configura.

- **Mi tienda, rediseñada como el mockup (2026-10-16)**, de arriba a abajo:
  1. Cabecera con **Ver como cliente** (otra pestaña, `noopener`).
  2. **`TarjetaEnlace`**: tarjeta oscura con el **código QR** (librería `qrcode`, dibujado en el navegador, PNG de 640 px que
     se baja con **Descargar QR** como `qr-{slug}.png`), el enlace (`util/tienda.ts`: `VITE_TIENDA_URL`, por defecto
     `http://localhost:5014`, sin el `http://`), **Copiar enlace** (si el navegador no deja copiar, explica cómo) y
     **Compartir por WhatsApp**.
  3. **Cómo se ve**: nombre y WhatsApp en dos columnas (el aviso del WhatsApp solo aparece si es inválido, para que las columnas
     queden parejas), descripción de una línea, logo y color. **Personalizar colores y diseño** baja a la sección de abajo.
  4. **`VistaPreviaTienda`**: miniatura de la tienda pública REAL (mismos colores que `Hermes.Public/Tema.cs`, copiados en
     `util/color.ts → paletaDeFondo`) dentro de un marco de navegador. Cambia al instante con lo que se escribe (nombre,
     descripción, color, logo, sin guardar) y con los interruptores (precios, disponibilidad, WhatsApp, fondo); usa los
     primeros productos visibles de verdad. Si se cambia el diseño de la tienda pública, cambiar también esta miniatura.
  5. Botón negro **Guardar cambios** (+ "Descartar los cambios").
  6. **"Diseño y lo que ven tus clientes"** (`TiendaEnInternet.tsx`, id `diseno`): **Tienda publicada**, "Qué ven tus
     clientes" (**Mostrar los precios**, **Mostrar si hay o si está agotado**, **Pedidos por WhatsApp**) y el **Fondo**
     (Claro / Crema / Oscuro). `MiTienda` carga la configuración y se la pasa (`config` / `alCambiarConfig`): la vista previa
     la lee de ahí.
  El mockup original muestra el encabezado de la tienda pública centrado y claro; la tienda pública real tiene la franja de
  color: la miniatura imita la REAL, no el dibujo del mockup.
- **Cada interruptor se guarda al tocarlo** (`PUT /api/v1/tienda/publica`, con aviso verde), no con un botón Guardar. El
  enlace se actualiza solo si se cambia la dirección.
- **Hasta 30 s de demora**: la tienda pública se cachea 30 s, así que lo que se cambia acá puede tardar eso en verse allá.
  En el e2e los `fetch` a `/public/...` llevan `cache: 'no-store'` (si no, el navegador reutiliza la respuesta).
- `/public` y `/archivos` pasan por el proxy de Vite hacia la API (ya estaban).
- **Pendiente**: vista previa embebida (hoy es un enlace), código QR, avisar cuántos clientes entraron.
- **Trampa de las pruebas**: un `msedge.exe` zombi de una corrida abortada sigue escuchando en el puerto de depuración 9333 y
  la siguiente corrida se conecta a él (ya con sesión iniciada: falla desde el primer paso). Cerrar los `msedge` con
  `remote-debugging-port=933x` antes de reintentar. `scripts/publico.mjs` (puerto 9334) prueba el sitio público en un
  navegador de verdad: `node scripts/publico.mjs <slug>`.

## Desde Instagram (M11, 2026-10-14)

Rutas `/instagram` y `/instagram/revisar/:id` (`src/paginas/instagram/`). Reglas del lector y de la bandeja en
`../Hermes/docs/GUIA.md` ("Lector de Instagram por reglas (M11)").

- **`Instagram.tsx`**: "Pegá una publicación" (textarea con contador 0/5000) con **Ver qué entendió** (`POST /instagram/leer`:
  muestra nombre, precio, antes costaba, colores, tallas, quedan, categoría y descripción, y lo que falta en rojo; **no guarda
  nada**; si se cambia el texto, el resultado viejo se va) y **Mandar a la bandeja** (`importar`). Una guía plegable explica el
  formato y tiene "Usar este ejemplo". Abajo, **Para revisar (N)**: cada producto con su precio ("Sin precio"), su hashtag y
  etiquetas "Falta el precio"; **Revisar** y **Descartar** (con confirmación). Un carrusel se ve como "Producto 1, 2, 3".
- **`RevisarBorrador.tsx`** reutiliza `FormularioProducto` con la prop `borrador`: arranca con lo entendido, elige la categoría si
  el hashtag coincide con una existente (sin tildes ni mayúsculas, `sinTildes`), y **al guardar publica DESDE la bandeja**
  (`POST /instagram/borradores/{id}/publicar` con "Quedan N") en vez de `POST /productos`. Arriba muestra lo que el lector no
  estuvo seguro, el texto original (plegable) y "Descartar este producto". La pantalla de éxito dice si se cargó el stock
  ("Cargamos las unidades…") o por qué no ("hay varias opciones…") y ofrece "Seguir con la bandeja". Abrir de nuevo un producto ya
  publicado o descartado lo explica en vez de dejar publicar otra vez (el servidor igual da 409).
- Las fotos se agregan en la revisión (el texto de Instagram no las trae).
- **Pendiente**: aviso en el Inicio con cuántos productos esperan en la bandeja; conexión con Instagram (M12).
- **Ojo en las pruebas**: la carrera intermitente de M4 ("Cannot read properties of undefined (reading 'value')" a las ~45
  verificaciones) era escribir antes de que el formulario terminara de cargar: ahora se espera el CAMPO, no solo la
  dirección. Regla para pasos nuevos: después de navegar, esperar `!!__campo('…')`. Y los textos con saltos de línea van con `JSON.stringify` dentro de
  `evaluar(...)` (un `\n` suelto rompe la cadena que se evalúa en la página).

## Conectar Instagram (M12, 2026-10-15)

Reglas en `../Hermes/docs/GUIA.md` ("Conexión con Instagram (M12)").

- **`ConexionInstagram`** (arriba de "Desde Instagram"): sin app de Meta en la plataforma dice que todavía no está activada;
  si no, "Conectar con Instagram" (pide `GET /instagram/conexion/url` y manda a Instagram con `window.location`), y conectada:
  @usuario, última revisión, **"Traer lo nuevo"** y "Desconectar"; si Meta revocó el permiso, "Volver a conectar".
- **`/instagram/conectado`** (`ConectadoInstagram.tsx`): adonde vuelve Instagram con `?code&state` (o `?error=access_denied`);
  manda el código al servidor UNA vez (StrictMode monta dos: `useRef`) y vuelve a `/instagram?conectada=1`.
- La bandeja muestra la miniatura y "Llegó de tu Instagram"; la revisión trae las fotos y el enlace a la publicación.
  **`FormularioProducto` cuenta las fotos del borrador como guardadas**: no las borra al salir sin publicar.
- e2e: si la API apunta al **Meta falso** (`../Hermes/scripts/meta_falso.py`, ver su encabezado) recorre todo con clics; si no,
  verifica el aviso de "todavía no está activada".

## Producción: PWA y legales (M14, 2026-10-14)

- **PWA instalable**: `public/manifest.webmanifest` (nombre = el lema, sin nombre de producto; atajos a Nueva venta y Pedidos),
  íconos `public/icono-*.png` y `apple-touch-icon.png` (la bolsa del favicon), y `public/sw.js`, registrado **solo en
  producción** (`main.tsx`). El SW guarda `/assets/*` (con hash) y la última página; **nunca** `/api` ni `/archivos`: los datos
  siempre son los de ahora. Verificado en Edge: instalable sin errores. El panel del navegador de la app de escritorio NO
  registra service workers (no sirve para probarlo). Cuando haya nombre, cambiarlo también en el manifiesto.
- **Términos y privacidad** (`paginas/legal/Legal.tsx`, `/terminos` y `/privacidad`, con o sin sesión): BORRADOR sin abogado. El
  registro dice "al crear tu cuenta aceptás…" con los dos enlaces.
- `public/robots.txt`: el panel no se indexa.
- **e2e más estable**: `recargar()` espera a que la página vieja se vaya (la carrera "reading 'value'" era leer la nueva a medio
  cargar después de `Page.reload`), las capturas reintentan si Windows tiene el archivo tomado (y si no, avisan sin fallar) y una
  excepción muestra la expresión que falló (`en: …`).
- En producción el panel se compila dentro de la imagen de Caddy (`../Hermes/deploy/Dockerfile.caddy`) con `VITE_API_URL=""`:
  la API está en el mismo dominio, bajo `/api`.

## Pedidos del carrito (2026-10-14)

Reglas en `../Hermes/docs/GUIA.md` ("Carrito y pedidos"). El carrito en sí está en el sitio público (`Hermes.Public`, `publico.js`),
no en este repo.

- **Pedidos** (`paginas/pedidos/Pedidos.tsx`, `/pedidos`, en el menú lateral con una **insignia** de pendientes): pestañas Por
  atender / Entregados / Cancelados (`?vista=`), lista con número, cliente, detalle, entrega, total y estado. El detalle (hoja)
  trae "Escribirle" (WhatsApp al cliente con un mensaje armado), entrega, nota, líneas y total; avisa si cambiaste precios
  desde el pedido (la venta se cobra al precio de hoy). Acciones: **Entregar y cobrar** (elige forma de pago → registra la
  venta), Confirmar (solo si es Nuevo) y Cancelar (motivo opcional).
- La insignia del menú (`Armazon`) pregunta `GET /pedidos/resumen` al cambiar de pantalla y cuando la pantalla de Pedidos
  dispara el evento `PEDIDOS_CAMBIARON` (`diseno/secciones.ts`).
- El Inicio muestra "Pedidos de tu tienda" en "Para atender", y una tienda con pedidos ya no ve los "primeros pasos".
- e2e: el cliente pide por el sitio público (fetch a :5014), el menú y el Inicio lo avisan, la dueña lo entrega con QR y la
  venta aparece en Ventas.

## Mi plan y Administración (M13, 2026-10-14)

Reglas en `../Hermes/docs/GUIA.md` ("Planes y panel admin (M13)").

- **Mi plan** (`paginas/plan/MiPlan.tsx`, `/mi-plan`, en el menú lateral): plan actual con vencimiento, medidores de uso
  (productos y espacio de fotos, `.medidor-lleno` en rojo al tope), aviso del pedido en revisión o del último rechazado (con el
  motivo), tarjetas de los planes de pago y "Mis pagos". "Pedir este plan" abre una hoja: meses (chips con el total), QR o
  transferencia, las instrucciones de pago (vienen del servidor) y la foto del comprobante con `SubirFoto comprobante`
  (sube con `?comprobante=true`: no cuenta en el espacio). Con un pedido pendiente los botones quedan desactivados.
- **Límite del plan (402)**: el mensaje del servidor nombra "Mi plan" y `Aviso` le agrega solo el enlace **Ver mi plan**
  (cualquier error que diga "Mi plan"): no hace falta tocar cada formulario.
- **Administración** (`paginas/admin/Admin.tsx`, `/admin`): solo si `usuario.esAdmin` (si no, vuelve al Inicio; el servidor
  igual exige el rol con 403). Pestañas Pagos (pendientes con comprobante, Aprobar / Rechazar con motivo), Tiendas (búsqueda,
  plan, vencimiento, uso, Cambiar plan con o sin vencimiento) y Planes (precio, límites vacíos = sin límite, se puede
  contratar). El enlace aparece al final del menú lateral, solo para administradores.
- `util/plan.ts`: `fechaLarga` y `limite` ("sin límite" / "150 productos").
- e2e: la dueña pasa al Gratis (vía API del admin), choca el límite en el formulario, pide Emprendedor 3 meses con
  comprobante, sale; entra el **administrador por la pantalla de ingreso** (credenciales de `../Hermes/scripts/admin.local.json`,
  las crea `e2e_planes.py`), aprueba y revisa Tiendas/Planes; vuelve la dueña y ya puede crear más. Ojo: el nombre y la
  dirección de la tienda de prueba cambian en la parte de Mi tienda, se leen de la API.

## Nombre del producto: SIN DEFINIR (2026-10-14, pedido del usuario)

"Hermes" es solo el nombre en clave del proyecto (repos, carpetas, código). **En la interfaz no
aparece ningún nombre** hasta que el usuario lo defina: ni en títulos, ni en textos, ni en
`index.html`, ni en el manifiesto PWA, ni en logos. Todo lo visible de la marca sale de
`src/marca.ts` (`marca.nombre` es `null` hasta entonces; usar `tituloDePagina()` para el `<title>`).
Cuando se elija el nombre, se cambia ahí y en ningún otro lado. El logo del prototipo (que dice
"hermes") **no se usa**: el menú muestra el nombre y las iniciales de la TIENDA del usuario.
La prueba e2e verifica que ningún texto visible diga "hermes".

## Diseño

- Fuente de la verdad visual: el prototipo navegable (lienzo de diseño, 31 pantallas, celular 390 y
  escritorio 1440; ver `../Hermes/docs/CONTEXTO.md`, sección 3).
- Tokens en `src/index.css`: fondo `#F6F5F1`, texto `#17181C`, acento verde `#0B7A57`, ámbar `#F2A33A`,
  bordes `#E6E4DE`, radios 12/16/20. Tipografías **Bricolage Grotesque** (títulos) y **DM Sans**
  (texto), por Google Fonts en `index.html`. El color de cada TIENDA (por defecto mostaza `#F2A33A`) es
  independiente del verde de la app.
- Navegación: celular = barra inferior (Inicio, Catálogo, **+ venta** al centro, Stock, Mi tienda);
  escritorio = menú lateral con todas las secciones (`diseno/secciones.ts`). Las dos están en el DOM
  y el CSS muestra una u otra.
- Secciones sin módulo hecho → `<EnConstruccion>` (cada una dice qué módulo del plan la construye).
  Al construir un módulo, su ruta pasa a tener página propia en `rutas.tsx`.
- Accesible: etiquetas reales (`Campo`), objetivos táctiles ≥ 44 px, `aria-current` en el menú,
  errores en `role="alert"`, campos a 16 px (evita el zoom de iOS).
- Interfaz en **español**, tono cercano ("Llegaron más", "Probá tu formato"). Sin números inventados:
  sin datos reales se muestran primeros pasos, no métricas de ejemplo.
- La tienda pública nunca muestra costo, margen ni stock exacto (solo disponible/agotado).

## Comandos

```bash
pnpm install
pnpm dev          # http://localhost:5173 (necesita la API en http://localhost:5013)
pnpm build
pnpm lint
pnpm api:tipos    # regenera src/api/esquema.d.ts desde la API corriendo
pnpm e2e          # prueba de punta a punta con Edge headless (API + pnpm dev corriendo)
```

`pnpm e2e` usa Edge por DevTools Protocol, sin dependencias. `__campo(etiqueta)` encuentra el campo con
`label.control` (sirve para etiquetas que envuelven al campo y para las que usan `for`). **Cuidado al editarlo**: todo el bloque de
ayudas (`helpers`) es un texto entre comillas invertidas, así que no pueden aparecer comillas invertidas
dentro (ni en comentarios). Una espera que devuelve un elemento del DOM nunca se cumple: devolver
booleano (`!!document.querySelector(...)`). Para comprobar que una foto se borró hay que saltarse la
caché del navegador (`fetch(url, { cache: 'reload' })`): se sirven con caché inmutable de un año. Crea una cuenta de prueba nueva en
`hermes_dev` en cada corrida y deja capturas en `../Hermes/docs/capturas/`. Correrla varias veces
seguidas puede chocar con el límite por IP del login (20/min): esperar un minuto.

## Estado

- 2026-10-14: esqueleto (Vite + React + TS, proxy, cliente tipado).
- 2026-10-14: **M1 hecho** — ruteo, bienvenida, registro (dirección de la tienda automática), ingresar,
  sesión con renovación automática, armazón celular/escritorio, Inicio con primeros pasos, Mi tienda
  (datos de la cuenta + cerrar sesión) y secciones en construcción. e2e: 17 verificaciones.
- 2026-10-14: **M3 hecho** — Mi tienda real: logo (subida de fotos), nombre, descripción, color, WhatsApp
  y cambio de dirección. e2e: 35 verificaciones (el script pasó a cubrir M1 + M3).
- 2026-10-14: **M4 hecho** — catálogo completo (lista con búsqueda, filtros y paginación; formulario con fotos,
  variantes y categorías; archivar). e2e: 56 verificaciones (M1 + M3 + M4).
- 2026-10-14: **M5 hecho** — pantalla de Stock (resumen, vistas, historial, Llegaron más, Corregir), interruptor de
  control de stock en el producto y "Quedan N" en el catálogo. e2e: 77 verificaciones (M1 + M3 + M4 + M5).
- 2026-10-14: **M6 hecho** — Nueva venta (venta rápida con pie de cobro, clave antidoble toque) e historial de ventas
  (Hoy / Semana / Mes, resumen, anular). e2e: 104 verificaciones (M1 + M3 + M4 + M5 + M6).
- 2026-10-14: **M7 hecho** — Proveedores (WhatsApp, últimos precios), Compras (resumen de deuda, llegó / pagada /
  anular, aviso de margen) y Nueva compra (costo por producto, comparador, "Ya llegó"). e2e: 128 verificaciones
  (M1 + M3 + M4 + M5 + M6 + M7).
- 2026-10-14: **M8 hecho** — Calculadora de precio en Editar producto (costeo, precio sugerido calculado por el servidor,
  "Usar este precio", costo bloqueado mientras hay costeo). e2e: 136 verificaciones (M1 + M3 a M8).
- 2026-10-14: **M9 hecho** — Inicio real (resumen del mes, medidor de gastos, para reponer, lo último que pasó), pantalla
  de Gastos y medidor en la venta registrada. e2e: 148 verificaciones (M1 + M3 a M9).
- 2026-10-14: **M10 hecho** — "Tu tienda en internet" en Mi tienda (enlace, qué ven tus clientes, fondo, publicar) y
  `scripts/publico.mjs` para el sitio público. e2e: 161 verificaciones (M1 + M3 a M10).
- 2026-10-14: **M11 hecho** — Desde Instagram (probá tu formato, bandeja de revisión, revisar y publicar, descartar). e2e: 177
  verificaciones (M1 + M3 a M11).
- 2026-10-14: **M13 hecho** — Mi plan (uso, pedir un plan con comprobante, mis pagos), enlace a Mi plan en los avisos de
  límite y panel de Administración (pagos, tiendas, planes) para el rol admin. e2e: ~190 verificaciones (M1 + M3 a M11 + M13).
  La primera carga de Vite en frío puede tardar más de 10 s: la primera espera del e2e tiene 60 s.
- 2026-10-14: **Pedidos del carrito** — pantalla Pedidos (entregar y cobrar, confirmar, cancelar), insignia en el menú y aviso
  en el Inicio. e2e: 194 verificaciones. `publico.mjs` ya no tiene el número de WhatsApp fijo (lo lee de la página).
- 2026-10-14: **M14 (front)** — PWA instalable, términos y privacidad, robots, e2e sin la carrera intermitente. e2e: 198
  verificaciones (también pasa con la API usando Row Level Security).
- 2026-10-15: **M12 (front)** — conectar la cuenta de Instagram, "Traer lo nuevo", fotos de Instagram en la bandeja y en la
  revisión. e2e: 200 verificaciones con el Meta falso.

- 2026-10-23: **Roles y permisos en el panel.** `sesion/permisos.ts` (códigos, los mismos del backend), `usePermisos().tiene('a|b')` en
  `sesion/contexto.ts`, `Seccion.permiso` en el menú, `RequierePermiso` en las rutas (y `rutaDeEntrada`: un vendedor sin Inicio abre
  Nueva venta). Pantallas **Equipo** y **Roles** (`paginas/equipo/`), **cambio de contraseña obligatorio** (`CambiarPassword`) y
  `SinAcceso`. Sin `costos.ver` no se muestran costos, márgenes ni ganancias (Catálogo, ficha, Stock, Ventas, Inicio).
- 2026-10-23: **Barra inferior del celular** con botón **Menú** que abre una hoja con todas las secciones, Apariencia y Cerrar sesión.
- 2026-10-23: **"Desde Instagram" en construcción**: `INSTAGRAM_LISTO = false` en `diseno/secciones.ts` (rutas, banner del Inicio y
  textos de la bienvenida apagados). Poner `true` cuando haya app de Meta.
- Pendiente del front: actualizar los e2e (`scripts/*.mjs`) a los permisos, la barra móvil y el Instagram oculto; poner el nombre
  "Mi Casero"; primera tanda de mejoras de la tienda pública (vive en el backend, `Hermes.Public`). Ver `Hermes/docs/GUIA.md`.