// CRUD de eventos: crear (borrador, con o sin tipos de boleta), leer (cartelera,
// detalle y panel del organizador), actualizar (editar, publicar, pausar o
// cancelar, con bloqueo optimista) y eliminar (solo borradores).
import crypto from 'node:crypto';
import { conflicto, noEncontrado, reglaDeNegocio, sinPermiso, solicitudInvalida } from '../../comun/errores.js';
import { fechaColombia, fechaLegible, inicioDelDiaColombia, serializar } from '../../comun/formato.js';
import { leerPaginacion } from '../../comun/paginacion.js';
import { completarTipoNuevo, validarFechasDelEvento, validarTiposDelEvento } from './reglas.js';

const COLUMNAS_EVENTO = `id, organizador_id, nombre, slug, descripcion, categoria, lugar, direccion, municipio,
  fecha_inicio, fecha_fin, aforo_total, edad_minima, es_gratuito, politica_reembolso, imagen_url,
  estado, version, creado_en, actualizado_en`;
export const COLUMNAS_TIPO = `id, evento_id, nombre, descripcion, precio_cop, cantidad_total, cantidad_vendida,
  maximo_por_orden, venta_inicia_en, venta_termina_en, creado_en, actualizado_en`;

const eventoNoEncontrado = () => noEncontrado('evento_no_encontrado', 'No encontramos ese evento.');

// ------------------------------------------------------------------ respuesta
// Un Evento del contrato lleva anidados su organizador (parte pública) y sus tipos de boleta.
export async function completarEventos(db, filas) {
  if (!filas.length) return [];
  const ids = filas.map((f) => f.id);
  const idsOrganizadores = [...new Set(filas.map((f) => f.organizador_id))];
  const tipos = await db.consultar(
    `SELECT ${COLUMNAS_TIPO} FROM tipo_boleta WHERE evento_id = ANY($1::uuid[]) ORDER BY creado_en, id`,
    [ids],
  );
  const organizadores = await db.consultar(
    'SELECT id, nombre, municipio FROM organizador WHERE id = ANY($1::uuid[])',
    [idsOrganizadores],
  );
  const organizadorPorId = new Map(organizadores.rows.map((o) => [o.id, o]));
  const tiposPorEvento = new Map(ids.map((id) => [id, []]));
  for (const tipo of tipos.rows) tiposPorEvento.get(tipo.evento_id).push(serializar(tipo));
  return filas.map((f) => ({
    ...serializar(f),
    organizador: organizadorPorId.get(f.organizador_id),
    tipos_boleta: tiposPorEvento.get(f.id),
  }));
}

export async function obtenerCompleto(db, id) {
  const { rows } = await db.consultar(`SELECT ${COLUMNAS_EVENTO} FROM evento WHERE id = $1`, [id]);
  const [evento] = await completarEventos(db, rows);
  return evento;
}

// Un borrador solo lo ve su dueño; para cualquier otra persona «no existe».
export async function buscarVisible(db, id, organizador) {
  const { rows } = await db.consultar('SELECT id, organizador_id, estado FROM evento WHERE id = $1', [id]);
  const evento = rows[0];
  if (!evento || (evento.estado === 'borrador' && evento.organizador_id !== organizador?.id)) throw eventoNoEncontrado();
  return evento;
}

// 404 si no existe; 403 si es de otro organizador. Devuelve la fila completa.
export async function exigirEventoPropio(db, organizador, id, mensajeSinPermiso, { bloquear = false } = {}) {
  const { rows } = await db.consultar(
    `SELECT ${COLUMNAS_EVENTO} FROM evento WHERE id = $1${bloquear ? ' FOR NO KEY UPDATE' : ''}`,
    [id],
  );
  if (!rows[0]) throw eventoNoEncontrado();
  if (rows[0].organizador_id !== organizador.id) throw sinPermiso(mensajeSinPermiso);
  return rows[0];
}

// ------------------------------------------------------------------ crear
const SIN_TILDES = /[̀-ͯ]/g;
const ALFABETO_SLUG = 'abcdefghijklmnopqrstuvwxyz0123456789';

