// Los datos de demostración (npm run semilla / npm run demo) se cargan y sirven.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearContexto } from './ayudas.js';
import { CLAVE_DEMO, cargarSemilla } from '../servidor/db/semilla.js';

let ctx;
let datos;
before(async () => {
  ctx = await crearContexto();
  datos = await cargarSemilla(ctx.db);
});
after(() => ctx.cerrar());

test('la cartelera de demostración tiene cuatro eventos y el stand-up está agotado', async () => {
  const r = await ctx.api.get('/eventos');
  assert.equal(r.body.length, 4);
  assert.equal(r.body.find((e) => e.nombre.startsWith('Stand-up')).estado, 'agotado');
});

test('el organizador de demostración entra con su clave y ve su borrador en el panel', async () => {
  const sesion = await ctx.api.post('/sesiones').send({ correo: 'demo@apparchar.co', clave: CLAVE_DEMO });
  assert.equal(sesion.status, 200);
  const panel = await ctx.api.get(`/organizadores/${datos.organizador.id}/eventos`).set('Authorization', `Bearer ${sesion.body.token}`);
  assert.ok(panel.body.some((e) => e.estado === 'borrador'));
});

test('las boletas de la orden pagada entran por la puerta del concierto de esta noche', async () => {
  assert.equal(datos.codigos.length, 3);
  const sesion = await ctx.api.post('/sesiones').send({ correo: 'demo@apparchar.co', clave: CLAVE_DEMO });
  const r = await ctx.api.post(`/eventos/${datos.evento.id}/validaciones`)
    .set('Authorization', `Bearer ${sesion.body.token}`)
    .send({ codigo_leido: datos.codigos[0], validada_por: 'Portero de prueba' });
  assert.equal(r.status, 201);
  assert.equal(r.body.resultado, 'aceptada');
});

test('volver a cargar la semilla deja la base igual (se puede repetir antes de cada demostración)', async () => {
  const otraVez = await cargarSemilla(ctx.db);
  const { rows } = await ctx.db.consultar('SELECT count(*)::int AS n FROM organizador');
  assert.equal(rows[0].n, 2);
  assert.notEqual(otraVez.evento.id, datos.evento.id);
});
