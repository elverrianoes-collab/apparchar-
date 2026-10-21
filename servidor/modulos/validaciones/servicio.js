// Validación en la puerta: cada código leído queda registrado, aceptado o
// rechazado, y una boleta entra una sola vez (D-06).
import { conflicto } from '../../comun/errores.js';
import { fechaLegible, serializar } from '../../comun/formato.js';
import { leerPaginacion } from '../../comun/paginacion.js';
import { exigirEventoPropio } from '../eventos/servicio.js';

const COLUMNAS_VALIDACION = `id, evento_id, boleta_id, codigo_leido, resultado, motivo, puerta, validada_por,
  validada_en, creado_en, actualizado_en`;
const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

// La puerta abre 6 horas antes del inicio y cierra al final, con la hora del servidor.
function exigirPuertaAbierta(evento) {
  if (['borrador', 'cancelado'].includes(evento.estado)) {
    const estado = evento.estado === 'borrador' ? 'en borrador' : evento.estado;
    throw conflicto('evento_no_activo', `«${evento.nombre}» está ${estado}: su puerta no está abierta.`);
  }
  const ahora = Date.now();
  const abre = new Date(evento.fecha_inicio).getTime() - SEIS_HORAS_MS;
  if (ahora < abre) {
    throw conflicto('evento_no_activo', `La puerta de «${evento.nombre}» abre el ${fechaLegible(abre)}, 6 horas antes del inicio.`);
  }
  if (ahora > new Date(evento.fecha_fin).getTime()) {
    throw conflicto('evento_no_activo', `La puerta de «${evento.nombre}» cerró el ${fechaLegible(evento.fecha_fin)}.`);
  }
}

export async function registrar(db, organizador, eventoId, datos) {
  const evento = await exigirEventoPropio(db, organizador, eventoId, 'Solo el organizador dueño del evento puede validar en su puerta.');
  exigirPuertaAbierta(evento);

  return db.transaccion(async (tx) => {
    // El código se busca sin espacios y en mayúsculas; se guarda tal como llegó.
    const codigo = datos.codigo_leido.trim().toUpperCase();
    const { rows } = await tx.consultar(
      `SELECT b.id, b.estado, t.evento_id
         FROM boleta b JOIN tipo_boleta t ON t.id = b.tipo_boleta_id
        WHERE b.codigo = $1 FOR NO KEY UPDATE OF b`,
      [codigo],
    );
    const boleta = rows[0];
    let resultado = 'rechazada';
    let motivo = null;
    if (!boleta) motivo = 'no_existe';
    else if (boleta.evento_id !== eventoId) motivo = 'otro_evento';
    else if (boleta.estado === 'cancelada') motivo = 'cancelada';
    else if (boleta.estado === 'usada') motivo = 'ya_usada';
    else {
      // Solo una lectura gana: la actualización exige que la boleta siga válida.
      const usada = await tx.consultar(
        "UPDATE boleta SET estado = 'usada', usada_en = now() WHERE id = $1 AND estado = 'valida' RETURNING id",
        [boleta.id],
      );
      if (usada.rows.length) resultado = 'aceptada';
      else motivo = 'ya_usada';
    }

    const insertada = await tx.consultar(
      `INSERT INTO validacion (evento_id, boleta_id, codigo_leido, resultado, motivo, puerta, validada_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNAS_VALIDACION}`,
      [eventoId, boleta?.id ?? null, datos.codigo_leido, resultado, motivo, datos.puerta ?? 'Principal', datos.validada_por.trim()],
    );
    return serializar(insertada.rows[0]);
  });
}

export async function listar(db, organizador, eventoId, consulta) {
  await exigirEventoPropio(db, organizador, eventoId, 'Solo el organizador dueño del evento puede ver las lecturas de su puerta.');
  const valores = [eventoId];
  let donde = 'WHERE evento_id = $1';
  if (consulta.resultado) {
    valores.push(consulta.resultado);
    donde += ' AND resultado = $2';
  }
  const { limite, desplazamiento } = leerPaginacion(consulta);
  const total = await db.consultar(`SELECT count(*)::int AS total FROM validacion ${donde}`, valores);
  const { rows } = await db.consultar(
    `SELECT ${COLUMNAS_VALIDACION} FROM validacion ${donde}
     ORDER BY validada_en DESC, creado_en DESC, id LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, desplazamiento],
  );
  return { validaciones: rows.map(serializar), total: total.rows[0].total };
}
