// Caché en Valkey/Redis (REDIS_URL), opcional. La caché acelera las lecturas
// públicas y guarda los contadores del límite de intentos; nunca es la fuente de
// verdad. Sin REDIS_URL, o si el servicio deja de responder, la API sigue
// funcionando y consulta directo la base (falla abierta).
import { createClient } from 'redis';

// Caché que no guarda nada: la usan las pruebas y el modo sin REDIS_URL.
export const sinCache = Object.freeze({
  motor: 'ninguna',
  cliente: null,
  disponible: () => false,
  obtener: async () => null,
  guardar: async () => {},
  incrementar: async () => {},
  cerrar: async () => {},
});

const ESPERA_CONEXION_MS = 3000;

export async function conectarCache(url, { registrar = console } = {}) {
  if (!url) return sinCache;

  let ultimoAviso = 0;
  const avisar = (error) => {
    // Un aviso cada 30 s como máximo, para no inundar el registro si el servicio cae.
    if (Date.now() - ultimoAviso < 30_000) return;
    ultimoAviso = Date.now();
    registrar.warn(`Caché no disponible (${error.message}); se consulta directo la base.`);
  };

  const cliente = createClient({
    url,
    socket: { connectTimeout: ESPERA_CONEXION_MS, reconnectStrategy: (intentos) => Math.min(intentos * 250, 5000) },
  });
  cliente.on('error', avisar);

  // El arranque no espera más de 3 s: si la caché no está lista, la API arranca
  // igual y el cliente sigue intentando conectarse en segundo plano.
  await Promise.race([
    cliente.connect().catch(avisar),
    new Promise((resolver) => setTimeout(resolver, ESPERA_CONEXION_MS).unref()),
  ]);

  // Los comandos van en crudo (sendCommand) para no depender de la forma de las
  // opciones de cada versión del cliente.
  const seguro = async (comando, porDefecto) => {
    if (!cliente.isReady) return porDefecto;
    try {
      return await cliente.sendCommand(comando);
    } catch (error) {
      avisar(error);
      return porDefecto;
    }
  };

  return {
    motor: 'valkey',
    cliente,
    disponible: () => cliente.isReady,
    obtener: (clave) => seguro(['GET', clave], null),
    guardar: (clave, valor, segundos) => seguro(['SET', clave, valor, 'EX', String(segundos)], undefined),
    incrementar: (clave) => seguro(['INCR', clave], undefined),
    cerrar: async () => {
      try {
        await cliente.close();
      } catch {
        cliente.destroy();
      }
    },
  };
}
