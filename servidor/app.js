// Arma la aplicación Express: middlewares, documentación, rutas y errores.
// No abre ningún puerto (eso lo hace index.js), así las pruebas la usan directo.
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { contrato } from './comun/contrato.js';
import { manejarErrores, rutaNoEncontrada } from './comun/errores.js';
import { crearRutas } from './rutas.js';

// El contrato que muestra /docs apunta a este mismo servidor, para que el botón
// «Try it out» de Swagger UI pruebe el backend real. A los parámetros se les
// quitan los ejemplos: Swagger UI los llenaría solos con ids y filtros del
// contrato que no existen en la base (los ejemplos de los cuerpos se conservan).
function sinEjemplosEnParametros(paths) {
  const copia = structuredClone(paths);
  for (const metodos of Object.values(copia)) {
    for (const op of Object.values(metodos)) {
      for (const parametro of op.parameters || []) {
        delete parametro.example;
        delete parametro.examples;
        if (parametro.schema) {
          delete parametro.schema.example;
          delete parametro.schema.examples;
        }
      }
    }
  }
  return copia;
}

const contratoParaDocs = {
  ...contrato,
  servers: [{ url: '/', description: 'Este servidor (backend del MVP)' }],
  paths: sinEjemplosEnParametros(contrato.paths),
  components: {
    ...contrato.components,
    parameters: Object.fromEntries(Object.entries(contrato.components.parameters).map(([nombre, p]) => {
      const { example: _e, examples: _es, ...resto } = p;
      const { example: _se, examples: _ses, ...esquema } = resto.schema || {};
      return [nombre, { ...resto, schema: esquema }];
    })),
  },
};

export function crearApp({ db }) {
  const app = express();
  app.locals.db = db;
  app.disable('x-powered-by');

  app.use(cors({
    origin: config.corsOrigen === '*' ? true : config.corsOrigen.split(',').map((o) => o.trim()),
    exposedHeaders: ['Location', 'X-Total-Count'],
  }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (req, res) => {
    res.json({
      nombre: contrato.info.title,
      version: contrato.info.version,
      documentacion: '/docs',
      contrato: '/openapi.json',
      salud: '/salud',
    });
  });

  app.get('/salud', async (req, res) => {
    await db.consultar('SELECT 1');
    res.json({ estado: 'ok', base_de_datos: db.motor });
  });

  // Documentación: Swagger UI en /docs y el contrato en JSON en /openapi.json.
  app.get('/openapi.json', (req, res) => res.json(contratoParaDocs));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(contratoParaDocs, {
    customSiteTitle: 'API de Apparchar · Documentación',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, docExpansion: 'list', tryItOutEnabled: true },
  }));

  app.use(crearRutas());

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
