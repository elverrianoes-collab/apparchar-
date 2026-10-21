// Configuración del servidor. Se lee de variables de entorno; en local, del
// archivo .env de la raíz (copia de .env.example). Ningún secreto vive en el código.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const archivoEnv = path.join(RAIZ, '.env');
if (fs.existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);

const entorno = process.env.NODE_ENV || 'development';

// Valores de desarrollo: sirven para correr el proyecto sin configurar nada.
// Sin JWT_SECRETO, el servidor inventa una clave aleatoria cada vez que arranca
// (nadie la conoce, así que nadie puede fabricar tokens; los tokens dejan de
// servir al reiniciar). En producción el servidor se niega a arrancar sin ella.
const CLAVE_PASARELA_DESARROLLO = 'pasarela-demo';

export const config = {
  entorno,
  puerto: Number(process.env.PORT) || 3000,
  // Con DATABASE_URL se usa un PostgreSQL real; sin ella, PGlite guarda la base en .datos/pglite.
  databaseUrl: process.env.DATABASE_URL || '',
  directorioPglite: process.env.PGLITE_DIR || path.join(RAIZ, '.datos', 'pglite'),
  jwtSecreto: process.env.JWT_SECRETO || crypto.randomBytes(48).toString('base64url'),
  pasarelaClave: process.env.PASARELA_CLAVE || CLAVE_PASARELA_DESARROLLO,
  corsOrigen: process.env.CORS_ORIGIN || '*',
};

export const usaValoresDeDesarrollo = !process.env.JWT_SECRETO || config.pasarelaClave === CLAVE_PASARELA_DESARROLLO;

if (entorno === 'production' && usaValoresDeDesarrollo) {
  throw new Error('En producción hay que definir JWT_SECRETO y PASARELA_CLAVE (ver .env.example).');
}
