// Ayudas compartidas por las pruebas automáticas (node --test).
// Cada archivo de pruebas arranca la API sobre una base PGlite en memoria, nueva y
// vacía, y le hace peticiones HTTP con supertest, sin abrir ningún puerto.
import './entorno.js';
import assert from 'node:assert/strict';
import request from 'supertest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { conectar } from '../servidor/db/conexion.js';
import { prepararEsquema } from '../servidor/db/migrar.js';
import { crearApp } from '../servidor/app.js';
import { contrato, operacion, resolver } from '../servidor/comun/contrato.js';

export async function crearContexto() {
  const db = await conectar();
  await prepararEsquema(db);
  const app = crearApp({ db });
  return { db, app, api: request(app), cerrar: () => db.cerrar() };
}

// Fechas relativas a hoy, para que las pruebas no caduquen.
export function enDias(dias, hora = 20) {
  const fecha = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  fecha.setUTCHours(hora + 5, 0, 0, 0); // hora de Colombia
  return fecha.toISOString().replace('.000Z', 'Z');
}
export const enHoras = (horas) => new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();

let consecutivo = 0;
export function datosOrganizador(cambios = {}) {
  consecutivo += 1;
  return {
    nombre: `Colectivo Sabana Rock ${consecutivo}`,
    correo: `colectivo${consecutivo}.${Date.now()}@ejemplo.co`,
    telefono: '+573105550148',
    municipio: 'Yopal',
    clave: 'SabanaRock2026',
    ...cambios,
  };
}

// Registra un organizador e inicia sesión: devuelve su perfil, su token y el encabezado listo.
export async function registrarYEntrar(api, cambios = {}) {
  const datos = datosOrganizador(cambios);
  const registro = await api.post('/organizadores').send(datos);
  assert.equal(registro.status, 201, JSON.stringify(registro.body));
  const sesion = await api.post('/sesiones').send({ correo: datos.correo, clave: datos.clave });
  assert.equal(sesion.status, 200, JSON.stringify(sesion.body));
  return {
    datos,
    organizador: registro.body,
    token: sesion.body.token,
    auth: { Authorization: `Bearer ${sesion.body.token}` },
  };
}

// ------------------------------------------------------------------------------
// cumpleContrato(operationId, respuesta): la respuesta tiene un código de estado
// documentado en el contrato, su cuerpo valida contra el esquema documentado, trae
// las cabeceras documentadas y, si es un error, su `codigo` aparece en los
// ejemplos de esa respuesta. Así el contrato y el backend no se pueden desviar.
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const conRefs = (e) => JSON.parse(JSON.stringify(e).replaceAll('#/components/schemas/', 'contrato#/$defs/'));
ajv.addSchema({ $id: 'contrato', $defs: conRefs(contrato.components.schemas) });
const compilados = new Map();

export function cumpleContrato(operationId, respuesta) {
  const { op } = operacion(operationId);
  const documentada = op.responses[String(respuesta.status)];
  assert.ok(documentada, `${operationId}: el contrato no documenta la respuesta ${respuesta.status} (${JSON.stringify(respuesta.body)})`);
  const r = resolver(documentada);
  for (const cabecera of Object.keys(r.headers || {})) {
    assert.ok(respuesta.headers[cabecera.toLowerCase()] !== undefined, `${operationId} ${respuesta.status}: falta la cabecera ${cabecera}`);
  }
  const contenido = r.content?.['application/json'];
  if (!contenido) {
    assert.equal(respuesta.text, '', `${operationId} ${respuesta.status}: debía responder sin cuerpo`);
    return;
  }
  const clave = `${operationId}:${respuesta.status}`;
  if (!compilados.has(clave)) compilados.set(clave, ajv.compile(conRefs(contenido.schema)));
  const validarCuerpo = compilados.get(clave);
  assert.ok(
    validarCuerpo(respuesta.body),
    `${operationId} ${respuesta.status} no cumple el contrato: ${ajv.errorsText(validarCuerpo.errors)}\n${JSON.stringify(respuesta.body).slice(0, 600)}`,
  );
  if (respuesta.status >= 400) {
    const codigos = Object.values(contenido.examples || {}).map((e) => resolver(e).value?.codigo).filter(Boolean);
    if (codigos.length) {
      assert.ok(codigos.includes(respuesta.body.codigo), `${operationId} ${respuesta.status}: el código «${respuesta.body.codigo}» no está en los ejemplos del contrato (${codigos.join(', ')})`);
    }
  }
}

// ------------------------------------------------------------------------------
// Eventos de prueba: un concierto en Yopal dentro de 10 días, con dos tipos de boleta.
export function datosEvento(cambios = {}) {
  return {
    nombre: 'Noche de rock llanero: Sabana Eléctrica en vivo',
    descripcion: 'Sabana Eléctrica presenta su nuevo sencillo en vivo, con invitados de Aguazul.',
    categoria: 'concierto',
    lugar: 'Bar La Tranquera',
    direccion: 'Carrera 23 # 12-40, barrio El Centro',
    municipio: 'Yopal',
    fecha_inicio: enDias(10, 21),
    fecha_fin: enDias(11, 2),
    aforo_total: 180,
    tipos_boleta: [
      { nombre: 'Preventa', precio_cop: 25000, cantidad_total: 50 },
      { nombre: 'General', precio_cop: 35000, cantidad_total: 100 },
    ],
    ...cambios,
  };
}

export async function crearEvento(api, auth, cambios = {}) {
  const r = await api.post('/eventos').set(auth).send(datosEvento(cambios));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

// Crea el evento y lo publica (borrador → publicado).
export async function crearEventoPublicado(api, auth, cambios = {}) {
  const evento = await crearEvento(api, auth, cambios);
  const r = await api.patch(`/eventos/${evento.id}`).set(auth).send({ version: evento.version, estado: 'publicado' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
