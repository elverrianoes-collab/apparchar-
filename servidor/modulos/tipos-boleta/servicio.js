// CRUD de tipos de boleta: crear (agregar una localidad a un evento), leer,
// actualizar (precio, cupo, ventana de venta) y eliminar (solo sin ventas).
import { conflicto, noEncontrado, reglaDeNegocio, sinPermiso } from '../../comun/errores.js';
import { serializar } from '../../comun/formato.js';
import { completarTipoNuevo, validarTiposDelEvento } from '../eventos/reglas.js';
import { COLUMNAS_TIPO, exigirEventoPropio, insertarTipo } from '../eventos/servicio.js';

const tipoNoEncontrado = () => noEncontrado('tipo_boleta_no_encontrado', 'No encontramos ese tipo de boleta.');

const eventoNoDisponible = (evento, accion) =>
  conflicto('evento_no_disponible', `«${evento.nombre}» está ${evento.estado}: ${accion}.`);

// El sistema pone el evento en «agotado» cuando ningún tipo tiene cupo y lo
// devuelve a «publicado» cuando se libera o se agrega cupo (§9 del modelo).
export async function ajustarAgotado(db, eventoId) {
  await db.consultar(
    `UPDATE evento e
        SET estado = CASE WHEN c.con_cupo = 0 THEN 'agotado'::estado_evento ELSE 'publicado'::estado_evento END
       FROM (SELECT count(*)::int AS tipos,
                    count(*) FILTER (WHERE cantidad_vendida < cantidad_total)::int AS con_cupo
               FROM tipo_boleta WHERE evento_id = $1) c
      WHERE e.id = $1 AND c.tipos > 0 AND e.estado IN ('publicado', 'agotado')
        AND e.estado <> CASE WHEN c.con_cupo = 0 THEN 'agotado'::estado_evento ELSE 'publicado'::estado_evento END`,
    [eventoId],
  );
}

async function nombreRepetido(db, eventoId, nombre, excepto = null) {
  const { rows } = await db.consultar(
    'SELECT 1 FROM tipo_boleta WHERE evento_id = $1 AND nombre = $2 AND id IS DISTINCT FROM $3',
    [eventoId, nombre, excepto],
  );
  return rows.length > 0;
}

async function cuposDeOtrosTipos(db, eventoId, excepto = null) {
  const { rows } = await db.consultar(
    'SELECT coalesce(sum(cantidad_total), 0)::int AS cupos FROM tipo_boleta WHERE evento_id = $1 AND id IS DISTINCT FROM $2',
    [eventoId, excepto],
  );
  return rows[0].cupos;
}

// Carga el tipo con los datos de su evento que necesitan las reglas. Al bloquear,
// se sigue el orden de toda la API: primero el evento y después sus tipos (así dos
// transacciones nunca se esperan en orden contrario, que es lo que causa un deadlock).
async function cargarTipoConEvento(db, id, { bloquear = false } = {}) {
  if (bloquear) {
    await db.consultar('SELECT 1 FROM evento WHERE id = (SELECT evento_id FROM tipo_boleta WHERE id = $1) FOR NO KEY UPDATE', [id]);
  }
  const { rows } = await db.consultar(
    `SELECT t.id, t.evento_id, t.nombre, t.descripcion, t.precio_cop, t.cantidad_total, t.cantidad_vendida,
            t.maximo_por_orden, t.venta_inicia_en, t.venta_termina_en,
            e.organizador_id, e.nombre AS evento_nombre, e.estado AS evento_estado, e.lugar, e.aforo_total,
            e.es_gratuito, e.fecha_inicio, e.fecha_fin
       FROM tipo_boleta t JOIN evento e ON e.id = t.evento_id
      WHERE t.id = $1${bloquear ? ' FOR NO KEY UPDATE OF t' : ''}`,
    [id],
  );
  if (!rows[0]) throw tipoNoEncontrado();
  const fila = rows[0];
  return {
    tipo: fila,
    evento: {
      id: fila.evento_id, organizador_id: fila.organizador_id, nombre: fila.evento_nombre, estado: fila.evento_estado,
      lugar: fila.lugar, aforo_total: fila.aforo_total, es_gratuito: fila.es_gratuito,
      fecha_inicio: fila.fecha_inicio, fecha_fin: fila.fecha_fin,
    },
  };
}

// ------------------------------------------------------------------ crear
export async function crear(db, organizador, eventoId, datos) {
  return db.transaccion(async (tx) => {
    const evento = await exigirEventoPropio(tx, organizador, eventoId, 'Solo puedes agregar tipos de boleta a tus propios eventos.', { bloquear: true });
    if (['cancelado', 'finalizado'].includes(evento.estado)) throw eventoNoDisponible(evento, 'ya no admite tipos de boleta nuevos');

    const tipo = completarTipoNuevo(datos, evento);
    if (await nombreRepetido(tx, eventoId, tipo.nombre)) {
      throw conflicto('tipo_boleta_nombre_repetido', `«${evento.nombre}» ya tiene un tipo de boleta llamado «${tipo.nombre}».`);
    }
    validarTiposDelEvento(evento, [tipo], { cuposDeOtrosTipos: await cuposDeOtrosTipos(tx, eventoId) });

    const creado = await insertarTipo(tx, eventoId, tipo);
    await ajustarAgotado(tx, eventoId); // un tipo nuevo trae cupo: un evento agotado vuelve a publicado
    return creado;
  });
}

