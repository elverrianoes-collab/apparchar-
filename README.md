# Plataforma Apparchar

Plataforma web para que organizadores de eventos de Casanare vendan boletas con
código QR y controlen el aforo en la puerta. Este repositorio contiene el
**backend del MVP** (API REST con Node.js, Express y PostgreSQL), su contrato
OpenAPI 3.1, el modelo de datos y el prototipo web navegable.

**Documentación de la API:** Swagger UI en <http://localhost:3000/docs> al correr `npm run api` ·
**Postman:** [`postman/apparchar-mvp.postman_collection.json`](postman/apparchar-mvp.postman_collection.json) ·
**Contrato:** [`api/openapi.yaml`](api/openapi.yaml) · **Modelo de datos:** [`docs/modelo-datos.md`](docs/modelo-datos.md) · **Versión:** 0.3.0 (MVP) ·
**Prototipo publicado:** <https://elverrianoes-collab.github.io/apparchar-/>

## Cumplimiento del MVP

| Requisito | Cómo se cumple |
|---|---|
| **CRUD sobre cuatro recursos** | Crear, leer, actualizar y eliminar en cuatro tablas: `organizador`, `evento`, `tipo_boleta` y `orden` (más boletas y validaciones en la puerta). Ver [Rutas de la API](#rutas-de-la-api). |
| **Autenticación** | Registro con clave guardada como hash bcrypt, inicio de sesión que entrega un JWT (HS256, 8 horas) y rutas protegidas con `Authorization: Bearer`: 401 sin token válido, 403 con el de otro organizador. Ver [Autenticación](#autenticación). |
| **Validación** | Cada petición se valida contra los esquemas del contrato antes de tocar la base (400 con detalle por campo) y cada servicio aplica las reglas del negocio (409 y 422). Ver [Validación y errores](#validación-y-errores). |
| **Documentación** | Swagger UI en `/docs`, generado del contrato OpenAPI 3.1, y una colección de Postman con 47 peticiones y 76 comprobaciones. |
| **Demostración funcional** | `npm run demo` arranca con datos de Casanare y sirve el [panel del organizador](#panel-del-organizador-conectado-a-la-api) en <http://localhost:3000/>: inicio de sesión, los cuatro CRUD y las pruebas de seguridad desde el navegador. [`docs/demo-mvp.md`](docs/demo-mvp.md) es el guion de la prueba en vivo y `npm test` corre las pruebas automáticas de toda la API. |

## El problema

Los organizadores de eventos de 50 a 2.000 personas en Casanare (bares, colectivos,
fundaciones, consejos estudiantiles) venden boletas en papel o por WhatsApp: no
saben cuántas quedan ni pueden detectar en la puerta una boleta falsa o repetida.

## Ruta y equipo

| Dato | Valor |
|---|---|
| Curso | Tecnologías Web 2026-B · Ingeniería de Sistemas · Unitrópico |
| Ruta de profundización | Electiva de profundización en Desarrollo Web (Tecnologías Web) |
| Equipo | Grupo 3 · «Los insanos» |
| Grupo del curso | G2 |
| Profesor | Juan Carlos Fonseca |

| Integrante | Rol en el MVP | Usuario de GitHub |
|---|---|---|
| Freddy Sneyder Cedeño Uva | Servidor base, autenticación con JWT y CRUD de organizadores (PR 1) | [@sneyderuva](https://github.com/sneyderuva) |
| Elver Riaño Díaz | CRUD de eventos y prototipo web (PR 2); dueño del repositorio | [@elverrianoes-collab](https://github.com/elverrianoes-collab) |
| Javier Alberto Gómez Wilches | CRUD de tipos de boleta, wireframes y evidencias (PR 3) | [@Wilcheszz](https://github.com/Wilcheszz) |
| Juan David Rivera Goyeneche | CRUD de órdenes, pago, validación en la puerta y demostración (PR 4) | [@JuanRivera-hub](https://github.com/JuanRivera-hub) |

La sustentación la presenta cualquiera de los integrantes; todos responden por el
contenido.

El MVP se integró a `main` en cuatro pull requests. Los commits de cada uno los
hizo su autor con su propia cuenta y todos pasaron la revisión automática:

| Pull request | Commits de | Aprobado por | Integrado por |
|---|---|---|---|
| [#1](https://github.com/elverrianoes-collab/apparchar-/pull/1) · Servidor base, autenticación con JWT y CRUD de organizadores | @sneyderuva | — | @elverrianoes-collab |
| [#2](https://github.com/elverrianoes-collab/apparchar-/pull/2) · CRUD de eventos y prototipo web | @elverrianoes-collab | @sneyderuva | @Wilcheszz |
| [#3](https://github.com/elverrianoes-collab/apparchar-/pull/3) · CRUD de tipos de boleta, wireframes y evidencias | @Wilcheszz | @sneyderuva | @sneyderuva |
| [#4](https://github.com/elverrianoes-collab/apparchar-/pull/4) · CRUD de órdenes, pago, boletas y validación en la puerta | @JuanRivera-hub | @sneyderuva | @sneyderuva |

## Cómo ejecutarlo

Requisitos: **Git** y **Node.js 20.19 o superior en la línea 20, o 22.12 o
superior** (con npm 10). Compruébalo con `node --version`. **No hace falta
instalar PostgreSQL ni Docker**: sin configuración, el backend usa PGlite, el
mismo PostgreSQL compilado a WebAssembly, y guarda la base en `.datos/pglite`
(decisión D-25). En Windows, copia los comandos en **Git Bash**.

1. Clona el repositorio e instala las dependencias con las versiones exactas del
   `package-lock.json`:
   ```bash
   git clone https://github.com/elverrianoes-collab/apparchar-.git
   cd apparchar-
   npm ci
   ```
2. Levanta el backend:
   ```bash
   npm run api
   ```
   La consola muestra `API de Apparchar escuchando en http://localhost:3000`. La
   primera vez crea las tablas.
3. Abre **<http://localhost:3000/>**: el panel del organizador, conectado a esta
   misma API (inicio de sesión y los cuatro CRUD desde el navegador). La
   documentación está en **<http://localhost:3000/docs>**: Swagger UI con todas las
   rutas, sus esquemas y ejemplos; con **Try it out** se prueban contra este mismo
   servidor.
4. Corre las pruebas automáticas (cada archivo arranca la API sobre una base en
   memoria, nueva y vacía):
   ```bash
   npm test
   ```
5. Para la demostración, `npm run demo` borra la base local (o, si hay
   `DATABASE_URL`, vacía las tablas de esa base), carga datos de ejemplo de
   Casanare (organizador `demo@apparchar.co`, clave `Apparchar2026`, un concierto
   que empieza en 3 horas, órdenes y boletas) y arranca el servidor. Antes, cierra
   cualquier otro servidor de Apparchar abierto. `npm run semilla` solo carga los
   datos (con el servidor apagado).

Opcional: copia `.env.example` como `.env` para cambiar el puerto, la clave
secreta de los tokens (`JWT_SECRETO`) o la clave de la pasarela. Para usar un
PostgreSQL real, define `DATABASE_URL`; por ejemplo, con Docker:

```bash
docker run --rm -d --name apparchar-pg -p 5433:5432 -e POSTGRES_PASSWORD=apparchar postgres:17
DATABASE_URL=postgres://postgres:apparchar@localhost:5433/postgres npm run api
```

## Autenticación

El organizador se registra, inicia sesión y envía el token en cada operación
protegida (decisión D-23):

```bash
# 1. Registrarse (la clave se guarda como hash bcrypt, nunca en claro)
curl -s -X POST http://localhost:3000/organizadores -H "Content-Type: application/json" \
  -d '{"nombre":"Colectivo Sabana Rock","correo":"sabanarock@ejemplo.co","telefono":"+573105550148","municipio":"Yopal","clave":"SabanaRock2026"}'

# 2. Iniciar sesión: devuelve un JWT (HS256) que vence a las 8 horas
curl -s -X POST http://localhost:3000/sesiones -H "Content-Type: application/json" \
  -d '{"correo":"sabanarock@ejemplo.co","clave":"SabanaRock2026"}'

# 3. Usar el token en una ruta protegida
curl -s -X PATCH http://localhost:3000/organizadores/<id> -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" -d '{"municipio":"Aguazul"}'
```

En Swagger UI, el botón **Authorize** guarda el token para todas las pruebas.
Sin token, o con uno vencido o falso, las rutas protegidas responden **401**;
con el token de otro organizador, **403**.

## Rutas de la API

| Recurso | Método y ruta | Operación | Token |
|---|---|---|---|
| Sesiones | `POST /sesiones` | Iniciar sesión | No |
| Organizadores | `POST /organizadores` | Crear (registrarse) | No |
| Organizadores | `GET /organizadores/{id}` | Leer el perfil público | No |
| Organizadores | `PATCH /organizadores/{id}` | Actualizar la propia cuenta | Sí |
| Organizadores | `DELETE /organizadores/{id}` | Eliminar la propia cuenta (sin eventos) | Sí |
| Eventos | `POST /eventos` | Crear (nace en borrador, con o sin tipos de boleta) | Sí |
| Eventos | `GET /eventos` | Leer la cartelera: filtros `q`, `municipio`, `categoria`, `desde`, `hasta`, `slug`, `orden` y paginación | No |
| Eventos | `GET /eventos/{id}` | Leer el detalle (el dueño también ve sus borradores) | Opcional |
| Eventos | `PATCH /eventos/{id}` | Actualizar: editar, publicar, pausar o cancelar, con `version` | Sí |
| Eventos | `DELETE /eventos/{id}` | Eliminar un borrador | Sí |
| Eventos | `GET /organizadores/{id}/eventos` | Leer «Mis eventos» (panel del organizador) | Sí |
| Tipos de boleta | `POST /eventos/{id}/tipos-boleta` | Crear una localidad (Preventa, General, VIP) | Sí |
| Tipos de boleta | `GET /tipos-boleta/{id}` | Leer precio, cupo, vendidas y ventana de venta | Opcional |
| Tipos de boleta | `PATCH /tipos-boleta/{id}` | Actualizar precio, cupo o ventana de venta | Sí |
| Tipos de boleta | `DELETE /tipos-boleta/{id}` | Eliminar un tipo que nunca se ha vendido | Sí |
| Órdenes | `POST /ordenes` | Crear una compra sin cuenta: reserva el cupo 15 minutos | No |
| Órdenes | `GET /ordenes/{id}` | Leer la orden (el id es el enlace privado de la compra) | No |
| Órdenes | `PATCH /ordenes/{id}` | Actualizar los datos del comprador mientras está pendiente | No |
| Órdenes | `DELETE /ordenes/{id}` | Eliminar (anular) una orden pendiente y liberar su cupo | No |
| Órdenes | `POST /ordenes/{id}/pago` | Confirmar el pago (lo llama la pasarela con `X-Clave-Pasarela`) | Clave de la pasarela |
| Órdenes | `GET /eventos/{id}/ordenes` | Leer el reporte de ventas del evento | Sí |
| Boletas | `GET /ordenes/{id}/boletas` | Leer las boletas de una orden pagada | No |
| Boletas | `GET /boletas/{codigo}` | Leer una boleta por el código de su QR | No |
| Validaciones | `POST /eventos/{id}/validaciones` | Validar un código en la puerta: aceptada o rechazada | Sí |
| Validaciones | `GET /eventos/{id}/validaciones` | Leer las lecturas de la puerta | Sí |

## Validación y errores

Cada petición se valida contra el contrato antes de tocar la base (decisión
D-24): tipos, obligatorios, longitudes, formatos (correo, UUID, fechas ISO 8601),
dominios (municipios de Casanare, categorías) y campos que no se deben enviar.
Después, cada servicio revisa las reglas de negocio. Todos los errores tienen la
misma forma:

```json
{
  "codigo": "solicitud_invalida",
  "mensaje": "La solicitud tiene datos inválidos.",
  "detalles": [{ "campo": "telefono", "problema": "Usa el formato +573XXXXXXXXX (celular) o +5760XXXXXXXX (fijo)." }]
}
```

| Código HTTP | Cuándo |
|---|---|
| 400 | La petición no cumple el esquema (`solicitud_invalida`). |
| 401 | Falta el token o no sirve (`no_autenticado`), o el correo o la clave no coinciden (`credenciales_invalidas`). |
| 403 | El recurso es de otro organizador (`sin_permiso`). |
| 404 | El recurso no existe. |
| 409 | Choca con el estado actual: correo ya registrado, otra persona guardó antes (`conflicto_de_version`), transición no permitida, cupo insuficiente, venta cerrada, orden ya pagada… |
| 422 | Los datos rompen una regla del negocio: fechas incoherentes, cupos que superan el aforo, precio en un evento gratuito, falta la cédula en un evento +18, más boletas que el máximo por compra… |

Los tipos de boleta cumplen las reglas del evento: la suma de sus cupos no
supera el aforo, en un evento gratuito valen $0, la venta termina a más tardar al
cierre del evento y el cupo nunca baja de lo ya vendido. Cuando ningún tipo tiene
cupo, el evento pasa solo a `agotado`, y vuelve a `publicado` si se agrega cupo.

Las órdenes reservan el cupo con una actualización condicional dentro de la
misma transacción, así que nunca hay sobreventa; si no se pagan en 15 minutos,
expiran y liberan el cupo. En la puerta, una boleta entra una sola vez aunque dos
celulares la lean al mismo tiempo.

Los eventos usan **bloqueo optimista**: cada edición envía la `version` que
leyó; si otra persona guardó antes, la API responde 409 en lugar de pisar el
cambio (decisión D-10). Los listados devuelven el total en la cabecera
`X-Total-Count`.

## Qué hay en este repositorio

```
apparchar-/
├── servidor/                  Backend (Node.js + Express)
│   ├── index.js               Arranque: base de datos, tablas y puerto
│   ├── demo.js                npm run demo: datos de demostración y arranque
│   ├── app.js                 Middlewares, Swagger UI, rutas y errores
│   ├── config.js              Variables de entorno (.env)
│   ├── rutas.js               Rutas de cada módulo
│   ├── tareas.js              Tareas automáticas del sistema
│   ├── db/                    Conexión (PostgreSQL o PGlite), esquema SQL y semilla
│   ├── comun/                 Autenticación JWT, validación, errores, formatos
│   └── modulos/               Un módulo por recurso: rutas.js + servicio.js
├── pruebas/                   Pruebas automáticas (node --test + supertest)
├── postman/                   Colección de Postman del MVP
├── api/openapi.yaml           Contrato de la API (OpenAPI 3.1)
├── web/                       Prototipo navegable y panel del organizador (HTML, CSS y JavaScript)
├── docs/                      Modelo de datos, decisiones, wireframes, evidencias
│                              y guion de la demostración (demo-mvp.md)
├── scripts/                   Verificador de coherencia y prueba del DDL
├── .env.example               Variables de entorno (solo nombres)
└── .github/                   Revisión automática de cada pull request
```

## Prototipo web

El prototipo de la Entrega 2 (cartelera, detalle con compra, publicar evento y
validar en la puerta) está en [`web/`](web/) y se publica en GitHub Pages con la
acción `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions):
**<https://elverrianoes-collab.github.io/apparchar-/>**. Esas cuatro páginas
simulan los datos en el navegador con `web/datos/ejemplo.json`.

### Panel del organizador (conectado a la API)

[`web/panel.html`](web/panel.html) es la parte de la web que trabaja contra la API
real. El mismo backend la sirve: con `npm run demo` (o `npm run api`) corriendo, se
abre **<http://localhost:3000/>** y el navegador llega a
`http://localhost:3000/app/panel.html`. Ahí se muestra el MVP completo sin Swagger
ni Postman:

| Pestaña | Qué se demuestra |
|---|---|
| Ingreso | Registro (`POST /organizadores`) e inicio de sesión (`POST /sesiones`) con `demo@apparchar.co` / `Apparchar2026`; el token JWT se ve decodificado (algoritmo, `sub`, `iss`, `exp`). |
| Mi cuenta | CRUD de `organizador`: leer, actualizar (solo los campos que cambian) y eliminar (409 si tiene eventos). |
| Eventos | CRUD de `evento`: listar, crear en borrador, editar con `version` (bloqueo optimista), publicar, pausar, reanudar, cancelar y borrar borradores; la cartelera pública con `X-Total-Count`. |
| Tipos de boleta | CRUD de `tipo_boleta` con las reglas de aforo (422) y nombre repetido (409). |
| Órdenes | CRUD de `orden`: comprar sin cuenta, corregir y anular una orden pendiente, confirmar el pago (simulación de la pasarela) y ver las boletas emitidas. |
| Puerta | Validar una boleta: la primera lectura entra y la segunda sale rechazada por `ya_usada`. |
| Seguridad y validación | Seis pruebas que el servidor debe rechazar: sin token (401), firma alterada (401), recurso de otro organizador (403), datos inválidos (400), versión desactualizada (409) y aforo excedido (422). |

Cada formulario muestra el error del servidor con su código y marca los campos del
`detalles`, y la columna **Peticiones a la API** registra método, ruta, código
HTTP, tiempo, cuerpo enviado y respuesta de cada llamada. Desde GitHub Pages el
panel también abre, pero solo funciona si en ese computador está corriendo la API
en `http://localhost:3000`.

En local, solo las páginas estáticas:

```bash
npm run web    # http://localhost:8080
```

Todavía lee los datos de ejemplo de `web/datos/ejemplo.json`; conectarlo a la API
es el paso siguiente al MVP.

## Demostración con Postman

Con el backend corriendo (`npm run api` o `npm run demo`), importa
[`postman/apparchar-mvp.postman_collection.json`](postman/apparchar-mvp.postman_collection.json)
y pulsa **Run collection**: recorre el registro, el inicio de sesión, el CRUD de
los cuatro recursos, el pago, las boletas y la puerta, con sus casos de error.
Cada petición guarda en variables lo que necesita la siguiente. También corre
desde la terminal con Newman (la primera vez `npx` lo descarga, así que necesita
internet): `npx newman run postman/apparchar-mvp.postman_collection.json`.

## Otras verificaciones

```bash
npm run validar:api    # el contrato OpenAPI es válido (Redocly)
npm run verificar      # modelo, contrato, datos y formularios usan los mismos campos
npm run revisar        # las tres anteriores y las pruebas del backend
npm run mock           # servidor simulado con Prism en http://127.0.0.1:4010
```

Con un PostgreSQL disponible, `DATABASE_URL=… npm run probar:modelo` prueba las
restricciones del DDL (44 comprobaciones).

## Uso de inteligencia artificial

| Herramienta | Para qué | Alcance |
|---|---|---|
| Claude (Anthropic) | Contrato, modelo de datos y prototipo de la Entrega 2; en el MVP, el código del backend, sus pruebas automáticas, la colección de Postman y esta documentación. | Borradores y verificaciones automáticas. Cada integrante revisa, ajusta y sustenta la parte que sube en su pull request. |

Declaración: los integrantes del equipo «Los insanos» declaran de manera libre y
transparente que usaron una herramienta de inteligencia artificial generativa
(Claude, de Anthropic) como apoyo académico y técnico, en continuidad con las
declaraciones del anteproyecto y de la Entrega 2. La idea del proyecto, el
contexto regional, las decisiones de producto y la validación final del contenido
son responsabilidad del equipo.

Revisión humana: _(por completar: quién revisó qué parte y qué cambió)_.
