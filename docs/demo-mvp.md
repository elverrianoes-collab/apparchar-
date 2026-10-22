# Demostración en vivo del MVP

Guion para mostrar en clase que el backend funciona de punta a punta. Todo corre
en el computador de quien presenta, sin internet y sin instalar PostgreSQL: el
backend usa PGlite (decisión D-25).

## Antes de la clase (con internet)

1. Clonar el repositorio e instalar las dependencias:
   ```bash
   git clone https://github.com/elverrianoes-collab/apparchar-.git
   cd apparchar-
   npm ci
   ```
2. Ensayar una vez `npm test` y `npm run demo`, y abrir <http://localhost:3000/> (panel) y <http://localhost:3000/docs> (Swagger UI).
3. Importar en Postman la colección [`postman/apparchar-mvp.postman_collection.json`](../postman/apparchar-mvp.postman_collection.json).

Después de esto ya no hace falta internet: `npm ci` es el único paso que descarga algo.

## Recorrido desde la web (8 minutos, recomendado)

Todo se muestra en el navegador, en el panel del organizador que sirve el mismo
backend. La columna **Peticiones a la API** de la derecha deja a la vista cada
petición: método, ruta, código HTTP, cuerpo enviado y respuesta.

| Minuto | Qué se muestra | Cómo |
|---|---|---|
| 0:00 | Arranque con datos | Cerrar cualquier otro servidor de Apparchar, correr `npm run demo` y abrir <http://localhost:3000/>: el navegador llega al **Panel del organizador** y arriba dice «Conectado a la API». |
| 0:30 | Validación en el servidor | En **Crear cuenta de organizador**: nombre `Yo`, correo `x`, teléfono `3105550148`, clave `123` → **HTTP 400 `solicitud_invalida`** con un detalle por campo y los campos marcados en rojo. |
| 1:15 | Autenticación | **Iniciar sesión** con una clave equivocada (**401**) y luego **Usar la cuenta de demostración** (`demo@apparchar.co` / `Apparchar2026`). Abrir **Ver el token JWT**: algoritmo HS256, `sub` (el organizador), `iss` y `exp` (8 horas). |
| 2:00 | CRUD de organizador | Pestaña **Mi cuenta**: se lee el perfil (GET), se cambia el teléfono y **Guardar** (PATCH, envía solo ese campo) y **Borrar mi cuenta** dos veces → **409 `organizador_con_eventos`**. |
| 2:45 | CRUD de evento | Pestaña **Eventos**: la tabla es el GET. **Llenar con un ejemplo** → **Crear evento** (**201**, borrador, versión 1) → **Editar** el nombre (**200**, versión 2) → **Publicar** sin tipos de boleta (**409 `evento_sin_tipos_de_boleta`**) → **Borrar** el borrador «Torneo relámpago de microfútbol» (**204**). **Consultar** la cartelera pública con `X-Total-Count`. |
| 4:00 | CRUD de tipo de boleta | Pestaña **Tipos de boleta**, con el evento nuevo elegido: **Llenar con un ejemplo** → **Crear** (**201**) → **Editar** el precio (**200**) → otro tipo «Gradería» con cantidad `5000` (**422 `aforo_excedido`**) → **Borrar** un tipo (**204**). Volver a **Eventos** y **Publicar** (**200**). |
| 5:00 | CRUD de orden | Pestaña **Órdenes**, con el concierto «Noche de rock llanero»: **Llenar con un ejemplo**, borrar el documento y **Crear orden** (**422 `documento_requerido`**, es +18) → con el documento (**201 pendiente**, el servidor calcula el total) → **Confirmar pago** (simulación de la pasarela, **200**) → aparecen las boletas. Otra orden: **Editar** el correo (**200**) y **Anular** (**204**). |
| 6:15 | Puerta | En una boleta, **Validar en la puerta** → **Validar**: «Puede entrar». Validar otra vez: «No puede entrar · ya se usó». |
| 6:45 | Seguridad y validación | Pestaña **Seguridad y validación** → **Ejecutar todas**: 401 sin token, 401 con la firma alterada, 403 con el evento de otro organizador, 400 con datos inválidos, 409 con una versión vieja y 422 con aforo excedido, las seis en verde. |
| 7:30 | Documentación | Enlace **Swagger UI** de la barra de conexión (<http://localhost:3000/docs>): las 25 operaciones del contrato. Si hay tiempo, *Run collection* en Postman. |

Si el servidor se reinicia, el token deja de servir (sin `JWT_SECRETO` la clave
cambia en cada arranque) y la página vuelve a pedir el inicio de sesión.

## Recorrido con Swagger UI (7 minutos, alternativa)

| Minuto | Qué se muestra | Cómo |
|---|---|---|
| 0:00 | Las pruebas automáticas | `npm test`: cada archivo levanta la API sobre una base nueva y recorre el CRUD, la autenticación y la validación; todas en verde. |
| 1:00 | Arranque con datos | Cerrar cualquier otro servidor de Apparchar y correr `npm run demo`: borra la base local, carga los datos de demostración y arranca el servidor. La consola muestra el usuario y la clave, el `evento_id` del concierto de esta noche y los `tipo_boleta_id` de sus localidades, el id de un borrador y tres códigos de boleta. Dejar esa consola a la vista. |
| 1:30 | Documentación | Abrir <http://localhost:3000/docs> (Swagger UI): las 25 operaciones con sus esquemas, ejemplos y errores. |
| 2:00 | Autenticación | En **Sesiones → POST /sesiones**, *Try it out* con `demo@apparchar.co` y `Apparchar2026`. Copiar el `token`, pulsar **Authorize** y pegarlo. |
| 2:30 | CRUD de eventos | `GET /eventos` (cartelera, con `X-Total-Count`) → `POST /eventos` con el ejemplo `con_tipos` (nace en borrador, `version` 1) → `PATCH` de ese evento con `{"version": 1, "estado": "publicado"}` → repetir el mismo `PATCH` para ver el **409 conflicto_de_version** → `DELETE /eventos/{id}` con el id del borrador que imprimió la consola (**204**) → `DELETE` del evento recién publicado (**409 evento_no_eliminable**). |
| 3:30 | CRUD de tipos de boleta | `POST /eventos/{id}/tipos-boleta` sobre el evento recién creado con el ejemplo «Mesa VIP» (**201**) → `PATCH /tipos-boleta/{id}` del precio → otro `POST` **cambiando el nombre** (por ejemplo «Gradería») y con `"cantidad_total": 500` para ver el **422 aforo_excedido** (con el mismo nombre respondería antes 409 `tipo_boleta_nombre_repetido`). |
| 4:15 | CRUD de órdenes | `POST /ordenes` con el `evento_id` y un `tipo_boleta_id` del concierto que imprimió la consola y sin `comprador_documento` (**422 documento_requerido**: es +18) → con `"comprador_documento": "1118532219"` (**201 pendiente**, el servidor calcula el total) → `PATCH /ordenes/{id}` para corregir el correo → `POST /ordenes/{id}/pago` con la cabecera `X-Clave-Pasarela: pasarela-demo` → `GET /ordenes/{id}/boletas`. |
| 5:15 | Validación en la puerta | `POST /eventos/{evento_id}/validaciones` con el `evento_id` del concierto y uno de los códigos que imprimió la consola: **aceptada**. Repetirlo: **rechazada, ya_usada**. |
| 5:45 | Validación de datos | `POST /organizadores` con `{"nombre": "Yo", "correo": "x", "telefono": "3105550148", "municipio": "Mani"}`: **400** con un detalle por campo. |
| 6:15 | Protección de rutas | **Logout** en Authorize y repetir un `PATCH`: **401**. Entrar como `fundacion@apparchar.co` e intentar editar un evento del Colectivo: **403**. |
| 6:45 | Postman | *Run collection*: 47 peticiones y 76 comprobaciones en verde, incluidos los casos de error. |

## Dónde se cumple cada requisito

| Requisito del MVP | Dónde está | Cómo se demuestra |
|---|---|---|
| CRUD sobre cuatro recursos | `servidor/modulos/{organizadores,eventos,tipos-boleta,ordenes}` | Panel del organizador (pestañas Mi cuenta, Eventos, Tipos de boleta y Órdenes), Swagger UI y Postman (carpetas 1 a 4 y 6); pruebas `pruebas/*.test.js`. |
| Autenticación | `servidor/comun/autenticacion.js` y `POST /sesiones` (JWT HS256, claves con bcrypt) | Inicio de sesión y token decodificado en el panel; 401 sin token o con uno alterado y 403 con el de otro organizador (pestaña Seguridad y validación). |
| Validación | `servidor/comun/validacion.js` (esquemas del contrato) y las reglas de cada `servicio.js` | 400 con detalles por campo; 409 y 422 con códigos estables. |
| Documentación | Swagger UI en `/docs`, `api/openapi.yaml` y la colección de Postman | Abrir `/docs` y ejecutar la colección. |
| Demostración funcional | `npm run demo` (sirve el panel en <http://localhost:3000/>), `npm test` y la colección de Postman | Este guion. |

## Preguntas probables

- **¿Dónde se valida lo que envía el cliente?** Antes de tocar la base, un
  middleware compara parámetros y cuerpo con los esquemas de `api/openapi.yaml`
  (400). Después, cada servicio revisa las reglas que necesitan la base (409 y
  422). Decisión D-24.
- **¿Cómo se protege una ruta?** Con el middleware `autenticar`: verifica la firma
  y el vencimiento del JWT y que la cuenta exista. La pertenencia (403) la revisa
  el servicio comparando el dueño del recurso con el organizador del token.
- **¿Cómo se evita vender la misma boleta dos veces?** La reserva es un `UPDATE …
  WHERE cantidad_vendida + n <= cantidad_total` dentro de la transacción de la
  orden; la base tiene además un `CHECK` (§8 del modelo).
- **¿Y si dos porteros leen la misma boleta al tiempo?** La fila de la boleta se
  bloquea y solo una lectura la cambia a `usada`; el índice único parcial
  `validacion_una_aceptada_idx` es la última barrera. Se comprobó contra
  PostgreSQL con 20 lecturas simultáneas de la misma boleta: 1 aceptada y 19
  rechazadas por `ya_usada`.
- **¿Y si llegan muchas compras al tiempo, o se cancela el evento mientras
  compran?** Cada compra bloquea primero la fila del evento y después los tipos de
  boleta, siempre en el mismo orden: las compras de un evento se atienden una a la
  vez, una cancelación espera a la compra en curso (o la compra ve el evento ya
  cancelado) y no se producen bloqueos mutuos.
- **¿Por qué PGlite?** Es PostgreSQL de verdad corriendo dentro de Node: el mismo
  esquema y las mismas restricciones, sin instalar nada. Con `DATABASE_URL`, el
  mismo código usa un PostgreSQL normal (D-25).
