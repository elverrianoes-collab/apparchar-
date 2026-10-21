// Rutas de sesiones (contrato: etiqueta «Sesiones»).
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../../config.js';
import { validar } from '../../comun/validacion.js';
import { iniciarSesion } from './servicio.js';

const rutas = Router();

// Freno a los ataques de fuerza bruta: 20 intentos cada 15 minutos por dirección IP.
const limiteDeIntentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.entorno === 'test',
  handler: (req, res) => res.status(429).json({
    codigo: 'demasiados_intentos',
    mensaje: 'Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo.',
  }),
});

rutas.post('/sesiones', limiteDeIntentos, validar('iniciarSesion'), async (req, res) => {
  res.json(await iniciarSesion(req.app.locals.db, req.body));
});

export default rutas;
