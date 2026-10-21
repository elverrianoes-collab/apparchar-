// Boletas: las emite el servidor cuando una orden queda pagada (una por unidad)
// y se leen por orden o por código. No hay POST, PATCH ni DELETE públicos.
import crypto from 'node:crypto';
import { noEncontrado } from '../../comun/errores.js';
import { serializar } from '../../comun/formato.js';

const COLUMNAS_BOLETA = 'id, orden_id, tipo_boleta_id, codigo, titular_nombre, estado, usada_en, creado_en, actualizado_en';

// 31 símbolos sin letras ni números ambiguos (sin I, L, O, 0 ni 1): 12 de ellos
// dan unos 59 bits, imposible de adivinar (D-05). Se generan con crypto, no Math.random.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generarCodigo() {
  const simbolos = Array.from({ length: 12 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');
  return `${simbolos.slice(0, 4)}-${simbolos.slice(4, 8)}-${simbolos.slice(8)}`;
}

// Una boleta por unidad de cada ítem, a nombre del comprador.
export async function emitirBoletas(tx, ordenId, titular) {
  const { rows: items } = await tx.consultar(
    'SELECT tipo_boleta_id, cantidad FROM item_orden WHERE orden_id = $1 ORDER BY creado_en, id',
    [ordenId],
  );
  let posicion = 0;
  for (const item of items) {
    for (let i = 0; i < item.cantidad; i += 1) {
      await tx.consultar(
        `INSERT INTO boleta (orden_id, tipo_boleta_id, codigo, titular_nombre, creado_en)
         VALUES ($1, $2, $3, $4, now() + $5::int * interval '1 microsecond')`,
        [ordenId, item.tipo_boleta_id, generarCodigo(), titular, posicion],
      );
      posicion += 1;
    }
  }
}

export async function listarDeOrden(db, ordenId) {
  const orden = await db.consultar('SELECT 1 FROM orden WHERE id = $1', [ordenId]);
  if (!orden.rows.length) throw noEncontrado('orden_no_encontrada', 'No encontramos esa orden. Revisa el enlace del correo de compra.');
  const { rows } = await db.consultar(`SELECT ${COLUMNAS_BOLETA} FROM boleta WHERE orden_id = $1 ORDER BY creado_en, id`, [ordenId]);
  return rows.map(serializar);
}

export async function obtenerPorCodigo(db, codigo) {
  const { rows } = await db.consultar(`SELECT ${COLUMNAS_BOLETA} FROM boleta WHERE codigo = $1`, [codigo]);
  if (!rows[0]) throw noEncontrado('boleta_no_encontrada', 'No encontramos una boleta con ese código.');
  return serializar(rows[0]);
}
