// CRUD de organizadores: crear, leer, actualizar y eliminar.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearContexto, cumpleContrato, datosOrganizador, registrarYEntrar } from './ayudas.js';

let ctx;
before(async () => { ctx = await crearContexto(); });
after(() => ctx.cerrar());

describe('Crear (POST /organizadores)', () => {
  test('registra un organizador: 201, Location y sin la clave en la respuesta', async () => {
    const datos = datosOrganizador({ correo: 'Fundacion.Joropo@Ejemplo.CO' });
    const r = await ctx.api.post('/organizadores').send(datos);
    assert.equal(r.status, 201);
    cumpleContrato('registrarOrganizador', r);
    assert.equal(r.headers.location, `/organizadores/${r.body.id}`);
    assert.equal(r.body.correo, 'fundacion.joropo@ejemplo.co', 'el correo se guarda en minúsculas');
    assert.equal(r.body.clave, undefined);
    assert.equal(r.body.clave_hash, undefined);
  });

  test('la clave se guarda como hash bcrypt, nunca en claro', async () => {
    const datos = datosOrganizador();
    await ctx.api.post('/organizadores').send(datos);
    const { rows } = await ctx.db.consultar('SELECT clave_hash FROM organizador WHERE correo = $1', [datos.correo]);
    assert.match(rows[0].clave_hash, /^\$2[aby]\$10\$.{53}$/);
    assert.notEqual(rows[0].clave_hash, datos.clave);
  });

  test('un correo repetido (sin importar mayúsculas) responde 409 correo_ya_registrado', async () => {
    const datos = datosOrganizador();
    await ctx.api.post('/organizadores').send(datos);
    const r = await ctx.api.post('/organizadores').send({ ...datos, correo: datos.correo.toUpperCase() });
    assert.equal(r.status, 409);
    cumpleContrato('registrarOrganizador', r);
    assert.equal(r.body.codigo, 'correo_ya_registrado');
  });

  test('valida el cuerpo contra el contrato: 400 con el detalle de cada campo', async () => {
    const r = await ctx.api.post('/organizadores').send({
      nombre: 'Yo', correo: 'no-es-correo', telefono: '3105550148', municipio: 'Mani', id: 'x',
    });
    assert.equal(r.status, 400);
    cumpleContrato('registrarOrganizador', r);
    const campos = r.body.detalles.map((d) => d.campo).sort();
    assert.deepEqual(campos, ['clave', 'correo', 'id', 'municipio', 'nombre', 'telefono']);
    const telefono = r.body.detalles.find((d) => d.campo === 'telefono');
    assert.match(telefono.problema, /\+573XXXXXXXXX/);
  });

  test('una clave de menos de 8 caracteres responde 400', async () => {
    const r = await ctx.api.post('/organizadores').send(datosOrganizador({ clave: 'corta' }));
    assert.equal(r.status, 400);
    assert.deepEqual(r.body.detalles, [{ campo: 'clave', problema: 'Debe tener al menos 8 caracteres.' }]);
  });

  test('los espacios al principio y al final no cuentan: un nombre de solo espacios responde 400', async () => {
    const r = await ctx.api.post('/organizadores').send(datosOrganizador({ nombre: '   ' }));
    assert.equal(r.status, 400);
    assert.deepEqual(r.body.detalles, [{ campo: 'nombre', problema: 'Debe tener al menos 3 caracteres.' }]);
    const conEspacios = await ctx.api.post('/organizadores').send(datosOrganizador({ nombre: '  Colectivo Joropo  ' }));
    assert.equal(conEspacios.status, 201);
    assert.equal(conEspacios.body.nombre, 'Colectivo Joropo');
  });

  test('una clave de más de 72 bytes responde 400 (bcrypt no la recortará en silencio)', async () => {
    const r = await ctx.api.post('/organizadores').send(datosOrganizador({ clave: 'ñ'.repeat(40) }));
    assert.equal(r.status, 400);
    assert.equal(r.body.detalles[0].campo, 'clave');
  });

  test('un JSON mal formado responde 400 solicitud_invalida', async () => {
    const r = await ctx.api.post('/organizadores').set('Content-Type', 'application/json').send('{"nombre": "Colectivo",}');
    assert.equal(r.status, 400);
    assert.equal(r.body.codigo, 'solicitud_invalida');
  });
});

describe('Leer (GET /organizadores/{id})', () => {
  test('devuelve el perfil público, sin correo ni teléfono', async () => {
    const { organizador } = await registrarYEntrar(ctx.api);
    const r = await ctx.api.get(`/organizadores/${organizador.id}`);
    assert.equal(r.status, 200);
    cumpleContrato('obtenerOrganizador', r);
    assert.deepEqual(Object.keys(r.body).sort(), ['id', 'municipio', 'nombre']);
  });

  test('404 si no existe y 400 si el id no es un UUID', async () => {
    const r404 = await ctx.api.get('/organizadores/2e4c1c1d-d769-4047-9880-c8295fa22263');
    assert.equal(r404.status, 404);
    cumpleContrato('obtenerOrganizador', r404);
    const r400 = await ctx.api.get('/organizadores/sabana-rock');
    assert.equal(r400.status, 400);
    cumpleContrato('obtenerOrganizador', r400);
    assert.equal(r400.body.detalles[0].campo, 'organizador_id');
  });
});

