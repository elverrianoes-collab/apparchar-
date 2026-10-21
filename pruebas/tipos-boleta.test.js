// CRUD de tipos de boleta: crear, leer, actualizar y eliminar.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearContexto, crearEvento, crearEventoPublicado, cumpleContrato, enDias, registrarYEntrar } from './ayudas.js';

let ctx;
let dueno;
let otro;
before(async () => {
  ctx = await crearContexto();
  dueno = await registrarYEntrar(ctx.api);
  otro = await registrarYEntrar(ctx.api);
});
after(() => ctx.cerrar());

const VIP = { nombre: 'Mesa VIP', descripcion: 'Mesa para cuatro con una botella.', precio_cop: 60000, cantidad_total: 20, maximo_por_orden: 4 };

// Deja el evento sin cupo (como si lo hubieran vendido todo) y en estado agotado.
async function agotar(eventoId) {
  await ctx.db.consultar('UPDATE tipo_boleta SET cantidad_vendida = cantidad_total WHERE evento_id = $1', [eventoId]);
  await ctx.db.consultar("UPDATE evento SET estado = 'agotado' WHERE id = $1", [eventoId]);
}

describe('Crear (POST /eventos/{id}/tipos-boleta)', () => {
  test('agrega un tipo a un evento propio: 201 y Location', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const r = await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).set(dueno.auth).send(VIP);
    assert.equal(r.status, 201);
    cumpleContrato('crearTipoBoleta', r);
    assert.equal(r.headers.location, `/tipos-boleta/${r.body.id}`);
    assert.equal(r.body.evento_id, evento.id);
    assert.equal(r.body.cantidad_vendida, 0);
    assert.equal(new Date(r.body.venta_termina_en).getTime(), new Date(evento.fecha_inicio).getTime());
  });

  test('un tipo nuevo devuelve a publicado un evento agotado', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    await agotar(evento.id);
    await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).set(dueno.auth).send(VIP);
    const r = await ctx.api.get(`/eventos/${evento.id}`);
    assert.equal(r.body.estado, 'publicado');
  });

  test('401 sin token, 403 con el de otro organizador y 404 si el evento no existe', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const sinToken = await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).send(VIP);
    assert.equal(sinToken.status, 401);
    cumpleContrato('crearTipoBoleta', sinToken);
    const ajeno = await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).set(otro.auth).send(VIP);
    assert.equal(ajeno.status, 403);
    cumpleContrato('crearTipoBoleta', ajeno);
    const inexistente = await ctx.api.post('/eventos/2e4c1c1d-d769-4047-9880-c8295fa22263/tipos-boleta').set(dueno.auth).send(VIP);
    assert.equal(inexistente.status, 404);
    cumpleContrato('crearTipoBoleta', inexistente);
  });

  test('400 con un precio negativo o sin cantidad_total', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const r = await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).set(dueno.auth).send({ nombre: 'VIP', precio_cop: -1 });
    assert.equal(r.status, 400);
    cumpleContrato('crearTipoBoleta', r);
    assert.deepEqual(r.body.detalles.map((d) => d.campo).sort(), ['cantidad_total', 'precio_cop']);
  });

  test('409 con un nombre que ya existe en el evento o si el evento está cancelado', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const repetido = await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).set(dueno.auth).send({ ...VIP, nombre: 'General' });
    assert.equal(repetido.status, 409);
    cumpleContrato('crearTipoBoleta', repetido);
    assert.equal(repetido.body.codigo, 'tipo_boleta_nombre_repetido');
    await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: evento.version, estado: 'cancelado' });
    const cancelado = await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).set(dueno.auth).send(VIP);
    assert.equal(cancelado.status, 409);
    cumpleContrato('crearTipoBoleta', cancelado);
    assert.equal(cancelado.body.codigo, 'evento_no_disponible');
  });

  test('422 si se pasa del aforo, si tiene precio en un evento gratuito o si la venta termina tarde', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth); // aforo 180, ya tiene 150 cupos
    const aforo = await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).set(dueno.auth).send({ ...VIP, cantidad_total: 40 });
    assert.equal(aforo.status, 422);
    cumpleContrato('crearTipoBoleta', aforo);
    assert.deepEqual(aforo.body.detalles, [{ campo: 'cantidad_total', problema: 'Debe ser como máximo 30.' }]);

    const gratuito = await crearEvento(ctx.api, dueno.auth, { es_gratuito: true, tipos_boleta: [{ nombre: 'Entrada libre', precio_cop: 0, cantidad_total: 100 }] });
    const conPrecio = await ctx.api.post(`/eventos/${gratuito.id}/tipos-boleta`).set(dueno.auth).send(VIP);
    assert.equal(conPrecio.status, 422);
    cumpleContrato('crearTipoBoleta', conPrecio);
    assert.equal(conPrecio.body.codigo, 'precio_en_evento_gratuito');

    const tarde = await ctx.api.post(`/eventos/${evento.id}/tipos-boleta`).set(dueno.auth).send({ ...VIP, venta_termina_en: enDias(12) });
    assert.equal(tarde.status, 422);
    cumpleContrato('crearTipoBoleta', tarde);
    assert.equal(tarde.body.codigo, 'ventana_de_venta_invalida');
  });
});

