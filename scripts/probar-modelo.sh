#!/usr/bin/env bash
# Aplica el DDL de docs/modelo-datos.md en una base PostgreSQL 17 nueva y prueba
# sus restricciones: sobreventa, doble ingreso, boletas de un tipo no comprado,
# pagos repetidos, estados incoherentes, datos inválidos y búsqueda sin tildes.
#
# Uso:  DATABASE_URL=postgres://postgres@localhost:5433/postgres scripts/probar-modelo.sh
#
# DATABASE_URL apunta a un servidor donde el usuario puede crear bases de datos. El
# script crea una base temporal, corre las pruebas y la borra al terminar. Con
# Docker, un servidor desechable se levanta así:
#   docker run --rm -d --name apparchar-pg -p 5433:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
set -euo pipefail
: "${DATABASE_URL:?Define DATABASE_URL (ver la cabecera del script)}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
MD="$RAIZ/docs/modelo-datos.md"
TMP="$(mktemp -d)"
BASE="apparchar_prueba_$$"
ADMIN=(psql -X -q "$DATABASE_URL" -v ON_ERROR_STOP=1)
# Misma conexión, otra base de datos: reemplaza la ruta /<base> de la URL.
URL_PRUEBA="$(printf '%s' "$DATABASE_URL" | sed -E "s#^([a-z]+://[^/?]*)/?[^?]*#\\1/$BASE#")"
PSQL=(psql -X -q "$URL_PRUEBA" -v ON_ERROR_STOP=1)
trap '"${ADMIN[@]}" -c "DROP DATABASE IF EXISTS $BASE" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

"${ADMIN[@]}" -c "CREATE DATABASE $BASE" >/dev/null
awk '/^```sql$/{f=1;next} /^```$/{if(f){exit}} f' "$MD" > "$TMP/ddl.sql"
echo "PostgreSQL $("${PSQL[@]}" -tA -c 'SHOW server_version')"
echo "DDL: $(grep -c 'CREATE TABLE' "$TMP/ddl.sql") tablas, $(grep -c 'CREATE TYPE' "$TMP/ddl.sql") tipos, $(grep -c 'CREATE .*INDEX' "$TMP/ddl.sql") índices declarados"
"${PSQL[@]}" -f "$TMP/ddl.sql"
echo "DDL aplicado sin errores."

OK=0
esperar_error () { # $1 descripción, $2 sql que debe fallar
  if "${PSQL[@]}" -c "$2" >/dev/null 2>"$TMP/err"; then echo "FALLA (debió rechazarse): $1"; exit 1; fi
  echo "ok  rechaza: $1 → $(grep -m1 ERROR "$TMP/err" | sed 's/^.*ERROR: *//' | cut -c1-170)"; OK=$((OK+1))
}
esperar_ok () { # $1 descripción, $2 sql que debe funcionar
  if ! "${PSQL[@]}" -c "$2" >/dev/null 2>"$TMP/err"; then echo "FALLA (debió aceptarse): $1 → $(cat "$TMP/err")"; exit 1; fi
  echo "ok  acepta: $1"; OK=$((OK+1))
}
valor () { "${PSQL[@]}" -tA -c "$1"; }
comprobar () { # $1 descripción, $2 condición verdadera
  if [ "$2" = verdadero ]; then echo "ok  $1"; OK=$((OK+1)); else echo "FALLA $1"; exit 1; fi
}
si () { if eval "$1"; then echo verdadero; else echo falso; fi; }

# Hash bcrypt de ejemplo (60 caracteres): la base guarda el hash, nunca la clave (D-23).
H='$2b$10$CwTycUXWue0Thq9StjUM0uJ8Z5M5lV3cZ1u5d7QhYb5e8YJ7m1wDe'
O=00000000-0000-4000-8000-000000000001 E=00000000-0000-4000-8000-000000000010 T=00000000-0000-4000-8000-000000000020
V=00000000-0000-4000-8000-000000000021 R=00000000-0000-4000-8000-000000000030 B=00000000-0000-4000-8000-000000000040

