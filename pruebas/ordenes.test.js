// CRUD de órdenes, confirmación del pago y boletas.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearContexto, crearEvento, crearEventoPublicado, cumpleContrato, registrarYEntrar } from './ayudas.js';
import { ejecutarTareas } from '../servidor/tareas.js';

const CLAVE_PASARELA = { 'X-Clave-Pasarela': process.env.PASARELA_CLAVE };

let ctx;
let dueno;
let otro;
let rock; // concierto +18 con Preventa ($25.000, 50 cupos) y General ($35.000, 100 cupos)
before(async () => {
  ctx = await crearContexto();
  dueno = await registrarYEntrar(ctx.api);
  otro = await registrarYEntrar(ctx.api);
  rock = await crearEventoPublicado(ctx.api, dueno.auth, { edad_minima: 18 });
});
after(() => ctx.cerrar());

const tipo = (evento, nombre) => evento.tipos_boleta.find((t) => t.nombre === nombre);

function datosOrden(evento, items, cambios = {}) {
  return {
    evento_id: evento.id,
    items: items.map(([nombre, cantidad]) => ({ tipo_boleta_id: tipo(evento, nombre).id, cantidad })),
    comprador_nombre: 'Laura Camila Rojas',
    comprador_correo: 'Laura.Rojas@Ejemplo.co',
    comprador_telefono: '+573105550631',
    comprador_documento: '1118532219',
    medio_pago: 'nequi',
    autoriza_tratamiento_datos: true,
    ...cambios,
  };
}