describe('Actualizar (PATCH /organizadores/{id})', () => {
  test('el propio organizador cambia sus datos', async () => {
    const { organizador, auth } = await registrarYEntrar(ctx.api);
    const r = await ctx.api.patch(`/organizadores/${organizador.id}`).set(auth).send({ telefono: '+573125550911', municipio: 'Aguazul' });
    assert.equal(r.status, 200);
    cumpleContrato('actualizarOrganizador', r);
    assert.equal(r.body.telefono, '+573125550911');
    assert.equal(r.body.municipio, 'Aguazul');
    assert.equal(r.body.nombre, organizador.nombre);
  });

  test('el id de la ruta se acepta también en mayúsculas', async () => {
    const { organizador, auth } = await registrarYEntrar(ctx.api);
    const r = await ctx.api.patch(`/organizadores/${organizador.id.toUpperCase()}`).set(auth).send({ municipio: 'Maní' });
    assert.equal(r.status, 200);
    assert.equal(r.body.id, organizador.id);
  });

  test('sin token responde 401; con un token falso, también', async () => {
    const { organizador } = await registrarYEntrar(ctx.api);
    const sinToken = await ctx.api.patch(`/organizadores/${organizador.id}`).send({ municipio: 'Maní' });
    assert.equal(sinToken.status, 401);
    cumpleContrato('actualizarOrganizador', sinToken);
    const falso = await ctx.api.patch(`/organizadores/${organizador.id}`).set('Authorization', 'Bearer abc.def.ghi').send({ municipio: 'Maní' });
    assert.equal(falso.status, 401);
    assert.equal(falso.body.codigo, 'no_autenticado');
  });

  test('con el token de otro organizador responde 403', async () => {
    const dueno = await registrarYEntrar(ctx.api);
    const otro = await registrarYEntrar(ctx.api);
    const r = await ctx.api.patch(`/organizadores/${dueno.organizador.id}`).set(otro.auth).send({ nombre: 'Intruso' });
    assert.equal(r.status, 403);
    cumpleContrato('actualizarOrganizador', r);
  });

  test('un cuerpo vacío responde 400 y un correo ajeno 409', async () => {
    const uno = await registrarYEntrar(ctx.api);
    const dos = await registrarYEntrar(ctx.api);
    const vacio = await ctx.api.patch(`/organizadores/${uno.organizador.id}`).set(uno.auth).send({});
    assert.equal(vacio.status, 400);
    cumpleContrato('actualizarOrganizador', vacio);
    const ajeno = await ctx.api.patch(`/organizadores/${uno.organizador.id}`).set(uno.auth).send({ correo: dos.datos.correo });
    assert.equal(ajeno.status, 409);
    cumpleContrato('actualizarOrganizador', ajeno);
  });

  test('cambiar la clave: la nueva sirve para entrar y la vieja ya no', async () => {
    const { organizador, auth, datos } = await registrarYEntrar(ctx.api);
    const r = await ctx.api.patch(`/organizadores/${organizador.id}`).set(auth).send({ clave: 'ClaveNueva2026' });
    assert.equal(r.status, 200);
    const vieja = await ctx.api.post('/sesiones').send({ correo: datos.correo, clave: datos.clave });
    assert.equal(vieja.status, 401);
    const nueva = await ctx.api.post('/sesiones').send({ correo: datos.correo, clave: 'ClaveNueva2026' });
    assert.equal(nueva.status, 200);
  });
});

describe('Eliminar (DELETE /organizadores/{id})', () => {
  test('el propio organizador borra su cuenta: 204, y su token deja de servir', async () => {
    const { organizador, auth } = await registrarYEntrar(ctx.api);
    const r = await ctx.api.delete(`/organizadores/${organizador.id}`).set(auth);
    assert.equal(r.status, 204);
    cumpleContrato('eliminarOrganizador', r);
    assert.equal((await ctx.api.get(`/organizadores/${organizador.id}`)).status, 404);
    const despues = await ctx.api.patch(`/organizadores/${organizador.id}`).set(auth).send({ nombre: 'Fantasma' });
    assert.equal(despues.status, 401);
  });

  test('con el token de otro organizador responde 403', async () => {
    const dueno = await registrarYEntrar(ctx.api);
    const otro = await registrarYEntrar(ctx.api);
    const r = await ctx.api.delete(`/organizadores/${dueno.organizador.id}`).set(otro.auth);
    assert.equal(r.status, 403);
    cumpleContrato('eliminarOrganizador', r);
  });

  test('no borra una cuenta con eventos: 409 organizador_con_eventos', async () => {
    const { organizador, auth } = await registrarYEntrar(ctx.api);
    await ctx.db.consultar(
      `INSERT INTO evento (organizador_id, nombre, slug, descripcion, categoria, lugar, direccion, municipio, fecha_inicio, fecha_fin, aforo_total)
       VALUES ($1, 'Feria de prueba', 'feria-de-prueba-2030-a1b2', 'Una feria con más de veinte caracteres.', 'festival', 'Parque', 'Calle 1 # 2-3', 'Yopal', '2030-01-10T20:00:00-05:00', '2030-01-10T23:00:00-05:00', 100)`,
      [organizador.id],
    );
    const r = await ctx.api.delete(`/organizadores/${organizador.id}`).set(auth);
    assert.equal(r.status, 409);
    cumpleContrato('eliminarOrganizador', r);
    assert.equal(r.body.codigo, 'organizador_con_eventos');
  });
});