# Organizador
esperar_ok "organizador válido" "INSERT INTO organizador (id,nombre,correo,telefono,municipio,clave_hash) VALUES ('$O','Colectivo Sabana Rock','colectivo.sabanarock@example.com','+573105550148','Yopal','$H')"
esperar_error "correo repetido" "INSERT INTO organizador (nombre,correo,telefono,municipio,clave_hash) VALUES ('Otro','colectivo.sabanarock@example.com','+573105550149','Yopal','$H')"
esperar_error "teléfono no colombiano" "INSERT INTO organizador (nombre,correo,telefono,municipio,clave_hash) VALUES ('Otro','otro@example.com','3105550148','Yopal','$H')"
esperar_error "municipio fuera del dominio de Casanare" "INSERT INTO organizador (nombre,correo,telefono,municipio,clave_hash) VALUES ('Otro','otro2@example.com','+573105550150','Yopall','$H')"
esperar_error "correo de menos de 6 caracteres" "INSERT INTO organizador (nombre,correo,telefono,municipio,clave_hash) VALUES ('Otro','a@b.c','+573105550151','Yopal','$H')"
esperar_ok "teléfono fijo de Casanare (608)" "INSERT INTO organizador (nombre,correo,telefono,municipio,clave_hash) VALUES ('Red Agro','redagro@example.com','+576085550412','Yopal','$H')"
# Evento
esperar_ok "evento válido" "INSERT INTO evento (id,organizador_id,nombre,slug,descripcion,categoria,lugar,direccion,municipio,fecha_inicio,fecha_fin,aforo_total,edad_minima) VALUES ('$E','$O','Noche de rock llanero','noche-de-rock-llanero-2026-7d40','Sabana Eléctrica presenta su nuevo sencillo en vivo.','concierto','Bar La Tranquera','Carrera 23 # 12-40','Yopal','2030-10-03T21:00:00-05:00','2030-10-04T02:00:00-05:00',300,18)"
esperar_error "fecha_fin anterior a fecha_inicio" "INSERT INTO evento (organizador_id,nombre,slug,descripcion,categoria,lugar,direccion,municipio,fecha_inicio,fecha_fin,aforo_total) VALUES ('$O','Evento','evento-x-2026-aaaa','Descripción de más de veinte caracteres.','fiesta','Salón','Calle 1 # 2-3','Yopal','2030-10-03T21:00:00-05:00','2030-10-03T20:00:00-05:00',100)"
esperar_error "slug con mayúsculas" "INSERT INTO evento (organizador_id,nombre,slug,descripcion,categoria,lugar,direccion,municipio,fecha_inicio,fecha_fin,aforo_total) VALUES ('$O','Evento','Evento-X','Descripción de más de veinte caracteres.','fiesta','Salón','Calle 1 # 2-3','Yopal','2030-10-03T21:00:00-05:00','2030-10-03T23:00:00-05:00',100)"
esperar_error "categoría fuera del dominio" "INSERT INTO evento (organizador_id,nombre,slug,descripcion,categoria,lugar,direccion,municipio,fecha_inicio,fecha_fin,aforo_total) VALUES ('$O','Evento','evento-y-2026-aaaa','Descripción de más de veinte caracteres.','coleo','Salón','Calle 1 # 2-3','Yopal','2030-10-03T21:00:00-05:00','2030-10-03T23:00:00-05:00',100)"
# Tipo de boleta y reserva de cupo
esperar_ok "tipo de boleta con 2 cupos (venta_inicia_en por defecto)" "INSERT INTO tipo_boleta (id,evento_id,nombre,precio_cop,cantidad_total,venta_termina_en) VALUES ('$T','$E','General',35000,2,'2030-10-03T22:00:00-05:00')"
esperar_error "nombre de tipo repetido en el evento" "INSERT INTO tipo_boleta (evento_id,nombre,precio_cop,cantidad_total,venta_inicia_en,venta_termina_en) VALUES ('$E','General',1,1,'2030-09-01T10:00:00-05:00','2030-10-03T22:00:00-05:00')"
R1=$(valor "WITH r AS (UPDATE tipo_boleta SET cantidad_vendida = cantidad_vendida + 2 WHERE id='$T' AND cantidad_vendida + 2 <= cantidad_total RETURNING 1) SELECT count(*) FROM r")
R2=$(valor "WITH r AS (UPDATE tipo_boleta SET cantidad_vendida = cantidad_vendida + 1 WHERE id='$T' AND cantidad_vendida + 1 <= cantidad_total RETURNING 1) SELECT count(*) FROM r")
comprobar "reserva condicional: 2 de 2 reservadas; la siguiente no actualiza filas (→ 409)" "$(si "[ $R1 = 1 ] && [ $R2 = 0 ]")"
esperar_error "sobreventa directa (CHECK de cupo)" "UPDATE tipo_boleta SET cantidad_vendida = 3 WHERE id='$T'"
# Órdenes
esperar_error "orden sin autorización de datos" "INSERT INTO orden (evento_id,comprador_nombre,comprador_correo,comprador_telefono,medio_pago,autoriza_tratamiento_datos,total_cop) VALUES ('$E','Laura Rojas','laura@example.com','+573105550631','nequi',false,35000)"
esperar_error "orden paga sin medio de pago" "INSERT INTO orden (evento_id,comprador_nombre,comprador_correo,comprador_telefono,autoriza_tratamiento_datos,total_cop) VALUES ('$E','Laura Rojas','laura@example.com','+573105550631',true,35000)"
esperar_ok "orden gratuita sin medio de pago" "INSERT INTO orden (evento_id,comprador_nombre,comprador_correo,comprador_telefono,autoriza_tratamiento_datos,total_cop) VALUES ('$E','Laura Rojas','laura@example.com','+573105550631',true,0)"
esperar_error "orden pendiente con pagada_en" "INSERT INTO orden (evento_id,comprador_nombre,comprador_correo,comprador_telefono,medio_pago,autoriza_tratamiento_datos,total_cop,pagada_en) VALUES ('$E','Laura Rojas','laura@example.com','+573105550631','pse',true,70000,now())"
esperar_error "orden pagada sin referencia de pago" "INSERT INTO orden (evento_id,comprador_nombre,comprador_correo,comprador_telefono,medio_pago,autoriza_tratamiento_datos,total_cop,estado,pagada_en) VALUES ('$E','Laura Rojas','laura@example.com','+573105550631','nequi',true,70000,'pagada',now())"
esperar_ok "orden pagada con referencia de pago" "INSERT INTO orden (id,evento_id,comprador_nombre,comprador_correo,comprador_telefono,comprador_documento,medio_pago,autoriza_tratamiento_datos,total_cop,estado,pagada_en,referencia_pago) VALUES ('$R','$E','Laura Camila Rojas','lauracamila.rojas@example.com','+573105550631','1118532219','nequi',true,70000,'pagada',now(),'NEQUI-20260902-194406')"
comprobar "expira_en por defecto: creado_en + 15 minutos" "$(si "[ $(valor "SELECT (expira_en - creado_en) = interval '15 minutes' FROM orden WHERE id='$R'") = t ]")"
esperar_error "misma referencia de pago en otra orden" "INSERT INTO orden (evento_id,comprador_nombre,comprador_correo,comprador_telefono,medio_pago,autoriza_tratamiento_datos,total_cop,estado,pagada_en,referencia_pago) VALUES ('$E','Juan David Chaparro','juandavid@example.com','+573125550287','pse',true,35000,'pagada',now(),'NEQUI-20260902-194406')"
esperar_error "orden que expira antes de crearse" "INSERT INTO orden (evento_id,comprador_nombre,comprador_correo,comprador_telefono,medio_pago,autoriza_tratamiento_datos,total_cop,expira_en) VALUES ('$E','Juan David Chaparro','juandavid@example.com','+573125550287','pse',true,35000,now() - interval '1 minute')"
esperar_ok "ítem de orden" "INSERT INTO item_orden (orden_id,tipo_boleta_id,cantidad,precio_unitario_cop) VALUES ('$R','$T',2,35000)"
esperar_error "tipo repetido en la misma orden" "INSERT INTO item_orden (orden_id,tipo_boleta_id,cantidad,precio_unitario_cop) VALUES ('$R','$T',1,35000)"
# Boletas
esperar_ok "boleta válida" "INSERT INTO boleta (id,orden_id,tipo_boleta_id,codigo,titular_nombre) VALUES ('$B','$R','$T','956T-X8KV-CHV3','Laura Camila Rojas')"
esperar_ok "tipo VIP que la orden no compró" "INSERT INTO tipo_boleta (id,evento_id,nombre,precio_cop,cantidad_total,venta_termina_en) VALUES ('$V','$E','VIP',60000,10,'2030-10-03T20:00:00-05:00')"
esperar_error "boleta de un tipo que su orden no compró (FK compuesta)" "INSERT INTO boleta (orden_id,tipo_boleta_id,codigo,titular_nombre) VALUES ('$R','$V','K7M2-9QXD-H4TP','Laura Camila Rojas')"
esperar_error "código con letra ambigua (O)" "INSERT INTO boleta (orden_id,tipo_boleta_id,codigo,titular_nombre) VALUES ('$R','$T','956T-X8KV-CHO3','Laura Camila Rojas')"
esperar_error "código repetido" "INSERT INTO boleta (orden_id,tipo_boleta_id,codigo,titular_nombre) VALUES ('$R','$T','956T-X8KV-CHV3','Laura Camila Rojas')"
esperar_error "boleta usada sin usada_en" "UPDATE boleta SET estado='usada' WHERE id='$B'"
# Validaciones en la puerta
esperar_ok "primera validación aceptada" "INSERT INTO validacion (evento_id,boleta_id,codigo_leido,resultado,validada_por) VALUES ('$E','$B','956T-X8KV-CHV3','aceptada','Carlos Pérez')"
esperar_error "segunda validación aceptada de la misma boleta" "INSERT INTO validacion (evento_id,boleta_id,codigo_leido,resultado,validada_por) VALUES ('$E','$B','956T-X8KV-CHV3','aceptada','Diana Mesa')"
esperar_ok "reintento registrado como rechazo ya_usada" "INSERT INTO validacion (evento_id,boleta_id,codigo_leido,resultado,motivo,validada_por) VALUES ('$E','$B','956T-X8KV-CHV3','rechazada','ya_usada','Diana Mesa')"
esperar_error "rechazo sin motivo" "INSERT INTO validacion (evento_id,codigo_leido,resultado,validada_por) VALUES ('$E','XXXX','rechazada','Diana Mesa')"
esperar_error "no_existe con boleta" "INSERT INTO validacion (evento_id,boleta_id,codigo_leido,resultado,motivo,validada_por) VALUES ('$E','$B','956T-X8KV-CHV3','rechazada','no_existe','Diana Mesa')"
esperar_ok "código inexistente registrado" "INSERT INTO validacion (evento_id,codigo_leido,resultado,motivo,validada_por) VALUES ('$E','7K4P-QX2M-RT8W','rechazada','no_existe','Diana Mesa')"
# Campos de control, slug e índices
comprobar "disparador: version 1 → 2 y actualizado_en tocado" "$(si "[ $(valor "UPDATE evento SET nombre='Noche de rock llanero: Sabana Eléctrica' WHERE id='$E' AND version=1 RETURNING version") = 2 ]")"
comprobar "bloqueo optimista: una edición con version=1 ya no actualiza filas (→ 409)" "$(si "[ $(valor "WITH r AS (UPDATE evento SET nombre='Edición vieja' WHERE id='$E' AND version=1 RETURNING 1) SELECT count(*) FROM r") = 0 ]")"
esperar_error "cambiar el slug de un evento (inmutable)" "UPDATE evento SET slug='otro-slug-2026-0000' WHERE id='$E'"
esperar_ok "evento para la búsqueda" "INSERT INTO evento (organizador_id,nombre,slug,descripcion,categoria,lugar,direccion,municipio,fecha_inicio,fecha_fin,aforo_total) VALUES ('$O','La leyenda del Silbón','la-leyenda-del-silbon-2026-9a1b','Teatro con títeres para toda la familia en Yopal.','teatro','Teatrino El Morichal','Calle 20 # 25-12','Yopal','2030-10-31T19:00:00-05:00','2030-10-31T20:30:00-05:00',180)"
Q=$(valor "SELECT nombre FROM evento WHERE f_unaccent(lower(nombre || ' ' || lugar)) LIKE '%' || f_unaccent(lower('SILBON')) || '%'")
comprobar "búsqueda sin mayúsculas ni tildes: «SILBON» encuentra «$Q»" "$(si "[ \"$Q\" = 'La leyenda del Silbón' ]")"
PLAN=$(valor "SET enable_seqscan = off; EXPLAIN SELECT id FROM evento WHERE f_unaccent(lower(nombre || ' ' || lugar)) LIKE '%silbon%'" | tr '\n' ' ')
comprobar "la búsqueda usa el índice de trigramas evento_busqueda_idx" "$(si "echo \"$PLAN\" | grep -q evento_busqueda_idx")"
esperar_error "borrar organizador con eventos (RESTRICT)" "DELETE FROM organizador WHERE id='$O'"

echo "Índices: $(valor "SELECT string_agg(indexname, ' ' ORDER BY indexname) FROM pg_indexes WHERE schemaname='public'")"
echo "RESULTADO: $OK comprobaciones, todas correctas."
