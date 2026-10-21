/* Apparchar · prototipo navegable (Tecnologías Web 2026-B, Unitrópico)
 *
 * Un solo archivo, sin frameworks ni dependencias. Cada página declara en
 * <body data-pagina="…"> cuál es, y aquí se enciende solo lo que le toca:
 *   cartelera · detalle · publicar · puerta
 *
 * Reglas que se cumplen en todo el archivo:
 *  - Los datos salen de datos/ejemplo.json (fetch con ruta relativa).
 *  - ?simular=cargando|vacio|error fuerza los estados excepcionales.
 *  - Nada de innerHTML con datos: el DOM se arma con createElement/textContent.
 *    Los únicos fragmentos de marcado son los íconos SVG constantes de ICONOS.
 *  - sessionStorage siempre dentro de try/catch.
 *  - Fechas en hora de Colombia (America/Bogota) y dinero en pesos sin decimales.
 */
'use strict';

(function () {
  // ------------------------------------------------------------------ contexto
  const PAGINA = document.body.dataset.pagina;
  const PARAMS = new URLSearchParams(window.location.search);
  const SIMULAR = ['cargando', 'vacio', 'error'].includes(PARAMS.get('simular')) ? PARAMS.get('simular') : null;
  const ZONA = 'America/Bogota';
  const RUTA_DATOS = 'datos/ejemplo.json';
  const SLUG_TALLER = 'taller-de-fotografia-de-aves-en-los-esteros-2026-59f8';
  const ESTADOS_VISIBLES = ['publicado', 'agotado'];

  // Fecha del prototipo. Los datos de ejemplo son una foto del 30 de septiembre
  // de 2026 y la demostración es el jueves 1 de octubre: el reloj arranca ahí y
  // avanza en tiempo real. Así las ventanas de venta, los «próximos eventos» y
  // las validaciones se ven igual sin importar el día en que se abra.
  const INICIO_REAL = Date.now();
  const INICIO_PROTOTIPO = Date.parse('2026-10-01T08:00:00-05:00');
  const ahoraPrototipo = () => new Date(INICIO_PROTOTIPO + (Date.now() - INICIO_REAL));

  const CLAVES = {
    boletas: 'apparchar.boletas',
    ordenes: 'apparchar.ordenes',
    vendidas: 'apparchar.vendidas',
    validaciones: 'apparchar.validaciones',
    portero: 'apparchar.portero',
    eventos: 'apparchar.eventos',
    organizadores: 'apparchar.organizadores',
  };

  const CATEGORIAS = {
    concierto: 'Concierto',
    fiesta: 'Fiesta',
    conferencia: 'Conferencia',
    deportes: 'Deportes',
    teatro: 'Teatro',
    festival: 'Festival',
    otro: 'Otro',
  };

  const REEMBOLSOS = {
    ninguno: 'Sin reembolso',
    hasta_24h_antes: 'Hasta 24 horas antes del evento',
    hasta_72h_antes: 'Hasta 72 horas antes del evento',
  };

  const MEDIOS_PAGO = {
    pse: 'PSE',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    tarjeta: 'Tarjeta débito o crédito',
  };

  const NOMBRE_SIMULACION = { cargando: 'cargando', vacio: 'vacío', error: 'error' };

  // ------------------------------------------------------------------ íconos (marcado constante, decorativo)
  const trazo = (contenido) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${contenido}</svg>`;

  const ICONOS = {
    concierto: trazo('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    fiesta: trazo('<path d="m12 3 1.9 5.8L20 10l-4.9 3.6L16.8 20 12 16.4 7.2 20l1.7-6.4L4 10l6.1-1.2z"/><path d="M19 3v3M17.5 4.5h3"/>'),
    conferencia: trazo('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>'),
    deportes: trazo('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6M12 2v3"/>'),
    teatro: trazo('<path d="M3 4h11v6a5.5 5.5 0 0 1-11 0z"/><path d="M6 8h.01M10 8h.01M6.5 11.5a2.5 2.5 0 0 0 4 0"/><path d="M14 9h7v6a5.5 5.5 0 0 1-9.6 3.7"/><path d="M16 13h.01M19 13h.01M16 17a2.5 2.5 0 0 1 3.5 0"/>'),
    festival: trazo('<path d="M3 20 12 4l9 16z"/><path d="M12 4v16M9 20l3-6 3 6"/>'),
    otro: trazo('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
    calendario: trazo('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    lugar: trazo('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
    persona: trazo('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    alerta: trazo('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    vacio: trazo('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 15h6"/>'),
    buscar: trazo('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>'),
    ok: trazo('<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>'),
    no: trazo('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'),
    boleta: trazo('<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M15 6v2M15 11v2M15 16v2"/>'),
  };

  function icono(nombre, clase) {
    const plantilla = document.createElement('template');
    plantilla.innerHTML = ICONOS[nombre] || ICONOS.otro; // marcado constante del código, nunca datos
    const svg = plantilla.content.firstElementChild;
    if (clase) svg.setAttribute('class', clase);
    return svg;
  }

  // ------------------------------------------------------------------ DOM seguro
  function el(etiqueta, atributos, ...hijos) {
    const nodo = document.createElement(etiqueta);
    for (const [clave, valor] of Object.entries(atributos || {})) {
      if (valor === null || valor === undefined || valor === false) continue;
      if (clave === 'clase') nodo.className = valor;
      else if (clave === 'texto') nodo.textContent = valor;
      else nodo.setAttribute(clave, valor === true ? '' : String(valor));
    }
    for (const hijo of hijos.flat()) {
      if (hijo === null || hijo === undefined || hijo === false) continue;
      nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
    }
    return nodo;
  }

  const $ = (selector, raiz) => (raiz || document).querySelector(selector);
  const $$ = (selector, raiz) => Array.from((raiz || document).querySelectorAll(selector));
  const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

  function enfocar(nodo) {
    if (!nodo) return;
    if (!nodo.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(nodo.tagName)) {
      nodo.setAttribute('tabindex', '-1');
    }
    nodo.focus({ preventScroll: true });
    nodo.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  // ------------------------------------------------------------------ formatos
  const fmtDiaCorto = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'long' });
  const fmtHora = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' });
  const fmtFechaLarga = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtFechaMedia = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDiaIso = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtPesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const fmtNumero = new Intl.NumberFormat('es-CO');

  const pesos = (valor) => fmtPesos.format(valor).replace(/\s/g, '');
  const numero = (valor) => fmtNumero.format(valor);
  const hora = (fecha) => fmtHora.format(new Date(fecha));
  const diaIso = (fecha) => fmtDiaIso.format(new Date(fecha));

  function diaCorto(fecha) {
    const partes = fmtDiaCorto.formatToParts(new Date(fecha));
    const parte = (tipo) => (partes.find((p) => p.type === tipo) || {}).value || '';
    return `${parte('weekday').replace(/\.$/, '')}., ${parte('day')} de ${parte('month')}`;
  }

  const fechaCorta = (fecha) => `${diaCorto(fecha)} · ${hora(fecha)}`;
  const fechaLarga = (fecha) => fmtFechaLarga.format(new Date(fecha));
  const fechaMedia = (fecha) => fmtFechaMedia.format(new Date(fecha));

  // Colombia no tiene horario de verano: siempre UTC−5.
  function isoBogota(fecha) {
    const d = new Date(new Date(fecha).getTime() - 5 * 3600 * 1000);
    const dos = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}T${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}-05:00`;
  }

  // "2026-10-03T21:00" (datetime-local, hora de Colombia) -> Date
  function desdeLocal(valor) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor || '')) return null;
    const fecha = new Date(`${valor.slice(0, 16)}:00-05:00`);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const sinTildes = (texto) => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // <nombre>-<año>-<4 caracteres>, sin repetir el año si el nombre ya lo trae.
  function slugConAnio(base, anio, sufijo) {
    return new RegExp(`(^|-)${anio}(-|$)`).test(base) ? `${base}-${sufijo}` : `${base}-${anio}-${sufijo}`;
  }

  function slugificar(texto) {
    return sinTildes(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120).replace(/-+$/g, '');
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // Código de boleta: 12 caracteres sin letras ambiguas (sin I, L, O, 0 ni 1).
  const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function generarCodigo(existentes) {
    let codigo;
    do {
      let caracteres = '';
      while (caracteres.length < 12) {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        for (const b of bytes) {
          // Muestreo por rechazo: 248 = 31 × 8, así ningún carácter sale más que otro.
          if (b < 248 && caracteres.length < 12) caracteres += ALFABETO[b % ALFABETO.length];
        }
      }
      codigo = `${caracteres.slice(0, 4)}-${caracteres.slice(4, 8)}-${caracteres.slice(8)}`;
    } while (existentes.has(codigo));
    return codigo;
  }

  function normalizarCodigo(valor) {
    const limpio = String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return limpio.length === 12 ? `${limpio.slice(0, 4)}-${limpio.slice(4, 8)}-${limpio.slice(8)}` : limpio;
  }

  // ------------------------------------------------------------------ sessionStorage (siempre protegido)
  function leerSesion(clave, porDefecto) {
    try {
      const valor = window.sessionStorage.getItem(clave);
      return valor ? JSON.parse(valor) : porDefecto;
    } catch (error) {
      return porDefecto;
    }
  }

  function guardarSesion(clave, valor) {
    try {
      window.sessionStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (error) {
      return false;
    }
  }

  // ------------------------------------------------------------------ carga de datos
  class ErrorCarga extends Error {
    constructor(detalle, real) {
      super(detalle);
      this.detalle = detalle;
      this.real = real;
    }
  }

  async function cargarDatos() {
    if (SIMULAR === 'cargando') return new Promise(() => {}); // se queda cargando a propósito
    if (SIMULAR === 'error') {
      await espera(500);
      throw new ErrorCarga(`Estado simulado: GET ${RUTA_DATOS} respondió 503 Service Unavailable.`, false);
    }
    let respuesta;
    try {
      respuesta = await fetch(RUTA_DATOS, { cache: 'no-store' });
    } catch (error) {
      throw new ErrorCarga(`GET ${RUTA_DATOS} falló: ${error.name}: ${error.message} (protocolo ${window.location.protocol})`, true);
    }
    if (!respuesta.ok) throw new ErrorCarga(`GET ${RUTA_DATOS} respondió ${respuesta.status} ${respuesta.statusText}`.trim(), true);
    let crudos;
    try {
      crudos = await respuesta.json();
    } catch (error) {
      throw new ErrorCarga(`${RUTA_DATOS} no es un JSON válido: ${error.message}`, true);
    }
    return prepararDatos(crudos);
  }

  function prepararDatos(crudos) {
    // Cada evento trae su organizador anidado (OrganizadorPublico), como la respuesta de GET /eventos.
    const organizadores = [
      ...(crudos.eventos || []).map((e) => e.organizador).filter(Boolean),
      ...leerSesion(CLAVES.organizadores, []),
    ];
    const eventosSesion = SIMULAR === 'vacio' ? [] : leerSesion(CLAVES.eventos, []);
    const eventos = SIMULAR === 'vacio' ? [] : [...(crudos.eventos || []), ...eventosSesion];
    const idsSesion = new Set(eventosSesion.map((e) => e.id));
    const vendidas = leerSesion(CLAVES.vendidas, {});

    const datos = {
      organizadores,
      eventos,
      boletas: [...(crudos.boletas || []), ...leerSesion(CLAVES.boletas, [])],
      organizadorPorId: new Map(organizadores.map((o) => [o.id, o])),
      eventoPorId: new Map(),
      eventoPorSlug: new Map(),
      tipoPorId: new Map(),
      esDeSesion: (evento) => idsSesion.has(evento.id),
    };
    for (const evento of eventos) {
      for (const tipo of evento.tipos_boleta || []) {
        // Las compras hechas en esta sesión descuentan cupo.
        const extra = Number(vendidas[tipo.id] || 0);
        if (extra) tipo.cantidad_vendida = Math.min(tipo.cantidad_total, tipo.cantidad_vendida + extra);
        datos.tipoPorId.set(tipo.id, { tipo, evento });
      }
      datos.eventoPorId.set(evento.id, evento);
      datos.eventoPorSlug.set(evento.slug, evento);
    }
    datos.boletaPorCodigo = new Map(datos.boletas.map((b) => [b.codigo, b]));
    return datos;
  }

  // ------------------------------------------------------------------ reglas del dominio
  function estadoTipo(tipo, ahora) {
    const momento = ahora || ahoraPrototipo();
    const restantes = Math.max(0, tipo.cantidad_total - tipo.cantidad_vendida);
    if (restantes <= 0) return { disponible: false, restantes: 0, texto: 'Agotado' };
    if (momento < new Date(tipo.venta_inicia_en)) {
      return { disponible: false, restantes, texto: `La venta abre el ${fechaMedia(tipo.venta_inicia_en)} a las ${hora(tipo.venta_inicia_en)}` };
    }
    if (momento > new Date(tipo.venta_termina_en)) return { disponible: false, restantes, texto: 'Venta cerrada' };
    return { disponible: true, restantes, texto: '' };
  }

  function cuposEvento(evento) {
    const total = evento.tipos_boleta.reduce((s, t) => s + t.cantidad_total, 0);
    const vendidos = evento.tipos_boleta.reduce((s, t) => s + t.cantidad_vendida, 0);
    return { total, vendidos, restantes: Math.max(0, total - vendidos) };
  }

  const eventoAgotado = (evento) => evento.estado === 'agotado' || cuposEvento(evento).restantes === 0;

  function resumenPrecio(evento) {
    const tipos = evento.tipos_boleta;
    if (evento.es_gratuito || tipos.every((t) => t.precio_cop === 0)) return { texto: 'Entrada libre', hayGratis: false };
    const enVenta = tipos.filter((t) => estadoTipo(t).disponible);
    const base = (enVenta.length ? enVenta : tipos).filter((t) => t.precio_cop > 0);
    const minimo = Math.min(...base.map((t) => t.precio_cop));
    return { texto: `Desde ${pesos(minimo)}`, hayGratis: tipos.some((t) => t.precio_cop === 0) };
  }

  function textoEdad(edad) {
    return edad ? `Mayores de ${edad}` : 'Todo público';
  }

  function ordenarPorFecha(eventos) {
    return [...eventos].sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));
  }

  // Próximos eventos: publicados o agotados que todavía no han terminado.
  const visiblesEnCartelera = (datos) => ordenarPorFecha(datos.eventos.filter((e) =>
    ESTADOS_VISIBLES.includes(e.estado) && new Date(e.fecha_fin) >= ahoraPrototipo()));

  // ------------------------------------------------------------------ piezas de interfaz compartidas
  function tarjetaEvento(evento, opciones) {
    const op = Object.assign({ nivel: 3, enlace: true, organizador: null, deSesion: false }, opciones);
    const precio = resumenPrecio(evento);
    const agotado = eventoAgotado(evento);
    const cupos = cuposEvento(evento);

    const titulo = el(`h${op.nivel}`, { clase: 'tarjeta__titulo' },
      op.enlace
        ? el('a', { clase: 'tarjeta__enlace', href: `detalle.html?evento=${encodeURIComponent(evento.slug)}` }, evento.nombre)
        : evento.nombre);

    const distintivos = [];
    if (op.deSesion) distintivos.push(['nuevo', 'Creado en esta sesión']);
    if (agotado) distintivos.push(['agotado', 'Agotado']);
    else if (cupos.total && cupos.restantes / cupos.total < 0.1) distintivos.push(['quedan', `Quedan ${numero(cupos.restantes)}`]);
    if (evento.edad_minima) distintivos.push(['edad', `+${evento.edad_minima}`]);
    if (precio.hayGratis) distintivos.push(['gratis', 'Hay boletas sin costo']);

    const dato = (nombreIcono, ...contenido) =>
      el('p', { clase: 'tarjeta__dato' }, icono(nombreIcono), el('span', {}, ...contenido));

    return el('article', { clase: `tarjeta tarjeta--${evento.categoria}` },
      el('div', { clase: 'tarjeta__franja', 'aria-hidden': 'true' }, icono(evento.categoria)),
      el('div', { clase: 'tarjeta__cuerpo' },
        titulo,
        el('p', { clase: 'tarjeta__categoria' }, CATEGORIAS[evento.categoria] || 'Otro'),
        dato('calendario', el('time', { datetime: evento.fecha_inicio }, fechaCorta(evento.fecha_inicio))),
        dato('lugar', `${evento.lugar} · ${evento.municipio}`),
        dato('persona', `Organiza: ${op.organizador ? op.organizador.nombre : 'Organizador de Casanare'}`),
        el('div', { clase: 'tarjeta__pie' },
          el('p', { clase: 'tarjeta__precio' }, precio.texto),
          distintivos.length
            ? el('ul', { clase: 'distintivos', 'aria-label': 'Distintivos' },
              distintivos.map(([tipo, texto]) => el('li', { clase: `distintivo distintivo--${tipo}` }, texto)))
            : null)));
  }

  function estadoCargando() {
    return el('div', { clase: 'estado estado--cargando', role: 'status' },
      el('span', { clase: 'girador', 'aria-hidden': 'true' }),
      el('p', {}, 'Cargando…'));
  }

  function esqueletosTarjeta(cantidad) {
    const piezas = [];
    for (let i = 0; i < cantidad; i++) {
      piezas.push(el('li', { 'aria-hidden': 'true' },
        el('div', { clase: 'esqueleto' },
          el('div', { clase: 'esqueleto__franja' }),
          el('div', { clase: 'esqueleto__cuerpo' },
            el('div', { clase: 'esqueleto__linea esqueleto__linea--corta' }),
            el('div', { clase: 'esqueleto__linea esqueleto__linea--titulo' }),
            el('div', { clase: 'esqueleto__linea' }),
            el('div', { clase: 'esqueleto__linea esqueleto__linea--corta' })))));
    }
    return piezas;
  }

  // Estado de error: role="alert", título, explicación llana, Reintentar y detalle técnico.
  // URL de la página actual sin ?simular (para salir de un estado simulado).
  function urlSinSimular() {
    const sinSimular = new URLSearchParams(PARAMS);
    sinSimular.delete('simular');
    const archivo = window.location.pathname.split('/').pop() || 'index.html';
    const consulta = sinSimular.toString();
    return consulta ? `${archivo}?${consulta}` : archivo;
  }

  function estadoError(error, { nivel, titulo, explicacion, alReintentar }) {
    const boton = el('button', { type: 'button', clase: 'boton boton--primario' }, 'Reintentar');
    // En un error simulado, reintentar muestra cómo se recupera la página: carga
    // la versión normal (sin ?simular).
    boton.addEventListener('click', SIMULAR ? () => { window.location.href = urlSinSimular(); } : alReintentar);
    return el('div', { clase: 'estado estado--error', role: 'alert' },
      icono('alerta', 'estado__icono'),
      nivel ? el(`h${nivel}`, {}, titulo) : null,
      el('p', {}, explicacion),
      error.real ? el('p', {}, 'Abre el prototipo con un servidor local o en la URL publicada (mira el README).') : null,
      el('div', { clase: 'acciones' }, boton),
      el('p', { clase: 'estado__detalle' }, 'Detalle técnico: ', el('code', {}, error.detalle || String(error))));
  }

  function avisoSimulacion() {
    if (!SIMULAR) return;
    if (PAGINA === 'publicar' && SIMULAR !== 'error') return;
    const main = $('main');
    if (!main) return;
    main.prepend(el('div', { clase: 'contenedor' },
      el('div', { clase: 'aviso-simulado' },
        el('p', {},
          `Estás viendo un estado simulado: ${NOMBRE_SIMULACION[SIMULAR]}. `,
          el('a', { href: urlSinSimular() }, 'Volver a la versión normal')))));
  }

  // ------------------------------------------------------------------ validación accesible de formularios
  /*
   * Cada regla: { clave, controles(): Element[], relacionados?(): Element[],
   *               validar(): string|null, ubicar?(p) }
   * - Los mensajes van debajo del campo, con ícono y texto, enlazados con
   *   aria-describedby; el campo recibe aria-invalid="true".
   * - Arriba, un resumen «Revisa N campos antes de …» con enlaces a cada campo;
   *   el foco se mueve a ese resumen.
   * - Al corregir, el error del campo se limpia y el resumen se actualiza.
   */
  function crearValidador(form, { resumen, verbo, reglas }) {
    const activos = new Map(); // clave -> { regla, mensaje }
    const tocados = new Set();
    let ultimas = [];

    const idError = (clave) => `error-${clave}`;

    function sincronizarControles() {
      const describe = new Map();
      for (const [clave, { regla }] of activos) {
        for (const control of regla.controles()) {
          if (!describe.has(control)) describe.set(control, []);
          describe.get(control).push(idError(clave));
        }
      }
      for (const control of tocados) {
        const base = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && !t.startsWith('error-'));
        const errores = describe.get(control) || [];
        const tokens = [...base, ...errores];
        if (tokens.length) control.setAttribute('aria-describedby', tokens.join(' '));
        else control.removeAttribute('aria-describedby');
        if (errores.length) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
      }
    }

    function pintarMensaje(clave, regla, mensaje) {
      let p = document.getElementById(idError(clave));
      if (!p) {
        p = el('p', { clase: 'error', id: idError(clave) });
        if (regla.ubicar) regla.ubicar(p);
        else {
          const control = regla.controles()[0];
          const contenedor = control.closest('.campo') || control.parentElement;
          contenedor.append(p);
        }
      }
      p.textContent = mensaje;
      for (const control of regla.controles()) tocados.add(control);
    }

    function quitarMensaje(clave) {
      const p = document.getElementById(idError(clave));
      if (p) p.remove();
    }

    function ordenarPorDocumento(entradas) {
      return entradas.sort((a, b) => {
        const ca = a.regla.controles()[0];
        const cb = b.regla.controles()[0];
        if (!ca || !cb || ca === cb) return 0;
        return ca.compareDocumentPosition(cb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
    }

    function pintarResumen() {
      const lista = $('ul', resumen);
      const titulo = $('h2, h3', resumen);
      const entradas = ordenarPorDocumento([...activos.values()]);
      if (!entradas.length) {
        resumen.hidden = true;
        lista.replaceChildren();
        return;
      }
      const n = entradas.length;
      const accion = typeof verbo === 'function' ? verbo() : verbo;
      titulo.textContent = `Revisa ${n} ${n === 1 ? 'campo' : 'campos'} antes de ${accion}`;
      lista.replaceChildren(...entradas.map(({ regla, mensaje }) => {
        const destino = regla.controles()[0];
        const enlace = el('a', { href: `#${destino.id}` }, mensaje);
        enlace.addEventListener('click', (evento) => {
          evento.preventDefault();
          const actual = regla.controles()[0];
          const caja = actual.closest('.campo, fieldset') || actual;
          caja.scrollIntoView({ block: 'center' });
          actual.focus({ preventScroll: true });
        });
        return el('li', {}, enlace);
      }));
      resumen.hidden = false;
    }

    function validarTodo() {
      ultimas = reglas();
      for (const clave of activos.keys()) quitarMensaje(clave);
      activos.clear();
      for (const regla of ultimas) {
        const mensaje = regla.validar();
        if (mensaje) {
          activos.set(regla.clave, { regla, mensaje });
          pintarMensaje(regla.clave, regla, mensaje);
        }
      }
      sincronizarControles();
      pintarResumen();
      if (activos.size) {
        resumen.hidden = false;
        resumen.scrollIntoView({ block: 'start' });
        resumen.focus({ preventScroll: true });
        return false;
      }
      return true;
    }

    function revalidar(control) {
      if (!activos.size) return;
      ultimas = reglas();
      const vigentes = new Set(ultimas.map((r) => r.clave));
      let cambio = false;
      for (const clave of [...activos.keys()]) {
        if (!vigentes.has(clave)) {
          activos.delete(clave);
          quitarMensaje(clave);
          cambio = true;
        }
      }
      for (const regla of ultimas) {
        if (!activos.has(regla.clave)) continue;
        const implicados = [...regla.controles(), ...(regla.relacionados ? regla.relacionados() : [])];
        if (!implicados.includes(control)) continue;
        const mensaje = regla.validar();
        if (!mensaje) {
          activos.delete(regla.clave);
          quitarMensaje(regla.clave);
        } else {
          activos.set(regla.clave, { regla, mensaje });
          pintarMensaje(regla.clave, regla, mensaje);
        }
        cambio = true;
      }
      if (cambio) {
        sincronizarControles();
        pintarResumen();
      }
    }

    form.addEventListener('input', (e) => revalidar(e.target));
    form.addEventListener('change', (e) => revalidar(e.target));

    return {
      validarTodo,
      revalidar,
      limpiar() {
        for (const clave of activos.keys()) quitarMensaje(clave);
        activos.clear();
        sincronizarControles();
        pintarResumen();
      },
    };
  }

  // Validadores de valores (devuelven el mensaje o null)
  const REGEX_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function textoEntre(valor, min, max, vacio, corto, largo) {
    const v = String(valor || '').trim();
    if (!v) return vacio;
    if (v.length < min) return corto;
    if (v.length > max) return largo;
    return null;
  }

  function validarCorreo(valor, vacio) {
    const v = String(valor || '').trim();
    if (!v) return vacio;
    if (v.length > 254 || !REGEX_CORREO.test(v)) return 'Revisa el correo: debe tener la forma nombre@dominio.com.';
    return null;
  }

  // Celular: acepta espacios, guiones y el prefijo +57; devuelve +573XXXXXXXXX o null.
  function normalizarCelular(valor) {
    let d = String(valor || '').replace(/[\s\-().]/g, '');
    if (d.startsWith('+57')) d = d.slice(3);
    else if (/^57\d{10}$/.test(d)) d = d.slice(2);
    return /^3\d{9}$/.test(d) ? `+57${d}` : null;
  }

  // Teléfono del organizador: celular o fijo (60X + 7 dígitos, en Casanare 608).
  function normalizarTelefono(valor) {
    const celular = normalizarCelular(valor);
    if (celular) return celular;
    let d = String(valor || '').replace(/[\s\-().]/g, '');
    if (d.startsWith('+57')) d = d.slice(3);
    else if (/^57\d{10}$/.test(d)) d = d.slice(2);
    return /^60[1-8]\d{7}$/.test(d) ? `+57${d}` : null;
  }

  function enteroEntre(valor, min, max) {
    const v = String(valor ?? '').trim();
    if (!/^\d+$/.test(v)) return null;
    const n = Number(v);
    return n >= min && n <= max ? n : null;
  }

  // ------------------------------------------------------------------ PANTALLA 1 · cartelera
  function iniciarCartelera() {
    const form = $('#form-filtros');
    const campoQ = $('#filtro-q');
    const campoMunicipio = $('#filtro-municipio');
    const campoCategoria = $('#filtro-categoria');
    const campoDesde = $('#filtro-desde');
    const lista = $('#lista-eventos');
    const estado = $('#estado-cartelera');
    const conteo = $('#conteo');
    const tituloLista = $('#titulo-lista');
    let datos = null;
    let temporizador = null;

    form.addEventListener('submit', (e) => e.preventDefault());

    function limpiarFiltros(enfocarBusqueda) {
      form.reset();
      pintar();
      if (enfocarBusqueda) campoQ.focus();
    }

    $('#limpiar-filtros').addEventListener('click', () => limpiarFiltros(false));

    for (const campo of [campoMunicipio, campoCategoria, campoDesde]) campo.addEventListener('change', () => pintar());
    campoQ.addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => pintar(), 250);
    });

    function mostrarCargando() {
      estado.replaceChildren(estadoCargando());
      lista.setAttribute('aria-busy', 'true');
      lista.replaceChildren(...esqueletosTarjeta(6));
      lista.hidden = false;
      conteo.textContent = '';
    }

    function poblarMunicipios() {
      const actual = campoMunicipio.value;
      const municipios = [...new Set(visiblesEnCartelera(datos).map((e) => e.municipio))].sort((a, b) => a.localeCompare(b, 'es'));
      campoMunicipio.replaceChildren(
        el('option', { value: '' }, 'Todos los municipios'),
        ...municipios.map((m) => el('option', { value: m }, m)));
      if (municipios.includes(actual)) campoMunicipio.value = actual;
    }

    function filtrar(eventos) {
      const q = sinTildes(campoQ.value.trim());
      const municipio = campoMunicipio.value;
      const categoria = campoCategoria.value;
      const desde = campoDesde.value;
      return eventos.filter((e) => {
        if (q && !sinTildes(`${e.nombre} ${e.lugar} ${e.municipio}`).includes(q)) return false;
        if (municipio && e.municipio !== municipio) return false;
        if (categoria && e.categoria !== categoria) return false;
        if (desde && diaIso(e.fecha_inicio) < desde) return false;
        return true;
      });
    }

    function pintar() {
      if (!datos) return;
      const todos = visiblesEnCartelera(datos);
      lista.setAttribute('aria-busy', 'false');

      if (!todos.length) {
        lista.replaceChildren();
        lista.hidden = true;
        conteo.textContent = '';
        estado.replaceChildren(el('div', { clase: 'estado', role: 'status' },
          icono('vacio', 'estado__icono'),
          el('h3', {}, 'Todavía no hay eventos publicados en Casanare'),
          el('p', {}, '¿Organizas un concierto, una feria o una fiesta? Publícalo en Apparchar y vende tus boletas con QR desde el primer día.'),
          el('div', { clase: 'acciones' }, el('a', { clase: 'boton boton--primario', href: 'publicar.html' }, 'Publica el primero'))));
        return;
      }

      const filtrados = filtrar(todos);
      lista.replaceChildren(...filtrados.map((evento) => el('li', {}, tarjetaEvento(evento, {
        nivel: 3,
        organizador: evento.organizador || datos.organizadorPorId.get(evento.organizador_id),
        deSesion: datos.esDeSesion(evento),
      }))));
      lista.hidden = !filtrados.length;
      conteo.textContent = filtrados.length === 1 ? 'Encontramos 1 evento' : filtrados.length ? `Encontramos ${filtrados.length} eventos` : 'No encontramos eventos';

      if (!filtrados.length) {
        const boton = el('button', { type: 'button', clase: 'boton boton--primario' }, 'Limpiar filtros');
        boton.addEventListener('click', () => limpiarFiltros(true));
        estado.replaceChildren(el('div', { clase: 'estado', role: 'status' },
          icono('buscar', 'estado__icono'),
          el('h3', {}, 'No hay eventos con esos filtros'),
          el('p', {}, 'Prueba con otro municipio, otra categoría o una fecha más temprana. También puedes quitar todos los filtros y ver la cartelera completa.'),
          el('div', { clase: 'acciones' }, boton)));
      } else {
        estado.replaceChildren();
      }
    }

    async function cargar(reintento) {
      mostrarCargando();
      try {
        datos = await cargarDatos();
      } catch (error) {
        lista.replaceChildren();
        lista.hidden = true;
        lista.setAttribute('aria-busy', 'false');
        estado.replaceChildren(estadoError(error, {
          nivel: 3,
          titulo: 'No pudimos cargar la cartelera',
          explicacion: 'Algo falló al traer los eventos. Revisa tu conexión a internet y vuelve a intentarlo en un momento.',
          alReintentar: () => cargar(true),
        }));
        if (reintento) $('.estado--error button', estado).focus();
        return;
      }
      poblarMunicipios();
      pintar();
      if (reintento) enfocar(tituloLista);
    }

    cargar(false);
  }

  // ------------------------------------------------------------------ PANTALLA 2 · detalle y compra
  function iniciarDetalle() {
    const slug = PARAMS.get('evento');
    const h1 = $('#titulo-evento');
    const miga = $('#miga-actual');
    const meta = $('#meta-evento');
    const estado = $('#estado-detalle');
    const contenido = $('#detalle-contenido');

    function mostrarCargando() {
      h1.textContent = 'Cargando evento…';
      contenido.hidden = true;
      meta.hidden = true;
      estado.hidden = false;
      estado.replaceChildren(estadoCargando(),
        el('div', { clase: 'esqueleto', 'aria-hidden': 'true' },
          el('div', { clase: 'esqueleto__cuerpo' },
            el('div', { clase: 'esqueleto__linea esqueleto__linea--titulo' }),
            el('div', { clase: 'esqueleto__linea' }),
            el('div', { clase: 'esqueleto__linea' }),
            el('div', { clase: 'esqueleto__linea esqueleto__linea--corta' }))));
    }

    function noEncontrado() {
      document.title = 'Evento no encontrado · Apparchar';
      h1.textContent = 'No encontramos este evento';
      miga.textContent = 'Evento no encontrado';
      estado.replaceChildren(el('div', { clase: 'estado' },
        icono('buscar', 'estado__icono'),
        el('p', {}, slug
          ? 'Puede que el enlace esté incompleto o que el organizador haya retirado el evento.'
          : 'El enlace no dice qué evento quieres ver.'),
        el('p', {}, 'En la cartelera están todos los eventos vigentes de Casanare.'),
        el('div', { clase: 'acciones' }, el('a', { clase: 'boton boton--primario', href: 'index.html' }, 'Ver la cartelera'))));
    }

    async function cargar(reintento) {
      mostrarCargando();
      let datos;
      try {
        datos = await cargarDatos();
      } catch (error) {
        document.title = 'Error al cargar el evento · Apparchar';
        h1.textContent = 'No pudimos cargar el evento';
        estado.replaceChildren(estadoError(error, {
          explicacion: 'Algo falló al traer la información del evento. Revisa tu conexión a internet y vuelve a intentarlo.',
          alReintentar: () => cargar(true),
        }));
        if (reintento) $('.estado--error button', estado).focus();
        return;
      }
      const evento = slug ? datos.eventoPorSlug.get(slug) : null;
      if (!evento || !ESTADOS_VISIBLES.includes(evento.estado)) {
        noEncontrado();
        if (reintento) enfocar(h1);
        return;
      }
      pintarDetalle(datos, evento);
      if (reintento) enfocar(h1);
    }

    function filaFicha(termino, ...definicion) {
      return el('div', {}, el('dt', {}, termino), el('dd', {}, ...definicion));
    }

    function pintarDetalle(datos, evento) {
      const organizador = evento.organizador || datos.organizadorPorId.get(evento.organizador_id);
      document.title = `${evento.nombre} · Apparchar`;
      h1.textContent = evento.nombre;
      miga.textContent = evento.nombre;

      meta.replaceChildren(
        el('span', { clase: 'etiqueta-categoria' }, icono(evento.categoria), CATEGORIAS[evento.categoria] || 'Otro'),
        el('span', {}, `Organiza: ${organizador ? organizador.nombre : 'Organizador de Casanare'}`));
      meta.hidden = false;

      const mismoDia = diaIso(evento.fecha_inicio) === diaIso(evento.fecha_fin);
      $('#ficha-evento').replaceChildren(
        filaFicha('Fecha', el('time', { datetime: evento.fecha_inicio }, fechaLarga(evento.fecha_inicio))),
        filaFicha('Hora',
          el('time', { datetime: evento.fecha_inicio }, hora(evento.fecha_inicio)),
          ' a ',
          el('time', { datetime: evento.fecha_fin }, hora(evento.fecha_fin)),
          mismoDia ? '' : ` del ${fechaMedia(evento.fecha_fin).replace(/ de \d{4}$/, '')}`),
        filaFicha('Lugar', evento.lugar),
        filaFicha('Dirección', evento.direccion),
        filaFicha('Municipio', `${evento.municipio}, Casanare`),
        filaFicha('Aforo', `${numero(evento.aforo_total)} personas`),
        filaFicha('Edad mínima', textoEdad(evento.edad_minima)),
        filaFicha('Reembolsos', REEMBOLSOS[evento.politica_reembolso] || 'Sin reembolso'));
      $('#descripcion-evento').textContent = evento.descripcion;

      estado.replaceChildren();
      estado.hidden = true;
      contenido.hidden = false;
      prepararCompra(datos, evento);
    }

    // ---------------------------------------------------------------- compra
    function prepararCompra(datos, evento) {
      const form = $('#form-compra');
      const listaTipos = $('#lista-tipos');
      const plantilla = $('#plantilla-tipo');
      const noDisponible = $('#compra-no-disponible');
      const confirmacion = $('#confirmacion-compra');
      const grupoPago = $('#grupo-pago');
      const notaGratis = $('#nota-gratis');
      const botonPagar = $('#boton-pagar');
      const lineas = $('#lineas-resumen');
      const resumenVacio = $('#resumen-vacio');
      const total = $('#total-compra');
      const ahora = ahoraPrototipo();

      const filas = evento.tipos_boleta.map((tipo, i) => ({ tipo, estado: estadoTipo(tipo, ahora), indice: i + 1 }));
      const comprables = filas.filter((f) => f.estado.disponible);

      if (!comprables.length) {
        form.hidden = true;
        const agotado = eventoAgotado(evento);
        noDisponible.replaceChildren(el('div', { clase: 'estado' },
          icono(agotado ? 'boleta' : 'calendario', 'estado__icono'),
          el('h3', {}, agotado ? 'Las boletas se agotaron' : 'La venta de boletas no está abierta'),
          el('p', {}, agotado
            ? 'Ya no quedan cupos para este evento. Mira otros planes en la cartelera.'
            : 'Por ahora no hay tipos de boleta a la venta para este evento. Vuelve más tarde o mira otros planes.'),
          el('div', { clase: 'acciones' }, el('a', { clase: 'boton boton--primario', href: 'index.html' }, 'Ver la cartelera'))));
        noDisponible.hidden = false;
        return;
      }

      // Una fila por tipo de boleta, desde el <template> del HTML
      const gratisTodo = evento.es_gratuito || evento.tipos_boleta.every((t) => t.precio_cop === 0);
      listaTipos.replaceChildren(...filas.map(({ tipo, estado: e, indice }) => {
        const fragmento = plantilla.content.cloneNode(true);
        const fila = $('.tipo', fragmento);
        const id = `cantidad-${indice}`;
        const maximo = Math.min(tipo.maximo_por_orden, e.restantes);
        $('input[name="tipo_boleta_id"]', fila).value = tipo.id;
        $('.tipo__nombre', fila).textContent = tipo.nombre;
        const descripcion = $('.tipo__descripcion', fila);
        if (tipo.descripcion) descripcion.textContent = tipo.descripcion;
        else descripcion.remove();
        $('.tipo__precio', fila).textContent = tipo.precio_cop ? pesos(tipo.precio_cop) : 'Sin costo';
        const disponibles = $('.tipo__disponibles', fila);
        const aviso = $('.tipo__estado', fila);
        const etiqueta = $('.tipo__etiqueta', fila);
        const entrada = $('input[name="cantidad"]', fila);
        const ayuda = $('.ayuda', fila);
        etiqueta.htmlFor = id;
        $('.tipo__etiqueta-nombre', fila).textContent = ` de ${tipo.nombre}`;
        $('.tipo__menos', fila).textContent = ` Quitar una boleta ${tipo.nombre}`;
        $('.tipo__mas', fila).textContent = ` Agregar una boleta ${tipo.nombre}`;
        entrada.id = id;
        entrada.max = String(Math.max(0, maximo));
        entrada.dataset.maximo = String(maximo);
        entrada.dataset.precio = String(tipo.precio_cop);
        entrada.dataset.nombre = tipo.nombre;
        ayuda.id = `${id}-ayuda`;
        entrada.setAttribute('aria-describedby', ayuda.id);

        if (e.disponible) {
          disponibles.textContent = `Quedan ${numero(e.restantes)}`;
          ayuda.textContent = maximo < tipo.maximo_por_orden
            ? `Máximo ${maximo} por compra (son las que quedan).`
            : `Máximo ${maximo} por compra.`;
        } else {
          fila.classList.add('tipo--no-disponible');
          disponibles.remove();
          aviso.textContent = e.texto;
          aviso.hidden = false;
          ayuda.textContent = e.texto === 'Agotado' ? 'Este tipo ya no tiene cupos.' : 'Este tipo no se puede comprar ahora.';
          entrada.disabled = true;
          for (const b of $$('button', fila)) b.disabled = true;
        }
        return fragmento;
      }));

      const entradas = () => $$('input[name="cantidad"]:not(:disabled)', listaTipos);

      // Botones − y + de cada fila
      listaTipos.addEventListener('click', (e) => {
        const boton = e.target.closest('button[data-paso]');
        if (!boton) return;
        const entrada = $('input[name="cantidad"]', boton.closest('.tipo'));
        const actual = enteroEntre(entrada.value, 0, 1000) ?? 0;
        const maximo = Number(entrada.dataset.maximo);
        entrada.value = String(Math.min(maximo, Math.max(0, actual + Number(boton.dataset.paso))));
        entrada.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Cédula obligatoria si el evento tiene edad mínima
      const documento = $('#compra-documento');
      const exigeDocumento = Boolean(evento.edad_minima);
      $('#compra-documento-opcional').hidden = exigeDocumento;
      documento.required = exigeDocumento;
      $('#compra-documento-ayuda').textContent = exigeDocumento
        ? `Evento para mayores de ${evento.edad_minima}: el portero la verifica.`
        : 'Solo números, sin puntos.';

      function seleccion() {
        return entradas()
          .map((entrada) => ({ entrada, cantidad: enteroEntre(entrada.value, 0, Number(entrada.dataset.maximo)) }))
          .filter((x) => x.cantidad);
      }

      function calcularTotal() {
        return seleccion().reduce((s, x) => s + x.cantidad * Number(x.entrada.dataset.precio), 0);
      }

      function actualizarResumen() {
        const elegidas = seleccion();
        const valor = calcularTotal();
        lineas.replaceChildren(...elegidas.map(({ entrada, cantidad }) => el('li', {},
          el('span', {}, `${cantidad} × ${entrada.dataset.nombre}`),
          el('span', {}, Number(entrada.dataset.precio) ? pesos(cantidad * Number(entrada.dataset.precio)) : 'Sin costo'))));
        resumenVacio.hidden = elegidas.length > 0;
        total.textContent = `Total: ${pesos(valor)}`;
        const gratis = gratisTodo || (elegidas.length > 0 && valor === 0);
        grupoPago.hidden = gratis;
        notaGratis.hidden = !gratis;
        if (gratis) for (const r of $$('input[name="medio_pago"]', grupoPago)) r.checked = false;
        botonPagar.textContent = gratis ? 'Confirmar boletas gratis' : valor > 0 ? `Pagar ${pesos(valor)}` : 'Pagar';
      }

      form.addEventListener('input', (e) => {
        if (e.target.name === 'cantidad') actualizarResumen();
      });
      actualizarResumen();

      const $c = (nombre) => form.elements.namedItem(nombre);

      const validador = crearValidador(form, {
        resumen: $('#errores-compra'),
        verbo: 'pagar',
        reglas: () => {
          const reglas = [];
          reglas.push({
            clave: 'compra-boletas',
            controles: () => entradas().slice(0, 1),
            relacionados: () => entradas(),
            ubicar: (p) => $('legend', $('#grupo-boletas')).after(p),
            validar: () => {
              const algunaInvalida = entradas().some((x) => x.value.trim() !== '' && enteroEntre(x.value, 0, Number(x.dataset.maximo)) === null);
              if (algunaInvalida) return null; // de eso se encarga la regla de cada fila
              return seleccion().length ? null : 'Elige al menos una boleta.';
            },
          });
          for (const entrada of entradas()) {
            reglas.push({
              clave: entrada.id,
              controles: () => [entrada],
              validar: () => {
                const v = entrada.value.trim();
                const maximo = Number(entrada.dataset.maximo);
                if (v === '') return null;
                if (!/^\d+$/.test(v)) return `La cantidad de ${entrada.dataset.nombre} debe ser un número entero.`;
                if (Number(v) > maximo) return `Puedes llevar máximo ${maximo} boletas ${entrada.dataset.nombre} por compra.`;
                return null;
              },
            });
          }
          reglas.push({
            clave: 'compra-nombre',
            controles: () => [$('#compra-nombre')],
            validar: () => textoEntre($c('comprador_nombre').value, 3, 120,
              'Escribe tu nombre y apellido.',
              'El nombre debe tener al menos 3 letras.',
              'El nombre no puede pasar de 120 caracteres.'),
          });
          reglas.push({
            clave: 'compra-correo',
            controles: () => [$('#compra-correo')],
            validar: () => validarCorreo($c('comprador_correo').value, 'Escribe tu correo electrónico: ahí te llegan las boletas.'),
          });
          reglas.push({
            clave: 'compra-telefono',
            controles: () => [$('#compra-telefono')],
            validar: () => {
              const v = $c('comprador_telefono').value.trim();
              if (!v) return 'Escribe tu celular.';
              return normalizarCelular(v) ? null : 'El celular debe tener 10 dígitos y empezar por 3, por ejemplo 310 555 0148.';
            },
          });
          reglas.push({
            clave: 'compra-documento',
            controles: () => [documento],
            validar: () => {
              const v = documento.value.replace(/[\s.]/g, '');
              if (!v) return exigeDocumento ? `Escribe tu cédula: el evento es para mayores de ${evento.edad_minima}.` : null;
              return /^\d{6,10}$/.test(v) ? null : 'La cédula debe tener entre 6 y 10 dígitos, sin puntos ni letras.';
            },
          });
          if (!grupoPago.hidden) {
            reglas.push({
              clave: 'compra-medio-pago',
              controles: () => $$('input[name="medio_pago"]', grupoPago),
              ubicar: (p) => grupoPago.append(p),
              validar: () => (calcularTotal() > 0 && !$('input[name="medio_pago"]:checked', grupoPago) ? 'Elige un medio de pago.' : null),
            });
          }
          reglas.push({
            clave: 'compra-autoriza',
            controles: () => [$('#compra-autoriza')],
            validar: () => ($('#compra-autoriza').checked ? null : 'Para comprar necesitas autorizar el tratamiento de tus datos personales.'),
          });
          return reglas;
        },
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!validador.validarTodo()) return;
        confirmarCompra();
      });

      function confirmarCompra() {
        const elegidas = seleccion();
        const valor = calcularTotal();
        const creadoEn = isoBogota(ahoraPrototipo());
        const nombre = $c('comprador_nombre').value.trim().replace(/\s+/g, ' ');
        const medio = valor > 0 ? ($('input[name="medio_pago"]:checked', grupoPago) || {}).value || null : null;
        const orden = {
          id: uuid(),
          evento_id: evento.id,
          comprador_nombre: nombre,
          comprador_correo: $c('comprador_correo').value.trim().toLowerCase(),
          comprador_telefono: normalizarCelular($c('comprador_telefono').value),
          comprador_documento: documento.value.replace(/[\s.]/g, '') || null,
          medio_pago: medio,
          autoriza_tratamiento_datos: true,
          total_cop: valor,
          estado: 'pagada',
          expira_en: isoBogota(ahoraPrototipo().getTime() + 15 * 60 * 1000),
          pagada_en: creadoEn,
          items: [],
          creado_en: creadoEn,
          actualizado_en: creadoEn,
        };
        const existentes = new Set(datos.boletaPorCodigo.keys());
        const nuevas = [];
        const vendidas = leerSesion(CLAVES.vendidas, {});
        for (const { entrada, cantidad } of elegidas) {
          const fila = entrada.closest('.tipo');
          const tipoId = $('input[name="tipo_boleta_id"]', fila).value;
          const tipo = datos.tipoPorId.get(tipoId).tipo;
          orden.items.push({
            id: uuid(), orden_id: orden.id, tipo_boleta_id: tipoId, cantidad, precio_unitario_cop: tipo.precio_cop,
            creado_en: creadoEn, actualizado_en: creadoEn,
          });
          vendidas[tipoId] = Number(vendidas[tipoId] || 0) + cantidad;
          for (let i = 0; i < cantidad; i++) {
            const codigo = generarCodigo(existentes);
            existentes.add(codigo);
            nuevas.push({
              id: uuid(), orden_id: orden.id, tipo_boleta_id: tipoId, codigo, titular_nombre: nombre,
              estado: 'valida', usada_en: null, creado_en: creadoEn, actualizado_en: creadoEn,
            });
          }
        }
        guardarSesion(CLAVES.boletas, [...leerSesion(CLAVES.boletas, []), ...nuevas]);
        guardarSesion(CLAVES.ordenes, [...leerSesion(CLAVES.ordenes, []), orden]);
        guardarSesion(CLAVES.vendidas, vendidas);

        const primerNombre = nombre.split(' ')[0];
        const titulo = el('h3', { clase: 'confirmacion__titulo', tabindex: '-1', id: 'confirmacion-titulo' },
          icono('ok'), el('span', {}, `¡Listo, ${primerNombre}! Tus boletas están confirmadas`));
        confirmacion.replaceChildren(
          titulo,
          el('p', {}, valor > 0
            ? `Pagaste ${pesos(valor)} con ${MEDIOS_PAGO[medio]} (pago simulado: no se cobró nada).`
            : 'Tu orden es gratuita: no pagaste nada.'),
          el('p', {}, `En la app real te llegarían a ${orden.comprador_correo} con su QR. Guarda estos códigos: en la puerta los pueden digitar si la cámara falla.`),
          el('ul', { clase: 'boletas', 'aria-label': 'Tus boletas' }, nuevas.map((b) => el('li', { clase: 'boleta' },
            el('p', { clase: 'boleta__codigo' }, b.codigo),
            el('p', {}, `Tipo: ${datos.tipoPorId.get(b.tipo_boleta_id).tipo.nombre}`),
            el('p', {}, `Titular: ${b.titular_nombre}`)))),
          el('div', { clase: 'acciones' },
            el('a', { clase: 'boton boton--primario', href: `puerta.html?evento=${encodeURIComponent(evento.slug)}` }, 'Validarlas en la puerta'),
            el('a', { clase: 'boton boton--secundario', href: 'index.html' }, 'Volver a la cartelera')));
        form.hidden = true;
        confirmacion.hidden = false;
        confirmacion.setAttribute('aria-labelledby', 'confirmacion-titulo');
        enfocar(titulo);
      }
    }

    cargar(false);
  }

  // ------------------------------------------------------------------ PANTALLA 3 · publicar evento
  function iniciarPublicar() {
    const form = $('#form-publicar');
    const grupoOrganizador = $('#grupo-organizador');
    const grupoEvento = $('#grupo-evento');
    const listaFilas = $('#lista-filas-tipo');
    const plantilla = $('#plantilla-fila-tipo');
    const botonAgregar = $('#agregar-tipo');
    const topeTipos = $('#tope-tipos');
    const contadorCupos = $('#contador-cupos');
    const descripcion = $('#evento-descripcion');
    const contadorDescripcion = $('#evento-descripcion-contador');
    const gratuito = $('#evento-es-gratuito');
    const aforo = $('#evento-aforo-total');
    const alerta = $('#alerta-envio');
    const confirmacion = $('#confirmacion-publicar');
    const MAX_TIPOS = 10;
    let siguienteId = 1;
    let modo = 'publicar';

    const valorEn = (fieldset, nombre) => {
      const control = fieldset.elements.namedItem(nombre);
      if (!control) return '';
      // En un fieldset, namedItem devuelve el PRIMER radio del grupo, no el marcado.
      if (control.type === 'radio') {
        const marcado = fieldset.querySelector(`input[name="${nombre}"]:checked`);
        return marcado ? marcado.value : '';
      }
      return String(control.value || '');
    };
    const filas = () => $$('fieldset.fila-tipo', listaFilas);
    const controlDe = (fila, nombre) => fila.elements.namedItem(nombre);

    function renumerar() {
      const todas = filas();
      todas.forEach((fila, i) => {
        $('legend', fila).textContent = `Tipo de boleta ${i + 1}`;
        $('[data-quitar-tipo]', fila).hidden = todas.length === 1;
      });
      const lleno = todas.length >= MAX_TIPOS;
      botonAgregar.disabled = lleno;
      topeTipos.hidden = !lleno;
    }

    function agregarFila(enfocarNueva) {
      if (filas().length >= MAX_TIPOS) return;
      const n = siguienteId++;
      const fragmento = plantilla.content.cloneNode(true);
      const fila = $('fieldset', fragmento);
      for (const nodo of [fila, ...$$('*', fila)]) {
        for (const atributo of ['id', 'for', 'aria-describedby']) {
          const v = nodo.getAttribute(atributo);
          if (v && v.includes('tipo-N-')) nodo.setAttribute(atributo, v.replaceAll('tipo-N-', `tipo-${n}-`));
        }
      }
      fila.dataset.fila = String(n);
      if (gratuito.checked) {
        const precio = controlDe(fila, 'precio_cop');
        precio.value = '0';
        precio.disabled = true;
      }
      listaFilas.append(fragmento);
      renumerar();
      actualizarCupos();
      if (enfocarNueva) controlDe(fila, 'nombre').focus();
    }

    listaFilas.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-quitar-tipo]');
      if (!boton) return;
      const fila = boton.closest('fieldset.fila-tipo');
      const todas = filas();
      const indice = todas.indexOf(fila);
      fila.remove();
      renumerar();
      actualizarCupos();
      validador.revalidar(aforo);
      const vecina = filas()[Math.max(0, indice - 1)];
      if (vecina) controlDe(vecina, 'nombre').focus();
    });

    botonAgregar.addEventListener('click', () => agregarFila(true));

    function actualizarDescripcion() {
      contadorDescripcion.textContent = `${numero(descripcion.value.length)} de 2.000 caracteres, mínimo 20`;
    }
    descripcion.addEventListener('input', actualizarDescripcion);

    function sumaCupos() {
      return filas().reduce((s, fila) => s + (enteroEntre(controlDe(fila, 'cantidad_total').value, 1, 100000) || 0), 0);
    }

    function actualizarCupos() {
      const suma = sumaCupos();
      const cap = enteroEntre(aforo.value, 1, 100000);
      contadorCupos.textContent = `Cupos asignados: ${numero(suma)} de ${cap ? numero(cap) : '—'} del aforo`;
      contadorCupos.classList.toggle('contador-cupos--excede', Boolean(cap && suma > cap));
    }

    form.addEventListener('input', (e) => {
      if (e.target === aforo || e.target.name === 'cantidad_total') actualizarCupos();
    });

    gratuito.addEventListener('change', () => {
      for (const fila of filas()) {
        const precio = controlDe(fila, 'precio_cop');
        if (gratuito.checked) {
          precio.dataset.anterior = precio.value;
          precio.value = '0';
          precio.disabled = true;
        } else {
          precio.disabled = false;
          precio.value = precio.dataset.anterior || '';
        }
      }
      validador.revalidar(gratuito);
    });

    // ---------------------------------------------------------------- reglas de validación (las del modelo)
    function reglas() {
      const lista = [];
      const o = (nombre) => grupoOrganizador.elements.namedItem(nombre);
      const ev = (nombre) => grupoEvento.elements.namedItem(nombre);
      const inicio = () => desdeLocal(ev('fecha_inicio').value);
      const fin = () => desdeLocal(ev('fecha_fin').value);

      lista.push({
        clave: 'organizador-nombre', controles: () => [o('nombre')],
        validar: () => textoEntre(o('nombre').value, 3, 120, 'Escribe el nombre del organizador o colectivo.', 'El nombre del organizador debe tener al menos 3 caracteres.', 'El nombre del organizador no puede pasar de 120 caracteres.'),
      });
      lista.push({
        clave: 'organizador-correo', controles: () => [o('correo')],
        validar: () => validarCorreo(o('correo').value, 'Escribe un correo de contacto.'),
      });
      lista.push({
        clave: 'organizador-telefono', controles: () => [o('telefono')],
        validar: () => {
          if (!o('telefono').value.trim()) return 'Escribe un teléfono de contacto.';
          return normalizarTelefono(o('telefono').value) ? null : 'Escribe un celular de 10 dígitos que empiece por 3 o un fijo que empiece por 608, por ejemplo 608 635 5041.';
        },
      });
      lista.push({
        clave: 'organizador-municipio', controles: () => [o('municipio')],
        validar: () => (o('municipio').value ? null : 'Elige el municipio del organizador.'),
      });
      lista.push({
        clave: 'evento-nombre', controles: () => [ev('nombre')],
        validar: () => textoEntre(ev('nombre').value, 3, 120, 'Escribe el nombre del evento.', 'El nombre del evento debe tener al menos 3 caracteres.', 'El nombre del evento no puede pasar de 120 caracteres.'),
      });
      lista.push({
        clave: 'evento-categoria', controles: () => [ev('categoria')],
        validar: () => (CATEGORIAS[ev('categoria').value] ? null : 'Elige una categoría.'),
      });
      lista.push({
        clave: 'evento-descripcion', controles: () => [descripcion],
        validar: () => {
          const largo = descripcion.value.trim().length;
          if (!largo) return 'Escribe una descripción del evento (mínimo 20 caracteres).';
          if (largo < 20) return `La descripción debe tener al menos 20 caracteres; llevas ${largo}.`;
          if (largo > 2000) return 'La descripción no puede pasar de 2.000 caracteres.';
          return null;
        },
      });
      lista.push({
        clave: 'evento-fecha-inicio', controles: () => [ev('fecha_inicio')],
        validar: () => {
          const f = inicio();
          if (!f) return 'Escribe la fecha y hora de inicio.';
          if (modo === 'publicar' && f <= ahoraPrototipo()) return 'Para publicar, la fecha de inicio debe ser futura (la fecha del prototipo es el 1 de octubre de 2026).';
          return null;
        },
      });
      lista.push({
        clave: 'evento-fecha-fin', controles: () => [ev('fecha_fin')], relacionados: () => [ev('fecha_inicio')],
        validar: () => {
          const f = fin();
          if (!f) return 'Escribe la fecha y hora de cierre.';
          const i = inicio();
          if (i && f <= i) return 'El cierre debe ser posterior al inicio del evento.';
          return null;
        },
      });
      lista.push({
        clave: 'evento-lugar', controles: () => [ev('lugar')],
        validar: () => textoEntre(ev('lugar').value, 2, 120, 'Escribe el lugar del evento.', 'El lugar debe tener al menos 2 caracteres.', 'El lugar no puede pasar de 120 caracteres.'),
      });
      lista.push({
        clave: 'evento-direccion', controles: () => [ev('direccion')],
        validar: () => textoEntre(ev('direccion').value, 5, 160, 'Escribe la dirección del lugar.', 'La dirección debe tener al menos 5 caracteres.', 'La dirección no puede pasar de 160 caracteres.'),
      });
      lista.push({
        clave: 'evento-municipio', controles: () => [ev('municipio')],
        validar: () => (ev('municipio').value ? null : 'Elige el municipio donde será el evento.'),
      });
      lista.push({
        clave: 'evento-aforo-total', controles: () => [aforo],
        validar: () => (enteroEntre(aforo.value, 1, 100000) ? null : 'El aforo debe ser un número entero entre 1 y 100.000.'),
      });
      lista.push({
        clave: 'evento-imagen-url', controles: () => [ev('imagen_url')],
        validar: () => {
          const v = ev('imagen_url').value.trim();
          if (!v) return null;
          if (!/^https:\/\/\S+\.\S+/.test(v)) return 'El enlace de la imagen debe empezar por https:// (o déjalo vacío).';
          if (v.length > 500) return 'El enlace de la imagen no puede pasar de 500 caracteres.';
          return null;
        },
      });

      const nombresVistos = new Map();
      for (const fila of filas()) {
        const n = fila.dataset.fila;
        const posicion = filas().indexOf(fila) + 1;
        const c = (nombre) => controlDe(fila, nombre);
        const etiqueta = `tipo de boleta ${posicion}`;
        const nombreTipo = c('nombre').value.trim();
        const clave = sinTildes(nombreTipo);
        const repetido = clave && nombresVistos.has(clave);
        if (clave && !repetido) nombresVistos.set(clave, posicion);

        lista.push({
          clave: `tipo-${n}-nombre`, controles: () => [c('nombre')], relacionados: () => filas().map((f) => controlDe(f, 'nombre')),
          validar: () => {
            const m = textoEntre(c('nombre').value, 2, 60, `Escribe el nombre del ${etiqueta}.`, `El nombre del ${etiqueta} debe tener al menos 2 caracteres.`, `El nombre del ${etiqueta} no puede pasar de 60 caracteres.`);
            if (m) return m;
            const propio = sinTildes(c('nombre').value.trim());
            const primero = filas().find((f) => sinTildes(controlDe(f, 'nombre').value.trim()) === propio);
            return primero !== fila ? `Ya hay otro tipo llamado «${c('nombre').value.trim()}»: usa nombres distintos.` : null;
          },
        });
        lista.push({
          clave: `tipo-${n}-descripcion`, controles: () => [c('descripcion')],
          validar: () => (c('descripcion').value.trim().length > 500 ? `Lo que incluye el ${etiqueta} no puede pasar de 500 caracteres.` : null),
        });
        lista.push({
          clave: `tipo-${n}-precio-cop`, controles: () => [c('precio_cop')], relacionados: () => [gratuito],
          validar: () => {
            const v = c('precio_cop').value.trim();
            if (v === '') return `Escribe el precio del ${etiqueta} (0 si es gratis).`;
            const precio = enteroEntre(v, 0, 10000000);
            if (precio === null) return `El precio del ${etiqueta} debe ser un número entero entre 0 y 10.000.000, sin puntos.`;
            if (gratuito.checked && precio !== 0) return 'En un evento gratuito todas las boletas valen $0.';
            return null;
          },
        });
        lista.push({
          clave: `tipo-${n}-cantidad-total`, controles: () => [c('cantidad_total')],
          validar: () => (enteroEntre(c('cantidad_total').value, 1, 100000) ? null : `Los cupos del ${etiqueta} deben ser un número entero entre 1 y 100.000.`),
        });
        lista.push({
          clave: `tipo-${n}-maximo-por-orden`, controles: () => [c('maximo_por_orden')],
          validar: () => (enteroEntre(c('maximo_por_orden').value, 1, 20) ? null : `El máximo por compra del ${etiqueta} debe estar entre 1 y 20.`),
        });
        lista.push({
          clave: `tipo-${n}-venta-inicia-en`, controles: () => [c('venta_inicia_en')],
          validar: () => (desdeLocal(c('venta_inicia_en').value) ? null : `Escribe cuándo abre la venta del ${etiqueta}.`),
        });
        lista.push({
          clave: `tipo-${n}-venta-termina-en`, controles: () => [c('venta_termina_en')],
          relacionados: () => [c('venta_inicia_en'), ev('fecha_fin')],
          validar: () => {
            const termina = desdeLocal(c('venta_termina_en').value);
            if (!termina) return `Escribe cuándo cierra la venta del ${etiqueta}.`;
            const abre = desdeLocal(c('venta_inicia_en').value);
            if (abre && termina <= abre) return `El cierre de la venta del ${etiqueta} debe ser posterior a su apertura.`;
            const cierre = fin();
            if (cierre && termina > cierre) return `La venta del ${etiqueta} debe cerrar antes del cierre del evento (${fechaCorta(cierre)}).`;
            return null;
          },
        });
      }

      // Regla que cruza tablas: la suma de cupos no supera el aforo.
      lista.push({
        clave: 'tipos-cupos',
        controles: () => filas().map((f) => controlDe(f, 'cantidad_total')),
        relacionados: () => [aforo],
        ubicar: (p) => contadorCupos.after(p),
        validar: () => {
          const cap = enteroEntre(aforo.value, 1, 100000);
          const suma = sumaCupos();
          if (!cap || !suma) return null;
          return suma > cap ? `Los cupos suman ${numero(suma)} y el aforo es ${numero(cap)}. Baja los cupos o revisa el aforo.` : null;
        },
      });
      return lista;
    }

    const validador = crearValidador(form, {
      resumen: $('#errores-publicar'),
      verbo: () => (modo === 'borrador' ? 'guardar' : 'publicar'),
      reglas,
    });

    // ---------------------------------------------------------------- envío
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      modo = (e.submitter && e.submitter.dataset.accion) || 'publicar';
      alerta.replaceChildren();
      if (form.getAttribute('aria-busy') === 'true') return; // ya se está enviando
      if (!validador.validarTodo()) return;
      const botones = $$('button[type="submit"]', form);
      const boton = e.submitter || botones[0];
      const textoOriginal = boton.textContent;
      // aria-disabled (y no disabled) para que el botón conserve el foco mientras espera.
      botones.forEach((b) => { b.setAttribute('aria-disabled', 'true'); });
      boton.textContent = modo === 'publicar' ? 'Publicando…' : 'Guardando…';
      form.setAttribute('aria-busy', 'true');
      await espera(800);
      form.removeAttribute('aria-busy');
      botones.forEach((b) => { b.removeAttribute('aria-disabled'); });
      boton.textContent = textoOriginal;

      if (SIMULAR === 'error') {
        alerta.replaceChildren(el('div', { clase: 'estado estado--error', role: 'alert' },
          icono('alerta', 'estado__icono'),
          el('p', {}, el('strong', {}, modo === 'publicar'
            ? 'No pudimos publicar tu evento. Tus datos siguen aquí; inténtalo de nuevo.'
            : 'No pudimos guardar tu borrador. Tus datos siguen aquí; inténtalo de nuevo.')),
          el('p', { clase: 'estado__detalle' }, 'Detalle técnico: ', el('code', {}, 'POST /eventos: la conexión se cerró sin respuesta (error de red simulado).'))));
        boton.focus();
        return;
      }
      mostrarConfirmacion(construirEvento());
    });

    function construirEvento() {
      const ahora = isoBogota(ahoraPrototipo());
      const o = (nombre) => valorEn(grupoOrganizador, nombre).trim();
      const ev = (nombre) => valorEn(grupoEvento, nombre).trim();
      const organizador = {
        id: uuid(),
        nombre: o('nombre').replace(/\s+/g, ' '),
        correo: o('correo').toLowerCase(),
        telefono: normalizarTelefono(o('telefono')),
        municipio: o('municipio'),
        creado_en: ahora,
        actualizado_en: ahora,
      };
      const inicio = desdeLocal(ev('fecha_inicio'));
      const sufijo = uuid().replace(/-/g, '').slice(0, 4);
      const eventoId = uuid();
      const evento = {
        id: eventoId,
        organizador_id: organizador.id,
        nombre: ev('nombre').replace(/\s+/g, ' '),
        slug: slugConAnio(slugificar(ev('nombre')) || 'evento', isoBogota(inicio).slice(0, 4), sufijo),
        descripcion: ev('descripcion'),
        categoria: ev('categoria'),
        lugar: ev('lugar'),
        direccion: ev('direccion'),
        municipio: ev('municipio'),
        fecha_inicio: isoBogota(inicio),
        fecha_fin: isoBogota(desdeLocal(ev('fecha_fin'))),
        aforo_total: Number(ev('aforo_total')),
        edad_minima: ev('edad_minima') ? Number(ev('edad_minima')) : null,
        es_gratuito: gratuito.checked,
        politica_reembolso: ev('politica_reembolso') || 'hasta_24h_antes',
        imagen_url: ev('imagen_url') || null,
        estado: modo === 'publicar' ? 'publicado' : 'borrador',
        // Nace en borrador (version 1); publicarlo es una segunda escritura (version 2).
        version: modo === 'publicar' ? 2 : 1,
        creado_en: ahora,
        actualizado_en: ahora,
        organizador: { id: organizador.id, nombre: organizador.nombre, municipio: organizador.municipio },
        tipos_boleta: filas().map((fila) => {
          const t = (nombre) => String(controlDe(fila, nombre).value || '').trim();
          return {
            id: uuid(),
            evento_id: eventoId,
            nombre: t('nombre'),
            descripcion: t('descripcion') || null,
            precio_cop: gratuito.checked ? 0 : Number(t('precio_cop')),
            cantidad_total: Number(t('cantidad_total')),
            cantidad_vendida: 0,
            maximo_por_orden: Number(t('maximo_por_orden')),
            venta_inicia_en: isoBogota(desdeLocal(t('venta_inicia_en'))),
            venta_termina_en: isoBogota(desdeLocal(t('venta_termina_en'))),
            creado_en: ahora,
            actualizado_en: ahora,
          };
        }),
      };
      return { organizador, evento };
    }

    function mostrarConfirmacion({ organizador, evento }) {
      const publicado = evento.estado === 'publicado';
      if (publicado) {
        guardarSesion(CLAVES.organizadores, [...leerSesion(CLAVES.organizadores, []), organizador]);
        guardarSesion(CLAVES.eventos, [...leerSesion(CLAVES.eventos, []), evento]);
      }
      const fila = (termino, ...definicion) => el('div', {}, el('dt', {}, termino), el('dd', {}, ...definicion));
      const titulo = el('h2', { clase: 'confirmacion__titulo', id: 'confirmacion-publicar-titulo', tabindex: '-1' },
        icono('ok'), el('span', {}, publicado ? '¡Tu evento quedó publicado!' : 'Guardamos tu borrador'));
      confirmacion.replaceChildren(
        titulo,
        el('p', {}, publicado
          ? 'Ya aparece en la cartelera de esta sesión con el distintivo «Creado en esta sesión». En la app real le llegaría un correo de confirmación al organizador.'
          : 'Tu borrador no sale en la cartelera hasta que lo publiques. En este prototipo no queda guardado en ningún servidor: es una simulación.'),
        el('dl', { clase: 'ficha' },
          fila('Organizador', `${organizador.nombre} · ${organizador.municipio}`),
          fila('Contacto', `${organizador.correo} · ${organizador.telefono}`),
          fila('Evento', evento.nombre),
          fila('Categoría', CATEGORIAS[evento.categoria]),
          fila('Inicio', el('time', { datetime: evento.fecha_inicio }, `${fechaLarga(evento.fecha_inicio)}, ${hora(evento.fecha_inicio)}`)),
          fila('Cierre', el('time', { datetime: evento.fecha_fin }, `${fechaLarga(evento.fecha_fin)}, ${hora(evento.fecha_fin)}`)),
          fila('Lugar', `${evento.lugar} · ${evento.direccion} · ${evento.municipio}`),
          fila('Aforo', `${numero(evento.aforo_total)} personas`),
          fila('Edad mínima', textoEdad(evento.edad_minima)),
          fila('Reembolsos', REEMBOLSOS[evento.politica_reembolso]),
          fila('Tipos de boleta', el('ul', { clase: 'mb-0' }, evento.tipos_boleta.map((t) => el('li', {},
            `${t.nombre}: ${t.precio_cop ? pesos(t.precio_cop) : 'sin costo'} · ${numero(t.cantidad_total)} cupos · máximo ${t.maximo_por_orden} por compra`)))),
          fila('Dirección web', el('code', {}, `detalle.html?evento=${evento.slug}`))),
        el('h3', {}, 'Así se verá en la cartelera'),
        el('div', { clase: 'previa' }, tarjetaEvento(evento, { nivel: 4, enlace: publicado, organizador, deSesion: true })),
        el('div', { clase: 'acciones mt-5' },
          el('a', { clase: 'boton boton--primario', href: 'index.html' }, 'Ver la cartelera'),
          el('a', { clase: 'boton boton--secundario', href: 'publicar.html' }, 'Publicar otro evento')));
      form.hidden = true;
      confirmacion.setAttribute('aria-labelledby', 'confirmacion-publicar-titulo');
      confirmacion.hidden = false;
      enfocar(titulo);
    }

    agregarFila(false);
    actualizarDescripcion();
    actualizarCupos();
  }

  // ------------------------------------------------------------------ PANTALLA 4 · validar en la puerta
  function iniciarPuerta() {
    const estado = $('#estado-puerta');
    const app = $('#puerta-app');
    const form = $('#form-validar');
    const selectEvento = $('#validar-evento');
    const codigo = $('#validar-codigo');
    const selectPuerta = $('#validar-puerta');
    const portero = $('#validar-portero');
    const resultado = $('#resultado');
    const listaLecturas = $('#lista-lecturas');
    const sinLecturas = $('#sin-lecturas');
    const avisoBorrado = $('#aviso-borrado');
    let datos = null;

    const MOTIVOS_CORTOS = {
      ya_usada: 'ya había ingresado',
      cancelada: 'boleta cancelada',
      otro_evento: 'es de otro evento',
      no_existe: 'el código no existe',
    };

    function mostrarCargando() {
      app.hidden = true;
      estado.hidden = false;
      estado.replaceChildren(estadoCargando());
    }

    async function cargar(reintento) {
      mostrarCargando();
      try {
        datos = await cargarDatos();
      } catch (error) {
        estado.replaceChildren(estadoError(error, {
          nivel: 2,
          titulo: 'No pudimos cargar los eventos',
          explicacion: 'Sin la lista de eventos y boletas no podemos validar. Revisa la conexión del celular y vuelve a intentarlo.',
          alReintentar: () => cargar(true),
        }));
        if (reintento) $('.estado--error button', estado).focus();
        return;
      }
      const eventos = visiblesEnCartelera(datos);
      if (!eventos.length) {
        estado.replaceChildren(el('div', { clase: 'estado', role: 'status' },
          icono('vacio', 'estado__icono'),
          el('h2', {}, 'No hay eventos para validar'),
          el('p', {}, 'Cuando publiques un evento y vendas boletas, aquí vas a poder validarlas en la puerta.'),
          el('div', { clase: 'acciones' }, el('a', { clase: 'boton boton--primario', href: 'publicar.html' }, 'Publica tu evento'))));
        return;
      }
      selectEvento.replaceChildren(...eventos.map((e) => el('option', { value: e.id }, `${e.nombre} · ${diaCorto(e.fecha_inicio)}`)));
      const pedido = datos.eventoPorSlug.get(PARAMS.get('evento') || '') || datos.eventoPorSlug.get(SLUG_TALLER) || eventos[0];
      selectEvento.value = ESTADOS_VISIBLES.includes(pedido.estado) ? pedido.id : eventos[0].id;
      portero.value = leerSesion(CLAVES.portero, '') || '';
      pintarCodigosSesion();
      pintarConteo();
      estado.replaceChildren();
      estado.hidden = true;
      app.hidden = false;
      if (reintento) enfocar($('h1'));
    }

    const eventoActual = () => datos.eventoPorId.get(selectEvento.value);
    const lecturas = () => leerSesion(CLAVES.validaciones, []);

    selectEvento.addEventListener('change', () => {
      const evento = eventoActual();
      const consulta = new URLSearchParams(PARAMS);
      consulta.set('evento', evento.slug);
      try {
        window.history.replaceState(null, '', `puerta.html?${consulta.toString()}`);
      } catch (error) { /* sin historial disponible: no pasa nada */ }
      resultado.replaceChildren();
      pintarConteo();
    });

    codigo.addEventListener('blur', () => {
      if (codigo.value.trim()) codigo.value = normalizarCodigo(codigo.value);
    });

    app.addEventListener('click', (e) => {
      const boton = e.target.closest('button[data-codigo]');
      if (!boton) return;
      codigo.value = boton.dataset.codigo;
      validador.revalidar(codigo);
      codigo.focus();
    });

    function pintarCodigosSesion() {
      const propias = leerSesion(CLAVES.boletas, []);
      const caja = $('#codigos-sesion');
      if (!propias.length) {
        caja.hidden = true;
        return;
      }
      $('#lista-codigos-sesion').replaceChildren(...propias.slice(-6).map((b) => {
        const info = datos.tipoPorId.get(b.tipo_boleta_id);
        return el('li', {},
          el('span', {}, el('span', { clase: 'codigo' }, b.codigo), info ? ` · ${info.evento.nombre}` : ''),
          el('button', { type: 'button', clase: 'boton boton--secundario', 'data-codigo': b.codigo }, 'Usar', el('span', { clase: 'visualmente-oculto' }, ` el código ${b.codigo}`)));
      }));
      caja.hidden = false;
    }

    function pintarConteo() {
      const evento = eventoActual();
      const propias = lecturas().filter((v) => v.evento_id === evento.id);
      $('#conteo-aceptadas').textContent = numero(propias.filter((v) => v.resultado === 'aceptada').length);
      $('#conteo-rechazadas').textContent = numero(propias.filter((v) => v.resultado === 'rechazada').length);
      $('#conteo-vendidas').textContent = numero(evento.tipos_boleta.reduce((s, t) => s + t.cantidad_vendida, 0));
      const recientes = [...propias].reverse();
      sinLecturas.hidden = recientes.length > 0;
      listaLecturas.hidden = recientes.length === 0;
      listaLecturas.replaceChildren(...recientes.map((v) => {
        const aceptada = v.resultado === 'aceptada';
        return el('li', { clase: `lectura lectura--${v.resultado}` },
          icono(aceptada ? 'ok' : 'no'),
          el('p', { clase: 'lectura__resultado' },
            aceptada ? 'Aceptada' : `Rechazada: ${MOTIVOS_CORTOS[v.motivo]}`, ' · ',
            el('span', { clase: 'codigo' }, v.codigo_leido)),
          el('p', { clase: 'lectura__meta' },
            el('time', { datetime: v.validada_en }, hora(v.validada_en)),
            ` · Puerta ${v.puerta} · Validó ${v.validada_por}`));
      }));
    }

    const validador = crearValidador(form, {
      resumen: $('#errores-validar'),
      verbo: 'validar',
      reglas: () => [
        {
          clave: 'validar-codigo', controles: () => [codigo],
          validar: () => (codigo.value.trim() ? null : 'Escribe el código de la boleta.'),
        },
        {
          clave: 'validar-portero', controles: () => [portero],
          validar: () => textoEntre(portero.value, 2, 120, 'Escribe tu nombre: queda registrado quién validó.', 'Tu nombre debe tener al menos 2 letras.', 'Tu nombre no puede pasar de 120 caracteres.'),
        },
      ],
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validador.validarTodo()) return;
      const leido = codigo.value.trim();
      const normal = normalizarCodigo(leido);
      codigo.value = normal;
      const evento = eventoActual();
      const nombrePortero = portero.value.trim().replace(/\s+/g, ' ');
      guardarSesion(CLAVES.portero, nombrePortero);

      const boleta = datos.boletaPorCodigo.get(normal) || null;
      const info = boleta ? datos.tipoPorId.get(boleta.tipo_boleta_id) : null;
      const previas = lecturas();
      let motivo = null;
      let anterior = null;
      if (!boleta || !info) motivo = 'no_existe';
      else if (info.evento.id !== evento.id) motivo = 'otro_evento';
      else {
        anterior = previas.find((v) => v.boleta_id === boleta.id && v.resultado === 'aceptada');
        if (anterior || boleta.estado === 'usada') motivo = 'ya_usada';
        else if (boleta.estado === 'cancelada') motivo = 'cancelada';
      }
      const ahora = isoBogota(ahoraPrototipo());
      const validacion = {
        id: uuid(),
        evento_id: evento.id,
        boleta_id: motivo === 'no_existe' ? null : boleta.id,
        codigo_leido: leido,
        resultado: motivo ? 'rechazada' : 'aceptada',
        motivo,
        puerta: selectPuerta.value,
        validada_por: nombrePortero,
        validada_en: ahora,
        creado_en: ahora,
        actualizado_en: ahora,
      };
      guardarSesion(CLAVES.validaciones, [...previas, validacion]);
      mostrarResultado(validacion, { boleta, info, anterior });
      pintarConteo();
      avisoBorrado.textContent = '';
    });

    function mostrarResultado(v, { boleta, info, anterior }) {
      let caja;
      if (v.resultado === 'aceptada') {
        caja = el('div', { clase: 'resultado__caja resultado--aceptada' },
          icono('ok'),
          el('div', {},
            el('p', { clase: 'resultado__titulo' }, 'Puede entrar'),
            el('p', { clase: 'resultado__detalle' }, el('strong', {}, boleta.titular_nombre)),
            el('p', { clase: 'resultado__detalle' }, `Boleta ${info.tipo.nombre} · `, el('span', { clase: 'codigo' }, boleta.codigo)),
            el('p', { clase: 'resultado__detalle' }, 'Validada a las ', el('time', { datetime: v.validada_en }, hora(v.validada_en)), ` por la puerta ${v.puerta}.`)));
      } else {
        let explicacion;
        if (v.motivo === 'ya_usada') {
          explicacion = anterior
            ? `Esta boleta ya ingresó a las ${hora(anterior.validada_en)} por la puerta ${anterior.puerta}`
            : `Esta boleta ya ingresó${boleta.usada_en ? ` el ${fechaCorta(boleta.usada_en)}` : ''}`;
        } else if (v.motivo === 'cancelada') {
          explicacion = 'La boleta fue cancelada por un reembolso';
        } else if (v.motivo === 'otro_evento') {
          explicacion = `Esta boleta es de otro evento: ${info.evento.nombre} (${diaCorto(info.evento.fecha_inicio)})`;
        } else {
          explicacion = 'Ese código no corresponde a ninguna boleta';
        }
        caja = el('div', { clase: 'resultado__caja resultado--rechazada' },
          icono('no'),
          el('div', {},
            el('p', { clase: 'resultado__titulo' }, 'No puede entrar'),
            el('p', { clase: 'resultado__detalle' }, el('strong', {}, `${explicacion}.`)),
            boleta && v.motivo !== 'no_existe' ? el('p', { clase: 'resultado__detalle' }, `Titular: ${boleta.titular_nombre}`) : null,
            v.motivo === 'no_existe' ? el('p', { clase: 'resultado__detalle' }, 'Revisa que el código esté completo y sin errores de digitación.') : null,
            el('p', { clase: 'resultado__detalle' }, 'Código leído: ', el('span', { clase: 'codigo' }, v.codigo_leido))));
      }
      // Se vacía y se vuelve a llenar para que el lector de pantalla anuncie cada lectura.
      resultado.replaceChildren();
      window.setTimeout(() => resultado.replaceChildren(caja), 60);
    }

    $('#borrar-lecturas').addEventListener('click', () => {
      guardarSesion(CLAVES.validaciones, []);
      resultado.replaceChildren();
      pintarConteo();
      avisoBorrado.textContent = 'Borramos las validaciones de esta sesión.';
    });

    cargar(false);
  }

  // ------------------------------------------------------------------ arranque
  avisoSimulacion();
  const PANTALLAS = { cartelera: iniciarCartelera, detalle: iniciarDetalle, publicar: iniciarPublicar, puerta: iniciarPuerta };
  if (PANTALLAS[PAGINA]) PANTALLAS[PAGINA]();
})();
