// CRUD de organizadores: registrar (crear), ver perfil público (leer),
// editar la cuenta (actualizar) y borrar la cuenta (eliminar).
import bcrypt from 'bcryptjs';
import { conflicto, noEncontrado, sinPermiso, solicitudInvalida } from '../../comun/errores.js';
import { serializar } from '../../comun/formato.js';

// Costo de bcrypt: 2^10 rondas. Suficiente para el MVP y rápido en un portátil.
const COSTO_BCRYPT = 10;
// Columnas que salen en las respuestas: clave_hash nunca sale de la base.
const COLUMNAS = 'id, nombre, correo, telefono, municipio, creado_en, actualizado_en';

// bcrypt solo usa los primeros 72 bytes: una clave más larga se rechaza en lugar
// de recortarla en silencio (la ñ y las letras con tilde ocupan 2 bytes).
export function hashDeClave(clave) {
  if (Buffer.byteLength(clave, 'utf8') > 72) {
    throw solicitudInvalida([{ campo: 'clave', problema: 'Es demasiado larga: máximo 72 bytes (la ñ y las letras con tilde ocupan 2).' }]);
  }
  return bcrypt.hash(clave, COSTO_BCRYPT);
}

const correoRepetido = (correo) =>
  conflicto('correo_ya_registrado', `Ya existe un organizador con el correo ${correo}. Inicia sesión o usa otro correo.`);

export async function registrar(db, datos) {
  const correo = datos.correo.toLowerCase();
  const claveHash = await hashDeClave(datos.clave);
  try {
    const { rows } = await db.consultar(
      `INSERT INTO organizador (nombre, correo, telefono, municipio, clave_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS}`,
      [datos.nombre.trim(), correo, datos.telefono, datos.municipio, claveHash],
    );
    return serializar(rows[0]);
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'organizador_correo_key') throw correoRepetido(correo);
    throw error;
  }
}

export async function obtenerPublico(db, id) {
  const { rows } = await db.consultar('SELECT id, nombre, municipio FROM organizador WHERE id = $1', [id]);
  if (!rows[0]) throw noEncontrado('organizador_no_encontrado', 'No encontramos ese organizador.');
  return rows[0];
}

// Primero 404 si la cuenta no existe; después 403 si el token es de otra persona.
async function exigirPropia(db, organizadorDelToken, id) {
  const { rows } = await db.consultar('SELECT id FROM organizador WHERE id = $1', [id]);
  if (!rows[0]) throw noEncontrado('organizador_no_encontrado', 'No encontramos ese organizador.');
  if (organizadorDelToken.id !== id) throw sinPermiso('Solo puedes modificar tu propia cuenta.');
}

export async function actualizar(db, organizadorDelToken, id, cambios) {
  await exigirPropia(db, organizadorDelToken, id);

  const columnas = [];
  const valores = [];
  const poner = (columna, valor) => {
    valores.push(valor);
    columnas.push(`${columna} = $${valores.length}`);
  };
  if (cambios.nombre !== undefined) poner('nombre', cambios.nombre.trim());
  if (cambios.correo !== undefined) poner('correo', cambios.correo.toLowerCase());
  if (cambios.telefono !== undefined) poner('telefono', cambios.telefono);
  if (cambios.municipio !== undefined) poner('municipio', cambios.municipio);
  if (cambios.clave !== undefined) poner('clave_hash', await hashDeClave(cambios.clave));

  valores.push(id);
  try {
    const { rows } = await db.consultar(
      `UPDATE organizador SET ${columnas.join(', ')} WHERE id = $${valores.length} RETURNING ${COLUMNAS}`,
      valores,
    );
    return serializar(rows[0]);
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'organizador_correo_key') throw correoRepetido(cambios.correo.toLowerCase());
    throw error;
  }
}

export async function eliminar(db, organizadorDelToken, id) {
  await exigirPropia(db, organizadorDelToken, id);
  const { rows } = await db.consultar('SELECT count(*)::int AS eventos FROM evento WHERE organizador_id = $1', [id]);
  const { eventos } = rows[0];
  if (eventos > 0) {
    throw conflicto(
      'organizador_con_eventos',
      `No se puede borrar la cuenta porque tiene ${eventos} evento(s): solo se borra una cuenta sin eventos.`,
    );
  }
  await db.consultar('DELETE FROM organizador WHERE id = $1', [id]);
}
