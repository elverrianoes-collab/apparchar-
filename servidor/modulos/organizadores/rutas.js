// Rutas de organizadores (contrato: etiqueta «Organizadores»).
import { Router } from 'express';
import { autenticar } from '../../comun/autenticacion.js';
import { validar } from '../../comun/validacion.js';
import * as organizadores from './servicio.js';

const rutas = Router();

// Crear: pública, es la puerta de entrada (todavía no hay token).
rutas.post('/organizadores', validar('registrarOrganizador'), async (req, res) => {
  const organizador = await organizadores.registrar(req.app.locals.db, req.body);
  res.status(201).location(`/organizadores/${organizador.id}`).json(organizador);
});

// Leer: perfil público, sin correo ni teléfono.
rutas.get('/organizadores/:organizador_id', validar('obtenerOrganizador'), async (req, res) => {
  res.json(await organizadores.obtenerPublico(req.app.locals.db, req.params.organizador_id));
});

// Actualizar: solo el propio organizador.
rutas.patch('/organizadores/:organizador_id', autenticar, validar('actualizarOrganizador'), async (req, res) => {
  res.json(await organizadores.actualizar(req.app.locals.db, req.organizador, req.params.organizador_id, req.body));
});

// Eliminar: solo el propio organizador y solo si no tiene eventos.
rutas.delete('/organizadores/:organizador_id', autenticar, validar('eliminarOrganizador'), async (req, res) => {
  await organizadores.eliminar(req.app.locals.db, req.organizador, req.params.organizador_id);
  res.status(204).end();
});

export default rutas;
