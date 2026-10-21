// Validación de boletas en la puerta.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearContexto, crearEventoPublicado, cumpleContrato, enHoras, registrarYEntrar } from './ayudas.js';

let ctx;
let dueno;
let otro;
let esta_noche; // empieza en una hora: la puerta ya está abierta
let codigos;
before(async () => {
  ctx = await crearContexto();
  dueno = await registrarYEntrar(ctx.api);
  otro = await registrarYEntrar(ctx.api);
  esta_noche = await crearEventoPublicado(ctx.api, dueno.auth, {
    fecha_inicio: enHoras(1), fecha_fin: enHoras(6),
    tipos_boleta: [{ nombre: 'General', precio_cop: 35000, cantidad_total: 100 }],
  });
  codigos = await boletasPagadas(esta_noche, 5);
});
after(() => ctx.cerrar());

async function boletasPagadas(evento, cantidad) {
  const orden = await ctx.api.post('/ordenes').send({
    evento_id: evento.id,
    items: [{ tipo_boleta_id: evento.tipos_boleta[0].id, cantidad }],
    comprador_nombre: 'Juan David Chaparro',
    comprador_correo: 'juandavid@ejemplo.co',
    comprador_telefono: '+573125550287',
    medio_pago: 'pse',
    autoriza_tratamiento_datos: true,
  });
  assert.equal(orden.status, 201, JSON.stringify(orden.body));
  await ctx.api.post(`/ordenes/${orden.body.id}/pago`).set('X-Clave-Pasarela', process.env.PASARELA_CLAVE)
    .send({ referencia_pago: `PSE-${orden.body.id.slice(0, 8)}` });
  const boletas = await ctx.api.get(`/ordenes/${orden.body.id}/boletas`);
  return boletas.body.map((b) => b.codigo);
}

const validar = (evento, codigo, auth = dueno.auth) =>
  ctx.api.post(`/eventos/${evento.id}/validaciones`).set(auth).send({ codigo_leido: codigo, validada_por: 'Nelson Ávila Barrera' });

