// Conexión a la base de datos. El resto del código solo usa tres funciones:
//   consultar(sql, parametros)  → { rows }
//   transaccion(async (tx) => …) → todo o nada (tx también tiene consultar)
//   cerrar()
// Con DATABASE_URL se conecta a un PostgreSQL real (pg). Sin ella usa PGlite: el
// mismo motor PostgreSQL compilado a WebAssembly, que corre dentro de Node sin
// instalar nada. Así el proyecto arranca en cualquier computador y las pruebas
// usan una base en memoria, nueva en cada archivo de pruebas.
import fs from 'node:fs';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

// Envuelve un cliente para que dentro de una transacción se pueda volver a llamar
// a transaccion() sin abrir otra (las funciones de servicio se pueden componer).
function conTransaccionAnidada(tx) {
  const envuelto = { consultar: (sql, p) => tx.query(sql, p) };
  envuelto.transaccion = (fn) => fn(envuelto);
  return envuelto;
}

export async function conectar({ url, directorio } = {}) {
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    await pool.query('SELECT 1');
    return {
      motor: 'postgresql',
      consultar: (sql, p) => pool.query(sql, p),
      async transaccion(fn) {
        const cliente = await pool.connect();
        try {
          await cliente.query('BEGIN');
          const resultado = await fn(conTransaccionAnidada(cliente));
          await cliente.query('COMMIT');
          return resultado;
        } catch (error) {
          await cliente.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          cliente.release();
        }
      },
      ejecutarScript: (sql) => pool.query(sql),
      cerrar: () => pool.end(),
    };
  }

  const opciones = { extensions: { unaccent, pg_trgm } };
  let db;
  if (directorio) {
    fs.mkdirSync(directorio, { recursive: true });
    db = new PGlite(directorio, opciones);
  } else {
    db = new PGlite(opciones); // en memoria: para las pruebas
  }
  await db.waitReady;
  return {
    motor: directorio ? 'pglite' : 'pglite (memoria)',
    consultar: (sql, p) => db.query(sql, p),
    transaccion: (fn) => db.transaction((tx) => fn(conTransaccionAnidada(tx))),
    ejecutarScript: (sql) => db.exec(sql),
    cerrar: () => db.close(),
  };
}
