#!/usr/bin/env node
// Verifica que el modelo de datos, el contrato de API, los datos de ejemplo y
// los formularios del prototipo digan lo mismo. Es la revisión del error más
// frecuente de la Entrega 2: «campos que existen en OpenAPI y no en el modelo».
//
//   node scripts/verificar-coherencia.mjs
//
// Qué compara:
//  1. Cada propiedad de un esquema de OpenAPI marcado con `x-entidad` existe como
//     atributo de esa entidad en docs/modelo-datos.md (salvo las relaciones
//     anidadas, marcadas con `x-relacion`). Una propiedad que el servidor
//     transforma antes de guardarla declara el atributo con `x-guarda-como`
//     (la `clave` del organizador se guarda como `clave_hash`).
//  2. Cada atributo del modelo aparece en al menos un esquema de su entidad.
//  3. Tipo, formato, longitudes mínima y máxima, rango numérico, valores de
//     enumeración, valor por defecto y nulabilidad coinciden entre el modelo y el
//     contrato.
//  4. web/datos/ejemplo.json valida contra los esquemas del contrato.
//  5. Cada control de formulario de web/*.html con `name` corresponde a un
//     atributo de la entidad declarada en su `data-entidad`, y cada atributo que
//     «llena el usuario» aparece en algún formulario.
// Sale con código 1 si encuentra cualquier diferencia.
// Opcional: --partes=contrato,datos,formularios (por defecto, las que existan en
// el repositorio: el contrato, los datos de ejemplo y los formularios de web/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const existe = (p) => fs.existsSync(path.join(RAIZ, p));
const disponibles = [];
if (existe('api/openapi.yaml')) disponibles.push('contrato');
if (existe('api/openapi.yaml') && existe('web/datos/ejemplo.json')) disponibles.push('datos');
if (existe('web') && fs.readdirSync(path.join(RAIZ, 'web')).some((f) => f.endsWith('.html'))) disponibles.push('formularios');
const argPartes = process.argv.find((a) => a.startsWith('--partes='));
const PARTES = new Set(argPartes ? argPartes.slice(9).split(',') : disponibles);
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const problemas = [];
const avisos = [];
const falla = (m) => problemas.push(m);

