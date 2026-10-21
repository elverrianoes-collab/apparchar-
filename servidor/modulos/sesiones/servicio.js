// Inicio de sesión: correo y clave a cambio de un token JWT.
import bcrypt from 'bcryptjs';
import { emitirToken } from '../../comun/autenticacion.js';
import { ErrorApi } from '../../comun/errores.js';
import { serializar } from '../../comun/formato.js';

// Si el correo no existe se compara igual contra un hash cualquiera, para que la
// respuesta tarde lo mismo y no delate qué correos están registrados.
const HASH_DE_RELLENO = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8Z5M5lV3cZ1u5d7QhYb5e8YJ7m1wDe';

export async function iniciarSesion(db, { correo, clave }) {
  const { rows } = await db.consultar(
    `SELECT id, nombre, correo, telefono, municipio, clave_hash, creado_en, actualizado_en
       FROM organizador WHERE correo = $1`,
    [correo.toLowerCase()],
  );
  const encontrado = rows[0];
  const coincide = await bcrypt.compare(clave, encontrado?.clave_hash || HASH_DE_RELLENO);
  if (!encontrado || !coincide) {
    throw new ErrorApi(401, 'credenciales_invalidas', 'El correo o la clave no son correctos.');
  }
  const { clave_hash: _omitido, ...organizador } = encontrado;
  return { ...emitirToken(organizador), organizador: serializar(organizador) };
}
