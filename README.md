# Plataforma Apparchar

Plataforma web para que organizadores de eventos de Casanare vendan boletas con
código QR y controlen el aforo en la puerta. Este repositorio contiene el
**backend del MVP** (API REST con Node.js, Express y PostgreSQL), su contrato
OpenAPI 3.1, el modelo de datos y el prototipo web navegable.

**Documentación de la API:** Swagger UI en <http://localhost:3000/docs> al correr `npm run api` ·
**Contrato:** [`api/openapi.yaml`](api/openapi.yaml) · **Modelo de datos:** [`docs/modelo-datos.md`](docs/modelo-datos.md) · **Versión:** 0.3.0 (MVP)

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
| Javier Alberto Gómez Wilches | CRUD de tipos de boleta, wireframes y evidencias (PR 3) | _(por completar)_ |
| Juan David Rivera Goyeneche | CRUD de órdenes, pago, validación en la puerta y demostración (PR 4) | _(por completar)_ |

La sustentación la presenta cualquiera de los integrantes; todos responden por el
contenido.

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
3. Abre **<http://localhost:3000/docs>**: Swagger UI con todas las rutas, sus
   esquemas y ejemplos. Con **Try it out** se prueban contra este mismo servidor.
4. Corre las pruebas automáticas (cada archivo arranca la API sobre una base en
   memoria, nueva y vacía):
   ```bash
   npm test
   ```

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
| 409 | Choca con el estado actual: correo ya registrado, otra persona guardó antes (`conflicto_de_version`), transición de estado no permitida… |
| 422 | Los datos rompen una regla del negocio: fechas incoherentes, cupos que superan el aforo, precio en un evento gratuito… |

Los tipos de boleta cumplen las reglas del evento: la suma de sus cupos no
supera el aforo, en un evento gratuito valen $0, la venta termina a más tardar al
cierre del evento y el cupo nunca baja de lo ya vendido. Cuando ningún tipo tiene
cupo, el evento pasa solo a `agotado`, y vuelve a `publicado` si se agrega cupo.

Los eventos usan **bloqueo optimista**: cada edición envía la `version` que
leyó; si otra persona guardó antes, la API responde 409 en lugar de pisar el
cambio (decisión D-10). Los listados devuelven el total en la cabecera
`X-Total-Count`.

## Qué hay en este repositorio

```
apparchar-/
├── servidor/                  Backend (Node.js + Express)
│   ├── index.js               Arranque: base de datos, tablas y puerto
│   ├── app.js                 Middlewares, Swagger UI, rutas y errores
│   ├── config.js              Variables de entorno (.env)
│   ├── rutas.js               Rutas de cada módulo
│   ├── tareas.js              Tareas automáticas del sistema
│   ├── db/                    Conexión (PostgreSQL o PGlite) y esquema SQL
│   ├── comun/                 Autenticación JWT, validación, errores, formatos
│   └── modulos/               Un módulo por recurso: rutas.js + servicio.js
├── pruebas/                   Pruebas automáticas (node --test + supertest)
├── api/openapi.yaml           Contrato de la API (OpenAPI 3.1)
├── web/                       Prototipo navegable (HTML, CSS y JavaScript)
├── docs/                      Modelo de datos, decisiones, wireframes y evidencias
├── scripts/                   Verificador de coherencia y prueba del DDL
├── .env.example               Variables de entorno (solo nombres)
└── .github/                   Revisión automática de cada pull request
```

## Prototipo web

El prototipo de la Entrega 2 (cartelera, detalle con compra, publicar evento y
validar en la puerta) está en [`web/`](web/) y se publica en GitHub Pages con la
acción `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions).
En local:

```bash
npm run web    # http://localhost:8080
```

Todavía lee los datos de ejemplo de `web/datos/ejemplo.json`; conectarlo a la API
es el paso siguiente al MVP.

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
