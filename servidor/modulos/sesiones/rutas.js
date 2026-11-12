// Rutas de sesiones (contrato: etiqueta «Sesiones»).
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../../config.js';
import { validar } from '../../comun/validacion.js';
import { iniciarSesion } from './servicio.js';

const rutas = Router();

// Freno a los ataques de fuerza bruta: 20 intentos cada 15 minutos por dirección IP.
export const opcionesLimiteDeIntentos = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.entorno === 'test',
  handler: (req, res) => res.status(429).json({
    codigo: 'demasiados_intentos',
    mensaje: 'Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo.',
  }),
};
const limiteEnMemoria = rateLimit(opcionesLimiteDeIntentos);

// Con caché (Valkey), app.js arma el mismo límite con los contadores en la caché:
// así se comparten entre réplicas y no se reinician cuando el contenedor se reinicia.
// Si la caché no está conectada, el límite sigue funcionando con los contadores
// en memoria: el inicio de sesión nunca queda sin protección contra la fuerza bruta.
const limiteDeIntentos = (req, res, next) => {
  const enCache = req.app.locals.limiteDeIntentos;
  const usarCache = enCache && req.app.locals.cache?.disponible();
  return (usarCache ? enCache : limiteEnMemoria)(req, res, next);
};

rutas.post('/sesiones', limiteDeIntentos, validar('iniciarSesion'), async (req, res) => {
  res.json(await iniciarSesion(req.app.locals.db, req.body));
});

export default rutas;