async function comprar(evento, items, cambios) {
  const r = await ctx.api.post('/ordenes').send(datosOrden(evento, items, cambios));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

const vendidas = async (tipoId) => (await ctx.api.get(`/tipos-boleta/${tipoId}`)).body.cantidad_vendida;
let referencias = 0;
const pagar = (ordenId, referencia = `NEQUI-PRUEBA-${(referencias += 1)}`) =>
  ctx.api.post(`/ordenes/${ordenId}/pago`).set(CLAVE_PASARELA).send({ referencia_pago: referencia });

describe('Crear (POST /ordenes)', () => {
  test('crea la orden pendiente: calcula el total, congela el precio y reserva el cupo 15 minutos', async () => {
    const antes = await vendidas(tipo(rock, 'Preventa').id);
    const r = await ctx.api.post('/ordenes').send(datosOrden(rock, [['Preventa', 2], ['General', 1]]));
    assert.equal(r.status, 201);
    cumpleContrato('crearOrden', r);
    assert.equal(r.headers.location, `/ordenes/${r.body.id}`);
    assert.equal(r.body.estado, 'pendiente');
    assert.equal(r.body.total_cop, 2 * 25000 + 35000);
    assert.equal(r.body.comprador_correo, 'laura.rojas@ejemplo.co');
    assert.deepEqual(r.body.items.map((i) => [i.cantidad, i.precio_unitario_cop]), [[2, 25000], [1, 35000]]);
    const minutos = (new Date(r.body.expira_en) - new Date(r.body.creado_en)) / 60000;
    assert.equal(minutos, 15);
    assert.equal(await vendidas(tipo(rock, 'Preventa').id), antes + 2);
  });

  test('una orden gratuita nace pagada, sin medio de pago y con sus boletas emitidas', async () => {
    const encuentro = await crearEventoPublicado(ctx.api, dueno.auth, {
      nombre: 'Encuentro de arpa, cuatro y maracas', es_gratuito: true, municipio: 'Monterrey',
      tipos_boleta: [{ nombre: 'Entrada libre', precio_cop: 0, cantidad_total: 100 }],
    });
    const r = await ctx.api.post('/ordenes').send(datosOrden(encuentro, [['Entrada libre', 2]], { comprador_documento: undefined }));
    assert.equal(r.status, 201);
    cumpleContrato('crearOrden', r);
    assert.equal(r.body.estado, 'pagada');
    assert.equal(r.body.medio_pago, null);
    assert.ok(r.body.pagada_en);
    const boletas = await ctx.api.get(`/ordenes/${r.body.id}/boletas`);
    assert.equal(boletas.status, 200);
    cumpleContrato('listarBoletasDeOrden', boletas);
    assert.equal(boletas.body.length, 2);
    assert.equal(boletas.headers['x-total-count'], '2');
  });

  test('400: un tipo repetido en items, sin autorización de datos o con un celular inválido', async () => {
    const repetido = await ctx.api.post('/ordenes').send(datosOrden(rock, [['General', 1], ['General', 2]]));
    assert.equal(repetido.status, 400);
    cumpleContrato('crearOrden', repetido);
    assert.equal(repetido.body.detalles[0].campo, 'items[1].tipo_boleta_id');
    const sinAutorizacion = await ctx.api.post('/ordenes').send(datosOrden(rock, [['General', 1]], { autoriza_tratamiento_datos: false, comprador_telefono: '3105550631' }));
    assert.equal(sinAutorizacion.status, 400);
    cumpleContrato('crearOrden', sinAutorizacion);
    assert.deepEqual(sinAutorizacion.body.detalles.map((d) => d.campo).sort(), ['autoriza_tratamiento_datos', 'comprador_telefono']);
  });

  test('los UUID en mayúsculas funcionan igual (y un tipo repetido se detecta aunque cambie la caja)', async () => {
    const datos = datosOrden(rock, [['General', 1]]);
    datos.evento_id = datos.evento_id.toUpperCase();
    datos.items[0].tipo_boleta_id = datos.items[0].tipo_boleta_id.toUpperCase();
    const r = await ctx.api.post('/ordenes').send(datos);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.evento_id, rock.id);
    const repetido = await ctx.api.post('/ordenes').send({
      ...datos, items: [{ tipo_boleta_id: tipo(rock, 'General').id, cantidad: 1 }, { tipo_boleta_id: tipo(rock, 'General').id.toUpperCase(), cantidad: 1 }],
    });
    assert.equal(repetido.status, 400);
  });

  test('404 si el evento no existe o es un borrador, o si un tipo no existe', async () => {
    const inexistente = await ctx.api.post('/ordenes').send({ ...datosOrden(rock, [['General', 1]]), evento_id: '2e4c1c1d-d769-4047-9880-c8295fa22263' });
    assert.equal(inexistente.status, 404);
    cumpleContrato('crearOrden', inexistente);
    const borrador = await crearEvento(ctx.api, dueno.auth);
    const deBorrador = await ctx.api.post('/ordenes').send(datosOrden(borrador, [['General', 1]]));
    assert.equal(deBorrador.status, 404);
    assert.equal(deBorrador.body.codigo, 'evento_no_encontrado');
    const sinTipo = await ctx.api.post('/ordenes').send({ ...datosOrden(rock, []), items: [{ tipo_boleta_id: '2e4c1c1d-d769-4047-9880-c8295fa22263', cantidad: 1 }] });
    assert.equal(sinTipo.status, 404);
    cumpleContrato('crearOrden', sinTipo);
    assert.equal(sinTipo.body.codigo, 'tipo_boleta_no_encontrado');
  });

  test('409: evento pausado, venta cerrada o cupo insuficiente (sin reservar nada)', async () => {
    const pausado = await crearEventoPublicado(ctx.api, dueno.auth);
    await ctx.api.patch(`/eventos/${pausado.id}`).set(dueno.auth).send({ version: pausado.version, estado: 'pausado' });
    const enPausa = await ctx.api.post('/ordenes').send(datosOrden(pausado, [['General', 1]]));
    assert.equal(enPausa.status, 409);
    cumpleContrato('crearOrden', enPausa);
    assert.equal(enPausa.body.codigo, 'evento_no_disponible');

    const cerrado = await crearEventoPublicado(ctx.api, dueno.auth);
    await ctx.db.consultar(
      "UPDATE tipo_boleta SET venta_inicia_en = now() - interval '2 days', venta_termina_en = now() - interval '1 day' WHERE id = $1",
      [tipo(cerrado, 'Preventa').id],
    );
    const ventaCerrada = await ctx.api.post('/ordenes').send(datosOrden(cerrado, [['Preventa', 1]]));
    assert.equal(ventaCerrada.status, 409);
    cumpleContrato('crearOrden', ventaCerrada);
    assert.equal(ventaCerrada.body.codigo, 'venta_cerrada');

    const pequeno = await crearEventoPublicado(ctx.api, dueno.auth, { tipos_boleta: [{ nombre: 'General', precio_cop: 20000, cantidad_total: 2 }, { nombre: 'VIP', precio_cop: 50000, cantidad_total: 5 }] });
    const sinCupo = await ctx.api.post('/ordenes').send(datosOrden(pequeno, [['VIP', 1], ['General', 3]]));
    assert.equal(sinCupo.status, 409);
    cumpleContrato('crearOrden', sinCupo);
    assert.equal(sinCupo.body.codigo, 'cupo_insuficiente');
    assert.equal(await vendidas(tipo(pequeno, 'VIP').id), 0, 'la transacción no deja reservas a medias');
  });

  test('422: más del máximo por orden, tipo de otro evento, sin cédula en un evento +18 o sin medio de pago', async () => {
    const maximo = await ctx.api.post('/ordenes').send(datosOrden(rock, [['General', 11]]));
    assert.equal(maximo.status, 422);
    cumpleContrato('crearOrden', maximo);
    assert.equal(maximo.body.codigo, 'maximo_por_orden_excedido');

    const otroEvento = await crearEventoPublicado(ctx.api, dueno.auth);
    const mezclado = await ctx.api.post('/ordenes').send({ ...datosOrden(rock, [['General', 1]]), items: [{ tipo_boleta_id: tipo(otroEvento, 'General').id, cantidad: 1 }] });
    assert.equal(mezclado.status, 422);
    cumpleContrato('crearOrden', mezclado);
    assert.equal(mezclado.body.codigo, 'tipo_de_otro_evento');

    const sinCedula = await ctx.api.post('/ordenes').send(datosOrden(rock, [['General', 1]], { comprador_documento: undefined }));
    assert.equal(sinCedula.status, 422);
    cumpleContrato('crearOrden', sinCedula);
    assert.equal(sinCedula.body.codigo, 'documento_requerido');

    const sinMedio = await ctx.api.post('/ordenes').send(datosOrden(rock, [['General', 1]], { medio_pago: undefined }));
    assert.equal(sinMedio.status, 422);
    cumpleContrato('crearOrden', sinMedio);
    assert.equal(sinMedio.body.codigo, 'medio_pago_requerido');
  });

  test('el último cupo agota el evento; anular la orden lo devuelve a publicado', async () => {
    const pequeno = await crearEventoPublicado(ctx.api, dueno.auth, { tipos_boleta: [{ nombre: 'General', precio_cop: 20000, cantidad_total: 2 }] });
    const orden = await comprar(pequeno, [['General', 2]]);
    assert.equal((await ctx.api.get(`/eventos/${pequeno.id}`)).body.estado, 'agotado');
    const otraCompra = await ctx.api.post('/ordenes').send(datosOrden(pequeno, [['General', 1]]));
    assert.equal(otraCompra.status, 409);
    assert.equal(otraCompra.body.codigo, 'evento_no_disponible');
    assert.equal((await ctx.api.delete(`/ordenes/${orden.id}`)).status, 204);
    assert.equal((await ctx.api.get(`/eventos/${pequeno.id}`)).body.estado, 'publicado');
  });
});