describe('Leer (GET /tipos-boleta/{id})', () => {
  test('el tipo de un evento publicado es público', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const r = await ctx.api.get(`/tipos-boleta/${evento.tipos_boleta[0].id}`);
    assert.equal(r.status, 200);
    cumpleContrato('obtenerTipoBoleta', r);
    assert.equal(r.body.nombre, 'Preventa');
  });

  test('el tipo de un borrador solo lo ve el dueño; si no existe, 404; un token falso, 401', async () => {
    const borrador = await crearEvento(ctx.api, dueno.auth);
    const id = borrador.tipos_boleta[0].id;
    const anonimo = await ctx.api.get(`/tipos-boleta/${id}`);
    assert.equal(anonimo.status, 404);
    cumpleContrato('obtenerTipoBoleta', anonimo);
    assert.equal((await ctx.api.get(`/tipos-boleta/${id}`).set(dueno.auth)).status, 200);
    assert.equal((await ctx.api.get('/tipos-boleta/2e4c1c1d-d769-4047-9880-c8295fa22263')).status, 404);
    const falso = await ctx.api.get(`/tipos-boleta/${id}`).set('Authorization', 'Bearer falso');
    assert.equal(falso.status, 401);
    cumpleContrato('obtenerTipoBoleta', falso);
  });
});

describe('Actualizar (PATCH /tipos-boleta/{id})', () => {
  test('cambia precio y descripción', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const r = await ctx.api.patch(`/tipos-boleta/${evento.tipos_boleta[1].id}`).set(dueno.auth).send({ precio_cop: 40000, descripcion: 'Incluye un cóctel de bienvenida.' });
    assert.equal(r.status, 200);
    cumpleContrato('actualizarTipoBoleta', r);
    assert.equal(r.body.precio_cop, 40000);
  });

  test('ampliar el cupo de un evento agotado lo devuelve a publicado', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    await agotar(evento.id);
    const r = await ctx.api.patch(`/tipos-boleta/${evento.tipos_boleta[0].id}`).set(dueno.auth).send({ cantidad_total: 60 });
    assert.equal(r.status, 200);
    assert.equal((await ctx.api.get(`/eventos/${evento.id}`)).body.estado, 'publicado');
  });

  test('422 si el cupo baja de lo vendido, si se pasa del aforo o si la venta termina después del evento', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const preventa = evento.tipos_boleta[0].id;
    await ctx.db.consultar('UPDATE tipo_boleta SET cantidad_vendida = 30 WHERE id = $1', [preventa]);
    const vendidas = await ctx.api.patch(`/tipos-boleta/${preventa}`).set(dueno.auth).send({ cantidad_total: 20 });
    assert.equal(vendidas.status, 422);
    cumpleContrato('actualizarTipoBoleta', vendidas);
    assert.equal(vendidas.body.codigo, 'cupo_menor_que_vendidas');
    const aforo = await ctx.api.patch(`/tipos-boleta/${preventa}`).set(dueno.auth).send({ cantidad_total: 90 });
    assert.equal(aforo.status, 422);
    cumpleContrato('actualizarTipoBoleta', aforo);
    assert.deepEqual(aforo.body.detalles, [{ campo: 'cantidad_total', problema: 'Debe ser como máximo 80.' }]);
    const ventana = await ctx.api.patch(`/tipos-boleta/${preventa}`).set(dueno.auth).send({ venta_termina_en: enDias(15) });
    assert.equal(ventana.status, 422);
    cumpleContrato('actualizarTipoBoleta', ventana);
  });

  test('409 si otro tipo ya se llama así; 400 con un cuerpo vacío o un máximo fuera de rango', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const id = evento.tipos_boleta[0].id;
    const repetido = await ctx.api.patch(`/tipos-boleta/${id}`).set(dueno.auth).send({ nombre: 'General' });
    assert.equal(repetido.status, 409);
    cumpleContrato('actualizarTipoBoleta', repetido);
    const vacio = await ctx.api.patch(`/tipos-boleta/${id}`).set(dueno.auth).send({});
    assert.equal(vacio.status, 400);
    cumpleContrato('actualizarTipoBoleta', vacio);
    const maximo = await ctx.api.patch(`/tipos-boleta/${id}`).set(dueno.auth).send({ maximo_por_orden: 25 });
    assert.equal(maximo.status, 400);
    cumpleContrato('actualizarTipoBoleta', maximo);
  });

  test('403 con el token de otro organizador y 409 si el evento está cancelado', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const id = evento.tipos_boleta[0].id;
    const ajeno = await ctx.api.patch(`/tipos-boleta/${id}`).set(otro.auth).send({ precio_cop: 1 });
    assert.equal(ajeno.status, 403);
    cumpleContrato('actualizarTipoBoleta', ajeno);
    await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: evento.version, estado: 'cancelado' });
    const cancelado = await ctx.api.patch(`/tipos-boleta/${id}`).set(dueno.auth).send({ precio_cop: 1 });
    assert.equal(cancelado.status, 409);
    cumpleContrato('actualizarTipoBoleta', cancelado);
  });
});