// ------------------------------------------------------------------ leer
// Igual que el detalle del evento: el tipo de un borrador solo lo ve su dueño.
export async function obtener(db, id, organizador) {
  const { evento } = await cargarTipoConEvento(db, id);
  if (evento.estado === 'borrador' && evento.organizador_id !== organizador?.id) throw tipoNoEncontrado();
  const { rows } = await db.consultar(`SELECT ${COLUMNAS_TIPO} FROM tipo_boleta WHERE id = $1`, [id]);
  return serializar(rows[0]);
}

// ------------------------------------------------------------------ actualizar
const CAMPOS_EDITABLES = ['nombre', 'descripcion', 'precio_cop', 'cantidad_total', 'maximo_por_orden', 'venta_inicia_en', 'venta_termina_en'];

export async function actualizar(db, organizador, id, cambios) {
  return db.transaccion(async (tx) => {
    const { tipo, evento } = await cargarTipoConEvento(tx, id, { bloquear: true });
    if (evento.organizador_id !== organizador.id) throw sinPermiso('Solo puedes editar los tipos de boleta de tus propios eventos.');
    if (['cancelado', 'finalizado'].includes(evento.estado)) throw eventoNoDisponible(evento, 'sus tipos de boleta ya no se editan');

    const nuevo = { ...tipo };
    for (const campo of CAMPOS_EDITABLES) if (cambios[campo] !== undefined) nuevo[campo] = cambios[campo];
    if (cambios.nombre !== undefined) nuevo.nombre = cambios.nombre.trim();

    if (cambios.nombre !== undefined && await nombreRepetido(tx, evento.id, nuevo.nombre, id)) {
      throw conflicto('tipo_boleta_nombre_repetido', `Otro tipo de boleta de «${evento.nombre}» ya se llama «${nuevo.nombre}».`);
    }
    if (nuevo.cantidad_total < tipo.cantidad_vendida) {
      throw reglaDeNegocio(
        'cupo_menor_que_vendidas',
        `«${tipo.nombre}» ya tiene ${tipo.cantidad_vendida} boletas vendidas o reservadas: el cupo no puede bajar a ${nuevo.cantidad_total}.`,
        [{ campo: 'cantidad_total', problema: `Debe ser al menos ${tipo.cantidad_vendida}.` }],
      );
    }
    validarTiposDelEvento(evento, [nuevo], { cuposDeOtrosTipos: await cuposDeOtrosTipos(tx, evento.id, id) });

    const columnas = [];
    const valores = [];
    for (const campo of CAMPOS_EDITABLES) {
      if (cambios[campo] !== undefined) {
        valores.push(nuevo[campo]);
        columnas.push(`${campo} = $${valores.length}`);
      }
    }
    valores.push(id);
    const { rows } = await tx.consultar(
      `UPDATE tipo_boleta SET ${columnas.join(', ')} WHERE id = $${valores.length} RETURNING ${COLUMNAS_TIPO}`,
      valores,
    );
    await ajustarAgotado(tx, evento.id); // más cupo: vuelve a publicado; cupo = vendidas: agotado
    return serializar(rows[0]);
  });
}

// ------------------------------------------------------------------ eliminar
export async function eliminar(db, organizador, id) {
  return db.transaccion(async (tx) => {
    const { tipo, evento } = await cargarTipoConEvento(tx, id, { bloquear: true });
    if (evento.organizador_id !== organizador.id) throw sinPermiso('Solo puedes borrar los tipos de boleta de tus propios eventos.');
    if (['cancelado', 'finalizado'].includes(evento.estado)) throw eventoNoDisponible(evento, 'sus tipos de boleta ya no se borran');
    const ventas = await tx.consultar('SELECT 1 FROM item_orden WHERE tipo_boleta_id = $1 LIMIT 1', [id]);
    if (ventas.rows.length) {
      throw conflicto(
        'tipo_boleta_con_ventas',
        `«${tipo.nombre}» ya tiene ventas y no se puede borrar. Para dejar de venderlo, adelanta venta_termina_en.`,
      );
    }
    // Un evento publicado (o pausado o agotado) siempre conserva al menos un tipo de boleta.
    if (evento.estado !== 'borrador') {
      const { rows } = await tx.consultar('SELECT count(*)::int AS tipos FROM tipo_boleta WHERE evento_id = $1', [evento.id]);
      if (rows[0].tipos === 1) {
        throw conflicto(
          'evento_sin_tipos_de_boleta',
          `«${evento.nombre}» está ${evento.estado} y necesita al menos un tipo de boleta: agrega otro antes de borrar «${tipo.nombre}».`,
        );
      }
    }
    await tx.consultar('DELETE FROM tipo_boleta WHERE id = $1', [id]);
    await ajustarAgotado(tx, evento.id);
  });
}