describe('Leer (GET /ordenes/{id} y GET /eventos/{id}/ordenes)', () => {
  test('la orden se consulta con su enlace privado; 404 si no existe, 400 si no es un UUID', async () => {
    const orden = await comprar(rock, [['General', 1]]);
    const r = await ctx.api.get(`/ordenes/${orden.id}`);
    assert.equal(r.status, 200);
    cumpleContrato('obtenerOrden', r);
    const r404 = await ctx.api.get('/ordenes/2e4c1c1d-d769-4047-9880-c8295fa22263');
    assert.equal(r404.status, 404);
    cumpleContrato('obtenerOrden', r404);
    const r400 = await ctx.api.get('/ordenes/360e1d4a');
    assert.equal(r400.status, 400);
    cumpleContrato('obtenerOrden', r400);
  });

  test('una orden que no se pagó en 15 minutos expira y libera el cupo', async () => {
    const orden = await comprar(rock, [['General', 3]]);
    const antes = await vendidas(tipo(rock, 'General').id);
    await ctx.db.consultar(
      "UPDATE orden SET creado_en = now() - interval '20 minutes', expira_en = now() - interval '5 minutes' WHERE id = $1",
      [orden.id],
    );
    await ejecutarTareas(ctx.db);
    const r = await ctx.api.get(`/ordenes/${orden.id}`);
    assert.equal(r.body.estado, 'expirada');
    cumpleContrato('obtenerOrden', r);
    assert.equal(await vendidas(tipo(rock, 'General').id), antes - 3);
  });

  test('el reporte de ventas es solo para el dueño del evento', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    await comprar(evento, [['General', 1]]);
    const orden = await comprar(evento, [['Preventa', 2]]);
    await pagar(orden.id);
    const todas = await ctx.api.get(`/eventos/${evento.id}/ordenes`).set(dueno.auth);
    assert.equal(todas.status, 200);
    cumpleContrato('listarOrdenesDelEvento', todas);
    assert.equal(todas.headers['x-total-count'], '2');
    const pagadas = await ctx.api.get(`/eventos/${evento.id}/ordenes`).set(dueno.auth).query({ estado: 'pagada' });
    assert.deepEqual(pagadas.body.map((o) => o.id), [orden.id]);
    const ajeno = await ctx.api.get(`/eventos/${evento.id}/ordenes`).set(otro.auth);
    assert.equal(ajeno.status, 403);
    cumpleContrato('listarOrdenesDelEvento', ajeno);
    const sinToken = await ctx.api.get(`/eventos/${evento.id}/ordenes`);
    assert.equal(sinToken.status, 401);
    cumpleContrato('listarOrdenesDelEvento', sinToken);
  });
});

