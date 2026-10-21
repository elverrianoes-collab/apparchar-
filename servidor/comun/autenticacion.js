// Autenticación con JWT (D-23).
//
// iniciarSesion entrega un token firmado con HS256 y la clave secreta del
// servidor (JWT_SECRETO), con sub = id del organizador y vencimiento a las 8 horas.
// Las rutas protegidas usan `autenticar`: sin token, vencido, con otra firma o de
// una cuenta borrada → 401 `no_autenticado`. Las que aceptan token opcional usan
// `autenticarOpcional`: sin token siguen como anónimas, pero un token que no sirve
// también es 401 (así el organizador sabe que debe volver a iniciar sesión).
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { noAutenticado } from './errores.js';
import { fechaColombia } from './formato.js';

const EMISOR = 'apparchar';
const DURACION = '8h';

export function emitirToken(organizador) {
  const token = jwt.sign({ correo: organizador.correo }, config.jwtSecreto, {
    algorithm: 'HS256',
    subject: organizador.id,
    issuer: EMISOR,
    expiresIn: DURACION,
  });
  const { exp } = jwt.decode(token);
  return { token, tipo: 'Bearer', expira_en: fechaColombia(new Date(exp * 1000)) };
}

async function leerOrganizadorDelToken(req) {
  const encabezado = req.get('authorization');
  if (!encabezado) return null;
  const partes = encabezado.match(/^Bearer\s+(\S+)$/i);
  if (!partes) throw noAutenticado('El encabezado debe ser «Authorization: Bearer <token>».');

  let datos;
  try {
    datos = jwt.verify(partes[1], config.jwtSecreto, { algorithms: ['HS256'], issuer: EMISOR });
  } catch (error) {
    throw noAutenticado(error.name === 'TokenExpiredError'
      ? 'La sesión venció: inicia sesión de nuevo.'
      : undefined);
  }
  // Todo token que emite el servidor vence: uno sin vencimiento no se acepta.
  if (typeof datos.exp !== 'number' || typeof datos.sub !== 'string') throw noAutenticado();

  const { rows } = await req.app.locals.db.consultar(
    'SELECT id, nombre, correo FROM organizador WHERE id = $1',
    [datos.sub],
  );
  if (!rows[0]) throw noAutenticado('La cuenta de este token ya no existe.');
  return rows[0];
}

export async function autenticar(req, res, next) {
  const organizador = await leerOrganizadorDelToken(req);
  if (!organizador) throw noAutenticado();
  req.organizador = organizador;
  next();
}

export async function autenticarOpcional(req, res, next) {
  req.organizador = await leerOrganizadorDelToken(req);
  next();
}
