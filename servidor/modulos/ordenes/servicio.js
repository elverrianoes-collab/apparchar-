// CRUD de órdenes (compras sin cuenta): crear (reserva el cupo 15 minutos), leer
// (la orden y el reporte de ventas del evento), actualizar (corregir los datos
// del comprador mientras está pendiente) y eliminar (anular una orden pendiente y
// liberar su cupo). Además, la confirmación del pago que hace la pasarela.
//
// Concurrencia: toda operación que cambia el cupo bloquea primero la fila del
// evento (FOR NO KEY UPDATE) y después la orden y los tipos de boleta, en ese orden
// y con los tipos ordenados por id. Así las compras de un mismo evento se atienden
// una a la vez, una cancelación no se cruza con una compra y no hay deadlocks. NO
// KEY UPDATE (y no UPDATE) deja pasar a quien solo inserta filas que apuntan al
// evento, como una lectura en la puerta.
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { conflicto, noAutenticado, noEncontrado, reglaDeNegocio, solicitudInvalida } from '../../comun/errores.js';
import { fechaLegible, serializar } from '../../comun/formato.js';
import { leerPaginacion } from '../../comun/paginacion.js';
import { emitirBoletas } from '../boletas/servicio.js';
import { exigirEventoPropio } from '../eventos/servicio.js';
import { ajustarAgotado } from '../tipos-boleta/servicio.js';

const COLUMNAS_ORDEN = `id, evento_id, comprador_nombre, comprador_correo, comprador_telefono, comprador_documento,
  medio_pago, autoriza_tratamiento_datos, total_cop, estado, expira_en, pagada_en, referencia_pago, creado_en, actualizado_en`;
const COLUMNAS_ITEM = 'id, orden_id, tipo_boleta_id, cantidad, precio_unitario_cop, creado_en, actualizado_en';

const ordenNoEncontrada = () => noEncontrado('orden_no_encontrada', 'No encontramos esa orden. Revisa el enlace del correo de compra.');

// ------------------------------------------------------------------ respuesta
async function completarOrdenes(db, filas) {
  if (!filas.length) return [];
  const { rows } = await db.consultar(
    `SELECT ${COLUMNAS_ITEM} FROM item_orden WHERE orden_id = ANY($1::uuid[]) ORDER BY creado_en, id`,
    [filas.map((f) => f.id)],
  );
  const itemsPorOrden = new Map(filas.map((f) => [f.id, []]));
  for (const item of rows) itemsPorOrden.get(item.orden_id).push(serializar(item));
  return filas.map((f) => ({ ...serializar(f), items: itemsPorOrden.get(f.id) }));
}

async function obtenerCompleta(db, id) {
  const { rows } = await db.consultar(`SELECT ${COLUMNAS_ORDEN} FROM orden WHERE id = $1`, [id]);
  if (!rows[0]) throw ordenNoEncontrada();
  const [orden] = await completarOrdenes(db, rows);
  return orden;
}

// ------------------------------------------------------------------ cupo
// Devuelve a cada tipo de boleta las unidades que reservaban estas órdenes.
async function liberarCupo(tx, idsOrdenes) {
  await tx.consultar(
    `UPDATE tipo_boleta t SET cantidad_vendida = t.cantidad_vendida - l.cantidad
       FROM (SELECT tipo_boleta_id, sum(cantidad)::int AS cantidad
               FROM item_orden WHERE orden_id = ANY($1::uuid[]) GROUP BY tipo_boleta_id) l
      WHERE t.id = l.tipo_boleta_id`,
    [idsOrdenes],
  );
}

// Tarea del sistema: las órdenes pendientes que pasaron expira_en quedan
// expiradas y liberan su cupo. Corre cada minuto y antes de cada operación de órdenes.
export async function expirarOrdenesVencidas(db) {
  const { rows: eventos } = await db.consultar(
    "SELECT DISTINCT evento_id FROM orden WHERE estado = 'pendiente' AND expira_en <= now() ORDER BY evento_id",
  );
  let expiradas = 0;
  for (const { evento_id: eventoId } of eventos) {
    expiradas += await db.transaccion(async (tx) => {
      await tx.consultar('SELECT 1 FROM evento WHERE id = $1 FOR NO KEY UPDATE', [eventoId]);
      const { rows } = await tx.consultar(
        "UPDATE orden SET estado = 'expirada' WHERE evento_id = $1 AND estado = 'pendiente' AND expira_en <= now() RETURNING id",
        [eventoId],
      );
      if (!rows.length) return 0;
      await liberarCupo(tx, rows.map((r) => r.id));
      await ajustarAgotado(tx, eventoId);
      return rows.length;
    });
  }
  return expiradas;
}

