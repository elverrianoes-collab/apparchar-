// Fechas en la API: ISO 8601 con el desfase de Colombia (UTC−5, sin horario de
// verano), por ejemplo 2026-10-03T21:00:00-05:00. La base guarda timestamptz (UTC).
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;

export function fechaColombia(valor) {
  if (valor === null || valor === undefined) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return new Date(fecha.getTime() - DESFASE_COLOMBIA_MS).toISOString().slice(0, 19) + '-05:00';
}

// Convierte a texto todas las fechas de una fila que devuelve la base.
export function serializar(fila) {
  if (!fila) return fila;
  const salida = {};
  for (const [clave, valor] of Object.entries(fila)) salida[clave] = valor instanceof Date ? fechaColombia(valor) : valor;
  return salida;
}

// Inicio de un día de Colombia (AAAA-MM-DD) como instante: 2026-12-05 → 2026-12-05T05:00:00Z.
export function inicioDelDiaColombia(dia, diasDespues = 0) {
  const fecha = new Date(`${dia}T00:00:00-05:00`);
  fecha.setUTCDate(fecha.getUTCDate() + diasDespues);
  return fecha;
}
