// Reglas de negocio que cruzan el evento con sus tipos de boleta (422, D-07).
// Las usa crearEvento (tipos que vienen con el evento) y el módulo de tipos de
// boleta (crear y editar un tipo suelto).
import { reglaDeNegocio } from '../../comun/errores.js';
import { fechaLegible, pesos } from '../../comun/formato.js';

const instante = (valor) => new Date(valor).getTime();

// fecha_fin posterior a fecha_inicio y, si se pide, fecha_inicio futura.
export function validarFechasDelEvento({ fecha_inicio, fecha_fin }, { exigirFutura = false } = {}) {
  if (instante(fecha_fin) <= instante(fecha_inicio)) {
    throw reglaDeNegocio(
      'fechas_incoherentes',
      `La hora de cierre (${fechaLegible(fecha_fin)}) debe ser posterior a la de inicio (${fechaLegible(fecha_inicio)}).`,
      [{ campo: 'fecha_fin', problema: 'Debe ser posterior a fecha_inicio.' }],
    );
  }
  if (exigirFutura && instante(fecha_inicio) <= Date.now()) {
    throw reglaDeNegocio(
      'fechas_incoherentes',
      `La fecha de inicio (${fechaLegible(fecha_inicio)}) ya pasó: el evento debe empezar en el futuro.`,
      [{ campo: 'fecha_inicio', problema: 'Debe ser una fecha futura.' }],
    );
  }
}

// Completa los valores por defecto de un tipo nuevo (TipoBoletaNuevo):
// la venta empieza ya y termina cuando empieza el evento.
export function completarTipoNuevo(tipo, evento) {
  return {
    ...tipo,
    nombre: tipo.nombre.trim(),
    descripcion: tipo.descripcion ?? null,
    maximo_por_orden: tipo.maximo_por_orden ?? 10,
    venta_inicia_en: tipo.venta_inicia_en ?? new Date().toISOString(),
    venta_termina_en: tipo.venta_termina_en ?? new Date(evento.fecha_inicio).toISOString(),
  };
}

// Revisa una lista de tipos contra su evento:
//  - la suma de cupos no supera el aforo (aforo_excedido);
//  - en un evento gratuito todos valen 0 (precio_en_evento_gratuito);
//  - la venta termina después de empezar y a más tardar al cierre del evento
//    (ventana_de_venta_invalida).
// `cuposDeOtrosTipos` son los cupos de los tipos del evento que no vienen en la
// lista; `campo(i, nombre)` dice cómo se llama el campo en la petición.
export function validarTiposDelEvento(evento, tipos, { cuposDeOtrosTipos = 0, campo = (i, nombre) => nombre } = {}) {
  const suma = cuposDeOtrosTipos + tipos.reduce((total, t) => total + t.cantidad_total, 0);
  if (suma > evento.aforo_total) {
    const disponibles = Math.max(evento.aforo_total - cuposDeOtrosTipos, 0);
    throw reglaDeNegocio(
      'aforo_excedido',
      `Los tipos de boleta sumarían ${suma} cupos y el aforo de ${evento.lugar} es de ${evento.aforo_total}.`,
      tipos.length === 1
        ? [{ campo: campo(0, 'cantidad_total'), problema: `Debe ser como máximo ${disponibles}.` }]
        : [{ campo: campo(null, 'tipos_boleta'), problema: `La suma de cantidad_total (${suma}) supera aforo_total (${evento.aforo_total}).` }],
    );
  }

  tipos.forEach((tipo, i) => {
    if (evento.es_gratuito && tipo.precio_cop > 0) {
      throw reglaDeNegocio(
        'precio_en_evento_gratuito',
        `En un evento gratuito todas las boletas valen $0; «${tipo.nombre}» tiene precio de ${pesos(tipo.precio_cop)}.`,
        [{ campo: campo(i, 'precio_cop'), problema: 'Debe ser 0 porque el evento es gratuito.' }],
      );
    }
    if (instante(tipo.venta_termina_en) <= instante(tipo.venta_inicia_en) || instante(tipo.venta_termina_en) > instante(evento.fecha_fin)) {
      throw reglaDeNegocio(
        'ventana_de_venta_invalida',
        `La venta de «${tipo.nombre}» debe terminar después de empezar y a más tardar al cierre del evento (${fechaLegible(evento.fecha_fin)}).`,
        [{ campo: campo(i, 'venta_termina_en'), problema: 'Debe ser posterior a venta_inicia_en y no posterior a fecha_fin.' }],
      );
    }
  });
}
