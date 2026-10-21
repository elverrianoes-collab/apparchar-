// CRUD de eventos: crear, leer (cartelera, detalle y panel), actualizar y eliminar.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearContexto, crearEvento, crearEventoPublicado, cumpleContrato, datosEvento, enDias, registrarYEntrar,
} from './ayudas.js';
import { ejecutarTareas } from '../servidor/tareas.js';

let ctx;
let dueno;
let otro;
before(async () => {
  ctx = await crearContexto();
  dueno = await registrarYEntrar(ctx.api);
  otro = await registrarYEntrar(ctx.api);
});
after(() => ctx.cerrar());

describe('Crear (POST /eventos)', () => {
  test('crea el evento en borrador, con slug, version 1 y sus tipos en orden', async () => {
    const r = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento());
    assert.equal(r.status, 201);
    cumpleContrato('crearEvento', r);
    assert.equal(r.headers.location, `/eventos/${r.body.id}`);
    assert.equal(r.body.estado, 'borrador');
    assert.equal(r.body.version, 1);
    assert.equal(r.body.organizador_id, dueno.organizador.id);
    assert.equal(r.body.organizador.nombre, dueno.organizador.nombre);
    assert.match(r.body.slug, /^noche-de-rock-llanero-sabana-electrica-en-vivo-\d{4}-[a-z0-9]{4}$/);
    assert.deepEqual(r.body.tipos_boleta.map((t) => t.nombre), ['Preventa', 'General']);
  });

  test('los tipos sin ventana de venta se venden desde ya hasta que empieza el evento', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const [preventa] = evento.tipos_boleta;
    assert.equal(new Date(preventa.venta_termina_en).getTime(), new Date(evento.fecha_inicio).getTime());
    assert.ok(new Date(preventa.venta_inicia_en) <= new Date());
    assert.equal(preventa.maximo_por_orden, 10);
    assert.equal(preventa.descripcion, null);
    assert.equal(preventa.cantidad_vendida, 0);
  });

  test('sin token responde 401', async () => {
    const r = await ctx.api.post('/eventos').send(datosEvento());
    assert.equal(r.status, 401);
    cumpleContrato('crearEvento', r);
  });

  test('400 si no cumple el esquema, si trae campos del servidor o tipos con el mismo nombre', async () => {
    const sinNombre = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento({ nombre: undefined }));
    assert.equal(sinNombre.status, 400);
    cumpleContrato('crearEvento', sinNombre);
    assert.deepEqual(sinNombre.body.detalles, [{ campo: 'nombre', problema: 'Es obligatorio.' }]);

    const conEstado = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento({ estado: 'publicado', categoria: 'coleo' }));
    assert.equal(conEstado.status, 400);
    assert.deepEqual(conEstado.body.detalles.map((d) => d.campo).sort(), ['categoria', 'estado']);

    const repetidos = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento({
      tipos_boleta: [{ nombre: 'General', precio_cop: 1000, cantidad_total: 10 }, { nombre: 'General', precio_cop: 2000, cantidad_total: 10 }],
    }));
    assert.equal(repetidos.status, 400);
    cumpleContrato('crearEvento', repetidos);
    assert.equal(repetidos.body.detalles[0].campo, 'tipos_boleta[1].nombre');
  });

  test('422 fechas_incoherentes: cierre antes del inicio o inicio en el pasado', async () => {
    const invertidas = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento({ fecha_fin: enDias(9) }));
    assert.equal(invertidas.status, 422);
    cumpleContrato('crearEvento', invertidas);
    assert.equal(invertidas.body.codigo, 'fechas_incoherentes');
    const pasada = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento({ fecha_inicio: enDias(-2), fecha_fin: enDias(-1) }));
    assert.equal(pasada.status, 422);
    assert.equal(pasada.body.codigo, 'fechas_incoherentes');
  });

  test('422 aforo_excedido, precio_en_evento_gratuito y ventana_de_venta_invalida', async () => {
    const aforo = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento({ aforo_total: 120 }));
    assert.equal(aforo.status, 422);
    cumpleContrato('crearEvento', aforo);
    assert.equal(aforo.body.codigo, 'aforo_excedido');

    const gratuito = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento({ es_gratuito: true }));
    assert.equal(gratuito.status, 422);
    cumpleContrato('crearEvento', gratuito);
    assert.equal(gratuito.body.detalles[0].campo, 'tipos_boleta[0].precio_cop');

    const ventana = await ctx.api.post('/eventos').set(dueno.auth).send(datosEvento({
      tipos_boleta: [{ nombre: 'General', precio_cop: 35000, cantidad_total: 100, venta_termina_en: enDias(12) }],
    }));
    assert.equal(ventana.status, 422);
    cumpleContrato('crearEvento', ventana);
    assert.equal(ventana.body.codigo, 'ventana_de_venta_invalida');
  });
});