// ------------------------------------------------------------------ crear
function revisarItemsRepetidos(items) {
  const vistos = new Map();
  const detalles = [];
  items.forEach((item, i) => {
    if (vistos.has(item.tipo_boleta_id)) {
      detalles.push({ campo: `items[${i}].tipo_boleta_id`, problema: `Ese tipo ya está en items[${vistos.get(item.tipo_boleta_id)}]; pide la cantidad en una sola línea.` });
    } else {
      vistos.set(item.tipo_boleta_id, i);
    }
  });
  if (detalles.length) throw solicitudInvalida(detalles);
}

export async function crear(db, datos) {
  revisarItemsRepetidos(datos.items);
  await expirarOrdenesVencidas(db);

  return db.transaccion(async (tx) => {
    // Bloqueo del evento: si se cancela en este instante, la compra espera y ve el estado nuevo.
    const eventos = await tx.consultar('SELECT id, nombre, estado, edad_minima FROM evento WHERE id = $1 FOR NO KEY UPDATE', [datos.evento_id]);
    const evento = eventos.rows[0];
    if (!evento || evento.estado === 'borrador') throw noEncontrado('evento_no_encontrado', 'No encontramos ese evento.');
    if (evento.estado !== 'publicado') {
      throw conflicto('evento_no_disponible', `«${evento.nombre}» no está a la venta: está ${evento.estado}.`);
    }

    const ids = datos.items.map((i) => i.tipo_boleta_id);
    const { rows: tipos } = await tx.consultar(
      `SELECT id, evento_id, nombre, precio_cop, cantidad_total, cantidad_vendida, maximo_por_orden,
              venta_inicia_en, venta_termina_en
         FROM tipo_boleta WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
    const ahora = Date.now();

    datos.items.forEach((item, i) => {
      const tipo = tipoPorId.get(item.tipo_boleta_id);
      if (!tipo) throw noEncontrado('tipo_boleta_no_encontrado', 'No encontramos uno de los tipos de boleta pedidos.');
      if (tipo.evento_id !== evento.id) {
        throw reglaDeNegocio('tipo_de_otro_evento', `«${tipo.nombre}» es de otro evento: una orden compra boletas de un solo evento.`,
          [{ campo: `items[${i}].tipo_boleta_id`, problema: `Debe ser un tipo de boleta de «${evento.nombre}».` }]);
      }
    });
    for (const item of datos.items) {
      const tipo = tipoPorId.get(item.tipo_boleta_id);
      if (ahora < new Date(tipo.venta_inicia_en).getTime()) {
        throw conflicto('venta_cerrada', `La venta de «${tipo.nombre}» abre el ${fechaLegible(tipo.venta_inicia_en)}.`);
      }
      if (ahora > new Date(tipo.venta_termina_en).getTime()) {
        throw conflicto('venta_cerrada', `La venta de «${tipo.nombre}» cerró el ${fechaLegible(tipo.venta_termina_en)}.`);
      }
    }
    datos.items.forEach((item, i) => {
      const tipo = tipoPorId.get(item.tipo_boleta_id);
      if (item.cantidad > tipo.maximo_por_orden) {
        throw reglaDeNegocio('maximo_por_orden_excedido', `De «${tipo.nombre}» se compran como máximo ${tipo.maximo_por_orden} boletas por orden.`,
          [{ campo: `items[${i}].cantidad`, problema: `Debe ser como máximo ${tipo.maximo_por_orden}.` }]);
      }
    });
    if (evento.edad_minima && !datos.comprador_documento) {
      throw reglaDeNegocio('documento_requerido', `«${evento.nombre}» es para mayores de ${evento.edad_minima} años: escribe la cédula de quien compra.`,
        [{ campo: 'comprador_documento', problema: 'Es obligatorio en eventos con edad mínima.' }]);
    }
    const total = datos.items.reduce((suma, item) => suma + tipoPorId.get(item.tipo_boleta_id).precio_cop * item.cantidad, 0);
    if (total > 0 && !datos.medio_pago) {
      throw reglaDeNegocio('medio_pago_requerido', 'Elige cómo vas a pagar: PSE, Nequi, Daviplata o tarjeta.',
        [{ campo: 'medio_pago', problema: 'Es obligatorio cuando el total es mayor que 0.' }]);
    }

    // Reserva del cupo sin sobreventa: la actualización solo ocurre si alcanza (§8 del modelo).
    // Los tipos se reservan ordenados por id para que dos compras no se bloqueen en orden contrario.
    const porTipo = [...datos.items].sort((a, b) => a.tipo_boleta_id.localeCompare(b.tipo_boleta_id));
    for (const item of porTipo) {
      const reservado = await tx.consultar(
        `UPDATE tipo_boleta SET cantidad_vendida = cantidad_vendida + $2
          WHERE id = $1 AND cantidad_vendida + $2 <= cantidad_total RETURNING id`,
        [item.tipo_boleta_id, item.cantidad],
      );
      if (!reservado.rows.length) {
        const tipo = tipoPorId.get(item.tipo_boleta_id);
        const { rows } = await tx.consultar('SELECT cantidad_total - cantidad_vendida AS quedan FROM tipo_boleta WHERE id = $1', [tipo.id]);
        throw conflicto('cupo_insuficiente', `Quedan ${rows[0].quedan} boletas de «${tipo.nombre}» y pediste ${item.cantidad}.`);
      }
    }

    // Una orden de $0 no tiene nada que pagar: nace pagada y con sus boletas.
    const gratuita = total === 0;
    const { rows } = await tx.consultar(
      `INSERT INTO orden (evento_id, comprador_nombre, comprador_correo, comprador_telefono, comprador_documento,
         medio_pago, autoriza_tratamiento_datos, total_cop, estado, pagada_en)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, ${gratuita ? 'now()' : 'NULL'})
       RETURNING id`,
      [evento.id, datos.comprador_nombre.trim(), datos.comprador_correo.toLowerCase(), datos.comprador_telefono,
        datos.comprador_documento ?? null, gratuita ? null : datos.medio_pago, total, gratuita ? 'pagada' : 'pendiente'],
    );
    const ordenId = rows[0].id;
    for (const [posicion, item] of datos.items.entries()) {
      await tx.consultar(
        `INSERT INTO item_orden (orden_id, tipo_boleta_id, cantidad, precio_unitario_cop, creado_en)
         VALUES ($1, $2, $3, $4, now() + $5::int * interval '1 microsecond')`,
        [ordenId, item.tipo_boleta_id, item.cantidad, tipoPorId.get(item.tipo_boleta_id).precio_cop, posicion],
      );
    }
    if (gratuita) await emitirBoletas(tx, ordenId, datos.comprador_nombre.trim());
    await ajustarAgotado(tx, evento.id); // si era el último cupo, el evento queda agotado
    return obtenerCompleta(tx, ordenId);
  });
}

// ------------------------------------------------------------------ leer
export async function obtener(db, id) {
  await expirarOrdenesVencidas(db);
  return obtenerCompleta(db, id);
}

// Reporte de ventas: solo el dueño del evento (trae datos personales).
export async function listarDelEvento(db, organizador, eventoId, consulta) {
  await exigirEventoPropio(db, organizador, eventoId, 'Solo el dueño del evento puede ver sus ventas.');
  await expirarOrdenesVencidas(db);
  const valores = [eventoId];
  let donde = 'WHERE evento_id = $1';
  if (consulta.estado) {
    valores.push(consulta.estado);
    donde += ' AND estado = $2';
  }
  const { limite, desplazamiento } = leerPaginacion(consulta);
  const total = await db.consultar(`SELECT count(*)::int AS total FROM orden ${donde}`, valores);
  const { rows } = await db.consultar(
    `SELECT ${COLUMNAS_ORDEN} FROM orden ${donde} ORDER BY creado_en DESC, id LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, desplazamiento],
  );
  return { ordenes: await completarOrdenes(db, rows), total: total.rows[0].total };
}

