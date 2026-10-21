// Rutas de tipos de boleta (contrato: etiqueta «Tipos de boleta»).
import { Router } from 'express';
import { autenticar, autenticarOpcional } from '../../comun/autenticacion.js';
import { validar } from '../../comun/validacion.js';
import * as tipos from './servicio.js';

const rutas = Router();

// Crear: se agrega a un evento del organizador del token.
rutas.post('/eventos/:evento_id/tipos-boleta', autenticar, validar('crearTipoBoleta'), async (req, res) => {
  const tipo = await tipos.crear(req.app.locals.db, req.organizador, req.params.evento_id, req.body);
  res.status(201).location(`/tipos-boleta/${tipo.id}`).json(tipo);
});

// Leer: público; el tipo de un borrador solo lo ve el dueño del evento.
rutas.get('/tipos-boleta/:tipo_boleta_id', autenticarOpcional, validar('obtenerTipoBoleta'), async (req, res) => {
  res.json(await tipos.obtener(req.app.locals.db, req.params.tipo_boleta_id, req.organizador));
});

// Actualizar: precio, cupo o ventana de venta (solo el dueño del evento).
rutas.patch('/tipos-boleta/:tipo_boleta_id', autenticar, validar('actualizarTipoBoleta'), async (req, res) => {
  res.json(await tipos.actualizar(req.app.locals.db, req.organizador, req.params.tipo_boleta_id, req.body));
});

// Eliminar: solo si nunca se ha vendido.
rutas.delete('/tipos-boleta/:tipo_boleta_id', autenticar, validar('eliminarTipoBoleta'), async (req, res) => {
  await tipos.eliminar(req.app.locals.db, req.organizador, req.params.tipo_boleta_id);
  res.status(204).end();
});

export default rutas;