describe('Confirmar el pago (POST /ordenes/{id}/pago) y boletas', () => {
  test('la pasarela confirma el pago: la orden queda pagada y emite una boleta por unidad', async () => {
    const orden = await comprar(rock, [['Preventa', 2], ['General', 1]]);
    const sinPagar = await ctx.api.get(`/ordenes/${orden.id}/boletas`);
    assert.deepEqual(sinPagar.body, []);
    const r = await pagar(orden.id, 'NEQUI-20261018-194406');
    assert.equal(r.status, 200);
    cumpleContrato('confirmarPagoOrden', r);
    assert.equal(r.body.estado, 'pagada');
    assert.equal(r.body.referencia_pago, 'NEQUI-20261018-194406');
    const boletas = await ctx.api.get(`/ordenes/${orden.id}/boletas`);
    cumpleContrato('listarBoletasDeOrden', boletas);
    assert.equal(boletas.body.length, 3);
    assert.ok(boletas.body.every((b) => b.titular_nombre === 'Laura Camila Rojas' && b.estado === 'valida'));
    assert.equal(new Set(boletas.body.map((b) => b.codigo)).size, 3);
    const porCodigo = await ctx.api.get(`/boletas/${boletas.body[0].codigo}`);
    assert.equal(porCodigo.status, 200);
    cumpleContrato('obtenerBoleta', porCodigo);
  });

  test('401 sin la clave de la pasarela o con una equivocada', async () => {
    const orden = await comprar(rock, [['General', 1]]);
    const sinClave = await ctx.api.post(`/ordenes/${orden.id}/pago`).send({ referencia_pago: 'PSE-1' });
    assert.equal(sinClave.status, 401);
    cumpleContrato('confirmarPagoOrden', sinClave);
    const malaClave = await ctx.api.post(`/ordenes/${orden.id}/pago`).set('X-Clave-Pasarela', 'adivinada').send({ referencia_pago: 'PSE-1' });
    assert.equal(malaClave.status, 401);
  });

  test('409: ya pagada, referencia repetida o expirada', async () => {
    const orden = await comprar(rock, [['General', 1]]);
    await pagar(orden.id, 'PSE-REPETIDA');
    const otraVez = await pagar(orden.id, 'PSE-OTRA');
    assert.equal(otraVez.status, 409);
    cumpleContrato('confirmarPagoOrden', otraVez);
    assert.equal(otraVez.body.codigo, 'orden_no_pendiente');

    const segunda = await comprar(rock, [['General', 1]]);
    const repetida = await pagar(segunda.id, 'PSE-REPETIDA');
    assert.equal(repetida.status, 409);
    cumpleContrato('confirmarPagoOrden', repetida);
    assert.equal(repetida.body.codigo, 'referencia_pago_repetida');

    await ctx.db.consultar("UPDATE orden SET creado_en = now() - interval '20 minutes', expira_en = now() - interval '1 minute' WHERE id = $1", [segunda.id]);
    const expirada = await pagar(segunda.id, 'PSE-TARDE');
    assert.equal(expirada.status, 409);
    cumpleContrato('confirmarPagoOrden', expirada);
    assert.equal(expirada.body.codigo, 'orden_expirada');
  });

  test('una boleta que no existe responde 404; un código mal escrito, 400', async () => {
    const r404 = await ctx.api.get('/boletas/K7M2-9QXD-H4TP');
    assert.equal(r404.status, 404);
    cumpleContrato('obtenerBoleta', r404);
    const r400 = await ctx.api.get('/boletas/956T-X8KV-CHO3');
    assert.equal(r400.status, 400);
    cumpleContrato('obtenerBoleta', r400);
  });
});

