// Crea las tablas la primera vez que arranca el servidor sobre una base vacía.
// El esquema es el DDL de docs/modelo-datos.md (§11), copiado en esquema.sql;
// la prueba «Esquema de la base» de pruebas/app.test.js falla si los dos se desvían.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ARCHIVO_ESQUEMA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'esquema.sql');

export async function prepararEsquema(db) {
  const { rows } = await db.consultar("SELECT to_regclass('public.organizador') IS NOT NULL AS existe");
  if (rows[0].existe) return false;
  await db.ejecutarScript(fs.readFileSync(ARCHIVO_ESQUEMA, 'utf8'));
  return true;
}
