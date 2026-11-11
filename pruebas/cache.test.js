// Caché de la cartelera (Valkey en compose y en Render). Aquí se usa una caché en
// memoria con la misma interfaz, para probar la lógica sin levantar Valkey: la
// cartelera se sirve desde la caché y cualquier escritura la invalida antes de
// responder. El CI prueba además el conjunto real con docker compose.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { conectar } from '../servidor/db/conexion.js';
import { prepararEsquema } from '../servidor/db/migrar.js';
import { crearApp } from '../servidor/app.js';
import { CLAVE_VERSION } from '../servidor/comun/cache-cartelera.js';
import { crearEventoPublicado, registrarYEntrar } from './ayudas.js';

function cacheEnMemoria() {
  const datos = new Map();
  return {
    motor: 'memoria',
    cliente: null,
    activa: true,
    datos,
    disponible() { return this.activa; },
    obtener: async (clave) => datos.get(clave) ?? null,
    guardar: async (clave, valor) => { datos.set(clave, valor); },
    incrementar: async (clave) => { datos.set(clave, String(Number(datos.get(clave) || 0) + 1)); },
    cerrar: async () => {},
  };
}

let db;
let cache;
let api;
let dueno;
before(async () => {
  db = await conectar();
  await prepararEsquema(db);
  cache = cacheEnMemoria();
  api = request(crearApp({ db, cache }));
  dueno = await registrarYEntrar(api);
});
after(() => db.cerrar());

describe('Caché de la cartelera (GET /eventos)', () => {
  test('la segunda lectura sale de la caché con el mismo cuerpo y el mismo X-Total-Count', async () => {
    await crearEventoPublicado(api, dueno.auth);
    const primera = await api.get('/eventos?por_pagina=5');
    const segunda = await api.get('/eventos?por_pagina=5');
    assert.equal(primera.status, 200);
    assert.equal(primera.headers['x-cache'], 'MISS');
    assert.equal(segunda.headers['x-cache'], 'HIT');
    assert.deepEqual(segunda.body, primera.body);
    assert.equal(segunda.headers['x-total-count'], primera.headers['x-total-count']);
  });

  test('publicar un evento invalida la caché: la siguiente lectura ya lo trae', async () => {
    const antes = await api.get('/eventos');
    const total = Number(antes.headers['x-total-count']);
    const nuevo = await crearEventoPublicado(api, dueno.auth);
    const despues = await api.get('/eventos');
    assert.equal(despues.headers['x-cache'], 'MISS');
    assert.equal(Number(despues.headers['x-total-count']), total + 1);
    assert.ok(despues.body.some((e) => e.id === nuevo.id));
  });

  test('iniciar sesión o una escritura fallida no invalidan la cartelera', async () => {
    await api.get('/eventos');
    const version = cache.datos.get(CLAVE_VERSION);
    await registrarYEntrar(api); // POST /organizadores sí invalida: se mide después
    const despuesDeRegistro = cache.datos.get(CLAVE_VERSION);
    await api.post('/sesiones').send({ correo: 'nadie@ejemplo.co', clave: 'NoExiste2026' });
    await api.post('/eventos').set(dueno.auth).send({});
    assert.notEqual(despuesDeRegistro, version);
    assert.equal(cache.datos.get(CLAVE_VERSION), despuesDeRegistro);
  });

  test('una respuesta con error (400) no se guarda en la caché', async () => {
    const r1 = await api.get('/eventos?por_pagina=999');
    const r2 = await api.get('/eventos?por_pagina=999');
    assert.equal(r1.status, 400);
    assert.equal(r2.headers['x-cache'], 'MISS');
  });

  test('sin caché disponible la cartelera se consulta directo, sin X-Cache', async () => {
    cache.activa = false;
    try {
      const r = await api.get('/eventos');
      assert.equal(r.status, 200);
      assert.equal(r.headers['x-cache'], undefined);
    } finally {
      cache.activa = true;
    }
  });
});

describe('Salud (GET /salud)', () => {
  test('informa la base, la caché y no se guarda en cachés intermedias', async () => {
    const r = await api.get('/salud');
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, 'ok');
    assert.equal(r.body.cache, 'valkey');
    assert.equal(r.headers['cache-control'], 'no-store');
  });
});