// ------------------------------------------------------------------ actualizar y eliminar
// Solo una orden pendiente se corrige o se anula.
async function cargarPendiente(tx, id) {
  const { rows } = await tx.consultar('SELECT id, evento_id, estado, expira_en FROM orden WHERE id = $1 FOR NO KEY UPDATE', [id]);
  const orden = rows[0];
  if (!orden) throw ordenNoEncontrada();
  if (orden.estado === 'expirada') {
    throw conflicto('orden_expirada', `La orden expiró el ${fechaLegible(orden.expira_en)} y liberó su cupo; hay que comprar de nuevo.`);
  }
  if (orden.estado !== 'pendiente') {
    throw conflicto('orden_no_pendiente', `La orden ya está ${orden.estado}; una orden ${orden.estado} no se modifica.`);
  }
  return orden;
}

const CAMPOS_EDITABLES = ['comprador_nombre', 'comprador_correo', 'comprador_telefono', 'comprador_documento', 'medio_pago'];

export async function actualizar(db, id, cambios) {
  await expirarOrdenesVencidas(db);
  return db.transaccion(async (tx) => {
    await cargarPendiente(tx, id);
    const columnas = [];
    const valores = [];
    for (const campo of CAMPOS_EDITABLES) {
      if (cambios[campo] === undefined) continue;
      let valor = cambios[campo];
      if (campo === 'comprador_nombre') valor = valor.trim();
      if (campo === 'comprador_correo') valor = valor.toLowerCase();
      valores.push(valor);
      columnas.push(`${campo} = $${valores.length}`);
    }
    valores.push(id);
    await tx.consultar(`UPDATE orden SET ${columnas.join(', ')} WHERE id = $${valores.length}`, valores);
    return obtenerCompleta(tx, id);
  });
}