describe('Registrar una lectura (POST /eventos/{id}/validaciones)', () => {
  test('una boleta válida entra: 201 aceptada y la boleta queda usada', async () => {
    const r = await validar(esta_noche, codigos[0]);
    assert.equal(r.status, 201);
    cumpleContrato('registrarValidacion', r);
    assert.equal(r.body.resultado, 'aceptada');
    assert.equal(r.body.motivo, null);
    assert.equal(r.body.puerta, 'Principal');
    const boleta = await ctx.api.get(`/boletas/${codigos[0]}`);
    assert.equal(boleta.body.estado, 'usada');
    assert.ok(boleta.body.usada_en);
  });

  test('la misma boleta otra vez: 201 rechazada por ya_usada', async () => {
    await validar(esta_noche, codigos[1]);
    const r = await validar(esta_noche, codigos[1]);
    assert.equal(r.status, 201);
    cumpleContrato('registrarValidacion', r);
    assert.equal(r.body.resultado, 'rechazada');
    assert.equal(r.body.motivo, 'ya_usada');
  });

  test('dos celulares leen la misma boleta al tiempo: solo una lectura entra', async () => {
    const lecturas = await Promise.all([validar(esta_noche, codigos[2]), validar(esta_noche, codigos[2])]);
    assert.deepEqual(lecturas.map((r) => r.body.resultado).sort(), ['aceptada', 'rechazada']);
  });

  test('el id del evento en mayúsculas no hace rechazar una boleta válida', async () => {
    const [codigo] = await boletasPagadas(esta_noche, 1);
    const r = await validar({ id: esta_noche.id.toUpperCase() }, codigo);
    assert.equal(r.status, 201);
    assert.equal(r.body.resultado, 'aceptada');
  });

  test('el código se reconoce aunque llegue en minúsculas y con espacios', async () => {
    const r = await validar(esta_noche, `  ${codigos[3].toLowerCase()} `);
    assert.equal(r.body.resultado, 'aceptada');
    assert.equal(r.body.codigo_leido, `  ${codigos[3].toLowerCase()} `);
  });

  test('rechaza un código que no existe, una boleta de otro evento y una boleta cancelada', async () => {
    const noExiste = await validar(esta_noche, '7K4P-QX2M-RT8W');
    assert.equal(noExiste.body.motivo, 'no_existe');
    assert.equal(noExiste.body.boleta_id, null);
    cumpleContrato('registrarValidacion', noExiste);

    const otroEvento = await crearEventoPublicado(ctx.api, dueno.auth, {
      nombre: 'Otra fiesta esta noche', fecha_inicio: enHoras(2), fecha_fin: enHoras(5),
      tipos_boleta: [{ nombre: 'General', precio_cop: 10000, cantidad_total: 10 }],
    });
    const [ajeno] = await boletasPagadas(otroEvento, 1);
    const deOtro = await validar(esta_noche, ajeno);
    assert.equal(deOtro.body.motivo, 'otro_evento');

    await ctx.db.consultar("UPDATE boleta SET estado = 'cancelada' WHERE codigo = $1", [codigos[4]]);
    const cancelada = await validar(esta_noche, codigos[4]);
    assert.equal(cancelada.body.motivo, 'cancelada');
  });

  test('409 evento_no_activo si la puerta no ha abierto o si el evento está cancelado', async () => {
    const lejano = await crearEventoPublicado(ctx.api, dueno.auth);
    const temprano = await validar(lejano, '7K4P-QX2M-RT8W');
    assert.equal(temprano.status, 409);
    cumpleContrato('registrarValidacion', temprano);
    assert.equal(temprano.body.codigo, 'evento_no_activo');
    await ctx.api.patch(`/eventos/${lejano.id}`).set(dueno.auth).send({ version: lejano.version, estado: 'cancelado' });
    assert.equal((await validar(lejano, '7K4P-QX2M-RT8W')).body.codigo, 'evento_no_activo');
  });

  test('401 sin token, 403 con el de otro organizador, 404 si el evento no existe y 400 sin código', async () => {
    const sinToken = await ctx.api.post(`/eventos/${esta_noche.id}/validaciones`).send({ codigo_leido: 'X', validada_por: 'Nelson' });
    assert.equal(sinToken.status, 401);
    cumpleContrato('registrarValidacion', sinToken);
    const ajeno = await validar(esta_noche, codigos[0], otro.auth);
    assert.equal(ajeno.status, 403);
    cumpleContrato('registrarValidacion', ajeno);
    const inexistente = await validar({ id: '2e4c1c1d-d769-4047-9880-c8295fa22263' }, codigos[0]);
    assert.equal(inexistente.status, 404);
    cumpleContrato('registrarValidacion', inexistente);
    const vacio = await validar(esta_noche, '');
    assert.equal(vacio.status, 400);
    cumpleContrato('registrarValidacion', vacio);
  });
});

describe('Listar las lecturas (GET /eventos/{id}/validaciones)', () => {
  test('el dueño ve todas las lecturas, las más recientes primero, y puede filtrar por resultado', async () => {
    const todas = await ctx.api.get(`/eventos/${esta_noche.id}/validaciones`).set(dueno.auth);
    assert.equal(todas.status, 200);
    cumpleContrato('listarValidacionesDelEvento', todas);
    const total = Number(todas.headers['x-total-count']);
    assert.ok(total >= 8);
    const aceptadas = await ctx.api.get(`/eventos/${esta_noche.id}/validaciones`).set(dueno.auth).query({ resultado: 'aceptada' });
    assert.equal(aceptadas.headers['x-total-count'], '5');
    assert.ok(aceptadas.body.every((v) => v.resultado === 'aceptada'));
  });

  test('otro organizador no las ve: 403', async () => {
    const r = await ctx.api.get(`/eventos/${esta_noche.id}/validaciones`).set(otro.auth);
    assert.equal(r.status, 403);
    cumpleContrato('listarValidacionesDelEvento', r);
  });
});
