// Rutas de boletas (contrato: etiqueta «Boletas»). Solo lectura.
import { Router } from 'express';
import { enviarLista } from '../../comun/paginacion.js';
import { validar } from '../../comun/validacion.js';
import { expirarOrdenesVencidas } from '../ordenes/servicio.js';
import * as boletas from './servicio.js';

const rutas = Router();

// Las boletas de una orden (vacía mientras no esté pagada). El id de la orden es el enlace privado.
rutas.get('/ordenes/:orden_id/boletas', validar('listarBoletasDeOrden'), async (req, res) => {
  await expirarOrdenesVencidas(req.app.locals.db);
  const lista = await boletas.listarDeOrden(req.app.locals.db, req.params.orden_id);
  enviarLista(res, lista, lista.length);
});

// Una boleta por el código de su QR (el código es la credencial).
rutas.get('/boletas/:codigo', validar('obtenerBoleta'), async (req, res) => {
  res.json(await boletas.obtenerPorCodigo(req.app.locals.db, req.params.codigo));
});

export default rutas;