describe('Actualizar (PATCH /ordenes/{id})', () => {
  test('el comprador corrige sus datos mientras la orden está pendiente', async () => {
    const orden = await comprar(rock, [['General', 1]]);
    const r = await ctx.api.patch(`/ordenes/${orden.id}`).send({ comprador_correo: 'Laura.C.Rojas@Ejemplo.co', medio_pago: 'pse' });
    assert.equal(r.status, 200);
    cumpleContrato('actualizarOrden', r);
    assert.equal(r.body.comprador_correo, 'laura.c.rojas@ejemplo.co');
    assert.equal(r.body.medio_pago, 'pse');
    assert.equal(r.body.total_cop, orden.total_cop);
  });

  test('400 con un cuerpo vacío o con campos que pone el servidor', async () => {
    const orden = await comprar(rock, [['General', 1]]);
    const vacio = await ctx.api.patch(`/ordenes/${orden.id}`).send({});
    assert.equal(vacio.status, 400);
    cumpleContrato('actualizarOrden', vacio);
    const total = await ctx.api.patch(`/ordenes/${orden.id}`).send({ total_cop: 1 });
    assert.equal(total.status, 400);
    assert.equal(total.body.detalles[0].campo, 'total_cop');
  });

  test('409 si ya está pagada; 404 si no existe', async () => {
    const orden = await comprar(rock, [['General', 1]]);
    await pagar(orden.id);
    const pagada = await ctx.api.patch(`/ordenes/${orden.id}`).send({ comprador_nombre: 'Otra persona' });
    assert.equal(pagada.status, 409);
    cumpleContrato('actualizarOrden', pagada);
    const r404 = await ctx.api.patch('/ordenes/2e4c1c1d-d769-4047-9880-c8295fa22263').send({ comprador_nombre: 'Nadie' });
    assert.equal(r404.status, 404);
    cumpleContrato('actualizarOrden', r404);
  });
});

describe('Eliminar (DELETE /ordenes/{id})', () => {
  test('anula una orden pendiente y libera su cupo en ese momento', async () => {
    const orden = await comprar(rock, [['Preventa', 4]]);
    const antes = await vendidas(tipo(rock, 'Preventa').id);
    const r = await ctx.api.delete(`/ordenes/${orden.id}`);
    assert.equal(r.status, 204);
    cumpleContrato('eliminarOrden', r);
    assert.equal(await vendidas(tipo(rock, 'Preventa').id), antes - 4);
    assert.equal((await ctx.api.get(`/ordenes/${orden.id}`)).status, 404);
  });

  test('una orden pagada no se borra (409 orden_no_pendiente); una expirada, tampoco (409 orden_expirada)', async () => {
    const pagada = await comprar(rock, [['General', 1]]);
    await pagar(pagada.id);
    const r = await ctx.api.delete(`/ordenes/${pagada.id}`);
    assert.equal(r.status, 409);
    cumpleContrato('eliminarOrden', r);
    assert.equal(r.body.codigo, 'orden_no_pendiente');

    const vencida = await comprar(rock, [['General', 1]]);
    await ctx.db.consultar("UPDATE orden SET creado_en = now() - interval '20 minutes', expira_en = now() - interval '1 minute' WHERE id = $1", [vencida.id]);
    const r2 = await ctx.api.delete(`/ordenes/${vencida.id}`);
    assert.equal(r2.status, 409);
    cumpleContrato('eliminarOrden', r2);
    assert.equal(r2.body.codigo, 'orden_expirada');
  });
});

describe('Cancelar un evento con ventas', () => {
  test('reembolsa las órdenes pagadas, cancela sus boletas y expira las pendientes', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const pagada = await comprar(evento, [['General', 2]]);
    await pagar(pagada.id);
    const pendiente = await comprar(evento, [['Preventa', 1]]);
    const actual = (await ctx.api.get(`/eventos/${evento.id}`)).body;
    const r = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: actual.version, estado: 'cancelado' });
    assert.equal(r.status, 200);
    assert.equal((await ctx.api.get(`/ordenes/${pagada.id}`)).body.estado, 'reembolsada');
    assert.equal((await ctx.api.get(`/ordenes/${pendiente.id}`)).body.estado, 'expirada');
    const boletas = (await ctx.api.get(`/ordenes/${pagada.id}/boletas`)).body;
    assert.ok(boletas.every((b) => b.estado === 'cancelada'));
    assert.ok(r.body.tipos_boleta.every((t) => t.cantidad_vendida === 0));
  });
});
