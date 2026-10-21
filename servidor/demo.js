// npm run demo: borra la base local, carga los datos de demostración y arranca
// el servidor. Es lo que se corre antes de la demostración en vivo.
import { config } from './config.js';
import { conectar } from './db/conexion.js';
import { prepararEsquema } from './db/migrar.js';
import { cargarSemilla, imprimirResumen } from './db/semilla.js';

const db = await conectar({ url: config.databaseUrl, directorio: config.directorioPglite });
await prepararEsquema(db);
const datos = await cargarSemilla(db);
await db.cerrar();

await import('./index.js');
setTimeout(() => imprimirResumen(datos), 300); // después del aviso de arranque

