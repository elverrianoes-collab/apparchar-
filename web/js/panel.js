/* Apparchar · panel del organizador (MVP)
   Habla con la API REST real: inicio de sesión con JWT y CRUD de organizador,
   evento, tipo_boleta y orden, más el pago simulado, la puerta y las pruebas de
   seguridad. Cada petición queda en la bitácora «Peticiones a la API».
   La API se busca primero en el mismo origen (cuando el backend sirve esta
   página en /app/) y después en http://localhost:3000; ?api=URL la fija. */
(() => {
  'use strict';

  // ------------------------------------------------------------ utilidades
  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];
  const esc = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ZONA = 'America/Bogota';
  const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-CO', { timeZone: ZONA, dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }) : '—');
  const pesos = (valor) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);
  // datetime-local («2026-10-29T19:00») ↔ instante con la hora de Colombia (UTC−5, sin horario de verano).
  const aIso = (local) => `${local}:00-05:00`;
  const aLocal = (iso) => new Date(new Date(iso).getTime() - 5 * 3600e3).toISOString().slice(0, 16);
  const enDias = (dias, horaDelDia) => {
    const d = new Date(Date.now() + dias * 864e5 - 5 * 3600e3);
    return `${d.toISOString().slice(0, 10)}T${String(horaDelDia).padStart(2, '0')}:00`;
  };

  const almacen = {
    leer(clave) { try { return JSON.parse(sessionStorage.getItem(clave)); } catch { return null; } },
    guardar(clave, valor) {
      try { if (valor == null) sessionStorage.removeItem(clave); else sessionStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
    },
  };

  const OPCIONES = {
    municipios: ['Yopal', 'Aguazul', 'Chámeza', 'Hato Corozal', 'La Salina', 'Maní', 'Monterrey', 'Nunchía', 'Orocué', 'Paz de Ariporo', 'Pore', 'Recetor', 'Sabanalarga', 'Sácama', 'San Luis de Palenque', 'Támara', 'Tauramena', 'Trinidad', 'Villanueva'].map((m) => [m, m]),
    categorias: [['concierto', 'Concierto'], ['fiesta', 'Fiesta'], ['festival', 'Festival'], ['teatro', 'Teatro'], ['conferencia', 'Conferencia'], ['deportes', 'Deportes'], ['otro', 'Otro']],
    politicas: [['hasta_24h_antes', 'Hasta 24 horas antes'], ['hasta_72h_antes', 'Hasta 72 horas antes'], ['ninguno', 'Sin reembolsos']],
    medios: [['nequi', 'Nequi'], ['pse', 'PSE'], ['daviplata', 'Daviplata'], ['tarjeta', 'Tarjeta']],
  };
  const ESTADO_EVENTO = { borrador: 'Borrador', publicado: 'Publicado', pausado: 'Pausado', agotado: 'Agotado', cancelado: 'Cancelado', finalizado: 'Finalizado' };
  const ESTADO_ORDEN = { pendiente: 'Pendiente', pagada: 'Pagada', expirada: 'Expirada', reembolsada: 'Reembolsada' };
  const MOTIVO = { ya_usada: 'la boleta ya se usó', cancelada: 'la boleta está cancelada', otro_evento: 'la boleta es de otro evento', no_existe: 'el código no existe' };
  // Acciones de estado que admite cada evento (las mismas transiciones del servidor).
  const ACCIONES_EVENTO = {
    borrador: [['publicado', 'Publicar']],
    publicado: [['pausado', 'Pausar'], ['cancelado', 'Cancelar']],
    pausado: [['publicado', 'Reanudar'], ['cancelado', 'Cancelar']],
    agotado: [['cancelado', 'Cancelar']],
  };

  const estado = {
    base: '',
    sesion: almacen.leer('apparchar.sesion'),
    eventos: [],
    eventoSeleccionado: almacen.leer('apparchar.evento'),
    eventoActual: null,
    ordenes: [],
  };

  // ------------------------------------------------------------ API y bitácora
  class ErrorApi extends Error {
    constructor(status, cuerpo) {
      super(cuerpo?.mensaje || `HTTP ${status}`);
      this.status = status;
      this.cuerpo = cuerpo || {};
    }
  }
  class PruebaOmitida extends Error {}

  const ocultar = (valor) => {
    if (Array.isArray(valor)) return valor.map(ocultar);
    if (valor && typeof valor === 'object') {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, k === 'clave' ? '••••••••' : k === 'token' && typeof v === 'string' ? `${v.slice(0, 24)}…` : ocultar(v)]));
    }
    return valor;
  };

  function registrar(e) {
    const lista = $('#lista-bitacora');
    const tipo = e.status === 0 ? 'error' : e.status < 300 ? 'ok' : e.status < 500 ? 'aviso' : 'error';
    const cabeceras = Object.entries(e.cabeceras)
      .filter(([k]) => k !== 'Accept')
      .map(([k, v]) => `${k}: ${k === 'Authorization' ? `${v.slice(0, 30)}…` : k === 'X-Clave-Pasarela' ? '••••••••' : v}`)
      .join('\n');
    const li = document.createElement('li');
    li.className = `bitacora__item bitacora__item--${tipo}`;
    li.innerHTML = `<details>
      <summary><span class="bitacora__metodo">${esc(e.metodo)}</span><span class="bitacora__ruta" title="${esc(e.ruta)}">${esc(e.ruta.replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '$1…'))}</span><span class="bitacora__codigo">${e.status || 'sin respuesta'}</span><span class="bitacora__ms">${Math.round(e.ms)} ms</span></summary>
      ${cabeceras ? `<p class="bitacora__etiqueta">Cabeceras enviadas</p><pre>${esc(cabeceras)}</pre>` : ''}
      ${e.cuerpo === undefined ? '' : `<p class="bitacora__etiqueta">Cuerpo enviado</p><pre>${esc(JSON.stringify(ocultar(e.cuerpo), null, 2))}</pre>`}
      <p class="bitacora__etiqueta">Respuesta${e.status ? ` HTTP ${e.status}` : ''}${e.total != null ? ` · X-Total-Count: ${esc(e.total)}` : ''}</p>
      <pre>${esc(e.respuesta == null || e.respuesta === '' ? '(sin cuerpo)' : JSON.stringify(ocultar(e.respuesta), null, 2))}</pre>
    </details>`;
    lista.prepend(li);
    while (lista.children.length > 40) lista.lastElementChild.remove();
  }

  async function api(metodo, ruta, { cuerpo, conToken = true, token, cabeceras = {}, prueba = false } = {}) {
    const headers = { Accept: 'application/json', ...cabeceras };
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const elToken = token !== undefined ? token : conToken ? estado.sesion?.token : null;
    if (elToken) headers.Authorization = `Bearer ${elToken}`;
    const inicio = performance.now();
    let respuesta;
    try {
      respuesta = await fetch(estado.base + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    } catch {
      const error = new ErrorApi(0, { codigo: 'sin_conexion', mensaje: `No hubo respuesta de la API (${estado.base || 'sin dirección'}). Revisar que npm run demo siga corriendo.` });
      registrar({ metodo, ruta, status: 0, ms: performance.now() - inicio, cabeceras: headers, cuerpo, respuesta: error.cuerpo });
      throw error;
    }
    const ms = performance.now() - inicio;
    const texto = await respuesta.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
    const total = respuesta.headers.get('X-Total-Count');
    registrar({ metodo, ruta, status: respuesta.status, ms, cabeceras: headers, cuerpo, respuesta: datos, total });
    if (!respuesta.ok) {
      const error = new ErrorApi(respuesta.status, datos && typeof datos === 'object' ? datos : { codigo: 'error', mensaje: String(datos || respuesta.statusText) });
      // Un token que ya no sirve (venció, o el servidor se reinició con otra clave) cierra la sesión.
      if (respuesta.status === 401 && elToken && !prueba) sesionVencida(error);
      throw error;
    }
    return { datos, total, status: respuesta.status };
  }

  async function detectarApi() {
    const candidatos = [];
    const parametro = new URLSearchParams(location.search).get('api');
    if (parametro) candidatos.push(parametro.replace(/\/+$/, ''));
    if (location.protocol.startsWith('http')) candidatos.push(location.origin);
    candidatos.push('http://localhost:3000');
    for (const base of [...new Set(candidatos)]) {
      try {
        const r = await fetch(`${base}/salud`, { headers: { Accept: 'application/json' } });
        if (!r.ok) continue;
        const d = await r.json();
        if (d?.estado === 'ok') return { base, motor: d.base_de_datos };
      } catch { /* se prueba el siguiente */ }
    }
    return null;
  }

  // ------------------------------------------------------------ mensajes y formularios
  // Destino de un mensaje: la caja .mensajes misma, o la que está dentro del formulario o panel.
  function cajaDe(destino) {
    const el = typeof destino === 'string' ? $(destino) : destino;
    if (!el || el.classList.contains('mensajes')) return el;
    return $('.mensajes', el) || el;
  }

  function limpiar(destino) {
    const caja = cajaDe(destino);
    caja?.replaceChildren();
    const form = caja?.closest('form');
    if (form) {
      $$('[aria-invalid]', form).forEach((c) => c.removeAttribute('aria-invalid'));
      $$('.error[data-campo]', form).forEach((p) => p.remove());
    }
  }

  function exito(destino, texto) {
    limpiar(destino);
    const caja = cajaDe(destino);
    caja.innerHTML = `<p class="exito" role="status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12l5 5L20 7"/></svg><span>${texto}</span></p>`;
  }

  function fallo(destino, error) {
    limpiar(destino);
    const caja = cajaDe(destino);
    const c = error.cuerpo || {};
    const detalles = Array.isArray(c.detalles) ? c.detalles : [];
    caja.innerHTML = `<div class="resumen-errores" role="alert">
      <p class="resumen-errores__titulo">${error.status ? `HTTP ${error.status}` : 'Sin conexión'} · <code>${esc(c.codigo || 'error')}</code></p>
      <p class="mb-0">${esc(c.mensaje || error.message)}</p>
      ${detalles.length ? `<ul>${detalles.map((d) => `<li><code>${esc(d.campo)}</code>: ${esc(d.problema)}</li>`).join('')}</ul>` : ''}
    </div>`;
    const form = caja.closest('form');
    if (!form) return;
    for (const d of detalles) {
      const nombre = String(d.campo).split('.').pop().replace(/\[\d+\]$/, '');
      const control = form.elements.namedItem(nombre);
      if (!(control instanceof HTMLElement)) continue;
      control.setAttribute('aria-invalid', 'true');
      const p = document.createElement('p');
      p.className = 'error';
      p.dataset.campo = nombre;
      p.textContent = d.problema;
      (control.closest('.campo') || control.parentElement).append(p);
    }
  }

  function llenarOpciones(raiz = document) {
    for (const select of $$('select[data-opciones]', raiz)) {
      if (select.options.length) continue;
      select.innerHTML = OPCIONES[select.dataset.opciones].map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    }
  }

  // Valores tal como están en el formulario (para saber qué cambió en un PATCH).
  function crudos(form) {
    const valores = {};
    for (const el of form.elements) {
      if (!el.name || el.type === 'submit' || el.type === 'button') continue;
      valores[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    return valores;
  }

  function convertir(el, valor) {
    if (el.type === 'checkbox') return valor;
    if (el.type === 'number' || 'numero' in el.dataset) return Number(valor);
    if (el.type === 'datetime-local') return aIso(valor);
    return el.type === 'password' ? valor : valor.trim();
  }

  // Cuerpo JSON del formulario: sin campos vacíos y, si `soloCambios`, solo lo que cambió.
  function leer(form, { soloCambios = false } = {}) {
    const original = soloCambios ? form._original || {} : {};
    const datos = {};
    for (const el of form.elements) {
      if (!el.name || el.type === 'submit' || el.type === 'button' || el.closest('[data-aparte]')) continue;
      const valor = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type !== 'checkbox' && String(valor).trim() === '') continue;
      if (soloCambios && original[el.name] === valor && el.type !== 'hidden') continue;
      datos[el.name] = convertir(el, valor);
    }
    return datos;
  }

  function llenar(form, valores) {
    for (const [nombre, valor] of Object.entries(valores)) {
      const el = form.elements.namedItem(nombre);
      if (!(el instanceof HTMLElement)) continue;
      if (el.type === 'checkbox') el.checked = Boolean(valor);
      else if (el.type === 'datetime-local') el.value = valor ? aLocal(valor) : '';
      else el.value = valor ?? '';
    }
    form._original = crudos(form);
  }

  async function ocupado(boton, tarea) {
    if (boton) { boton.disabled = true; boton.setAttribute('aria-busy', 'true'); }
    try { return await tarea(); } finally {
      if (boton) { boton.disabled = false; boton.removeAttribute('aria-busy'); }
    }
  }

  // Botones que borran o cancelan: el primer clic pide confirmación.
  function confirmar(boton, texto = '¿Confirmar?') {
    if (boton.dataset.confirmando === 'si') { delete boton.dataset.confirmando; boton.textContent = boton.dataset.texto; return true; }
    boton.dataset.texto = boton.textContent;
    boton.dataset.confirmando = 'si';
    boton.textContent = texto;
    setTimeout(() => {
      if (boton.dataset.confirmando === 'si') { delete boton.dataset.confirmando; boton.textContent = boton.dataset.texto; }
    }, 4000);
    return false;
  }

  function mostrarPanel(id, visible = true) {
    const el = document.getElementById(id);
    el.hidden = !visible;
    if (visible) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ------------------------------------------------------------ sesión
  const yo = () => estado.sesion?.organizador;

  function decodificar(token) {
    try {
      const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(parte))));
    } catch { return null; }
  }

  function guardarSesion(sesion) {
    estado.sesion = sesion;
    almacen.guardar('apparchar.sesion', sesion);
  }

  function sesionVencida(error) {
    guardarSesion(null);
    pintarSesion();
    const caja = $('#form-sesion .mensajes');
    fallo(caja, new ErrorApi(401, { codigo: error.cuerpo?.codigo || 'no_autenticado', mensaje: `La sesión ya no es válida: ${error.cuerpo?.mensaje || 'el token venció'} Es normal si el servidor se reinició. Iniciar sesión de nuevo.` }));
  }

  function pintarSesion() {
    const s = estado.sesion;
    if (s && new Date(s.expira_en) <= new Date()) { guardarSesion(null); return pintarSesion(); }
    $('#zona-ingreso').hidden = Boolean(s);
    $('#zona-sesion').hidden = !s;
    if (!s) return;
    const o = s.organizador;
    $('#sesion-nombre').textContent = o.nombre;
    $('#sesion-detalle').textContent = `${o.correo} · ${o.municipio} · el token vence el ${fecha(s.expira_en)}`;
    const [cabeza, carga, firma] = s.token.split('.');
    $('#token-crudo').innerHTML = `<span class="token__cabeza">${esc(cabeza)}</span>.<span class="token__carga">${esc(carga)}</span>.<span class="token__firma">${esc(firma)}</span>`;
    const p = decodificar(s.token) || {};
    const filas = [
      ['Algoritmo (cabecera)', (decodificar(`x.${cabeza}`) || {}).alg || 'HS256'],
      ['sub · organizador', p.sub],
      ['iss · emisor', p.iss],
      ['iat · emitido', p.iat ? fecha(p.iat * 1000) : '—'],
      ['exp · vence', p.exp ? fecha(p.exp * 1000) : '—'],
    ];
    $('#token-datos').innerHTML = filas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="codigo">${esc(v)}</dd></div>`).join('');
    llenar($('#form-cuenta'), { nombre: o.nombre, correo: o.correo, telefono: o.telefono, municipio: o.municipio, clave: '' });
  }

  async function iniciarSesion(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const datos = leer(form);
    try {
      const { datos: sesion } = await ocupado($('button[type=submit]', form), () => api('POST', '/sesiones', { cuerpo: { correo: datos.correo ?? '', clave: datos.clave ?? '' }, conToken: false }));
      guardarSesion(sesion);
      limpiar(form);
      form.reset();
      pintarSesion();
      await Promise.all([pintarCuenta(), cargarEventos()]);
    } catch (error) { fallo(form, error); }
  }

  async function registrarse(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    try {
      const { datos } = await ocupado($('button[type=submit]', form), () => api('POST', '/organizadores', { cuerpo: leer(form), conToken: false }));
      exito(form, `Cuenta creada (HTTP 201) para <strong>${esc(datos.nombre)}</strong>. Ya puede iniciar sesión con ese correo.`);
      $('#sesion-correo').value = datos.correo;
      form.reset();
    } catch (error) { fallo(form, error); }
  }

  function cerrarSesion() {
    guardarSesion(null);
    almacen.guardar('apparchar.evento', null);
    estado.eventos = [];
    pintarSesion();
    $('#sesion-correo').focus();
  }

  // ------------------------------------------------------------ pestañas
  function activarPestana(tab, enfocar = false) {
    for (const t of $$('[role=tab]')) {
      const activa = t === tab;
      t.setAttribute('aria-selected', String(activa));
      t.tabIndex = activa ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !activa;
    }
    if (enfocar) tab.focus();
    almacen.guardar('apparchar.pestana', tab.id);
    const al = { 'tab-cuenta': pintarCuenta, 'tab-eventos': cargarEventos, 'tab-tipos': cargarTipos, 'tab-ordenes': cargarOrdenes, 'tab-puerta': cargarLecturas, 'tab-pruebas': pintarPruebas };
    al[tab.id]?.();
  }

  function prepararPestanas() {
    const tabs = $$('[role=tab]');
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => activarPestana(tab));
      tab.addEventListener('keydown', (e) => {
        const mover = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (mover) { e.preventDefault(); activarPestana(tabs[(i + mover + tabs.length) % tabs.length], true); }
        if (e.key === 'Home') { e.preventDefault(); activarPestana(tabs[0], true); }
        if (e.key === 'End') { e.preventDefault(); activarPestana(tabs[tabs.length - 1], true); }
      });
    });
  }

  // ------------------------------------------------------------ organizador
  async function pintarCuenta() {
    if (!yo()) return;
    const destino = $('#cuenta-datos');
    try {
      const { datos } = await api('GET', `/organizadores/${yo().id}`, { conToken: false });
      const o = { ...yo(), ...datos };
      const filas = [['Nombre', o.nombre], ['Municipio', o.municipio], ['Correo', `${o.correo} (privado: solo lo ve el dueño)`], ['Teléfono', `${o.telefono} (privado)`], ['Cuenta creada', fecha(o.creado_en)], ['Id', o.id]];
      destino.innerHTML = filas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    } catch (error) { destino.innerHTML = ''; fallo('#mensajes-borrar-cuenta', error); }
  }

  async function actualizarCuenta(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const cambios = leer(form, { soloCambios: true });
    if (!Object.keys(cambios).length) { exito(form, 'No hay cambios para guardar.'); return; }
    try {
      const { datos } = await ocupado($('button[type=submit]', form), () => api('PATCH', `/organizadores/${yo().id}`, { cuerpo: cambios }));
      guardarSesion({ ...estado.sesion, organizador: datos });
      pintarSesion();
      exito(form, `Cuenta actualizada (HTTP 200): ${Object.keys(cambios).map((c) => `<code>${esc(c)}</code>`).join(', ')}.`);
      pintarCuenta();
    } catch (error) { fallo(form, error); }
  }

  async function borrarCuenta(evento) {
    const boton = evento.currentTarget;
    if (!confirmar(boton, '¿Borrar la cuenta? Clic otra vez para confirmar')) return;
    try {
      await ocupado(boton, () => api('DELETE', `/organizadores/${yo().id}`));
      guardarSesion(null);
      pintarSesion();
      exito('#form-sesion', 'La cuenta se borró (HTTP 204). Su token ya no sirve: la próxima petición con él responde 401.');
    } catch (error) { fallo('#mensajes-borrar-cuenta', error); }
  }

  // ------------------------------------------------------------ eventos
  function pintarSelectores() {
    const opciones = estado.eventos.map((e) => `<option value="${esc(e.id)}">${esc(e.nombre)} · ${esc(ESTADO_EVENTO[e.estado] || e.estado)}</option>`).join('');
    if (!estado.eventos.some((e) => e.id === estado.eventoSeleccionado)) {
      const preferido = estado.eventos.find((e) => ['publicado', 'agotado'].includes(e.estado)) || estado.eventos[0];
      estado.eventoSeleccionado = preferido?.id || null;
    }
    for (const select of $$('[data-selector-evento]')) {
      select.innerHTML = opciones || '<option value="">Todavía no hay eventos</option>';
      if (estado.eventoSeleccionado) select.value = estado.eventoSeleccionado;
    }
  }

  function seleccionarEvento(id) {
    estado.eventoSeleccionado = id;
    almacen.guardar('apparchar.evento', id);
    $$('[data-selector-evento]').forEach((s) => { s.value = id; });
  }

  async function cargarEventos() {
    if (!yo()) return;
    try {
      const { datos, total } = await api('GET', `/organizadores/${yo().id}/eventos?por_pagina=50`);
      estado.eventos = datos;
      pintarSelectores();
      const cuerpo = $('#tabla-eventos tbody');
      if (!datos.length) {
        cuerpo.innerHTML = '<tr><td colspan="6" class="texto-secundario">Todavía no hay eventos: crear el primero con el formulario de abajo.</td></tr>';
        return;
      }
      cuerpo.innerHTML = datos.map((e) => {
        const acciones = (ACCIONES_EVENTO[e.estado] || []).map(([nuevo, texto]) => `<button class="boton boton--${nuevo === 'cancelado' ? 'peligro' : 'secundario'} boton--chico" type="button" data-accion="estado" data-estado="${nuevo}" data-id="${esc(e.id)}">${texto}</button>`);
        if (!['cancelado', 'finalizado'].includes(e.estado)) acciones.unshift(`<button class="boton boton--secundario boton--chico" type="button" data-accion="editar" data-id="${esc(e.id)}">Editar</button>`);
        if (e.estado === 'borrador') acciones.push(`<button class="boton boton--peligro boton--chico" type="button" data-accion="borrar" data-id="${esc(e.id)}">Borrar</button>`);
        return `<tr>
          <td><strong>${esc(e.nombre)}</strong><br><span class="texto-secundario">${esc(e.lugar)} · ${esc(e.municipio)} · ${e.tipos_boleta.length} tipo(s) de boleta</span></td>
          <td><span class="estado-pildora estado-pildora--${esc(e.estado)}">${esc(ESTADO_EVENTO[e.estado] || e.estado)}</span></td>
          <td>${esc(fecha(e.fecha_inicio))}</td>
          <td>${esc(e.aforo_total)}</td>
          <td>${esc(e.version)}</td>
          <td><div class="acciones-tabla">${acciones.join('') || '<span class="texto-secundario">Sin acciones</span>'}</div></td>
        </tr>`;
      }).join('');
      $('#mensajes-eventos').innerHTML = `<p class="ayuda">${esc(total ?? datos.length)} evento(s) de esta cuenta (X-Total-Count), incluidos borradores.</p>`;
    } catch (error) { fallo('#mensajes-eventos', error); }
  }

  async function accionEvento(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const ev = estado.eventos.find((e) => e.id === boton.dataset.id);
    if (!ev) return;
    const accion = boton.dataset.accion;
    try {
      if (accion === 'editar') {
        const { datos } = await api('GET', `/eventos/${ev.id}`);
        const form = $('#form-evento-editar');
        $('#editar-evento-id').textContent = datos.id.slice(0, 8) + '…';
        form.dataset.id = datos.id;
        limpiar(form);
        llenar(form, { version: datos.version, nombre: datos.nombre, lugar: datos.lugar, aforo_total: datos.aforo_total, fecha_inicio: datos.fecha_inicio, fecha_fin: datos.fecha_fin, descripcion: datos.descripcion });
        mostrarPanel('form-evento-editar');
        return;
      }
      if (accion === 'borrar') {
        if (!confirmar(boton, '¿Borrar?')) return;
        await ocupado(boton, () => api('DELETE', `/eventos/${ev.id}`));
        exito('#mensajes-eventos', `«${esc(ev.nombre)}» se borró (HTTP 204).`);
      }
      if (accion === 'estado') {
        const nuevo = boton.dataset.estado;
        if (nuevo === 'cancelado' && !confirmar(boton, '¿Cancelar? Reembolsa las compras')) return;
        const { datos } = await ocupado(boton, () => api('PATCH', `/eventos/${ev.id}`, { cuerpo: { version: ev.version, estado: nuevo } }));
        exito('#mensajes-eventos', `«${esc(datos.nombre)}» quedó <strong>${esc(ESTADO_EVENTO[datos.estado])}</strong> (HTTP 200) · versión ${datos.version}.`);
      }
      const mensaje = $('#mensajes-eventos').innerHTML;
      await cargarEventos();
      $('#mensajes-eventos').innerHTML = mensaje;
    } catch (error) { fallo('#mensajes-eventos', error); }
  }

  async function editarEvento(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const cambios = leer(form, { soloCambios: true });
    if (Object.keys(cambios).length <= 1) { exito(form, 'No hay cambios para guardar.'); return; }
    try {
      const { datos } = await ocupado($('button[type=submit]', form), () => api('PATCH', `/eventos/${form.dataset.id}`, { cuerpo: cambios }));
      llenar(form, { version: datos.version });
      form._original = crudos(form);
      exito(form, `Evento actualizado (HTTP 200) · ahora va en la versión ${datos.version}. Guardar otra vez con la versión anterior responde 409.`);
      await cargarEventos();
    } catch (error) { fallo(form, error); }
  }

  async function crearEvento(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    try {
      const { datos } = await ocupado($('button[type=submit]', form), () => api('POST', '/eventos', { cuerpo: leer(form) }));
      seleccionarEvento(datos.id);
      await cargarEventos();
      exito(form, `«${esc(datos.nombre)}» se creó en <strong>borrador</strong> (HTTP 201) · versión ${datos.version}. Siguiente paso: agregarle tipos de boleta y publicarlo.`);
      form.reset();
      llenarOpciones(form);
    } catch (error) { fallo(form, error); }
  }

  function ejemploEvento() {
    const form = $('#form-evento');
    limpiar(form);
    llenar(form, {
      nombre: 'Feria gastronómica del llano en Maní',
      categoria: 'festival',
      lugar: 'Parque principal de Maní',
      direccion: 'Calle 8 # 6-20, Maní',
      municipio: 'Maní',
      aforo_total: 300,
      fecha_inicio: aIso(enDias(10, 10)),
      fecha_fin: aIso(enDias(10, 20)),
      edad_minima: '',
      politica_reembolso: 'hasta_24h_antes',
      descripcion: 'Cocineras de todo Casanare con mamona, hayacas y pescado de río. Música en vivo toda la tarde.',
      es_gratuito: false,
    });
  }

  async function cargarCartelera(evento) {
    const destino = $('#cartelera');
    try {
      const { datos, total } = await ocupado(evento?.currentTarget, () => api('GET', '/eventos?por_pagina=10', { conToken: false }));
      destino.innerHTML = `<p class="ayuda"><strong>${esc(total)}</strong> evento(s) a la venta según <code>X-Total-Count</code>.</p>
        <ul class="lista-simple">${datos.map((e) => `<li><strong>${esc(e.nombre)}</strong> · ${esc(e.organizador.nombre)} · ${esc(fecha(e.fecha_inicio))} · ${esc(ESTADO_EVENTO[e.estado])}</li>`).join('')}</ul>`;
    } catch (error) { destino.innerHTML = '<div class="mensajes"></div>'; fallo($('.mensajes', destino), error); }
  }

  // ------------------------------------------------------------ tipos de boleta
  async function leerEventoActual() {
    if (!estado.eventoSeleccionado) { estado.eventoActual = null; return null; }
    const { datos } = await api('GET', `/eventos/${estado.eventoSeleccionado}`);
    estado.eventoActual = datos;
    return datos;
  }

  async function cargarTipos() {
    if (!yo()) return;
    if (!estado.eventos.length) await cargarEventos();
    const cuerpo = $('#tabla-tipos tbody');
    try {
      const ev = await leerEventoActual();
      if (!ev) { cuerpo.innerHTML = '<tr><td colspan="5" class="texto-secundario">Primero crear un evento en la pestaña Eventos.</td></tr>'; return; }
      const cupos = ev.tipos_boleta.reduce((s, t) => s + t.cantidad_total, 0);
      $('#mensajes-tipos').innerHTML = `<p class="ayuda">${esc(ESTADO_EVENTO[ev.estado])} · aforo ${esc(ev.aforo_total)} · cupos repartidos ${cupos} · quedan ${ev.aforo_total - cupos} por asignar.</p>`;
      cuerpo.innerHTML = ev.tipos_boleta.length ? ev.tipos_boleta.map((t) => `<tr>
          <td><strong>${esc(t.nombre)}</strong>${t.descripcion ? `<br><span class="texto-secundario">${esc(t.descripcion)}</span>` : ''}</td>
          <td>${esc(pesos(t.precio_cop))}</td>
          <td>${t.cantidad_vendida} de ${t.cantidad_total}</td>
          <td>${t.maximo_por_orden}</td>
          <td><div class="acciones-tabla">
            <button class="boton boton--secundario boton--chico" type="button" data-accion="editar" data-id="${esc(t.id)}">Editar</button>
            <button class="boton boton--peligro boton--chico" type="button" data-accion="borrar" data-id="${esc(t.id)}">Borrar</button>
          </div></td>
        </tr>`).join('') : '<tr><td colspan="5" class="texto-secundario">Este evento todavía no tiene tipos de boleta.</td></tr>';
    } catch (error) { fallo('#mensajes-tipos', error); }
  }

  async function accionTipo(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const tipo = estado.eventoActual?.tipos_boleta.find((t) => t.id === boton.dataset.id);
    if (!tipo) return;
    if (boton.dataset.accion === 'editar') {
      const form = $('#form-tipo-editar');
      form.dataset.id = tipo.id;
      $('#editar-tipo-id').textContent = tipo.id.slice(0, 8) + '…';
      limpiar(form);
      llenar(form, { nombre: tipo.nombre, precio_cop: tipo.precio_cop, cantidad_total: tipo.cantidad_total, maximo_por_orden: tipo.maximo_por_orden });
      mostrarPanel('form-tipo-editar');
      return;
    }
    if (!confirmar(boton, '¿Borrar?')) return;
    try {
      await ocupado(boton, () => api('DELETE', `/tipos-boleta/${tipo.id}`));
      await cargarTipos();
      exito('#mensajes-tipos', `El tipo «${esc(tipo.nombre)}» se borró (HTTP 204).`);
    } catch (error) { fallo('#mensajes-tipos', error); }
  }

  async function crearTipo(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    if (!estado.eventoSeleccionado) { fallo(form, new ErrorApi(0, { codigo: 'sin_evento', mensaje: 'Primero crear o elegir un evento.' })); return; }
    try {
      const { datos } = await ocupado($('button[type=submit]', form), () => api('POST', `/eventos/${estado.eventoSeleccionado}/tipos-boleta`, { cuerpo: leer(form) }));
      form.reset();
      await cargarTipos();
      exito(form, `Tipo «${esc(datos.nombre)}» creado (HTTP 201): ${esc(pesos(datos.precio_cop))} · ${datos.cantidad_total} cupos.`);
    } catch (error) { fallo(form, error); }
  }

  async function editarTipo(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const cambios = leer(form, { soloCambios: true });
    if (!Object.keys(cambios).length) { exito(form, 'No hay cambios para guardar.'); return; }
    try {
      const { datos } = await ocupado($('button[type=submit]', form), () => api('PATCH', `/tipos-boleta/${form.dataset.id}`, { cuerpo: cambios }));
      form._original = crudos(form);
      await cargarTipos();
      exito(form, `Tipo «${esc(datos.nombre)}» actualizado (HTTP 200).`);
    } catch (error) { fallo(form, error); }
  }

  function ejemploTipo() {
    const usados = new Set((estado.eventoActual?.tipos_boleta || []).map((t) => t.nombre));
    const nombre = ['Mesa VIP', 'Palco', 'Gradería', 'Preventa 2', 'Cortesía'].find((n) => !usados.has(n)) || `Zona ${usados.size + 1}`;
    const form = $('#form-tipo');
    limpiar(form);
    llenar(form, { nombre, precio_cop: estado.eventoActual?.es_gratuito ? 0 : 60000, cantidad_total: 10, maximo_por_orden: 4, descripcion: 'Ubicación preferencial con servicio a la mesa.' });
  }

  // ------------------------------------------------------------ órdenes
  async function cargarOrdenes() {
    if (!yo()) return;
    if (!estado.eventos.length) await cargarEventos();
    const cuerpo = $('#tabla-ordenes tbody');
    try {
      const ev = await leerEventoActual();
      if (!ev) { cuerpo.innerHTML = '<tr><td colspan="5" class="texto-secundario">Primero crear un evento.</td></tr>'; $('#items-orden').innerHTML = ''; return; }
      $('#items-orden').innerHTML = ev.tipos_boleta.map((t) => `<div class="campo">
          <label for="item-${esc(t.id)}">${esc(t.nombre)} · ${esc(pesos(t.precio_cop))} <span class="opcional">(quedan ${t.cantidad_total - t.cantidad_vendida}; máx. ${t.maximo_por_orden})</span></label>
          <input id="item-${esc(t.id)}" data-tipo="${esc(t.id)}" type="number" min="0" max="20" value="0" inputmode="numeric">
        </div>`).join('') || '<p class="ayuda">El evento no tiene tipos de boleta.</p>';
      const { datos, total } = await api('GET', `/eventos/${ev.id}/ordenes?por_pagina=50`);
      estado.ordenes = datos;
      $('#mensajes-ordenes').innerHTML = `<p class="ayuda">${esc(ESTADO_EVENTO[ev.estado])} · ${esc(total ?? datos.length)} orden(es) (X-Total-Count).${ev.estado !== 'publicado' ? ' Solo se compran boletas de un evento publicado.' : ''}</p>`;
      cuerpo.innerHTML = datos.length ? datos.map((o) => {
        const acciones = o.estado === 'pendiente'
          ? [['pagar', 'Pagar', 'primario'], ['editar', 'Editar', 'secundario'], ['anular', 'Anular', 'peligro']]
          : o.estado === 'pagada' ? [['boletas', 'Ver boletas', 'secundario']] : [];
        return `<tr>
          <td><strong>${esc(o.comprador_nombre)}</strong><br><span class="texto-secundario">${esc(o.comprador_correo)}</span></td>
          <td><span class="estado-pildora estado-pildora--${esc(o.estado)}">${esc(ESTADO_ORDEN[o.estado] || o.estado)}</span></td>
          <td>${esc(pesos(o.total_cop))}</td>
          <td>${o.estado === 'pagada' ? `Pagada ${esc(fecha(o.pagada_en))}` : o.estado === 'pendiente' ? `Vence ${esc(hora(o.expira_en))}` : '—'}</td>
          <td><div class="acciones-tabla">${acciones.map(([a, t, c]) => `<button class="boton boton--${c} boton--chico" type="button" data-accion="${a}" data-id="${esc(o.id)}">${t}</button>`).join('') || '<span class="texto-secundario">Sin acciones</span>'}</div></td>
        </tr>`;
      }).join('') : '<tr><td colspan="5" class="texto-secundario">Todavía no hay órdenes de este evento.</td></tr>';
    } catch (error) { fallo('#mensajes-ordenes', error); }
  }

  async function verBoletas(ordenId, boton) {
    const destino = $('#boletas-orden');
    const { datos } = await ocupado(boton, () => api('GET', `/ordenes/${ordenId}/boletas`, { conToken: false }));
    destino.innerHTML = `<h4>Boletas de la orden · GET /ordenes/{id}/boletas</h4>
      <ul class="boletas-lista">${datos.map((b) => `<li><span class="codigo boletas-lista__codigo">${esc(b.codigo)}</span> <span class="estado-pildora estado-pildora--${esc(b.estado)}">${esc(b.estado)}</span> <button class="boton boton--secundario boton--chico" type="button" data-validar="${esc(b.codigo)}">Validar en la puerta</button></li>`).join('')}</ul>`;
    destino.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function accionOrden(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const orden = estado.ordenes.find((o) => o.id === boton.dataset.id);
    if (!orden) return;
    const accion = boton.dataset.accion;
    try {
      if (accion === 'pagar') {
        $('#pago-orden-id').textContent = orden.id.slice(0, 8) + '…';
        $('#panel-pago').dataset.id = orden.id;
        $('#pago-referencia').value = `DEMO-${Date.now().toString(36).toUpperCase()}`;
        limpiar('#mensajes-pago');
        mostrarPanel('panel-pago');
      } else if (accion === 'editar') {
        const form = $('#form-orden-editar');
        form.dataset.id = orden.id;
        $('#editar-orden-id').textContent = orden.id.slice(0, 8) + '…';
        limpiar(form);
        llenar(form, { comprador_nombre: orden.comprador_nombre, comprador_correo: orden.comprador_correo, comprador_telefono: orden.comprador_telefono, medio_pago: orden.medio_pago });
        mostrarPanel('form-orden-editar');
      } else if (accion === 'anular') {
        if (!confirmar(boton, '¿Anular?')) return;
        await ocupado(boton, () => api('DELETE', `/ordenes/${orden.id}`, { conToken: false }));
        await cargarOrdenes();
        exito('#mensajes-ordenes', 'La orden se anuló (HTTP 204) y su cupo volvió a quedar disponible.');
      } else if (accion === 'boletas') {
        await verBoletas(orden.id, boton);
      }
    } catch (error) { fallo('#mensajes-ordenes', error); }
  }

  async function crearOrden(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const cuerpo = leer(form);
    cuerpo.evento_id = estado.eventoSeleccionado;
    cuerpo.items = $$('#items-orden input[data-tipo]').map((i) => ({ tipo_boleta_id: i.dataset.tipo, cantidad: Number(i.value) })).filter((i) => i.cantidad > 0);
    try {
      const { datos } = await ocupado($('button[type=submit]', form), () => api('POST', '/ordenes', { cuerpo, conToken: false }));
      await cargarOrdenes();
      exito(form, `Orden creada (HTTP 201): <strong>pendiente</strong> por ${esc(pesos(datos.total_cop))}, calculado por el servidor. El cupo queda reservado hasta las ${esc(hora(datos.expira_en))}.`);
      $('#pago-orden-id').textContent = datos.id.slice(0, 8) + '…';
      $('#panel-pago').dataset.id = datos.id;
      $('#pago-referencia').value = `DEMO-${Date.now().toString(36).toUpperCase()}`;
      limpiar('#mensajes-pago');
      $('#panel-pago').hidden = false;
    } catch (error) { fallo(form, error); }
  }

  function ejemploOrden() {
    const form = $('#form-orden');
    limpiar(form);
    llenar(form, { comprador_nombre: 'Laura Camila Rojas', comprador_correo: 'laura.rojas@ejemplo.co', comprador_telefono: '+573105550631', comprador_documento: '1118532219', medio_pago: 'nequi', autoriza_tratamiento_datos: true });
    const primero = $('#items-orden input[data-tipo]');
    if (primero) primero.value = 2;
  }

  async function editarOrden(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const cambios = leer(form, { soloCambios: true });
    if (!Object.keys(cambios).length) { exito(form, 'No hay cambios para guardar.'); return; }
    try {
      await ocupado($('button[type=submit]', form), () => api('PATCH', `/ordenes/${form.dataset.id}`, { cuerpo: cambios, conToken: false }));
      form._original = crudos(form);
      await cargarOrdenes();
      exito(form, `Orden actualizada (HTTP 200): ${Object.keys(cambios).map((c) => `<code>${esc(c)}</code>`).join(', ')}.`);
    } catch (error) { fallo(form, error); }
  }

  async function confirmarPago(evento) {
    const boton = evento.currentTarget;
    const id = $('#panel-pago').dataset.id;
    try {
      const { datos } = await ocupado(boton, () => api('POST', `/ordenes/${id}/pago`, {
        cuerpo: { referencia_pago: $('#pago-referencia').value.trim() },
        conToken: false,
        cabeceras: { 'X-Clave-Pasarela': $('#pago-clave').value },
      }));
      exito('#mensajes-pago', `Pago confirmado (HTTP 200): la orden quedó <strong>pagada</strong> y el servidor emitió sus boletas.`);
      await cargarOrdenes();
      await verBoletas(datos.id);
    } catch (error) { fallo('#mensajes-pago', error); }
  }

  // ------------------------------------------------------------ puerta
  async function cargarLecturas() {
    if (!yo()) return;
    if (!estado.eventos.length) await cargarEventos();
    const cuerpo = $('#tabla-lecturas tbody');
    if (!estado.eventoSeleccionado) { cuerpo.innerHTML = '<tr><td colspan="4" class="texto-secundario">Primero crear un evento.</td></tr>'; return; }
    try {
      const { datos } = await api('GET', `/eventos/${estado.eventoSeleccionado}/validaciones?por_pagina=50`);
      cuerpo.innerHTML = datos.length ? datos.map((v) => `<tr>
          <td>${esc(hora(v.validada_en))}</td>
          <td class="codigo">${esc(v.codigo_leido)}</td>
          <td><span class="estado-pildora estado-pildora--${esc(v.resultado)}">${v.resultado === 'aceptada' ? 'Aceptada' : `Rechazada: ${esc(MOTIVO[v.motivo] || v.motivo)}`}</span></td>
          <td>${esc(v.puerta)}</td>
        </tr>`).join('') : '<tr><td colspan="4" class="texto-secundario">Todavía no hay lecturas en este evento.</td></tr>';
    } catch (error) { cuerpo.innerHTML = ''; fallo('#form-puerta', error); }
  }

  async function validarBoleta(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const datos = leer(form);
    const resultado = $('#resultado-puerta');
    resultado.innerHTML = '';
    try {
      const { datos: v } = await ocupado($('button[type=submit]', form), () => api('POST', `/eventos/${estado.eventoSeleccionado}/validaciones`, {
        cuerpo: { codigo_leido: datos.codigo_leido ?? '', puerta: datos.puerta || 'Principal', validada_por: yo().nombre },
      }));
      limpiar(form);
      const ok = v.resultado === 'aceptada';
      resultado.innerHTML = `<div class="veredicto veredicto--${ok ? 'aceptada' : 'rechazada'}" role="status">
        <p class="veredicto__titulo">${ok ? 'Puede entrar' : 'No puede entrar'}</p>
        <p class="mb-0">${ok ? 'Boleta válida: quedó marcada como usada.' : `Rechazada porque ${esc(MOTIVO[v.motivo] || v.motivo)}.`} <span class="codigo">${esc(v.codigo_leido)}</span> · HTTP 201</p>
      </div>`;
      await cargarLecturas();
    } catch (error) { fallo(form, error); }
  }

  // ------------------------------------------------------------ pruebas de seguridad y validación
  async function eventoPropioEditable() {
    if (!estado.eventos.length) await cargarEventos();
    const ev = estado.eventos.find((e) => ['borrador', 'publicado', 'pausado'].includes(e.estado));
    if (!ev) throw new PruebaOmitida('Se necesita un evento propio en borrador, publicado o pausado.');
    return (await api('GET', `/eventos/${ev.id}`)).datos;
  }

  const PRUEBAS = [
    {
      titulo: 'Editar la cuenta sin enviar el token', ruta: 'PATCH /organizadores/{id}', espera: 401,
      correr: () => api('PATCH', `/organizadores/${yo().id}`, { cuerpo: { nombre: yo().nombre }, conToken: false, prueba: true }),
    },
    {
      titulo: 'Usar un token con la firma alterada', ruta: 'PATCH /organizadores/{id}', espera: 401,
      correr: () => {
        const [a, b, firma] = estado.sesion.token.split('.');
        const alterada = (firma[0] === 'A' ? 'B' : 'A') + firma.slice(1);
        return api('PATCH', `/organizadores/${yo().id}`, { cuerpo: { nombre: yo().nombre }, token: `${a}.${b}.${alterada}`, prueba: true });
      },
    },
    {
      titulo: 'Editar un evento de otro organizador', ruta: 'PATCH /eventos/{id}', espera: 403,
      correr: async () => {
        const { datos } = await api('GET', '/eventos?por_pagina=50', { conToken: false });
        const ajeno = datos.find((e) => e.organizador_id !== yo().id);
        if (!ajeno) throw new PruebaOmitida('La cartelera no tiene eventos de otro organizador (npm run demo crea uno).');
        return api('PATCH', `/eventos/${ajeno.id}`, { cuerpo: { version: ajeno.version, nombre: ajeno.nombre }, prueba: true });
      },
    },
    {
      titulo: 'Registrar un organizador con datos inválidos', ruta: 'POST /organizadores', espera: 400,
      correr: () => api('POST', '/organizadores', { cuerpo: { nombre: 'Yo', correo: 'x', telefono: '3105550148', municipio: 'Mani' }, conToken: false, prueba: true }),
    },
    {
      titulo: 'Guardar un evento con una versión que no es la actual', ruta: 'PATCH /eventos/{id}', espera: 409,
      correr: async () => {
        const ev = await eventoPropioEditable();
        return api('PATCH', `/eventos/${ev.id}`, { cuerpo: { version: ev.version > 1 ? ev.version - 1 : ev.version + 1, nombre: ev.nombre }, prueba: true });
      },
    },
    {
      titulo: 'Crear un tipo de boleta que supera el aforo', ruta: 'POST /eventos/{id}/tipos-boleta', espera: 422,
      correr: async () => {
        const ev = await eventoPropioEditable();
        return api('POST', `/eventos/${ev.id}/tipos-boleta`, { cuerpo: { nombre: `Prueba de aforo ${Date.now() % 100000}`, precio_cop: ev.es_gratuito ? 0 : 10000, cantidad_total: Math.min(ev.aforo_total + 1, 100000) }, prueba: true });
      },
    },
  ];

  function pintarPruebas() {
    const lista = $('#lista-pruebas');
    if (lista.children.length) return;
    lista.innerHTML = PRUEBAS.map((p, i) => `<li class="prueba" data-indice="${i}">
        <div class="prueba__texto"><strong>${esc(p.titulo)}</strong><span class="texto-secundario"><code>${esc(p.ruta)}</code> · se espera HTTP ${p.espera}</span></div>
        <span class="prueba__resultado" aria-live="polite">Sin ejecutar</span>
        <button class="boton boton--secundario boton--chico" type="button" data-prueba="${i}">Ejecutar</button>
      </li>`).join('');
  }

  async function correrPrueba(i) {
    const prueba = PRUEBAS[i];
    const fila = $(`.prueba[data-indice="${i}"]`);
    const salida = $('.prueba__resultado', fila);
    fila.className = 'prueba';
    salida.textContent = 'Ejecutando…';
    let status;
    let codigo = '';
    try {
      const r = await prueba.correr();
      status = r.status;
    } catch (error) {
      if (error instanceof PruebaOmitida) { fila.classList.add('prueba--omitida'); salida.textContent = error.message; return; }
      status = error.status;
      codigo = error.cuerpo?.codigo || '';
    }
    const bien = status === prueba.espera;
    fila.classList.add(bien ? 'prueba--bien' : 'prueba--mal');
    salida.innerHTML = bien
      ? `✓ HTTP ${status}${codigo ? ` · <code>${esc(codigo)}</code>` : ''}`
      : `✗ Se esperaba ${prueba.espera} y llegó ${status || 'sin respuesta'}${codigo ? ` · <code>${esc(codigo)}</code>` : ''}`;
  }

  // ------------------------------------------------------------ arranque
  function conectar() {
    const caja = $('#conexion');
    detectarApi().then((r) => {
      if (!r) {
        caja.className = 'conexion conexion--error';
        $('#conexion-texto').innerHTML = 'No se encontró la API. En la carpeta del proyecto, ejecutar <code>npm run demo</code> y recargar esta página (<code>http://localhost:3000/</code>).';
        return;
      }
      estado.base = r.base;
      caja.className = 'conexion conexion--ok';
      $('#conexion-texto').innerHTML = `Conectado a la API en <code>${esc(r.base)}</code> · base de datos ${r.motor === 'postgresql' ? 'PostgreSQL' : 'PostgreSQL embebido (PGlite)'} · <a href="${esc(r.base)}/docs" target="_blank" rel="noopener">Swagger UI</a>`;
      $('#enlace-docs').href = `${r.base}/docs`;
      if (estado.sesion) {
        // El token guardado se comprueba con una ruta protegida; si no sirve, se pide iniciar sesión.
        api('GET', `/organizadores/${yo().id}/eventos?por_pagina=50`).then(() => {
          const guardada = almacen.leer('apparchar.pestana');
          activarPestana(document.getElementById(guardada) || $('#tab-cuenta'));
        }).catch(() => {});
      }
    });
  }

  function iniciar() {
    llenarOpciones();
    prepararPestanas();
    pintarSesion();

    $('#form-sesion').addEventListener('submit', iniciarSesion);
    $('#form-registro').addEventListener('submit', registrarse);
    $('#usar-demo').addEventListener('click', () => { $('#sesion-correo').value = 'demo@apparchar.co'; $('#sesion-clave').value = 'Apparchar2026'; $('#form-sesion').requestSubmit(); });
    $('#cerrar-sesion').addEventListener('click', cerrarSesion);

    $('#leer-cuenta').addEventListener('click', pintarCuenta);
    $('#form-cuenta').addEventListener('submit', actualizarCuenta);
    $('#borrar-cuenta').addEventListener('click', borrarCuenta);

    $('#leer-eventos').addEventListener('click', cargarEventos);
    $('#tabla-eventos').addEventListener('click', accionEvento);
    $('#form-evento').addEventListener('submit', crearEvento);
    $('#form-evento-editar').addEventListener('submit', editarEvento);
    $('#ejemplo-evento').addEventListener('click', ejemploEvento);
    $('#leer-cartelera').addEventListener('click', cargarCartelera);

    $('#tabla-tipos').addEventListener('click', accionTipo);
    $('#form-tipo').addEventListener('submit', crearTipo);
    $('#form-tipo-editar').addEventListener('submit', editarTipo);
    $('#ejemplo-tipo').addEventListener('click', ejemploTipo);

    $('#tabla-ordenes').addEventListener('click', accionOrden);
    $('#form-orden').addEventListener('submit', crearOrden);
    $('#form-orden-editar').addEventListener('submit', editarOrden);
    $('#ejemplo-orden').addEventListener('click', ejemploOrden);
    $('#confirmar-pago').addEventListener('click', confirmarPago);
    $('#boletas-orden').addEventListener('click', (e) => {
      const b = e.target.closest('[data-validar]');
      if (!b) return;
      $('#pu-codigo').value = b.dataset.validar;
      activarPestana($('#tab-puerta'), true);
      $('#pu-codigo').focus();
    });

    $('#form-puerta').addEventListener('submit', validarBoleta);
    $('#leer-lecturas').addEventListener('click', cargarLecturas);

    $('#lista-pruebas').addEventListener('click', (e) => { const b = e.target.closest('[data-prueba]'); if (b) ocupado(b, () => correrPrueba(Number(b.dataset.prueba))); });
    $('#correr-pruebas').addEventListener('click', (e) => ocupado(e.currentTarget, async () => { pintarPruebas(); for (let i = 0; i < PRUEBAS.length; i += 1) await correrPrueba(i); }));

    for (const select of $$('[data-selector-evento]')) {
      select.addEventListener('change', () => {
        seleccionarEvento(select.value);
        const activa = $('[role=tab][aria-selected=true]');
        activarPestana(activa);
      });
    }
    for (const boton of $$('[data-cerrar]')) boton.addEventListener('click', () => { document.getElementById(boton.dataset.cerrar).hidden = true; });
    $('#limpiar-bitacora').addEventListener('click', () => $('#lista-bitacora').replaceChildren());

    conectar();
    // Desde el botón «Iniciar sesión» de la cabecera (panel.html#ingresar) se llega al formulario.
    if (location.hash === '#ingresar' && !estado.sesion) {
      $('#form-sesion').scrollIntoView({ block: 'start' });
      $('#sesion-correo').focus();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
