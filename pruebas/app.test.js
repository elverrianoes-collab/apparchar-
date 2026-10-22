// La aplicación: documentación, salud, rutas inexistentes y esquema de la base.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { crearContexto } from './ayudas.js';
import { RAIZ } from '../servidor/config.js';
import { ARCHIVO_ESQUEMA } from '../servidor/db/migrar.js';

let ctx;
before(async () => { ctx = await crearContexto(); });
after(() => ctx.cerrar());

describe('Documentación y salud', () => {
  test('GET / describe la API y enlaza la documentación', async () => {
    const r = await ctx.api.get('/');
    assert.equal(r.status, 200);
    assert.equal(r.body.documentacion, '/docs');
  });

  test('GET /docs sirve Swagger UI y /openapi.json el contrato apuntando a este servidor', async () => {
    const docs = await ctx.api.get('/docs/').redirects(1);
    assert.equal(docs.status, 200);
    assert.match(docs.text, /swagger-ui/i);
    const contrato = await ctx.api.get('/openapi.json');
    assert.equal(contrato.status, 200);
    assert.equal(contrato.body.openapi, '3.1.0');
    assert.equal(contrato.body.servers[0].url, '/');
  });

  test('el servidor publica la web en /app y un navegador que abre / llega al panel', async () => {
    const raiz = await ctx.api.get('/').set('Accept', 'text/html,application/xhtml+xml');
    assert.equal(raiz.status, 302);
    assert.equal(raiz.headers.location, '/app/panel.html');
    const panel = await ctx.api.get('/app/panel.html');
    assert.equal(panel.status, 200);
    assert.match(panel.headers['content-type'], /text\/html/);
    assert.match(panel.text, /Panel del organizador/);
    const script = await ctx.api.get('/app/js/panel.js');
    assert.equal(script.status, 200);
    assert.match(script.headers['content-type'], /javascript/);
    const cartelera = await ctx.api.get('/app/');
    assert.equal(cartelera.status, 200);
    assert.match(cartelera.text, /panel\.html/);
  });

  test('GET /salud consulta la base', async () => {
    const r = await ctx.api.get('/salud');
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, 'ok');
  });

  test('un cuerpo en otra codificación que UTF-8 responde 400, no 500', async () => {
    const r = await ctx.api.post('/organizadores').set('Content-Type', 'application/json; charset=latin1').send('{}');
    assert.equal(r.status, 400);
    assert.equal(r.body.codigo, 'solicitud_invalida');
  });

  test('una ruta que no existe responde 404 con el formato de error', async () => {
    const r = await ctx.api.get('/no-existe');
    assert.equal(r.status, 404);
    assert.equal(r.body.codigo, 'ruta_no_encontrada');
  });
});

describe('Esquema de la base', () => {
  test('servidor/db/esquema.sql es el mismo DDL de docs/modelo-datos.md (§11)', () => {
    const modelo = fs.readFileSync(path.join(RAIZ, 'docs', 'modelo-datos.md'), 'utf8');
    const ddl = modelo.match(/```sql\n([\s\S]*?)```/)[1];
    assert.equal(fs.readFileSync(ARCHIVO_ESQUEMA, 'utf8'), ddl);
  });

  test('la base rechaza una clave guardada en claro (CHECK de clave_hash)', async () => {
    await assert.rejects(
      ctx.db.consultar(
        "INSERT INTO organizador (nombre, correo, telefono, municipio, clave_hash) VALUES ('Colectivo', 'claro@ejemplo.co', '+573105550148', 'Yopal', 'SabanaRock2026')",
      ),
      /clave_hash/,
    );
  });
});