// «Noche de rock llanero» → noche-de-rock-llanero-2026-7d40 (único e inmutable).
async function generarSlug(db, nombre, fechaInicio) {
  const base = nombre.normalize('NFD').replace(SIN_TILDES, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120).replace(/-+$/, '') || 'evento';
  const anio = fechaColombia(fechaInicio).slice(0, 4);
  for (;;) {
    const sufijo = Array.from({ length: 4 }, () => ALFABETO_SLUG[crypto.randomInt(ALFABETO_SLUG.length)]).join('');
    const slug = `${base}-${anio}-${sufijo}`;
    const { rows } = await db.consultar('SELECT 1 FROM evento WHERE slug = $1', [slug]);
    if (!rows.length) return slug;
  }
}

// Dos tipos con el mismo nombre en la misma petición: 400, sin consultar la base.
function revisarNombresRepetidos(tipos) {
  const vistos = new Map();
  const detalles = [];
  tipos.forEach((tipo, i) => {
    const nombre = tipo.nombre.trim();
    if (vistos.has(nombre)) {
      detalles.push({
        campo: `tipos_boleta[${i}].nombre`,
        problema: `«${nombre}» ya está en tipos_boleta[${vistos.get(nombre)}]; cada tipo del evento necesita un nombre distinto.`,
      });
    } else {
      vistos.set(nombre, i);
    }
  });
  if (detalles.length) throw solicitudInvalida(detalles);
}

// `posicion` separa por un microsegundo los tipos que se crean en la misma
// transacción (comparten now()), para que se listen en el orden en que llegaron.
export async function insertarTipo(db, eventoId, tipo, posicion = 0) {
  const { rows } = await db.consultar(
    `INSERT INTO tipo_boleta (evento_id, nombre, descripcion, precio_cop, cantidad_total, maximo_por_orden,
       venta_inicia_en, venta_termina_en, creado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + $9::int * interval '1 microsecond')
     RETURNING ${COLUMNAS_TIPO}`,
    [eventoId, tipo.nombre, tipo.descripcion, tipo.precio_cop, tipo.cantidad_total, tipo.maximo_por_orden,
      tipo.venta_inicia_en, tipo.venta_termina_en, posicion],
  );
  return serializar(rows[0]);
}

