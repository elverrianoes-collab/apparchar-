// Rutas de eventos (contrato: etiqueta «Eventos»).
import { Router } from 'express';
import { autenticar, autenticarOpcional } from '../../comun/autenticacion.js';
import { enviarLista } from '../../comun/paginacion.js';
import { validar } from '../../comun/validacion.js';
import * as eventos from './servicio.js';

const rutas = Router();

// Leer: la cartelera pública, con filtros y paginación.
rutas.get('/eventos', validar('listarEventos'), async (req, res) => {
  const { eventos: lista, total } = await eventos.listarCartelera(req.app.locals.db, req.consulta);
  enviarLista(res, lista, total);
});

// Crear: nace en borrador a nombre del organizador del token.
rutas.post('/eventos', autenticar, validar('crearEvento'), async (req, res) => {
  const evento = await eventos.crear(req.app.locals.db, req.organizador, req.body);
  res.status(201).location(`/eventos/${evento.id}`).json(evento);
});

// Leer: el detalle es público; con el token del dueño también muestra borradores.
rutas.get('/eventos/:evento_id', autenticarOpcional, validar('obtenerEvento'), async (req, res) => {
  res.json(await eventos.obtener(req.app.locals.db, req.params.evento_id, req.organizador));
});

// Actualizar: editar, publicar, pausar o cancelar (solo el dueño, con version).
rutas.patch('/eventos/:evento_id', autenticar, validar('actualizarEvento'), async (req, res) => {
  res.json(await eventos.actualizar(req.app.locals.db, req.organizador, req.params.evento_id, req.body));
});

// Eliminar: solo borradores, solo el dueño.
rutas.delete('/eventos/:evento_id', autenticar, validar('eliminarEvento'), async (req, res) => {
  await eventos.eliminar(req.app.locals.db, req.organizador, req.params.evento_id);
  res.status(204).end();
});

// Leer: «Mis eventos», el panel del organizador (todos sus eventos, también borradores).
rutas.get('/organizadores/:organizador_id/eventos', autenticar, validar('listarEventosDelOrganizador'), async (req, res) => {
  const { eventos: lista, total } = await eventos.listarDelOrganizador(
    req.app.locals.db, req.organizador, req.params.organizador_id, req.consulta,
  );
  enviarLista(res, lista, total);
});

export default rutas;
