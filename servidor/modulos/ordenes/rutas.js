// Rutas de órdenes (contrato: etiqueta «Órdenes»).
import { Router } from 'express';
import { autenticar } from '../../comun/autenticacion.js';
import { enviarLista } from '../../comun/paginacion.js';
import { validar } from '../../comun/validacion.js';
import * as ordenes from './servicio.js';

const rutas = Router();

// Crear: pública, se compra sin cuenta. Reserva el cupo 15 minutos.
rutas.post('/ordenes', validar('crearOrden'), async (req, res) => {
  const orden = await ordenes.crear(req.app.locals.db, req.body);
  res.status(201).location(`/ordenes/${orden.id}`).json(orden);
});

// Leer: el UUID de la orden es el enlace privado del comprador.
rutas.get('/ordenes/:orden_id', validar('obtenerOrden'), async (req, res) => {
  res.json(await ordenes.obtener(req.app.locals.db, req.params.orden_id));
});

// Actualizar: corregir los datos del comprador mientras la orden está pendiente.
rutas.patch('/ordenes/:orden_id', validar('actualizarOrden'), async (req, res) => {
  res.json(await ordenes.actualizar(req.app.locals.db, req.params.orden_id, req.body));
});

// Eliminar: anular una orden pendiente y liberar su cupo.
rutas.delete('/ordenes/:orden_id', validar('eliminarOrden'), async (req, res) => {
  await ordenes.eliminar(req.app.locals.db, req.params.orden_id);
  res.status(204).end();
});

// Confirmar el pago: solo la pasarela, con su clave en X-Clave-Pasarela.
rutas.post('/ordenes/:orden_id/pago', ordenes.exigirClavePasarela, validar('confirmarPagoOrden'), async (req, res) => {
  res.json(await ordenes.confirmarPago(req.app.locals.db, req.params.orden_id, req.body.referencia_pago));
});

// Leer: reporte de ventas de un evento (solo su dueño).
rutas.get('/eventos/:evento_id/ordenes', autenticar, validar('listarOrdenesDelEvento'), async (req, res) => {
  const { ordenes: lista, total } = await ordenes.listarDelEvento(
    req.app.locals.db, req.organizador, req.params.evento_id, req.consulta,
  );
  enviarLista(res, lista, total);
});

export default rutas;
