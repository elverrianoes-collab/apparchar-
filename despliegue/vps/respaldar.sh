#!/usr/bin/env bash
# Respaldo de la base del proyecto en el VPS: pg_dump en formato custom dentro de
# respaldos/ (permisos 600), conservando los últimos 7 días. Lo ejecuta un
# temporizador de systemd cada noche; también se puede correr a mano.
#
# Restaurar un respaldo (borra y reemplaza los datos actuales):
#   docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < respaldos/base-AAAA-MM-DD-HHMM.dump
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"
umask 077
mkdir -p respaldos

archivo="respaldos/base-$(date +%F-%H%M).dump"
# Las credenciales se leen dentro del contenedor (sus variables de entorno): no pasan
# por la línea de comandos del servidor.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$archivo.parcial"
mv "$archivo.parcial" "$archivo"
find respaldos -name 'base-*.dump' -mtime +7 -delete
printf 'Respaldo listo: %s (%s)\n' "$archivo" "$(du -h "$archivo" | cut -f1)"