describe('Eliminar (DELETE /tipos-boleta/{id})', () => {
  test('borra un tipo sin ventas: 204', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const r = await ctx.api.delete(`/tipos-boleta/${evento.tipos_boleta[0].id}`).set(dueno.auth);
    assert.equal(r.status, 204);
    cumpleContrato('eliminarTipoBoleta', r);
    assert.equal((await ctx.api.get(`/eventos/${evento.id}`).set(dueno.auth)).body.tipos_boleta.length, 1);
  });

  test('un tipo con ventas no se borra: 409 tipo_boleta_con_ventas', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const tipo = evento.tipos_boleta[0];
    const { rows } = await ctx.db.consultar(
      `INSERT INTO orden (evento_id, comprador_nombre, comprador_correo, comprador_telefono, medio_pago, autoriza_tratamiento_datos, total_cop)
       VALUES ($1, 'Laura Rojas', 'laura@ejemplo.co', '+573105550631', 'nequi', true, 25000) RETURNING id`,
      [evento.id],
    );
    await ctx.db.consultar('INSERT INTO item_orden (orden_id, tipo_boleta_id, cantidad, precio_unitario_cop) VALUES ($1, $2, 1, 25000)', [rows[0].id, tipo.id]);
    const r = await ctx.api.delete(`/tipos-boleta/${tipo.id}`).set(dueno.auth);
    assert.equal(r.status, 409);
    cumpleContrato('eliminarTipoBoleta', r);
  });

  test('el único tipo de un evento publicado no se borra: 409 evento_sin_tipos_de_boleta', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth, { tipos_boleta: [{ nombre: 'Única', precio_cop: 20000, cantidad_total: 50 }] });
    const r = await ctx.api.delete(`/tipos-boleta/${evento.tipos_boleta[0].id}`).set(dueno.auth);
    assert.equal(r.status, 409);
    cumpleContrato('eliminarTipoBoleta', r);
    assert.equal(r.body.codigo, 'evento_sin_tipos_de_boleta');
  });

  test('los tipos de un evento cancelado no se borran: 409 evento_no_disponible', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: evento.version, estado: 'cancelado' });
    const r = await ctx.api.delete(`/tipos-boleta/${evento.tipos_boleta[0].id}`).set(dueno.auth);
    assert.equal(r.status, 409);
    cumpleContrato('eliminarTipoBoleta', r);
    assert.equal(r.body.codigo, 'evento_no_disponible');
  });

  test('403 con el token de otro organizador', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const r = await ctx.api.delete(`/tipos-boleta/${evento.tipos_boleta[0].id}`).set(otro.auth);
    assert.equal(r.status, 403);
    cumpleContrato('eliminarTipoBoleta', r);
  });
});