export async function eliminar(db, id) {
  await expirarOrdenesVencidas(db);
  await db.transaccion(async (tx) => {
    // Primero el evento (libera cupo y puede cambiar su estado), después la orden.
    await tx.consultar('SELECT 1 FROM evento WHERE id = (SELECT evento_id FROM orden WHERE id = $1) FOR NO KEY UPDATE', [id]);
    const orden = await cargarPendiente(tx, id);
    await liberarCupo(tx, [id]);
    await tx.consultar('DELETE FROM orden WHERE id = $1', [id]); // sus ítems se borran en cascada
    await ajustarAgotado(tx, orden.evento_id);
  });
}

// ------------------------------------------------------------------ pago
// La clave de la pasarela se compara en tiempo constante (sobre su hash, para
// que las dos cadenas tengan la misma longitud).
export function exigirClavePasarela(req, res, next) {
  const recibida = req.get('x-clave-pasarela');
  const hash = (texto) => crypto.createHash('sha256').update(texto).digest();
  if (!recibida || !crypto.timingSafeEqual(hash(recibida), hash(config.pasarelaClave))) {
    throw noAutenticado('Falta la cabecera X-Clave-Pasarela o la clave no es la de la pasarela.');
  }
  next();
}

export async function confirmarPago(db, id, referencia) {
  await expirarOrdenesVencidas(db);
  return db.transaccion(async (tx) => {
    const orden = await cargarPendiente(tx, id);
    const repetida = await tx.consultar('SELECT 1 FROM orden WHERE referencia_pago = $1', [referencia]);
    if (repetida.rows.length) throw conflicto('referencia_pago_repetida', `La referencia ${referencia} ya confirmó otra orden.`);
    const { rows } = await tx.consultar(
      "UPDATE orden SET estado = 'pagada', pagada_en = now(), referencia_pago = $2 WHERE id = $1 RETURNING comprador_nombre",
      [orden.id, referencia],
    );
    await emitirBoletas(tx, orden.id, rows[0].comprador_nombre);
    return obtenerCompleta(tx, orden.id);
  });
}