export async function crear(db, organizador, datos) {
  const tiposPedidos = datos.tipos_boleta ?? [];
  revisarNombresRepetidos(tiposPedidos);
  validarFechasDelEvento(datos, { exigirFutura: true });
  const tipos = tiposPedidos.map((t) => completarTipoNuevo(t, datos));
  validarTiposDelEvento(datos, tipos, { campo: (i, nombre) => (i === null ? nombre : `tipos_boleta[${i}].${nombre}`) });

  return db.transaccion(async (tx) => {
    const slug = await generarSlug(tx, datos.nombre, datos.fecha_inicio);
    const { rows } = await tx.consultar(
      `INSERT INTO evento (organizador_id, nombre, slug, descripcion, categoria, lugar, direccion, municipio,
         fecha_inicio, fecha_fin, aforo_total, edad_minima, es_gratuito, politica_reembolso, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [organizador.id, datos.nombre.trim(), slug, datos.descripcion, datos.categoria, datos.lugar, datos.direccion,
        datos.municipio, datos.fecha_inicio, datos.fecha_fin, datos.aforo_total, datos.edad_minima ?? null,
        datos.es_gratuito ?? false, datos.politica_reembolso ?? 'hasta_24h_antes', datos.imagen_url ?? null],
    );
    const eventoId = rows[0].id;
    for (const [posicion, tipo] of tipos.entries()) await insertarTipo(tx, eventoId, tipo, posicion);
    return obtenerCompleto(tx, eventoId);
  });
}

// ------------------------------------------------------------------ leer
export async function obtener(db, id, organizador) {
  await buscarVisible(db, id, organizador);
  return obtenerCompleto(db, id);
}

// La cartelera pública: solo eventos publicados y agotados.
export async function listarCartelera(db, consulta) {
  if (consulta.desde && consulta.hasta && consulta.hasta < consulta.desde) {
    throw solicitudInvalida([{ campo: 'hasta', problema: `Debe ser igual o posterior a desde (${consulta.desde}).` }]);
  }
  const condiciones = [];
  const valores = [];
  const agregar = (sql, valor) => {
    valores.push(valor);
    condiciones.push(sql.replace('?', `$${valores.length}`));
  };
  if (consulta.estado) agregar('estado = ?', consulta.estado);
  else condiciones.push("estado IN ('publicado', 'agotado')");
  if (consulta.municipio) agregar('municipio = ?', consulta.municipio);
  if (consulta.categoria) agregar('categoria = ?', consulta.categoria);
  if (consulta.slug) agregar('slug = ?', consulta.slug);
  if (consulta.desde) agregar('fecha_inicio >= ?', inicioDelDiaColombia(consulta.desde));
  if (consulta.hasta) agregar('fecha_inicio < ?', inicioDelDiaColombia(consulta.hasta, 1));
  // Sin mayúsculas ni tildes: «silbon» encuentra «Silbón» (índice evento_busqueda_idx).
  // % y _ se escapan para que se busquen como texto y no como comodines de LIKE.
  if (consulta.q) {
    agregar("f_unaccent(lower(nombre || ' ' || lugar)) LIKE '%' || f_unaccent(lower(?)) || '%' ESCAPE '\\'",
      consulta.q.replace(/[\\%_]/g, '\\$&'));
  }

  const donde = `WHERE ${condiciones.join(' AND ')}`;
  const direccion = consulta.orden === '-fecha_inicio' ? 'DESC' : 'ASC';
  const { limite, desplazamiento } = leerPaginacion(consulta);
  const total = await db.consultar(`SELECT count(*)::int AS total FROM evento ${donde}`, valores);
  const { rows } = await db.consultar(
    `SELECT ${COLUMNAS_EVENTO} FROM evento ${donde}
     ORDER BY fecha_inicio ${direccion}, id LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, desplazamiento],
  );
  return { eventos: await completarEventos(db, rows), total: total.rows[0].total };
}

// «Mis eventos»: todos los del organizador, en cualquier estado.
export async function listarDelOrganizador(db, organizador, organizadorId, consulta) {
  const existe = await db.consultar('SELECT 1 FROM organizador WHERE id = $1', [organizadorId]);
  if (!existe.rows.length) throw noEncontrado('organizador_no_encontrado', 'No encontramos ese organizador.');
  if (organizador.id !== organizadorId) throw sinPermiso('Solo puedes ver el panel de tus propios eventos.');

  const valores = [organizadorId];
  let donde = 'WHERE organizador_id = $1';
  if (consulta.estado) {
    valores.push(consulta.estado);
    donde += ' AND estado = $2';
  }
  const { limite, desplazamiento } = leerPaginacion(consulta);
  const total = await db.consultar(`SELECT count(*)::int AS total FROM evento ${donde}`, valores);
  const { rows } = await db.consultar(
    `SELECT ${COLUMNAS_EVENTO} FROM evento ${donde} ORDER BY fecha_inicio, id LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, desplazamiento],
  );
  return { eventos: await completarEventos(db, rows), total: total.rows[0].total };
}

// ------------------------------------------------------------------ actualizar
// Transiciones que puede pedir el organizador (§9 del modelo). Las demás las hace el sistema.
const TRANSICIONES = {
  borrador: ['publicado'],
  publicado: ['pausado', 'cancelado'],
  pausado: ['publicado', 'cancelado'],
  agotado: ['cancelado'],
};

const CAMPOS_EDITABLES = ['nombre', 'descripcion', 'categoria', 'lugar', 'direccion', 'municipio', 'fecha_inicio',
  'fecha_fin', 'aforo_total', 'edad_minima', 'es_gratuito', 'politica_reembolso', 'imagen_url'];

// ¿Quedó sin cupo? Se pregunta al publicar o reanudar.
async function sinCupo(db, eventoId) {
  const { rows } = await db.consultar(
    `SELECT count(*)::int AS tipos, count(*) FILTER (WHERE cantidad_vendida < cantidad_total)::int AS con_cupo
       FROM tipo_boleta WHERE evento_id = $1`,
    [eventoId],
  );
  return rows[0].tipos > 0 && rows[0].con_cupo === 0;
}

// Al cancelar: las órdenes pagadas se reembolsan (y sus boletas se cancelan), las
// pendientes expiran y el cupo que comprometían se libera. Primero se cambia el
// estado de las órdenes y se trabaja solo con las que cambiaron (RETURNING): si
// en ese instante se paga o se anula una orden, el bloqueo de su fila hace que
// cada orden pase por un solo camino y el cupo no se libere dos veces.
async function cancelarVentas(tx, eventoId) {
  const { rows } = await tx.consultar(
    `UPDATE orden SET estado = CASE WHEN estado = 'pagada' THEN 'reembolsada'::estado_orden ELSE 'expirada'::estado_orden END
      WHERE evento_id = $1 AND estado IN ('pendiente', 'pagada')
      RETURNING id, estado`,
    [eventoId],
  );
  if (!rows.length) return;
  await tx.consultar(
    `UPDATE tipo_boleta t SET cantidad_vendida = t.cantidad_vendida - l.cantidad
       FROM (SELECT tipo_boleta_id, sum(cantidad)::int AS cantidad
               FROM item_orden WHERE orden_id = ANY($1::uuid[]) GROUP BY tipo_boleta_id) l
      WHERE t.id = l.tipo_boleta_id`,
    [rows.map((r) => r.id)],
  );
  const reembolsadas = rows.filter((r) => r.estado === 'reembolsada').map((r) => r.id);
  if (reembolsadas.length) {
    await tx.consultar("UPDATE boleta SET estado = 'cancelada' WHERE estado = 'valida' AND orden_id = ANY($1::uuid[])", [reembolsadas]);
  }
}

export async function actualizar(db, organizador, id, cambios) {
  return db.transaccion(async (tx) => {
    const actual = await exigirEventoPropio(tx, organizador, id, 'Solo puedes editar tus propios eventos.', { bloquear: true });

    if (['cancelado', 'finalizado'].includes(actual.estado)) {
      throw conflicto('transicion_no_permitida', `«${actual.nombre}» está ${actual.estado}: ya no admite cambios.`);
    }
    if (cambios.version !== actual.version) {
      throw conflicto(
        'conflicto_de_version',
        `Alguien guardó cambios en este evento después de que lo abriste (versión actual ${actual.version}, enviaste ${cambios.version}). Recarga el evento y vuelve a intentarlo.`,
      );
    }

    // Estado pedido por el organizador.
    let estado = actual.estado;
    if (cambios.estado !== undefined) {
      if (!TRANSICIONES[actual.estado]?.includes(cambios.estado)) {
        const mensaje = actual.estado === 'agotado' && cambios.estado === 'publicado'
          ? `«${actual.nombre}» está agotado: vuelve a publicado solo cuando se libera cupo. Puedes cancelarlo, pero no publicarlo a mano.`
          : `No se puede pasar «${actual.nombre}» de ${actual.estado} a ${cambios.estado}.`;
        throw conflicto('transicion_no_permitida', mensaje);
      }
      estado = cambios.estado;
    }

    const nuevo = { ...actual };
    for (const campo of CAMPOS_EDITABLES) if (cambios[campo] !== undefined) nuevo[campo] = cambios[campo];

    const tipos = (await tx.consultar(
      'SELECT nombre, precio_cop, cantidad_total, venta_termina_en FROM tipo_boleta WHERE evento_id = $1 ORDER BY creado_en',
      [id],
    )).rows;

    if (actual.estado === 'borrador' && estado === 'publicado' && !tipos.length) {
      throw conflicto('evento_sin_tipos_de_boleta', 'Para publicar el evento agrega al menos un tipo de boleta.');
    }

    // Reglas de datos (422).
    const cambianFechas = cambios.fecha_inicio !== undefined || cambios.fecha_fin !== undefined;
    const sePublica = actual.estado === 'borrador' && estado === 'publicado';
    if (cambianFechas || sePublica) {
      validarFechasDelEvento(nuevo, { exigirFutura: sePublica || cambios.fecha_inicio !== undefined });
    }
    if (cambios.fecha_fin !== undefined) {
      const tardio = tipos.find((t) => new Date(t.venta_termina_en) > new Date(nuevo.fecha_fin));
      if (tardio) {
        throw reglaDeNegocio(
          'fechas_incoherentes',
          `La hora de cierre (${fechaLegible(nuevo.fecha_fin)}) es anterior al fin de la venta de «${tardio.nombre}» (${fechaLegible(tardio.venta_termina_en)}).`,
          [{ campo: 'fecha_fin', problema: 'Debe ser posterior a fecha_inicio y a la venta_termina_en de cada tipo.' }],
        );
      }
    }
    const cupos = tipos.reduce((total, t) => total + t.cantidad_total, 0);
    if (cambios.aforo_total !== undefined && cupos > nuevo.aforo_total) {
      throw reglaDeNegocio(
        'aforo_excedido',
        `Los tipos de boleta suman ${cupos} cupos; el aforo no puede bajar a ${nuevo.aforo_total}.`,
        [{ campo: 'aforo_total', problema: `Debe ser al menos ${cupos}.` }],
      );
    }
    if (cambios.es_gratuito === true) {
      const conPrecio = tipos.filter((t) => t.precio_cop > 0).map((t) => `«${t.nombre}»`);
      if (conPrecio.length) {
        throw reglaDeNegocio(
          'precio_en_evento_gratuito',
          `No puedes marcar el evento como gratuito: ${conPrecio.join(', ')} ${conPrecio.length > 1 ? 'tienen' : 'tiene'} precio.`,
          [{ campo: 'es_gratuito', problema: 'Primero deja en 0 el precio de cada tipo de boleta.' }],
        );
      }
    }

    // Al publicar o reanudar sin cupo disponible, el evento queda agotado.
    if (estado === 'publicado' && (await sinCupo(tx, id))) estado = 'agotado';

    const columnas = [];
    const valores = [];
    for (const campo of CAMPOS_EDITABLES) {
      if (cambios[campo] !== undefined) {
        valores.push(cambios[campo]);
        columnas.push(`${campo} = $${valores.length}`);
      }
    }
    valores.push(estado);
    columnas.push(`estado = $${valores.length}`);
    valores.push(id, cambios.version);
    // El disparador sube version; si otra persona guardó antes, no se actualiza nada.
    const resultado = await tx.consultar(
      `UPDATE evento SET ${columnas.join(', ')} WHERE id = $${valores.length - 1} AND version = $${valores.length} RETURNING id`,
      valores,
    );
    if (!resultado.rows.length) {
      throw conflicto('conflicto_de_version', 'Alguien guardó cambios en este evento al mismo tiempo. Recarga el evento y vuelve a intentarlo.');
    }

    if (estado === 'cancelado') await cancelarVentas(tx, id);
    return obtenerCompleto(tx, id);
  });
}

// ------------------------------------------------------------------ eliminar
export async function eliminar(db, organizador, id) {
  const evento = await exigirEventoPropio(db, organizador, id, 'Solo puedes borrar tus propios eventos.');
  if (evento.estado !== 'borrador') {
    throw conflicto(
      'evento_no_eliminable',
      `Solo se borran eventos en borrador. «${evento.nombre}» está ${evento.estado}; si no se va a hacer, cancélalo.`,
    );
  }
  await db.consultar('DELETE FROM evento WHERE id = $1', [id]); // sus tipos se borran en cascada
}

// ------------------------------------------------------------------ tarea del sistema
// Los eventos publicados, pausados o agotados cuya hora de cierre ya pasó quedan finalizados.
export async function finalizarEventosVencidos(db) {
  await db.consultar(
    "UPDATE evento SET estado = 'finalizado' WHERE estado IN ('publicado', 'pausado', 'agotado') AND fecha_fin <= now()",
  );
}
