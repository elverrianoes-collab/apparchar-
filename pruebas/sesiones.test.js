// Autenticación: inicio de sesión con JWT y protección de las rutas.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { crearContexto, cumpleContrato, registrarYEntrar } from './ayudas.js';

let ctx;
before(async () => { ctx = await crearContexto(); });
after(() => ctx.cerrar());

describe('Iniciar sesión (POST /sesiones)', () => {
  test('con correo y clave correctos entrega un JWT de 8 horas y los datos del organizador', async () => {
    const { datos, organizador } = await registrarYEntrar(ctx.api);
    const r = await ctx.api.post('/sesiones').send({ correo: datos.correo.toUpperCase(), clave: datos.clave });
    assert.equal(r.status, 200);
    cumpleContrato('iniciarSesion', r);
    assert.equal(r.body.tipo, 'Bearer');
    assert.equal(r.body.organizador.id, organizador.id);
    const contenido = jwt.decode(r.body.token);
    assert.equal(contenido.sub, organizador.id);
    assert.equal(contenido.exp - contenido.iat, 8 * 60 * 60);
    assert.equal(jwt.decode(r.body.token, { complete: true }).header.alg, 'HS256');
  });

  test('una clave equivocada y un correo inexistente responden igual: 401 credenciales_invalidas', async () => {
    const { datos } = await registrarYEntrar(ctx.api);
    const malaClave = await ctx.api.post('/sesiones').send({ correo: datos.correo, clave: 'otra-clave' });
    const sinCuenta = await ctx.api.post('/sesiones').send({ correo: 'nadie@ejemplo.co', clave: 'otra-clave' });
    for (const r of [malaClave, sinCuenta]) {
      assert.equal(r.status, 401);
      cumpleContrato('iniciarSesion', r);
      assert.equal(r.body.codigo, 'credenciales_invalidas');
    }
    assert.deepEqual(malaClave.body, sinCuenta.body);
  });

  test('sin clave responde 400', async () => {
    const r = await ctx.api.post('/sesiones').send({ correo: 'alguien@ejemplo.co' });
    assert.equal(r.status, 400);
    cumpleContrato('iniciarSesion', r);
  });
});

describe('Rutas protegidas', () => {
  test('rechazan un token vencido, uno sin vencimiento, uno firmado con otra clave y un encabezado mal escrito', async () => {
    const { organizador } = await registrarYEntrar(ctx.api);
    const ruta = `/organizadores/${organizador.id}`;
    const vencido = jwt.sign({}, process.env.JWT_SECRETO, { subject: organizador.id, issuer: 'apparchar', expiresIn: -10 });
    const otraFirma = jwt.sign({}, 'otra-clave-secreta', { subject: organizador.id, issuer: 'apparchar', expiresIn: '1h' });
    const sinVencimiento = jwt.sign({}, process.env.JWT_SECRETO, { subject: organizador.id, issuer: 'apparchar' });
    const casos = [
      { Authorization: `Bearer ${vencido}` },
      { Authorization: `Bearer ${sinVencimiento}` },
      { Authorization: `Bearer ${otraFirma}` },
      { Authorization: 'Token abc' },
    ];
    for (const encabezado of casos) {
      const r = await ctx.api.patch(ruta).set(encabezado).send({ nombre: 'Colectivo Nuevo' });
      assert.equal(r.status, 401, JSON.stringify(encabezado));
      cumpleContrato('actualizarOrganizador', r);
    }
    const r = await ctx.api.patch(ruta).set('Authorization', `Bearer ${vencido}`).send({ nombre: 'Colectivo Nuevo' });
    assert.match(r.body.mensaje, /venció/);
  });
});
