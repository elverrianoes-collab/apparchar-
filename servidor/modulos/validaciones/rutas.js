// Rutas de validaciones en la puerta (contrato: etiqueta «Validaciones»).
import { Router } from 'express';
import { autenticar } from '../../comun/autenticacion.js';
import { enviarLista } from '../../comun/paginacion.js';
import { validar } from '../../comun/validacion.js';
import * as validaciones from './servicio.js';

const rutas = Router();

// Cada lectura responde 201: `resultado` dice si la persona entra (D-06).
rutas.post('/eventos/:evento_id/validaciones', autenticar, validar('registrarValidacion'), async (req, res) => {
  const validacion = await validaciones.registrar(req.app.locals.db, req.organizador, req.params.evento_id, req.body);
  res.status(201).json(validacion);
});

// Las lecturas del evento, las más recientes primero (conteo en vivo del aforo).
rutas.get('/eventos/:evento_id/validaciones', autenticar, validar('listarValidacionesDelEvento'), async (req, res) => {
  const { validaciones: lista, total } = await validaciones.listar(
    req.app.locals.db, req.organizador, req.params.evento_id, req.consulta,
  );
  enviarLista(res, lista, total);
});

export default rutas;