// ---------------------------------------------------------------- modelo
const md = leer('docs/modelo-datos.md');
const lineas = md.split('\n');
const celdas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nombreCodigo = (c) => (c.match(/`([^`]+)`/) || [null, c])[1].trim();

const entidades = {}; // nombre -> { atributos: {nombre: {tipo, nulo, llena, restricciones, defecto}} }
const dominios = {}; // nombre -> [valores]
let entidadActual = null;
for (let i = 0; i < lineas.length; i++) {
  const l = lineas[i];
  const h = l.match(/^#{2,4}\s.*?[Ee]ntidad\s+`([a-z_]+)`/);
  if (h) { entidadActual = h[1]; entidades[entidadActual] = { atributos: {} }; continue; }
  // Un título de nivel 2 o 3 que no es de entidad cierra la sección de la entidad.
  if (/^#{2,3}\s/.test(l)) entidadActual = null;
  if (!l.trim().startsWith('|')) continue;
  const cab = celdas(l).map(sinTildes);
  if (entidadActual && cab[0] === 'atributo') {
    const idx = (nombre) => cab.findIndex((c) => c.startsWith(nombre));
    const iTipo = idx('tipo'), iNulo = idx('nulo'), iLlena = idx('lo llena'), iRes = idx('restricciones'), iDef = idx('por defecto');
    i += 2; // salta la cabecera y la línea de separación
    for (; i < lineas.length && lineas[i].trim().startsWith('|'); i++) {
      const c = celdas(lineas[i]);
      const nombre = nombreCodigo(c[0]);
      entidades[entidadActual].atributos[nombre] = {
        tipo: nombreCodigo(c[iTipo] || '').toLowerCase(),
        nulo: /^s[ií]/i.test(c[iNulo] || ''),
        llena: sinTildes(c[iLlena] || ''),
        restricciones: c[iRes] || '',
        defecto: c[iDef] || '',
      };
    }
    i--;
    continue;
  }
  if (cab[0] === 'dominio' && cab.some((c) => c.startsWith('valores'))) {
    const iVal = cab.findIndex((c) => c.startsWith('valores'));
    i += 2;
    for (; i < lineas.length && lineas[i].trim().startsWith('|'); i++) {
      const c = celdas(lineas[i]);
      dominios[nombreCodigo(c[0]).toLowerCase()] = [...c[iVal].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    }
    i--;
  }
}
if (!Object.keys(entidades).length) falla('No encontré entidades en docs/modelo-datos.md (se esperan títulos «Entidad `nombre`» con una tabla «Atributo | Tipo | Nulo | …»).');

// ---------------------------------------------------------------- contrato
const necesitaContrato = PARTES.has('contrato') || PARTES.has('datos');
const api = necesitaContrato ? yaml.load(leer('api/openapi.yaml')) : { components: { schemas: {} } };
const esquemas = api.components?.schemas || {};
const resolver = (s) => {
  let n = 0;
  while (s && s.$ref && n++ < 10) s = esquemas[s.$ref.split('/').pop()];
  return s || {};
};
// Normaliza el esquema de una propiedad: { tipos:Set, formato, maxLength, enum, admiteNull }
function describir(s0) {
  const out = { tipos: new Set(), formato: null, maxLength: null, minLength: null, minimum: null, maximum: null, defecto: undefined, enum: null, admiteNull: false };
  const visitar = (s) => {
    s = resolver(s);
    for (const k of ['anyOf', 'oneOf']) if (s[k]) s[k].forEach(visitar);
    if (s.allOf) s.allOf.forEach(visitar);
    const t = s.type;
    for (const x of Array.isArray(t) ? t : t ? [t] : []) { if (x === 'null') out.admiteNull = true; else out.tipos.add(x); }
    if (s.const === null) out.admiteNull = true;
    if (s.format) out.formato = s.format;
    if (s.maxLength != null) out.maxLength = s.maxLength;
    if (s.minLength != null) out.minLength = s.minLength;
    if (s.minimum != null) out.minimum = s.minimum;
    if (s.maximum != null) out.maximum = s.maximum;
    if (s.default !== undefined) out.defecto = s.default;
    if (s.enum) {
      const v = s.enum.filter((x) => x !== null);
      if (s.enum.includes(null)) out.admiteNull = true;
      out.enum = v;
      if (!out.tipos.size) out.tipos.add('string');
    }
  };
  visitar(s0);
  return out;
}
const esEntrada = (n) => /(Nuevo|Nueva|Cambios)$/.test(n);
const usados = {}; // entidad -> Set(atributos vistos en el contrato)
for (const [nombre, s] of Object.entries(PARTES.has('contrato') ? esquemas : {})) {
  const ent = s['x-entidad'];
  if (!ent) continue;
  if (!entidades[ent]) { falla(`OpenAPI ${nombre}: x-entidad «${ent}» no existe en el modelo.`); continue; }
  usados[ent] ||= new Set();
  const req = new Set(s.required || []);
  for (const [prop, ps] of Object.entries(s.properties || {})) {
    const rel = ps['x-relacion'] || resolver(ps)['x-relacion'] || ps.items?.['x-relacion'];
    if (rel) {
      if (!entidades[rel]) falla(`OpenAPI ${nombre}.${prop}: x-relacion «${rel}» no es una entidad del modelo.`);
      continue;
    }
    const destino = ps['x-guarda-como'] || prop;
    const a = entidades[ent].atributos[destino];
    if (!a) { falla(`OpenAPI ${nombre}.${prop} no existe como atributo de «${ent}» en el modelo${destino !== prop ? ` (x-guarda-como: ${destino})` : ''}.`); continue; }
    usados[ent].add(destino);
    if (destino !== prop) {
      // Se transforma antes de guardarse (clave → hash bcrypt): tipo y longitudes no
      // se comparan, pero debe ser solo de entrada y nunca volver en una respuesta.
      if (!esEntrada(nombre)) falla(`${nombre}.${prop}: x-guarda-como solo se permite en esquemas de entrada (…Nuevo, …Cambios).`);
      if (!ps.writeOnly) falla(`${nombre}.${prop}: con x-guarda-como debe declararse writeOnly: true.`);
      continue;
    }
    const d = describir(ps);
    const tipo = a.tipo;
    const esperado =
      tipo === 'uuid' ? { t: 'string', f: 'uuid' } :
      /^(varchar|character varying)\(\d+\)$/.test(tipo) || tipo === 'text' || tipo === 'citext' ? { t: 'string' } :
      /^(smallint|integer|int|bigint)$/.test(tipo) ? { t: 'integer' } :
      tipo === 'boolean' ? { t: 'boolean' } :
      tipo === 'timestamptz' ? { t: 'string', f: 'date-time' } :
      tipo === 'date' ? { t: 'string', f: 'date' } :
      dominios[tipo] ? { t: 'string', e: dominios[tipo] } : null;
    if (!esperado) { falla(`Modelo ${ent}.${prop}: tipo «${tipo}» desconocido (¿falta en la tabla de dominios?).`); continue; }
    if (!d.tipos.has(esperado.t) || d.tipos.size !== 1) falla(`${nombre}.${prop}: tipo en OpenAPI [${[...d.tipos]}] ≠ modelo ${tipo} (→ ${esperado.t}).`);
    if (esperado.f && d.formato !== esperado.f) falla(`${nombre}.${prop}: formato «${d.formato}» ≠ «${esperado.f}» del modelo (${tipo}).`);
    const mVar = tipo.match(/\((\d+)\)/);
    if (mVar && d.maxLength !== +mVar[1]) falla(`${nombre}.${prop}: maxLength ${d.maxLength} ≠ ${mVar[1]} del modelo (${tipo}).`);
    if (esperado.e) {
      const a1 = [...(d.enum || [])].sort().join(','), b1 = [...esperado.e].sort().join(',');
      // Un esquema de entrada puede aceptar solo una parte del dominio (p. ej. los
      // estados que el organizador puede pedir); uno de respuesta debe tenerlo completo.
      const fuera = (d.enum || []).filter((v) => !esperado.e.includes(v));
      if (!d.enum) falla(`${nombre}.${prop}: falta el enum del dominio ${tipo}.`);
      else if (fuera.length) falla(`${nombre}.${prop}: valores [${fuera}] no existen en el dominio ${tipo} [${b1}].`);
      else if (!esEntrada(nombre) && a1 !== b1) falla(`${nombre}.${prop}: enum [${a1}] ≠ dominio ${tipo} [${b1}].`);
    }
    // Longitudes y rangos declarados en la columna «Restricciones» del modelo.
    // Un esquema de entrada DEBE declararlos; uno de respuesta, si los declara, igual.
    const r = a.restricciones.replace(/(\d)\.(?=\d{3}\b)/g, '$1'); // 100.000 → 100000
    const mCar = r.match(/(\d+)\s*a\s*(\d+)\s*caracteres/);
    if (mCar && esperado.t === 'string') {
      const mn = +mCar[1];
      if (d.minLength != null ? d.minLength !== mn : esEntrada(nombre) && mn > 0)
        falla(`${nombre}.${prop}: minLength ${d.minLength} ≠ ${mn} del modelo («${mCar[0]}»).`);
    }
    if (esperado.t === 'integer') {
      const mRango = r.match(/(?:^|[^\d])(\d+)\s*a\s*(\d+)(?![\d])/);
      const mMin = r.match(/≥\s*(\d+)/) || r.match(/^\s*(\d+)\s*≤/);
      const [mn, mx] = mRango ? [+mRango[1], +mRango[2]] : [mMin ? +mMin[1] : null, null];
      if (mn != null && (d.minimum != null ? d.minimum !== mn : esEntrada(nombre)))
        falla(`${nombre}.${prop}: minimum ${d.minimum} ≠ ${mn} del modelo.`);
      if (mx != null && (d.maximum != null ? d.maximum !== mx : esEntrada(nombre)))
        falla(`${nombre}.${prop}: maximum ${d.maximum} ≠ ${mx} del modelo.`);
    }
    // Valor por defecto literal del modelo (`false`, `10`, `'hasta_24h_antes'`…).
    const mDef = a.defecto.match(/^`(true|false|-?\d+|'[^']*')`/);
    if (mDef) {
      const lit = mDef[1];
      const valor = lit === 'true' ? true : lit === 'false' ? false : /^-?\d+$/.test(lit) ? Number(lit) : lit.slice(1, -1);
      if (d.defecto !== undefined && d.defecto !== valor) falla(`${nombre}.${prop}: default ${JSON.stringify(d.defecto)} ≠ ${lit} del modelo.`);
      // Solo en los de creación: en un PATCH (…Cambios), omitir un campo significa «no cambiar».
      if (d.defecto === undefined && /(Nuevo|Nueva)$/.test(nombre) && !req.has(prop)) falla(`${nombre}.${prop}: es opcional y el modelo tiene valor por defecto ${lit}; decláralo con default.`);
    } else if (d.defecto !== undefined && d.defecto !== null && !/now\(\)|interval/.test(a.defecto)) {
      falla(`${nombre}.${prop}: el contrato declara default ${JSON.stringify(d.defecto)} y el modelo no tiene valor por defecto literal.`);
    }
    if (!esEntrada(nombre)) {
      if (!req.has(prop)) falla(`${nombre}.${prop}: en un esquema de respuesta todo atributo debe ser required (puede valer null si el modelo lo permite).`);
      if (a.nulo !== d.admiteNull) falla(`${nombre}.${prop}: nulabilidad distinta (modelo ${a.nulo ? 'admite' : 'no admite'} NULL; OpenAPI ${d.admiteNull ? 'admite' : 'no admite'} null).`);
    }
  }
}
for (const [ent, e] of Object.entries(entidades)) {
  for (const at of Object.keys(e.atributos)) {
    if (PARTES.has('contrato') && !usados[ent]?.has(at)) falla(`Modelo ${ent}.${at} no aparece en ningún esquema del contrato con x-entidad: ${ent}.`);
  }
  for (const control of ['creado_en', 'actualizado_en']) if (!e.atributos[control]) falla(`Modelo ${ent}: falta el campo de control ${control}.`);
}

