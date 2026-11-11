// Arma la aplicación Express: middlewares, documentación, rutas y errores.
// No abre ningún puerto (eso lo hace index.js), así las pruebas la usan directo.
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config, RAIZ } from './config.js';
import { sinCache } from './comun/cache.js';
import { cachearCartelera, invalidarCartelera } from './comun/cache-cartelera.js';
import { opcionesLimiteDeIntentos } from './modulos/sesiones/rutas.js';
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

// TRUST_PROXY: un número de saltos («1») o una lista de direcciones, como la
// opción «trust proxy» de Express.
function valorConfianzaProxy(valor) {
  return /^\d+$/.test(valor) ? Number(valor) : valor;
}

export function crearApp({ db, cache = sinCache }) {
  const app = express();
  app.locals.db = db;
  app.locals.cache = cache;
  app.disable('x-powered-by');
  if (config.confiarEnProxy) app.set('trust proxy', valorConfianzaProxy(config.confiarEnProxy));

  // Con caché, los contadores del límite de intentos viven en Valkey. Si la caché
  // falla, el límite deja pasar la petición (passOnStoreError) en vez de tumbar el login.
  if (cache.cliente) {
    app.locals.limiteDeIntentos = rateLimit({
      ...opcionesLimiteDeIntentos,
      passOnStoreError: true,
      store: new RedisStore({ prefix: 'limite-sesiones:', sendCommand: (...args) => cache.cliente.sendCommand(args) }),
    });
  }

  app.use(cors({
    origin: config.corsOrigen === '*' ? true : config.corsOrigen.split(',').map((o) => o.trim()),
    exposedHeaders: ['Location', 'X-Total-Count'],
  }));
  // Comprime HTML, CSS, JS y JSON. En compose Caddy ya comprime (y no vuelve a
  // comprimir lo que llega comprimido); en Render no hay proxy propio, así que
  // lo hace la API. Fue la primera intervención del informe de rendimiento.
  app.use(compression({ threshold: 1024 }));
  app.use(express.json({ limit: '100kb' }));

  // La raíz describe la API; un navegador que la abre va directo al panel web.
  app.get('/', (req, res) => {
    if (req.accepts(['json', 'html']) === 'html') return res.redirect('/app/panel.html');
    res.json({
      nombre: contrato.info.title,
      version: contrato.info.version,
      documentacion: '/docs',
      contrato: '/openapi.json',
      salud: '/salud',
      aplicacion: '/app/panel.html',
    });
  });

  // La web (web/) se sirve en /app desde el mismo servidor: el panel del
  // organizador llama a la API en el mismo origen, sin CORS ni otra instalación.
  // Caché del navegador: las fuentes y las imágenes no cambian de contenido sin
  // cambiar de nombre (30 días); CSS, JS y datos, 1 hora; el HTML siempre se
  // revalida para que un despliegue nuevo se vea de inmediato.
  app.use('/app', express.static(path.join(RAIZ, 'web'), {
    index: 'index.html',
    fallthrough: true,
    setHeaders(res, ruta) {
      if (/\.(woff2|svg|png|jpe?g|webp|ico)$/.test(ruta)) res.set('Cache-Control', 'public, max-age=2592000, immutable');
      else if (/\.(css|js|json)$/.test(ruta)) res.set('Cache-Control', 'public, max-age=3600');
      else res.set('Cache-Control', 'no-cache');
    },
  }));

  // Comprobación de salud: la usan el HEALTHCHECK del contenedor, compose,
  // Render y el flujo de CI/CD (que espera ver aquí el commit recién desplegado).
  app.get('/salud', async (req, res) => {
    await db.consultar('SELECT 1');
    res.set('Cache-Control', 'no-store');
    res.json({
      estado: 'ok',
      base_de_datos: db.motor,
      cache: cache.motor === 'ninguna' ? 'ninguna' : cache.disponible() ? 'valkey' : 'valkey (sin conexión)',
      ...(config.commit && { commit: config.commit }),
    });
  });

  // Documentación: Swagger UI en /docs y el contrato en JSON en /openapi.json.
  app.get('/openapi.json', (req, res) => res.json(contratoParaDocs));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(contratoParaDocs, {
    customSiteTitle: 'API de Apparchar · Documentación',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, docExpansion: 'list', tryItOutEnabled: true },
  }));

  // Caché de la cartelera pública: las escrituras la invalidan antes de responder.
  app.use(invalidarCartelera(cache));
  app.get('/eventos', cachearCartelera(cache, config.cacheCarteleraSegundos));
  app.use(crearRutas());

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
