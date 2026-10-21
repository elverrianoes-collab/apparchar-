# README seguido al pie de la letra en un clon limpio (carpeta nueva, sin node_modules)
# Fecha: 2026-09-30 21:10 (hora de Colombia) · script de prueba externo al repositorio

## Requisitos
   git 2.48.1 · node v20.19.5 · npm 10.8.2

## 1. git clone <URL-del-repositorio> apparchar && cd apparchar
   ✔ clonado en <carpeta nueva>/apparchar

## 2. npm ci
   ✔ npm ci: added 266 packages in 8s

## 3. npm run web → http://localhost:8080
   ✔ GET / → 200
   ✔ GET /index.html → 200
   ✔ GET /detalle.html → 200
   ✔ GET /publicar.html → 200
   ✔ GET /puerta.html → 200
   ✔ GET /css/estilos.css → 200
   ✔ GET /js/app.js → 200
   ✔ GET /datos/ejemplo.json → 200
   ✔ GET /img/favicon.svg → 200
   ✔ GET /detalle.html?evento=noche-de-rock-llanero-sabana-electrica-en-vivo-2026-7d40 → 200
   ✔ GET /index.html?simular=vacio → 200

## 3b. Alternativa sin Node: python3 -m http.server 8080 --directory web
   ✔ python http.server → 200 (probado en 8088)

## 4. npm run mock → http://127.0.0.1:4010
   ✔ Prefer: example=yopal_conciertos, GET /eventos?municipio=Yopal&categoria=concierto → 200 ([{"id":"29f5422e-4b0e-4ff2-a6d7-eab5062461cb","organizador_id":"6aae0922-48db-4e01-9668-4b…)
   ✔ Prefer: code=404 → 404 ({"codigo":"evento_no_encontrado","mensaje":"No encontramos ese evento."})
   ✔ POST /eventos sin token → 401
   · POST /eventos con token y cuerpo vacío → 422 ({"codigo":"fechas_incoherentes","mensaje":"La hora de cierre (16 de enero, 7:30 p. m.) debe ser posterior a la de inicio (16 de enero, 8:00 p. m.).","detalles":)
   ✔ POST /ordenes/…/pago con X-Clave-Pasarela → 200 ({"id":"be8a62aa-a0e5-4bbd-be4b-74ab09a9d89a","evento_id":"2e4c1c1d-d769-4047-9880-c8295fa22263","comprador_nom…)
   ✔ POST /ordenes/…/pago sin la clave → 401

## 5. npm run validar:api
   ✔ validating api/openapi.yaml... api/openapi.yaml: validated in 791ms Woohoo! Your API description is valid. 🎉 

## 6. npm run verificar
   ✔ OK: modelo, contrato, datos de ejemplo y formularios son coherentes.

## 7. (opcional) npm run probar:modelo contra un PostgreSQL 17 desechable
   (en vez de Docker: clúster local desechable en un socket propio; el comando es el mismo)
   ✔ RESULTADO: 44 comprobaciones, todas correctas.

RESULTADO: el README se siguió de principio a fin sin ayuda y todos los pasos funcionaron.
