# Evidencias de la Entrega 2

Capturas y salidas de las verificaciones que pide el enunciado. Se generaron el
30 de septiembre de 2026 sobre la versión 0.2.0.

Las del prototipo se tomaron con el prototipo servido en local (`npm run web`).
Al publicarlo en GitHub Pages hay que repetir Lighthouse sobre la URL pública y
agregar esa captura aquí.

| Archivo | Qué muestra | Requisito |
|---|---|---|
| [`lighthouse-accesibilidad.png`](lighthouse-accesibilidad.png) | Lighthouse 13, categoría Accesibilidad: 100 en la cartelera y el detalle (móvil) y en publicar y la puerta (escritorio). Las 16 corridas (8 URL en móvil y escritorio) dieron 100. | §2.2 Accesibilidad medida |
| [`lighthouse-resumen.txt`](lighthouse-resumen.txt) | El puntaje de las 16 corridas, página por página. | §2.2 Accesibilidad medida |
| [`responsivo-360.png`](responsivo-360.png) | Cartelera, detalle y publicar a 360 px de ancho, sin barra horizontal. | §2.2 Diseño responsivo |
| [`zoom-200.png`](zoom-200.png) | Cartelera con zoom al 200 % (1280 px de ventana = 640 px CSS). | §2.2 Diseño responsivo |
| [`teclado-foco.png`](teclado-foco.png) | Foco visible al recorrer con Tab: una tarjeta de la cartelera y un campo del formulario de compra. | §2.2 Navegación por teclado |
| [`estados.png`](estados.png) | Los tres estados de la cartelera: cargando, vacío y error. | §2.1 Estado excepcional |
| [`compra-errores.png`](compra-errores.png) | Formulario de compra enviado vacío: resumen de errores enfocado y mensajes con texto e ícono. | §2.2 Formulario accesible |
| [`puerta.png`](puerta.png) | Validación en la puerta: primera lectura aceptada; la segunda del mismo código se rechaza por doble ingreso. | §2.1 Detalle o formulario |
| [`contrato-swagger-editor.png`](contrato-swagger-editor.png) | El contrato cargado en el Swagger Editor oficial (editor.swagger.io, v5): insignia OAS 3.1 y panel de validación vacío. | §4 Validación |
| [`contrato-validacion.png`](contrato-validacion.png) | `npm run validar:api` (Redocly), Spectral y swagger-parser sin errores ni advertencias. | §4 Validación |
| [`mock-prism.png`](mock-prism.png) | `npm run mock` (Prism) respondiendo: 200, 401, 404 con `Prefer` y 201. | §4 Servidor simulado |
| [`coherencia.txt`](coherencia.txt) | `npm run verificar`: modelo, contrato, datos de ejemplo y formularios sin diferencias. | §5 y §9 Coherencia |
| [`modelo-postgresql.txt`](modelo-postgresql.txt) | `npm run probar:modelo`: el DDL aplicado en PostgreSQL 17 y 44 comprobaciones de sus restricciones. | §5 Modelo de datos |
| [`readme-seguido.txt`](readme-seguido.txt) | Los pasos del README seguidos al pie de la letra en un clon limpio. | §9 Lista de verificación |
