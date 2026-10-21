// Datos de demostración: npm run semilla (borra la base y la llena) o npm run demo
// (lo mismo y además arranca el servidor). Los datos se crean con los mismos
// servicios de la API, así que cumplen todas sus reglas. Las fechas son relativas
// a hoy: el concierto empieza en 3 horas para poder mostrar la puerta en vivo.
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { conectar } from './conexion.js';
import { prepararEsquema } from './migrar.js';
import * as organizadores from '../modulos/organizadores/servicio.js';
import * as eventos from '../modulos/eventos/servicio.js';
import * as ordenes from '../modulos/ordenes/servicio.js';
import * as boletas from '../modulos/boletas/servicio.js';

export const CLAVE_DEMO = 'Apparchar2026';
const HORA = 60 * 60 * 1000;
const enHoras = (horas) => new Date(Date.now() + horas * HORA).toISOString();
// Un día a una hora de Colombia: enDias(12, 19) → dentro de 12 días a las 7:00 p. m.
function enDias(dias, hora) {
  const fecha = new Date(Date.now() + dias * 24 * HORA);
  fecha.setUTCHours(hora + 5, 0, 0, 0);
  return fecha.toISOString();
}

const comprador = {
  comprador_nombre: 'Laura Camila Rojas',
  comprador_correo: 'laura.rojas@ejemplo.co',
  comprador_telefono: '+573105550631',
  comprador_documento: '1118532219',
  medio_pago: 'nequi',
  autoriza_tratamiento_datos: true,
};

async function publicar(db, organizador, datos) {
  const evento = await eventos.crear(db, organizador, datos);
  return eventos.actualizar(db, organizador, evento.id, { version: evento.version, estado: 'publicado' });
}