describe('Leer: cartelera (GET /eventos)', () => {
  let feria;
  let teatro;
  before(async () => {
    const organizador = await registrarYEntrar(ctx.api, { municipio: 'Aguazul' });
    feria = await crearEventoPublicado(ctx.api, organizador.auth, {
      nombre: 'Feria de la mamona', categoria: 'festival', municipio: 'Aguazul', lugar: 'Parque principal',
      fecha_inicio: enDias(30, 10), fecha_fin: enDias(30, 22), aforo_total: 2000,
      tipos_boleta: [{ nombre: 'General', precio_cop: 15000, cantidad_total: 2000 }],
    });
    teatro = await crearEventoPublicado(ctx.api, organizador.auth, {
      nombre: 'La leyenda del Silbón', categoria: 'teatro', municipio: 'Aguazul', lugar: 'Teatrino El Morichal',
      fecha_inicio: enDias(31, 19), fecha_fin: enDias(31, 21), aforo_total: 180,
      tipos_boleta: [{ nombre: 'General', precio_cop: 12000, cantidad_total: 180 }],
    });
    await crearEvento(ctx.api, organizador.auth, { nombre: 'Borrador secreto en Aguazul', municipio: 'Aguazul' });
  });

  test('muestra solo eventos publicados o agotados, con X-Total-Count', async () => {
    const r = await ctx.api.get('/eventos').query({ municipio: 'Aguazul' });
    assert.equal(r.status, 200);
    cumpleContrato('listarEventos', r);
    assert.deepEqual(r.body.map((e) => e.nombre), ['Feria de la mamona', 'La leyenda del Silbón']);
    assert.equal(r.headers['x-total-count'], '2');
  });

  test('filtra por categoría, por texto sin tildes ni mayúsculas y por slug', async () => {
    const porCategoria = await ctx.api.get('/eventos').query({ municipio: 'Aguazul', categoria: 'teatro' });
    assert.deepEqual(porCategoria.body.map((e) => e.id), [teatro.id]);
    const porTexto = await ctx.api.get('/eventos').query({ q: 'SILBON' });
    assert.deepEqual(porTexto.body.map((e) => e.id), [teatro.id]);
    const porSlug = await ctx.api.get('/eventos').query({ slug: feria.slug });
    assert.deepEqual(porSlug.body.map((e) => e.id), [feria.id]);
    const comodin = await ctx.api.get('/eventos').query({ q: '%' });
    assert.equal(comodin.body.length, 0, '% se busca como texto, no como comodín');
  });

  test('filtra por fechas, ordena y pagina', async () => {
    const dia = feria.fecha_inicio.slice(0, 10);
    const delDia = await ctx.api.get('/eventos').query({ desde: dia, hasta: dia });
    assert.deepEqual(delDia.body.map((e) => e.id), [feria.id]);
    const pagina = await ctx.api.get('/eventos').query({ municipio: 'Aguazul', orden: '-fecha_inicio', por_pagina: 1 });
    assert.deepEqual(pagina.body.map((e) => e.id), [teatro.id]);
    assert.equal(pagina.headers['x-total-count'], '2');
  });

  test('400 con fechas invertidas, un municipio sin tilde o por_pagina fuera de rango', async () => {
    const invertidas = await ctx.api.get('/eventos').query({ desde: '2030-02-10', hasta: '2030-02-01' });
    assert.equal(invertidas.status, 400);
    cumpleContrato('listarEventos', invertidas);
    const municipio = await ctx.api.get('/eventos').query({ municipio: 'Mani' });
    assert.equal(municipio.status, 400);
    cumpleContrato('listarEventos', municipio);
    const porPagina = await ctx.api.get('/eventos').query({ por_pagina: 51 });
    assert.equal(porPagina.status, 400);
    cumpleContrato('listarEventos', porPagina);
    assert.deepEqual(porPagina.body.detalles, [{ campo: 'por_pagina', problema: 'Debe estar entre 1 y 50.' }]);
    for (const pagina of ['99999999999999999999', '1e20', '10001']) {
      const r = await ctx.api.get('/eventos').query({ pagina });
      assert.equal(r.status, 400, `pagina=${pagina}`);
    }
  });
});

