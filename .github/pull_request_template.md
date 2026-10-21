## Qué cambia y por qué

<!-- Dos o tres líneas. Enlaza la tarea del tablero: «Cierra #12». -->

## Cómo se probó

<!-- Pasos para que quien revisa lo compruebe en su máquina. -->

## Lista de revisión

- [ ] La revisión automática del PR pasa (contrato válido; modelo, contrato, datos y formularios coherentes; pruebas del backend en verde). En local, `npm run revisar` también pasa.
- [ ] Si cambió una ruta del backend: el contrato (`api/openapi.yaml`) dice lo mismo y hay una prueba en `pruebas/` que la recorre con `cumpleContrato`.
- [ ] Si cambió un campo: está igual en `docs/modelo-datos.md`, `api/openapi.yaml`, `web/datos/ejemplo.json` y el formulario.
- [ ] Si cambió `web/`: se recorrió con la tecla Tab, se probó a 360 px y con zoom al 200 %, y Lighthouse de accesibilidad sigue en 90 o más.
- [ ] No hay `.env`, tokens ni contraseñas en el cambio.
- [ ] Lo revisó al menos otra persona del equipo.
