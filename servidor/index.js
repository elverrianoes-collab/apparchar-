// Punto de entrada del backend: npm run api
import { config, usaValoresDeDesarrollo } from './config.js';
import { conectar } from './db/conexion.js';
import { prepararEsquema } from './db/migrar.js';
import { crearApp } from './app.js';
import { ejecutarTareas } from './tareas.js';

const db = await conectar({ url: config.databaseUrl, directorio: config.directorioPglite });
const esquemaNuevo = await prepararEsquema(db);
await ejecutarTareas(db);

const app = crearApp({ db });
const servidor = app.listen(config.puerto, () => {
  const url = `http://localhost:${config.puerto}`;
  console.log(`API de Apparchar escuchando en ${url}`);
  console.log(`  Documentación (Swagger UI): ${url}/docs`);
  console.log(`  Base de datos: ${db.motor === 'postgresql' ? 'PostgreSQL (DATABASE_URL)' : `PGlite en ${config.directorioPglite}`}${esquemaNuevo ? ' · tablas creadas' : ''}`);
  if (usaValoresDeDesarrollo) {
    console.log('  Aviso: modo de desarrollo. Sin JWT_SECRETO los tokens se firman con una clave aleatoria');
    console.log('  que cambia al reiniciar, y PASARELA_CLAVE vale «pasarela-demo» si no se define (ver .env.example).');
  }
});

// Tareas del sistema cada minuto (eventos finalizados, órdenes vencidas…).
const intervalo = setInterval(() => {
  ejecutarTareas(db).catch((error) => console.error('Error en las tareas programadas:', error));
}, 60 * 1000);

async function apagar() {
  clearInterval(intervalo);
  servidor.close();
  await db.cerrar();
  process.exit(0);
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