describe('Leer: detalle (GET /eventos/{id}) y panel (GET /organizadores/{id}/eventos)', () => {
  test('un evento publicado es público', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const r = await ctx.api.get(`/eventos/${evento.id}`);
    assert.equal(r.status, 200);
    cumpleContrato('obtenerEvento', r);
  });

  test('un borrador solo lo ve su dueño; un token falso responde 401', async () => {
    const borrador = await crearEvento(ctx.api, dueno.auth);
    const anonimo = await ctx.api.get(`/eventos/${borrador.id}`);
    assert.equal(anonimo.status, 404);
    cumpleContrato('obtenerEvento', anonimo);
    assert.equal((await ctx.api.get(`/eventos/${borrador.id}`).set(otro.auth)).status, 404);
    const propio = await ctx.api.get(`/eventos/${borrador.id}`).set(dueno.auth);
    assert.equal(propio.status, 200);
    const falso = await ctx.api.get(`/eventos/${borrador.id}`).set('Authorization', 'Bearer falso');
    assert.equal(falso.status, 401);
    cumpleContrato('obtenerEvento', falso);
  });

  test('el panel muestra todos los eventos del organizador, también los borradores', async () => {
    const organizador = await registrarYEntrar(ctx.api);
    await crearEvento(ctx.api, organizador.auth, { nombre: 'Borrador del panel' });
    await crearEventoPublicado(ctx.api, organizador.auth, { nombre: 'Publicado del panel', fecha_inicio: enDias(20), fecha_fin: enDias(20, 23) });
    const r = await ctx.api.get(`/organizadores/${organizador.organizador.id}/eventos`).set(organizador.auth);
    assert.equal(r.status, 200);
    cumpleContrato('listarEventosDelOrganizador', r);
    assert.deepEqual(r.body.map((e) => e.estado), ['borrador', 'publicado']);
    const borradores = await ctx.api.get(`/organizadores/${organizador.organizador.id.toUpperCase()}/eventos`).set(organizador.auth).query({ estado: 'borrador' });
    assert.equal(borradores.status, 200, 'el id en mayúsculas también es el propio');
    assert.equal(borradores.headers['x-total-count'], '1');
  });

  test('el panel de otro organizador responde 403; uno que no existe, 404', async () => {
    const ajeno = await ctx.api.get(`/organizadores/${dueno.organizador.id}/eventos`).set(otro.auth);
    assert.equal(ajeno.status, 403);
    cumpleContrato('listarEventosDelOrganizador', ajeno);
    const inexistente = await ctx.api.get('/organizadores/2e4c1c1d-d769-4047-9880-c8295fa22263/eventos').set(otro.auth);
    assert.equal(inexistente.status, 404);
    cumpleContrato('listarEventosDelOrganizador', inexistente);
  });
});

