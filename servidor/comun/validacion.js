// Validación de las peticiones contra el contrato (api/openapi.yaml).
//
// Cada ruta declara su operación: router.post('/eventos', validar('crearEvento'), …).
// Antes de tocar la base se revisan los parámetros de la ruta, los de consulta y
// el cuerpo JSON con los mismos esquemas que publica /docs. Si algo no cumple,
// responde 400 `solicitud_invalida` y `detalles` dice qué campo falló y por qué.
// Las reglas que necesitan la base (cupos, estados, dueños) las revisa cada servicio.
//
// Antes de validar se quitan los espacios al principio y al final de los textos
// (salvo la clave y el código leído en la puerta, que se usan tal cual), y después
// los UUID se pasan a minúsculas, que es como los devuelve la base.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { contrato, operacion, resolver } from './contrato.js';
import { solicitudInvalida } from './errores.js';

const conRefs = (esquema) =>
  JSON.parse(JSON.stringify(esquema).replaceAll('#/components/schemas/', 'contrato#/$defs/'));

function crearAjv(opciones) {
  const ajv = new Ajv2020({ strict: false, allErrors: true, verbose: true, ...opciones });
  addFormats(ajv);
  ajv.addSchema({ $id: 'contrato', $defs: conRefs(contrato.components.schemas) });
  return ajv;
}

// El cuerpo se valida tal cual llega y se le ponen los valores por defecto del contrato.
const ajvCuerpo = crearAjv({ useDefaults: true });
// Los parámetros llegan como texto: «?pagina=2» se convierte en el entero 2.
const ajvParametros = crearAjv({ useDefaults: true, coerceTypes: true });

const TIPOS = {
  integer: 'un número entero', number: 'un número', string: 'texto', boolean: 'true o false',
  object: 'un objeto JSON', array: 'una lista', null: 'null',
};
const FORMATOS = {
  uuid: 'Debe ser un UUID, por ejemplo 29f5422e-4b0e-4ff2-a6d7-eab5062461cb.',
  email: 'Debe ser un correo válido, por ejemplo nombre@dominio.co.',
  'date-time': 'Debe ser fecha y hora ISO 8601 con desfase, por ejemplo 2026-12-05T20:00:00-05:00.',
  date: 'Debe ser una fecha AAAA-MM-DD, por ejemplo 2026-12-05.',
  uri: 'Debe ser una dirección web completa.',
};
const PATRONES = {
  telefono: 'Usa el formato +573XXXXXXXXX (celular) o +5760XXXXXXXX (fijo).',
  comprador_telefono: 'Usa el formato +573XXXXXXXXX (celular colombiano).',
  comprador_documento: 'Escribe la cédula con 6 a 10 dígitos, sin puntos ni espacios.',
  correo: 'Debe ser un correo válido, por ejemplo nombre@dominio.co.',
  comprador_correo: 'Debe ser un correo válido, por ejemplo nombre@dominio.co.',
  codigo: 'Debe tener la forma XXXX-XXXX-XXXX, con letras y números sin I, L, O, 0 ni 1.',
  slug: 'Solo minúsculas sin tildes, números y guiones.',
  imagen_url: 'Debe empezar por https://.',
  referencia_pago: 'Solo letras sin tildes, números, guion y guion bajo.',
};

// '/tipos_boleta/0/precio_cop' → 'tipos_boleta[0].precio_cop'
function nombreCampo(rutaJson, extra) {
  let campo = '';
  const partes = rutaJson.split('/').slice(1).map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (extra !== undefined) partes.push(extra);
  for (const parte of partes) campo += /^\d+$/.test(parte) ? `[${parte}]` : (campo ? '.' : '') + parte;
  return campo || '(cuerpo)';
}

// Si un campo falla varias reglas, se informa la más útil para corregirlo.
const PRIORIDAD = ['required', 'additionalProperties', 'type', 'enum', 'const', 'format', 'pattern'];
const prioridad = (e) => (PRIORIDAD.includes(e.keyword) ? PRIORIDAD.indexOf(e.keyword) : PRIORIDAD.length);

