// Reúne las rutas de cada módulo de la API. Cada recurso nuevo se agrega aquí.
import { Router } from 'express';
import sesiones from './modulos/sesiones/rutas.js';
import organizadores from './modulos/organizadores/rutas.js';
import eventos from './modulos/eventos/rutas.js';
import tiposBoleta from './modulos/tipos-boleta/rutas.js';

export function crearRutas() {
  const rutas = Router();
  rutas.use(sesiones);
  rutas.use(organizadores);
  rutas.use(eventos);
  rutas.use(tiposBoleta);
  return rutas;
}