describe('Actualizar (PATCH /eventos/{id})', () => {
  test('edita con la versión leída: sube version y el slug no cambia', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const r = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: 1, nombre: 'Noche de rock llanero (segunda fecha)' });
    assert.equal(r.status, 200);
    cumpleContrato('actualizarEvento', r);
    assert.equal(r.body.version, 2);
    assert.equal(r.body.slug, evento.slug);
  });

  test('con una versión vieja responde 409 conflicto_de_version', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: 1, aforo_total: 200 });
    const r = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: 1, aforo_total: 220 });
    assert.equal(r.status, 409);
    cumpleContrato('actualizarEvento', r);
    assert.equal(r.body.codigo, 'conflicto_de_version');
  });

  test('ciclo de estados: publicar, pausar, reanudar y cancelar', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    let version = evento.version;
    for (const estado of ['publicado', 'pausado', 'publicado', 'cancelado']) {
      const r = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version, estado });
      assert.equal(r.status, 200, `${estado}: ${JSON.stringify(r.body)}`);
      cumpleContrato('actualizarEvento', r);
      assert.equal(r.body.estado, estado);
      version = r.body.version;
    }
    const despues = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version, nombre: 'Ya no se puede' });
    assert.equal(despues.status, 409);
    cumpleContrato('actualizarEvento', despues);
    assert.equal(despues.body.codigo, 'transicion_no_permitida');
  });

  test('409 al publicar sin tipos de boleta o al pedir una transición que no existe', async () => {
    const sinTipos = await crearEvento(ctx.api, dueno.auth, { tipos_boleta: undefined });
    const r = await ctx.api.patch(`/eventos/${sinTipos.id}`).set(dueno.auth).send({ version: 1, estado: 'publicado' });
    assert.equal(r.status, 409);
    cumpleContrato('actualizarEvento', r);
    assert.equal(r.body.codigo, 'evento_sin_tipos_de_boleta');
    const pausarBorrador = await ctx.api.patch(`/eventos/${sinTipos.id}`).set(dueno.auth).send({ version: 1, estado: 'pausado' });
    assert.equal(pausarBorrador.status, 409);
    assert.equal(pausarBorrador.body.codigo, 'transicion_no_permitida');
  });

  test('400 sin version o pidiendo un estado que pone el sistema', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const sinVersion = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ nombre: 'Sin versión' });
    assert.equal(sinVersion.status, 400);
    cumpleContrato('actualizarEvento', sinVersion);
    const agotado = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: 1, estado: 'agotado' });
    assert.equal(agotado.status, 400);
    cumpleContrato('actualizarEvento', agotado);
  });

  test('422: cierre antes del fin de la venta, aforo menor que los cupos, gratuito con precios', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const cierre = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: 1, fecha_fin: enDias(10, 20) });
    assert.equal(cierre.status, 422);
    cumpleContrato('actualizarEvento', cierre);
    assert.equal(cierre.body.codigo, 'fechas_incoherentes');
    const aforo = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: 1, aforo_total: 100 });
    assert.equal(aforo.status, 422);
    cumpleContrato('actualizarEvento', aforo);
    assert.deepEqual(aforo.body.detalles, [{ campo: 'aforo_total', problema: 'Debe ser al menos 150.' }]);
    const gratuito = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: 1, es_gratuito: true });
    assert.equal(gratuito.status, 422);
    cumpleContrato('actualizarEvento', gratuito);
  });

  test('422 al publicar un borrador cuya fecha de inicio ya pasó', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    await ctx.db.consultar("UPDATE evento SET fecha_inicio = now() - interval '1 hour' WHERE id = $1", [evento.id]);
    const r = await ctx.api.patch(`/eventos/${evento.id}`).set(dueno.auth).send({ version: 2, estado: 'publicado' });
    assert.equal(r.status, 422);
    assert.equal(r.body.codigo, 'fechas_incoherentes');
  });

  test('con el token de otro organizador responde 403; si no existe, 404', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const ajeno = await ctx.api.patch(`/eventos/${evento.id}`).set(otro.auth).send({ version: 1, nombre: 'Robado' });
    assert.equal(ajeno.status, 403);
    cumpleContrato('actualizarEvento', ajeno);
    const inexistente = await ctx.api.patch('/eventos/2e4c1c1d-d769-4047-9880-c8295fa22263').set(otro.auth).send({ version: 1, nombre: 'Nada' });
    assert.equal(inexistente.status, 404);
    cumpleContrato('actualizarEvento', inexistente);
  });
});

describe('Eliminar (DELETE /eventos/{id})', () => {
  test('borra un borrador con sus tipos de boleta: 204', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const r = await ctx.api.delete(`/eventos/${evento.id}`).set(dueno.auth);
    assert.equal(r.status, 204);
    cumpleContrato('eliminarEvento', r);
    assert.equal((await ctx.api.get(`/eventos/${evento.id}`).set(dueno.auth)).status, 404);
    const { rows } = await ctx.db.consultar('SELECT count(*)::int AS n FROM tipo_boleta WHERE evento_id = $1', [evento.id]);
    assert.equal(rows[0].n, 0);
  });

  test('un evento publicado no se borra: 409 evento_no_eliminable', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth);
    const r = await ctx.api.delete(`/eventos/${evento.id}`).set(dueno.auth);
    assert.equal(r.status, 409);
    cumpleContrato('eliminarEvento', r);
  });

  test('con el token de otro organizador responde 403', async () => {
    const evento = await crearEvento(ctx.api, dueno.auth);
    const r = await ctx.api.delete(`/eventos/${evento.id}`).set(otro.auth);
    assert.equal(r.status, 403);
    cumpleContrato('eliminarEvento', r);
  });
});

describe('Tareas del sistema', () => {
  test('un evento publicado cuya hora de cierre pasó queda finalizado y sale de la cartelera', async () => {
    const evento = await crearEventoPublicado(ctx.api, dueno.auth, { nombre: 'Evento que ya pasó' });
    await ctx.db.consultar(
      "UPDATE evento SET fecha_inicio = now() - interval '3 hours', fecha_fin = now() - interval '1 hour' WHERE id = $1",
      [evento.id],
    );
    await ejecutarTareas(ctx.db);
    const r = await ctx.api.get(`/eventos/${evento.id}`);
    assert.equal(r.body.estado, 'finalizado');
    const cartelera = await ctx.api.get('/eventos').query({ q: 'Evento que ya pasó' });
    assert.equal(cartelera.body.length, 0);
  });
});
