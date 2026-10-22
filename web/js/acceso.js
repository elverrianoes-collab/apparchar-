/* Botón «Iniciar sesión» de la cabecera. Lleva al panel del organizador; si en
   esta pestaña ya hay una sesión abierta (la guarda el panel), dice «Mi panel»
   con el nombre del organizador. */
(() => {
  'use strict';
  let sesion = null;
  try { sesion = JSON.parse(sessionStorage.getItem('apparchar.sesion')); } catch { /* sin almacenamiento */ }
  if (!sesion?.organizador || new Date(sesion.expira_en) <= new Date()) return;
  for (const enlace of document.querySelectorAll('[data-acceso]')) {
    enlace.href = 'panel.html';
    enlace.title = `Sesión iniciada: ${sesion.organizador.nombre}`;
    const texto = enlace.querySelector('[data-acceso-texto]');
    if (texto) texto.textContent = 'Mi panel';
  }
})();
