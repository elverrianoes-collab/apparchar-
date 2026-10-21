// Carga el contrato api/openapi.yaml una sola vez. Es la fuente de verdad de la
// API: la validación de las peticiones y la documentación de /docs salen de aquí.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { RAIZ } from '../config.js';

export const contrato = yaml.load(fs.readFileSync(path.join(RAIZ, 'api', 'openapi.yaml'), 'utf8'));

const operaciones = new Map();
for (const [ruta, metodos] of Object.entries(contrato.paths)) {
  for (const [metodo, op] of Object.entries(metodos)) {
    if (op?.operationId) operaciones.set(op.operationId, { ruta, metodo, op });
  }
}

export function operacion(operationId) {
  const encontrada = operaciones.get(operationId);
  if (!encontrada) throw new Error(`El contrato no tiene la operación ${operationId}.`);
  return encontrada;
}

// Resuelve un $ref local (#/components/…).
export function resolver(objeto) {
  let actual = objeto;
  while (actual?.$ref) {
    actual = actual.$ref.replace(/^#\//, '').split('/').reduce((o, parte) => o?.[parte], contrato);
  }
  return actual;
}
