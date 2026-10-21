# Decisiones de arquitectura

Registro de las decisiones que tomamos en la Entrega 2 y en el MVP del backend,
y de su porqué. Cada una
dice qué se decidió, por qué y qué alternativa se descartó. Si una decisión
cambia en una entrega posterior, no se borra: se marca como reemplazada y se
agrega la nueva.

Contexto: Apparchar ya tiene una primera versión funcionando en
[apparchar.sbs](https://apparchar.sbs) (Node.js, Firebase y Mercado Pago). Este
repositorio es la versión del curso: se vuelve a especificar el núcleo del
producto «contrato primero», con PostgreSQL, y se implementará en las Entregas
3 y 4. El código de esa primera versión no hace parte del repositorio.

## D-01 · Contrato primero y un solo vocabulario

- **Decisión.** El modelo de datos ([`modelo-datos.md`](modelo-datos.md)) es la
  fuente de verdad. El contrato ([`api/openapi.yaml`](../api/openapi.yaml)), los
  datos de ejemplo y los formularios usan exactamente los mismos nombres de
  atributo, en español y `snake_case`.
- **Por qué.** La incoherencia entre el contrato y el modelo es el error más
  frecuente de esta entrega. Con un solo vocabulario, lo que el formulario llama
  `comprador_correo` es lo que viaja en la API y lo que se guarda en la tabla.
- **Cómo se garantiza.** `npm run verificar` compara los cuatro artefactos
  (nombres, tipos, longitudes, enumeraciones, nulabilidad y campos de los
  formularios) y falla si alguno se desvía.
- **Descartado.** Nombres en inglés en el código y español en la interfaz:
  obliga a traducir en cada capa y es donde nacen las diferencias.
- **Parámetros y operaciones.** Los parámetros de ruta también van en
  `snake_case` (`/eventos/{evento_id}`). Los `operationId` (`crearEvento`) van en
  camelCase porque son identificadores de código que los generadores de clientes
  convierten en funciones; no son nombres de datos.

## D-02 · PostgreSQL y no MongoDB

- **Decisión.** PostgreSQL 17.
- **Por qué.** Vender boletas es manejar inventario: dos personas no pueden
  quedarse con el último cupo. PostgreSQL lo garantiza en la base con
  transacciones y restricciones (`CHECK cantidad_vendida <= cantidad_total`, un
  índice único que impide dos ingresos con la misma boleta, claves foráneas). El
  dominio es relacional y los reportes de ventas por evento son consultas SQL.
- **Descartado.** MongoDB: habría que reimplementar en el código la integridad
  entre colecciones (órdenes, boletas, tipos) y las restricciones de cupo.
- **Evidencia.** El DDL de `modelo-datos.md` se probó en PostgreSQL 17 con 44
  casos (sobreventa, doble ingreso, boletas de un tipo no comprado, pagos
  repetidos, estados incoherentes, datos inválidos y la búsqueda sin tildes): ver
  [`evidencias/modelo-postgresql.txt`](evidencias/modelo-postgresql.txt). Se
  reproduce con `npm run probar:modelo` (paso 7 del README).

## D-03 · El cupo se reserva al crear la orden y expira a los 15 minutos

- **Decisión.** `POST /ordenes` crea la orden en `pendiente` y suma las unidades
  a `cantidad_vendida` en la misma transacción, con una actualización
  condicional que falla si no hay cupo (409 `cupo_insuficiente`). Si el pago no
  se confirma antes de `expira_en`, la orden pasa a `expirada` y el cupo se
  libera.
- **Por qué.** Si el cupo se descuenta solo cuando el pago se confirma, dos
  personas pueden pagar al mismo tiempo el último cupo y el evento queda
  sobrevendido. Reservar primero traslada el conflicto al momento de la compra,
  donde todavía se puede decir «ya no hay».
- **Costo.** Una orden abandonada bloquea el cupo 15 minutos. Es aceptable para
  eventos de 50 a 2.000 personas y el valor queda configurable
  (`ORDEN_MINUTOS_RESERVA`).
- **Abuso.** Un bot podría crear órdenes pendientes para bloquear el aforo. Lo
  frenan `maximo_por_orden` (de 1 a 20) y, en la Entrega 3, un límite de órdenes
  pendientes por correo y por IP (429 del servidor, fuera del contrato de
  negocio).
- **Por qué un contador y no una suma.** `cantidad_vendida` se guarda en vez de
  calcularse con `SUM(item_orden.cantidad)` porque la reserva tiene que ser una
  sola actualización condicional y atómica sobre una fila. El contador se mueve
  en la misma transacción que crea, expira o reembolsa la orden. Si alguna vez se
  descuadra, se reconcilia con la suma de los ítems de órdenes `pendiente` y
  `pagada`.

## D-04 · Identificadores uuid, no consecutivos

- **Decisión.** Todas las claves primarias son `uuid` generados por la base.
- **Por qué.** La compra se hace sin crear cuenta: el enlace de la orden
  (`/ordenes/{orden_id}`) es la forma de volver a ella. Con números consecutivos
  cualquiera podría recorrer las compras de otros cambiando un número. Con uuid
  no se pueden adivinar.
- **Descartado.** `serial`: más corto, pero enumerable.

## D-05 · Código de boleta aleatorio de 12 caracteres

- **Decisión.** Cada boleta tiene un `codigo` como `956T-X8KV-CHV3`: 12
  caracteres aleatorios de un alfabeto sin letras ni números ambiguos (sin I, L,
  O, 0 ni 1). Es lo que codifica el QR y lo que el portero digita si la cámara
  falla. La API lo valida contra la base.
- **Por qué.** Unos 59 bits de azar lo hacen imposible de adivinar, y un humano
  lo puede leer en voz alta en una puerta ruidosa sin confundir la O con el 0.
- **Descartado para esta etapa.** Un QR con un token firmado (JWT), que
  permitiría validar sin conexión a internet: requiere manejar claves y
  rotación. Queda como mejora para cuando se implemente el modo sin conexión del
  escáner.

## D-06 · Una boleta rechazada en la puerta responde 201, no 409

- **Decisión.** `POST /eventos/{evento_id}/validaciones` responde `201` siempre
  que registra una lectura, aceptada o rechazada. El resultado viaja en el
  cuerpo (`resultado` y `motivo`).
- **Por qué.** Cada lectura es un registro de auditoría que sí se crea: quién
  intentó entrar, con qué código, por qué puerta y a qué hora. «La boleta ya se
  usó» es una respuesta del negocio que el portero necesita ver, no una falla de
  la petición. Los códigos de error HTTP quedan para peticiones mal formadas
  (400), sin permiso (401 y 403), sobre un evento que no existe (404) o cuando la
  puerta del evento no está abierta (409 `evento_no_activo`). La respuesta no
  trae `Location`: la lectura se consulta en `GET /eventos/{evento_id}/validaciones`.

## D-07 · 400, 409 y 422 significan cosas distintas

- **400** `solicitud_invalida`: la petición no cumple el esquema (JSON mal
  formado, tipo equivocado, obligatorio faltante, parámetro inválido) o se
  contradice a sí misma (dos tipos de boleta con el mismo nombre en la misma
  petición, o un tipo repetido en los `items` de una orden). Se detecta sin
  consultar la base.
- **422**: los datos enviados están bien formados pero rompen una regla del
  negocio, y se corrige cambiando esos datos: fin antes del inicio, cupos que
  superan el aforo, precio en un evento gratuito, más boletas que el máximo por
  compra, evento para mayores de edad sin cédula.
- **409**: la petición choca con el estado actual de un recurso en el
  servidor. El problema no está en los datos enviados sino en algo que ya pasó o
  ya existe allá, y hay que cambiar ese estado o esperar. Ejemplos: correo ya
  registrado, cupo agotado, versión desactualizada, venta cerrada, evento no
  publicado, puerta todavía cerrada, orden que ya no está pendiente, transición
  de estado no permitida, borrador sin tipos de boleta, referencia de pago ya
  usada.
- **Por qué.** El frontend reacciona distinto a cada caso. Con 400 y 422 marca
  los campos del formulario que hay que corregir. Con 409 explica qué pasó y
  ofrece otra salida (recargar, elegir otro tipo de boleta, volver más tarde).

## D-08 · Un solo formato de error

- **Decisión.** Toda respuesta de error usa el esquema `Error`:
  `{ "codigo": "aforo_excedido", "mensaje": "Los cupos suman 350 y el aforo es 300.", "detalles": [{ "campo": "tipos_boleta", "problema": "…" }] }`.
- **Por qué.** `codigo` es estable y el frontend decide con él; `mensaje` se
  puede mostrar tal cual; `detalles` permite marcar cada campo del formulario.
- **Descartado.** El estándar RFC 9457 (Problem Details): sus campos están en
  inglés (`type`, `title`, `detail`) y mezclaría idiomas en el contrato.

## D-09 · Dinero en pesos enteros y fechas con zona horaria

- **Decisión.** Los montos son enteros en pesos colombianos con el sufijo `_cop`
  (`precio_cop`, `total_cop`). Las fechas son `timestamptz`: se guardan en UTC,
  viajan en ISO 8601 con desfase (`2026-10-03T21:00:00-05:00`) y se muestran en
  hora de Colombia.
- **Por qué.** El peso no usa centavos en la práctica, así que un entero evita
  errores de redondeo. Poner la unidad en el nombre sigue la convención del
  enunciado (`nivel_m`). Un evento que termina a las 2:00 a. m. del día
  siguiente se guarda sin ambigüedad.

## D-10 · Bloqueo optimista del evento con `version`

- **Decisión.** `evento.version` sube en cada cambio. `PATCH /eventos/{evento_id}`
  exige la versión que leyó el cliente; si alguien guardó antes, responde 409
  `conflicto_de_version`.
- **Por qué.** Un colectivo puede tener a dos personas editando el mismo evento.
  Sin la versión, el último en guardar borra en silencio el cambio del otro.
- **Por qué no en `tipo_boleta`.** Lo que de verdad no se puede pisar en un tipo
  de boleta es `cantidad_vendida`, y esa la cambian las compras con una
  actualización condicional atómica (D-03), no el organizador. El precio de cada
  compra queda congelado en `item_orden`. Una edición simultánea del nombre o del
  precio de un tipo es rara y no pierde ventas, así que no justifica exigir la
  versión en cada cambio.

## D-11 · Relaciones de composición anidadas en el contrato

- **Decisión.** `Evento` trae su `organizador` (la parte pública) y sus
  `tipos_boleta`, y `Orden` trae sus `items`.
  `POST /eventos` puede recibir el evento con sus tipos de boleta en una sola
  petición (y después se agregan más con `POST /eventos/{evento_id}/tipos-boleta`);
  para publicarlo hace falta al menos uno.
- **Por qué.** Un evento sin tipos de boleta no se puede vender, así que se crean
  juntos en una transacción. La cartelera necesita el precio mínimo de cada
  evento: si los tipos vinieran aparte, serían 13 peticiones en vez de una.
- **Cómo se documenta.** Esas propiedades llevan `x-relacion` en el contrato y
  el verificador las trata como relaciones, no como columnas.

## D-12 · Compra sin cuenta y autorización de datos personales

- **Decisión.** Para comprar solo se piden nombre, correo, celular y, en eventos
  con edad mínima, cédula. Se exige `autoriza_tratamiento_datos = true`.
- **Por qué.** Pedir registro antes de pagar hace que la gente abandone la
  compra. La Ley 1581 de 2012 exige autorización previa y expresa para tratar
  datos personales; la base no acepta una orden sin ella (`CHECK`).
- **Edad mínima.** La cédula de la orden es la de quien compra. La edad de cada
  asistente la verifica el portero con el documento físico en la puerta, como
  hoy en cualquier bar. Pedir la cédula de cada acompañante al comprar agregaría
  fricción y datos personales que la plataforma no necesita guardar.

## D-13 · Autenticación declarada ahora, implementada en la Entrega 3

> **Reemplazada en parte por D-23** (MVP del backend): el token lo emite el propio
> backend con correo y clave, en lugar de un proveedor OpenID Connect. Lo demás
> de esta decisión sigue vigente.

- **Decisión.** El contrato marca con `bearerAuth` (token JWT) las operaciones
  del organizador; las de la persona compradora son públicas (`security: []`).
  `obtenerEvento` y `obtenerTipoBoleta` aceptan un token opcional
  (`security: [{}, {bearerAuth: []}]`): sin token son públicas y con el del dueño
  muestran también sus borradores. La confirmación del pago exige la clave de la
  pasarela (`X-Clave-Pasarela`), porque nunca la llama el navegador del
  comprador. El servidor simulado solo exige que la cabecera exista.
- **Por qué.** El enunciado deja la autenticación funcional para la Entrega 3,
  pero el contrato ya debe decir qué está protegido para que el frontend y el
  backend lo esperen desde el principio.
- **Quién valida en la puerta.** En esta versión, el organizador dueño del
  evento: el celular de la puerta usa su sesión y cada persona escribe su nombre
  en `validada_por`. Así no hace falta una entidad «portero» para el núcleo del
  producto. Los porteros con cuenta propia, asignados por evento, quedan para
  una entrega posterior.
- **Propuesta para la Entrega 3.** Delegar el inicio de sesión en un proveedor
  OpenID Connect (Google, como la versión en producción). El token trae `sub` y
  el `email` verificado; el backend resuelve al organizador por ese correo
  (`organizador.correo` es único). Así la aplicación no guarda contraseñas. Si
  el correo no está verificado o no es de ningún organizador, la API responde
  401 y el frontend ofrece registrarse.

## D-14 · Prototipo en HTML, CSS y JavaScript, sin frameworks

- **Decisión.** Cuatro páginas estáticas, un solo `css/estilos.css` con todas las
  variables en `:root`, un solo `js/app.js` y los datos en
  `datos/ejemplo.json`, con la misma forma que las respuestas de la API.
- **Por qué.** Es lo que pide el enunciado y es la forma más directa de probar
  navegación, accesibilidad y estados antes de tener backend. Como los datos
  tienen la forma del contrato, en la Entrega 3 basta con cambiar la URL del
  `fetch` por la de la API.
- **Consecuencia.** `fetch` no funciona si el HTML se abre con doble clic
  (`file://`). El README indica cómo servirlo en local y, si pasa, la página
  muestra el estado de error con esa explicación.

## D-15 · La accesibilidad es un requisito, no un retoque

- **Decisión.** Meta WCAG 2.2 AA: HTML semántico con un `h1` por página, enlace
  para saltar al contenido, `label for` en cada campo, errores con texto e ícono
  enlazados con `aria-describedby`, resumen de errores que recibe el foco, foco
  visible de 3 px, objetivos táctiles de 44 px y contraste AA (el ámbar de la
  marca se usa como fondo con texto oscuro, nunca como texto sobre blanco).
- **Cómo se verifica.** Lighthouse (100 en las 16 corridas), axe-core (0
  violaciones) y recorridos automáticos con teclado a 360 px, en escritorio y con
  zoom al 200 %. Las capturas están en [`evidencias/`](evidencias/README.md).

## D-16 · Estados de carga, vacío y error en cada pantalla

- **Decisión.** Cada pantalla que depende de datos tiene los tres estados, y
  `?simular=cargando|vacio|error` los muestra a propósito. Los enlaces están en el
  pie de todas las páginas.
- **Por qué.** Una interfaz que solo contempla el camino feliz está sin terminar,
  y en la sustentación hay que mostrar un estado de error o vacío en vivo.

## D-17 · Dónde se publica el prototipo

- **Decisión.** GitHub Pages, publicando la carpeta `web/` de `main` con la
  acción [`.github/workflows/pages.yml`](../.github/workflows/pages.yml).
- **Por qué.** Es gratuito, sirve archivos estáticos y queda atado al
  repositorio. GitHub Pages solo deja elegir la raíz o `/docs` como carpeta de
  una rama; para publicar `web/` sin mover archivos hay que usar la fuente
  «GitHub Actions».
- **Consecuencia.** Todas las rutas son relativas (`css/estilos.css`,
  `detalle.html?evento=…`), así que el prototipo funciona bajo
  `https://<usuario>.github.io/<repositorio>/`, en local y en cualquier
  subcarpeta. Cada página muestra el aviso «Prototipo académico: aquí no se
  venden boletas reales» y lleva `noindex`, porque los eventos son de ejemplo.

## D-18 · Datos de ejemplo verosímiles sin datos personales reales

- **Decisión.** Municipios reales de Casanare, magnitudes reales (aforos de 25 a
  2.500 personas, boletas de $12.000 a $185.000) y horarios de la región (una
  carrera nocturna para evitar el calor, un taller de aves al amanecer en
  temporada seca). Los organizadores, lugares y eventos son ficticios. Los
  correos usan el dominio reservado `example.com` (RFC 2606) y los teléfonos son
  ficticios.
- **Por qué.** Los datos realistas revelan problemas del modelo que los
  inventados esconden (un evento que termina a las 2:00 a. m., un tipo de boleta
  gratuito dentro de un evento pago, una cédula obligatoria solo en eventos para
  mayores de edad). Publicar correos o teléfonos de personas reales en un
  repositorio público no es aceptable.
- **Alcance de la muestra.** `ejemplo.json` trae las órdenes y boletas completas
  de un evento, el taller de aves: sus 16 boletas cuadran con su
  `cantidad_vendida` y alimentan la pantalla de la puerta. En los demás eventos,
  `cantidad_vendida` resume ventas cuyas órdenes no se incluyen, para que el
  archivo del prototipo siga siendo liviano.

## D-19 · Municipio como dominio cerrado

- **Decisión.** `municipio` es un dominio con los 19 municipios de Casanare
  (`municipio_casanare`), con su nombre oficial y sus tildes.
- **Por qué.** Es un filtro de la cartelera. Como texto libre, «yopal», «YOPAL» y
  «Yopall» serían tres municipios distintos y esos eventos no saldrían al filtrar
  por Yopal. El piloto es Casanare; abrir otro departamento es agregar valores al
  dominio (`ALTER TYPE … ADD VALUE`) o pasar a una tabla con los códigos DANE.
- **ENUM o tabla de catálogo.** Los 9 dominios del modelo son listas cortas que
  cambian poco y que el código usa en reglas (estados, motivos, medios de pago).
  El `ENUM` los valida en la base sin otra tabla ni otra unión. Agregar un valor
  es inmediato; quitar uno exige una migración. Si un dominio empieza a cambiar
  seguido o necesita más datos (el código DANE del municipio, la comisión de un
  medio de pago), se vuelve tabla.

## D-20 · Cómo se confirma un pago

- **Decisión.** `POST /ordenes/{orden_id}/pago` exige la clave de la pasarela
  (`X-Clave-Pasarela`) y recibe la `referencia_pago` de la transacción. La
  referencia es única, así que la misma transacción no puede confirmar dos
  órdenes.
- **Por qué.** El enlace de la orden es público para su comprador (D-04). Si la
  confirmación también lo fuera, cualquiera podría marcar su orden como pagada
  sin pagar. En la Entrega 3 la llama un simulador de pasarela del lado del
  servidor; en producción la reemplaza la notificación firmada de Mercado Pago.

## D-21 · Lo que queda fuera de alcance

- **Decisión.** El contrato cubre seis recursos y veinte operaciones:
  organizadores, eventos, tipos de boleta, órdenes, boletas y validaciones.
  Quedan fuera los códigos promocionales, la taquilla presencial, las
  transferencias de boletas, los reembolsos a solicitud del comprador (la
  política de reembolso se informa, pero el reembolso lo gestiona el
  organizador), las liquidaciones a organizadores, las suscripciones y el
  escáner sin conexión, que sí existen en la versión en producción.
- **Por qué.** En la Entrega 3 se implementa exactamente lo que diga el contrato.
  Es mejor un núcleo completo y bien probado (publicar, vender sin sobreventa,
  validar en la puerta) que un contrato grande a medio implementar.

## D-22 · De la base NoSQL de la primera versión a PostgreSQL

- **Contexto.** La primera versión de Apparchar usa Firebase Realtime Database,
  una base NoSQL que guarda todo como un árbol JSON: los tipos de boleta van
  dentro del evento, los ítems dentro de la orden y los usos dentro de la
  boleta.
- **Decisión.** El modelo del curso no copia ese árbol: lo traduce a las siete
  tablas de PostgreSQL, nodo por nodo. La tabla de equivalencias está en el §12
  de [`modelo-datos.md`](modelo-datos.md).
- **Por qué.** En el árbol, las reglas de seguridad pueden validar un campo,
  pero no hay claves foráneas ni índices únicos, y una transacción condicional
  cubre un solo nodo. Por eso el cupo, el ingreso único y la coherencia entre
  las copias de un mismo dato (el correo del comprador está en la orden y en
  cada boleta) dependen de que el código no se equivoque. En PostgreSQL esas
  reglas las garantiza la base (D-02, D-03 y §8 del modelo).
- **Descartado.** Seguir en Firebase para el curso, porque el enunciado pide
  PostgreSQL o MongoDB. MongoDB sería la traducción directa del árbol (cada
  nodo raíz, una colección), pero tendría el mismo problema (D-02).
- **Qué se conserva.** Los conceptos del producto (evento, tipo de boleta,
  orden, boleta y lectura en la puerta) y los datos que se le piden al
  comprador. Las reglas que cambian tienen su propia decisión, como la reserva
  de cupo (D-03).

## D-23 · Inicio de sesión propio con JWT (reemplaza la propuesta de D-13)

- **Decisión.** El backend emite sus propios tokens. El organizador se registra
  con una `clave` (8 a 72 caracteres) que se guarda como hash bcrypt en
  `organizador.clave_hash` (costo 10, nunca en claro y nunca en una respuesta) y
  la cambia por un token en `POST /sesiones` (`iniciarSesion`). El token es un JWT
  firmado con HS256 y la clave secreta `JWT_SECRETO` del servidor, con `sub` = id
  del organizador, emisor `apparchar` y vencimiento a las 8 horas. Las rutas
  protegidas responden 401 `no_autenticado` si falta, si venció, si tiene otra
  firma o si la cuenta ya no existe. Un correo inexistente y una clave equivocada
  responden igual (401 `credenciales_invalidas`) y tardan lo mismo, para no
  revelar qué correos están registrados, y cada dirección IP tiene 20 intentos
  cada 15 minutos (429 `demasiados_intentos`).
- **Por qué.** El MVP exige un inicio de sesión seguro que se pueda demostrar en
  vivo sin depender de credenciales de Google ni de internet. OpenID Connect
  sigue siendo el camino para producción: el resto del backend solo usa
  `req.organizador`, así que cambiar quién emite el token toca un solo archivo
  (`servidor/comun/autenticacion.js`).
- **También se agregó.** Con la cuenta llegan las operaciones que el MVP pide
  para un CRUD completo de organizadores: `actualizarOrganizador` (solo la propia
  cuenta; 403 con otro token) y `eliminarOrganizador` (solo si no tiene eventos:
  409 `organizador_con_eventos`).
- **Descartado.** Sesiones con cookie: obligan a manejar CSRF y la API la
  consumen también Swagger UI, Postman y el celular de la puerta, donde un token
  en la cabecera es más simple.

## D-24 · El servidor valida contra el mismo contrato que publica

- **Decisión.** Cada ruta declara su `operationId` (`validar('crearEvento')`) y un
  middleware revisa con Ajv los parámetros de la ruta, los de consulta y el cuerpo
  contra los esquemas de `api/openapi.yaml` antes de tocar la base. Si algo no
  cumple responde 400 `solicitud_invalida`, con un detalle en español por campo.
  Las reglas que necesitan la base (cupos, estados, dueños, fechas contra el
  evento) las revisa cada servicio y responden 409 o 422 según D-07. Las pruebas
  automáticas, además, validan cada respuesta contra el contrato.
- **Por qué.** Así el contrato es la única fuente de verdad: no hay una segunda
  copia de las reglas que se pueda desviar, y lo que muestra Swagger UI en `/docs`
  es exactamente lo que el servidor acepta y responde.
- **Descartado.** Validar a mano con `if` en cada ruta o con otra librería de
  esquemas (Joi, Zod): duplicaría las reglas que ya están en el contrato.

## D-25 · PostgreSQL real o PGlite, con el mismo esquema

- **Decisión.** Con `DATABASE_URL` el backend se conecta a un PostgreSQL real
  (librería `pg`). Sin ella usa PGlite, el mismo motor PostgreSQL compilado a
  WebAssembly, que corre dentro de Node y guarda la base en `.datos/pglite`. Las
  pruebas usan PGlite en memoria, con una base nueva por archivo. En los dos casos
  el esquema es el DDL de `docs/modelo-datos.md` (§11), copiado en
  `servidor/db/esquema.sql` y comprobado por una prueba.
- **Por qué.** La demostración en vivo y las pruebas tienen que correr en
  cualquier computador del equipo sin instalar PostgreSQL ni Docker, y sin
  cambiar una línea de SQL: las restricciones `CHECK`, los índices únicos
  parciales y los disparadores del modelo funcionan igual en los dos motores.
- **Descartado.** SQLite: no tiene tipos `ENUM`, `timestamptz`, índices de
  trigramas ni las mismas restricciones, así que habría que mantener otro
  esquema.

## D-26 · Una orden pendiente se corrige o se anula; una pagada, no

- **Decisión.** Se agregan `actualizarOrden` (`PATCH /ordenes/{orden_id}`), para
  que el comprador corrija su nombre, correo, celular, cédula o medio de pago, y
  `eliminarOrden` (`DELETE /ordenes/{orden_id}`), para que anule la compra antes
  de pagar: la orden se borra con sus ítems y el cupo vuelve a estar disponible
  en ese momento. Las dos solo aplican a órdenes `pendiente`: una pagada responde
  409 `orden_no_pendiente` y una vencida, 409 `orden_expirada`. Son públicas por
  la misma razón que `obtenerOrden`: el UUID de la orden es el enlace privado de
  la compra (D-04).
- **Por qué.** El MVP pide crear, leer, actualizar y eliminar en cuatro tablas
  (organizador, evento, tipo de boleta y orden). En una orden pendiente todavía
  no hay dinero ni boletas, así que no es registro contable: corregir un correo
  mal escrito evita que las boletas lleguen a otra persona, y anular libera el
  cupo sin esperar los 15 minutos de la reserva (D-03). Una orden pagada sigue
  siendo inmutable: los reembolsos los hace el sistema al cancelar el evento.
- **Alcance del contrato.** Con D-23 y esta decisión, la API pasa de 20 a 25
  operaciones: `iniciarSesion`, `actualizarOrganizador`, `eliminarOrganizador`,
  `actualizarOrden` y `eliminarOrden`. Boletas y validaciones siguen siendo de
  solo lectura y de solo agregar, como dice D-06.
- **Descartado.** Un estado `cancelada` para las órdenes anuladas: obligaría a
  cambiar el dominio `estado_orden` y sus `CHECK`, y una compra que nunca se pagó
  no necesita quedar en el historial.