// ---------------------------------------------------------------- datos de ejemplo
const ejemplo = PARTES.has('datos') ? JSON.parse(leer('web/datos/ejemplo.json')) : {};
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const conDefs = JSON.parse(JSON.stringify({ $id: 'contrato', $defs: esquemas }).replaceAll('#/components/schemas/', 'contrato#/$defs/'));
ajv.addSchema(conDefs);
const COLECCIONES = { organizadores: 'Organizador', eventos: 'Evento', ordenes: 'Orden', boletas: 'Boleta', validaciones: 'Validacion' };
for (const [col, arr] of Object.entries(ejemplo)) {
  const esq = COLECCIONES[col];
  if (!esq) { falla(`ejemplo.json: colección «${col}» sin esquema asociado en el verificador.`); continue; }
  if (!esquemas[esq]) { falla(`ejemplo.json: el contrato no define el esquema ${esq}.`); continue; }
  const validar = ajv.getSchema(`contrato#/$defs/${esq}`);
  arr.forEach((obj, i) => {
    if (!validar(obj)) falla(`ejemplo.json ${col}[${i}] no valida contra ${esq}: ${ajv.errorsText(validar.errors, { dataVar: col + '[' + i + ']' })}`);
  });
}

// ---------------------------------------------------------------- formularios
const htmls = PARTES.has('formularios') ? fs.readdirSync(path.join(RAIZ, 'web')).filter((f) => f.endsWith('.html')) : [];
const enFormularios = {}; // entidad -> Set(nombres)
for (const f of htmls) {
  const html = leer(path.join('web', f));
  // Pila simple de data-entidad por apertura/cierre de etiquetas contenedoras.
  const re = /<(\/?)(form|fieldset|template|div|section)\b([^>]*)>|<(input|select|textarea)\b([^>]*)>/gi;
  const pila = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[2]) {
      if (m[1]) { pila.pop(); continue; }
      const ent = (m[3].match(/data-entidad="([a-z_]+)"/) || [])[1] || null;
      pila.push(ent);
      continue;
    }
    const attrs = m[5];
    const tipo = (attrs.match(/type="([^"]+)"/) || [])[1] || m[4];
    if (['submit', 'button', 'reset', 'image'].includes(tipo)) continue;
    const nombre = (attrs.match(/\bname="([^"]+)"/) || [])[1];
    if (!nombre) continue;
    const ent = [...pila].reverse().find(Boolean);
    // Los controles fuera de un contenedor con data-entidad (buscador, filtros) no
    // son atributos del modelo: son parámetros de consulta y no se comparan.
    if (!ent) continue;
    if (!entidades[ent]) { falla(`${f}: data-entidad «${ent}» no es una entidad del modelo.`); continue; }
    if (!entidades[ent].atributos[nombre]) { falla(`${f}: el control «${nombre}» no es atributo de «${ent}».`); continue; }
    (enFormularios[ent] ||= new Set()).add(nombre);
  }
}
for (const [ent, e] of Object.entries(PARTES.has('formularios') ? entidades : {})) {
  for (const [at, a] of Object.entries(e.atributos)) {
    if (a.llena.startsWith('usuario') && !enFormularios[ent]?.has(at)) falla(`El modelo dice que el usuario llena ${ent}.${at}, pero ningún formulario de web/ lo pide.`);
  }
}