function traducir(errores) {
  const detalles = [];
  for (const e of [...errores].sort((a, b) => prioridad(a) - prioridad(b))) {
    // Los errores de las combinaciones (if/anyOf) repiten lo que ya dicen los demás.
    if (['if', 'anyOf', 'oneOf', 'not'].includes(e.keyword)) continue;
    let campo = nombreCampo(e.instancePath);
    const ultimo = campo.split('.').pop().replace(/\[\d+\]$/, '');
    let problema;
    switch (e.keyword) {
      case 'required':
        campo = nombreCampo(e.instancePath, e.params.missingProperty);
        problema = 'Es obligatorio.';
        break;
      case 'additionalProperties':
        campo = nombreCampo(e.instancePath, e.params.additionalProperty);
        problema = 'No es un campo permitido aquí (los campos que pone el servidor no se envían).';
        break;
      case 'type': {
        const tipos = Array.isArray(e.params.type) ? e.params.type : String(e.params.type).split(',');
        problema = `Debe ser ${tipos.map((t) => TIPOS[t] || t).join(' o ')}.`;
        break;
      }
      case 'minLength': problema = `Debe tener al menos ${e.params.limit} caracteres.`; break;
      case 'maxLength': problema = `Debe tener como máximo ${e.params.limit} caracteres.`; break;
      case 'minimum':
      case 'maximum': {
        const { minimum, maximum } = e.parentSchema || {};
        if (minimum !== undefined && maximum !== undefined) problema = `Debe estar entre ${minimum} y ${maximum}.`;
        else problema = e.keyword === 'minimum' ? `Debe ser mayor o igual que ${e.params.limit}.` : `Debe ser menor o igual que ${e.params.limit}.`;
        break;
      }
      case 'exclusiveMinimum': problema = `Debe ser mayor que ${e.params.limit}.`; break;
      case 'minItems': problema = `Debe tener al menos ${e.params.limit} elemento(s).`; break;
      case 'maxItems': problema = `Debe tener como máximo ${e.params.limit} elemento(s).`; break;
      case 'minProperties': problema = `Debe traer al menos ${e.params.limit} campo(s).`; break;
      case 'format': problema = FORMATOS[e.params.format] || `No tiene el formato ${e.params.format}.`; break;
      case 'pattern': problema = PATRONES[ultimo] || 'No tiene el formato esperado.'; break;
      case 'enum':
        problema = ultimo === 'municipio'
          ? `Debe ser un municipio de Casanare escrito como en la lista, con tildes: ${e.params.allowedValues.join(', ')}.`
          : `Debe ser una de: ${e.params.allowedValues.join(', ')}.`;
        break;
      case 'const':
        problema = ultimo === 'autoriza_tratamiento_datos'
          ? 'Debe ser true: sin autorización de tratamiento de datos (Ley 1581 de 2012) no se puede comprar.'
          : `Debe valer ${JSON.stringify(e.params.allowedValue)}.`;
        break;
      default:
        problema = e.message;
    }
    if (!detalles.some((d) => d.campo === campo)) detalles.push({ campo, problema });
  }
  return detalles;
}

function esquemaDeParametros(op, ubicacion) {
  const properties = {};
  const required = [];
  for (const referencia of op.parameters || []) {
    const p = resolver(referencia);
    if (p.in !== ubicacion) continue;
    properties[p.name] = conRefs(p.schema);
    if (p.required) required.push(p.name);
  }
  return Object.keys(properties).length ? { type: 'object', properties, required } : null;
}

// Textos que se usan tal como llegan: la clave (los espacios cuentan) y el código
// leído en la puerta (queda en la auditoría como lo leyó la cámara).
const SIN_RECORTAR = new Set(['clave', 'codigo_leido']);

function recortarTextos(valor) {
  if (Array.isArray(valor)) return valor.map(recortarTextos);
  if (valor && typeof valor === 'object') {
    const salida = {};
    for (const [clave, v] of Object.entries(valor)) salida[clave] = SIN_RECORTAR.has(clave) ? v : recortarTextos(v);
    return salida;
  }
  return typeof valor === 'string' ? valor.trim() : valor;
}

// La base devuelve los UUID en minúsculas: los que llegan en mayúsculas se normalizan
// para que las comparaciones (dueño, evento de la boleta, tipos repetidos) no fallen.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidsEnMinusculas(valor, clave = '') {
  if (Array.isArray(valor)) return valor.map((v) => uuidsEnMinusculas(v, clave));
  if (valor && typeof valor === 'object') {
    const salida = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = uuidsEnMinusculas(v, k);
    return salida;
  }
  return typeof valor === 'string' && clave.endsWith('_id') && UUID.test(valor) ? valor.toLowerCase() : valor;
}

export function validar(operationId) {
  const { op } = operacion(operationId);
  const esquemaRuta = esquemaDeParametros(op, 'path');
  const esquemaConsulta = esquemaDeParametros(op, 'query');
  const esquemaCuerpo = op.requestBody?.content?.['application/json']?.schema;
  const validarRuta = esquemaRuta && ajvParametros.compile(esquemaRuta);
  const validarConsulta = esquemaConsulta && ajvParametros.compile(esquemaConsulta);
  const validarCuerpo = esquemaCuerpo && ajvCuerpo.compile(conRefs(esquemaCuerpo));
  const cuerpoObligatorio = Boolean(op.requestBody?.required);

  return function validarPeticion(req, res, next) {
    const detalles = [];

    if (validarRuta && !validarRuta({ ...req.params })) detalles.push(...traducir(validarRuta.errors));

    // Express no deja reemplazar req.query: los parámetros ya convertidos quedan en req.consulta.
    const consulta = {};
    for (const [nombre, valor] of Object.entries(req.query)) {
      if (typeof valor === 'string') consulta[nombre] = valor;
      else detalles.push({ campo: nombre, problema: 'Se envió más de una vez o con un formato no válido.' });
    }
    if (validarConsulta && !validarConsulta(consulta)) detalles.push(...traducir(validarConsulta.errors));
    req.consulta = consulta;

    if (validarCuerpo) {
      if (req.body !== undefined) req.body = recortarTextos(req.body);
      if (req.body === undefined) {
        if (cuerpoObligatorio) {
          detalles.push({ campo: '(cuerpo)', problema: 'Falta el cuerpo JSON (encabezado Content-Type: application/json).' });
        }
      } else if (!validarCuerpo(req.body)) {
        detalles.push(...traducir(validarCuerpo.errors));
      }
    }

    if (detalles.length) return next(solicitudInvalida(detalles));
    req.params = uuidsEnMinusculas({ ...req.params });
    if (req.body !== undefined) req.body = uuidsEnMinusculas(req.body);
    return next();
  };
}