export async function cargarSemilla(db) {
  await db.ejecutarScript('TRUNCATE validacion, boleta, item_orden, orden, tipo_boleta, evento, organizador CASCADE');

  const sabanaRock = await organizadores.registrar(db, {
    nombre: 'Colectivo Sabana Rock', correo: 'demo@apparchar.co', telefono: '+573105550148', municipio: 'Yopal', clave: CLAVE_DEMO,
  });
  const joropo = await organizadores.registrar(db, {
    nombre: 'Fundación Cultural Joropo de Tauramena', correo: 'fundacion@apparchar.co', telefono: '+573125550911', municipio: 'Tauramena', clave: CLAVE_DEMO,
  });

  const rock = await publicar(db, sabanaRock, {
    nombre: 'Noche de rock llanero: Sabana Eléctrica en vivo',
    descripcion: 'Sabana Eléctrica presenta su nuevo sencillo en vivo, con invitados de Aguazul. Puertas a las 8:00 p. m.',
    categoria: 'concierto', lugar: 'Bar La Tranquera', direccion: 'Carrera 23 # 12-40, barrio El Centro', municipio: 'Yopal',
    fecha_inicio: enHoras(3), fecha_fin: enHoras(8), aforo_total: 180, edad_minima: 18,
    tipos_boleta: [
      { nombre: 'Preventa', precio_cop: 25000, cantidad_total: 50 },
      { nombre: 'General', precio_cop: 35000, cantidad_total: 100, maximo_por_orden: 6 },
    ],
  });
  const festival = await publicar(db, joropo, {
    nombre: 'Festival de música llanera de Tauramena',
    descripcion: 'Dos días de arpa, cuatro y maracas con agrupaciones de todo Casanare. Zona de comidas típicas.',
    categoria: 'festival', lugar: 'Coliseo cubierto de Tauramena', direccion: 'Calle 6 # 14-20', municipio: 'Tauramena',
    fecha_inicio: enDias(12, 16), fecha_fin: enDias(13, 23), aforo_total: 2500, politica_reembolso: 'hasta_72h_antes',
    tipos_boleta: [
      { nombre: 'General', precio_cop: 40000, cantidad_total: 2000 },
      { nombre: 'VIP', descripcion: 'Silla numerada cerca de la tarima.', precio_cop: 120000, cantidad_total: 300, maximo_por_orden: 4 },
    ],
  });
  await publicar(db, joropo, {
    nombre: 'Encuentro de arpa, cuatro y maracas de Monterrey',
    descripcion: 'Encuentro gratuito de músicos llaneros en el parque principal. La boleta solo controla el aforo.',
    categoria: 'festival', lugar: 'Parque principal de Monterrey', direccion: 'Carrera 8 con calle 10', municipio: 'Monterrey',
    fecha_inicio: enDias(6, 15), fecha_fin: enDias(6, 21), aforo_total: 400, es_gratuito: true,
    tipos_boleta: [{ nombre: 'Entrada libre', precio_cop: 0, cantidad_total: 400 }],
  });
  const standup = await publicar(db, sabanaRock, {
    nombre: 'Stand-up: Llanero pero no tanto',
    descripcion: 'Una hora de humor sobre la vida en el llano. Función única con cupo muy limitado.',
    categoria: 'teatro', lugar: 'Teatrino El Morichal', direccion: 'Calle 20 # 25-12', municipio: 'Aguazul',
    fecha_inicio: enDias(20, 19), fecha_fin: enDias(20, 21), aforo_total: 60,
    tipos_boleta: [{ nombre: 'Única', precio_cop: 30000, cantidad_total: 2 }],
  });
  const borrador = await eventos.crear(db, sabanaRock, {
    nombre: 'Torneo relámpago de microfútbol',
    descripcion: 'Borrador: torneo de un día para equipos de barrio. Todavía faltan los tipos de boleta.',
    categoria: 'deportes', lugar: 'Polideportivo La Campiña', direccion: 'Calle 40 # 15-30', municipio: 'Yopal',
    fecha_inicio: enDias(30, 8), fecha_fin: enDias(30, 18), aforo_total: 300,
  });

  // Ventas: una orden pagada para la puerta, una pendiente y el stand-up agotado.
  const general = rock.tipos_boleta.find((t) => t.nombre === 'General');
  const pagada = await ordenes.crear(db, { evento_id: rock.id, items: [{ tipo_boleta_id: general.id, cantidad: 3 }], ...comprador });
  await ordenes.confirmarPago(db, pagada.id, 'NEQUI-DEMO-0001');
  const pendiente = await ordenes.crear(db, {
    evento_id: festival.id, items: [{ tipo_boleta_id: festival.tipos_boleta[1].id, cantidad: 2 }],
    ...comprador, comprador_nombre: 'Edwin Alfonso Pidiache', comprador_correo: 'edwin.pidiache@ejemplo.co', medio_pago: 'pse',
  });
  await ordenes.crear(db, {
    evento_id: standup.id, items: [{ tipo_boleta_id: standup.tipos_boleta[0].id, cantidad: 2 }], ...comprador,
  });
  await ordenes.confirmarPago(db, (await db.consultar(
    "SELECT id FROM orden WHERE evento_id = $1 AND estado = 'pendiente'", [standup.id],
  )).rows[0].id, 'PSE-DEMO-0002');

  return {
    organizador: sabanaRock,
    evento: rock,
    borrador: borrador.id,
    ordenPagada: pagada.id,
    ordenPendiente: pendiente.id,
    codigos: (await boletas.listarDeOrden(db, pagada.id)).map((b) => b.codigo),
  };
}

export function imprimirResumen(datos) {
  console.log('Datos de demostración cargados:');
  console.log(`  Organizador: ${datos.organizador.correo} · clave ${CLAVE_DEMO} (también fundacion@apparchar.co)`);
  console.log(`  Evento con la puerta abierta (+18): «${datos.evento.nombre}»`);
  console.log(`    evento_id: ${datos.evento.id}`);
  for (const tipo of datos.evento.tipos_boleta) console.log(`    tipo_boleta_id ${tipo.nombre}: ${tipo.id}`);
  console.log(`  Borrador para editar o borrar: ${datos.borrador}`);
  console.log(`  Orden pagada: ${datos.ordenPagada} · boletas para validar: ${datos.codigos.join(', ')}`);
  console.log(`  Orden pendiente (vence 15 minutos después de cargar los datos): ${datos.ordenPendiente}`);
  console.log(`  Clave de la pasarela (cabecera X-Clave-Pasarela): ${config.pasarelaClave}`);
}

// npm run semilla
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = await conectar({ url: config.databaseUrl, directorio: config.directorioPglite });
  await prepararEsquema(db);
  imprimirResumen(await cargarSemilla(db));
  await db.cerrar();
}