// ---------------------------------------------------------------- informe
const nEnt = Object.keys(entidades).length;
const nAtr = Object.values(entidades).reduce((s, e) => s + Object.keys(e.atributos).length, 0);
const nEsq = Object.values(esquemas).filter((s) => s['x-entidad']).length;
console.log(`Partes revisadas: ${[...PARTES].join(', ')}.`);
console.log(`Modelo: ${nEnt} entidades, ${nAtr} atributos, ${Object.keys(dominios).length} dominios.`);
console.log(`Contrato: ${nEsq} esquemas ligados a entidades. Datos de ejemplo: ${Object.entries(ejemplo).map(([k, v]) => `${v.length} ${k}`).join(', ')}.`);
console.log(`Formularios: ${htmls.length} páginas, ${Object.values(enFormularios).reduce((s, x) => s + x.size, 0)} campos ligados al modelo.`);
for (const a of avisos) console.log('AVISO  ' + a);
if (problemas.length) {
  for (const p of problemas) console.log('FALLA  ' + p);
  console.log(`\n${problemas.length} diferencia(s) entre modelo, contrato, datos y formularios.`);
  process.exit(1);
}
const completa = ['contrato', 'datos', 'formularios'].every((p) => PARTES.has(p));
console.log(completa ? '\nOK: modelo, contrato, datos de ejemplo y formularios son coherentes.' : `\nOK (revisión parcial): el modelo es coherente con ${[...PARTES].join(', ')}.`);
