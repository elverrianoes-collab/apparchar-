#!/usr/bin/env bash
# Agente de despliegue del proyecto en un VPS (modelo «pull», decisión D-30).
#
# Un temporizador de systemd lo ejecuta cada minuto. Si la rama principal tiene un
# commit nuevo y el CI ya publicó su imagen (IMAGEN_BASE:sha-<commit>), lo despliega:
#   1. trae el commit y comprueba que pertenezca a la rama principal;
#   2. deja la copia del repositorio en ese commit (compose.yaml, Caddyfile…) y fija
#      IMAGEN_API en el .env;
#   3. docker compose up --wait. Si algún servicio no queda sano, vuelve a la versión
#      anterior y no reintenta ese commit hasta que llegue otro.
# Que la imagen exista garantiza que el commit pasó las pruebas y el compose del CI.
#
# Solo actúa sobre el proyecto de compose de esta carpeta (COMPOSE_PROJECT_NAME del
# .env): nunca detiene, borra ni modifica contenedores, redes, volúmenes o imágenes
# de otros proyectos del servidor.
#
# Uso: actualizar.sh [--forzar]   (--forzar reintenta un commit que falló antes)
# Reversión manual: escribir un commit de la rama principal en .despliegue/fijar-commit
# (el agente despliega ese y se queda en él); borrar el archivo para volver a seguir main.
set -Eeuo pipefail

# Bash lee el script a medida que lo ejecuta, y este script cambia el repositorio en
# el que vive (git checkout): se ejecuta una copia para que el cambio no lo altere.
if [[ -z "${AGENTE_COPIA:-}" ]]; then
  dir_proyecto="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  copia="$(mktemp)"
  cp "${BASH_SOURCE[0]}" "$copia"
  AGENTE_COPIA="$copia" exec bash "$copia" "$dir_proyecto" "$@"
fi
trap 'rm -f "$AGENTE_COPIA"' EXIT

DIR="$1"
shift
FORZAR=0
[[ "${1:-}" == "--forzar" ]] && FORZAR=1

cd "$DIR"
ESTADO="$DIR/.despliegue"
mkdir -p "$ESTADO"

log() { printf '%s\n' "$*"; }

# Lee una variable del .env sin ejecutarlo (sin «source»).
leer_env() {
  local valor
  valor="$(grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- || true)"
  valor="${valor%\"}"; valor="${valor#\"}"
  valor="${valor%\'}"; valor="${valor#\'}"
  printf '%s' "$valor"
}

fijar_env() {
  if grep -qE "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

# Escribe un aviso solo cuando cambia, para no repetir el mismo mensaje cada minuto.
avisar_una_vez() {
  if [[ "$(cat "$ESTADO/ultimo-aviso" 2>/dev/null || true)" != "$1" ]]; then
    log "$1"
    printf '%s' "$1" > "$ESTADO/ultimo-aviso"
  fi
}

existe_imagen() {
  docker manifest inspect "$1" > /dev/null 2>&1 || docker buildx imagetools inspect "$1" > /dev/null 2>&1
}

levantar() {
  docker compose pull --quiet api && docker compose up --detach --no-build --remove-orphans --wait --wait-timeout 240
}

[[ -f .env ]] || { log "ERROR: falta $DIR/.env (ver despliegue/vps/env.ejemplo)."; exit 1; }

# Un solo despliegue a la vez.
exec 9> "$ESTADO/bloqueo"
flock --nonblock 9 || exit 0

IMAGEN_BASE="$(leer_env IMAGEN_BASE)"
RAMA="$(leer_env RAMA)"
RAMA="${RAMA:-main}"
[[ -n "$IMAGEN_BASE" ]] || { log "ERROR: falta IMAGEN_BASE en el .env."; exit 1; }
[[ -n "$(leer_env COMPOSE_PROJECT_NAME)" ]] || { log "ERROR: falta COMPOSE_PROJECT_NAME en el .env."; exit 1; }

# ¿Qué commit debería estar desplegado?
objetivo="$(tr -d '[:space:]' < "$ESTADO/fijar-commit" 2>/dev/null || true)"
if [[ -z "$objetivo" ]]; then
  objetivo="$(git ls-remote origin "refs/heads/$RAMA" | cut -f1)"
fi
[[ "$objetivo" =~ ^[0-9a-f]{40}$ ]] || { log "ERROR: commit objetivo no válido: «$objetivo»."; exit 1; }

desplegado="$(cat "$ESTADO/commit-desplegado" 2>/dev/null || true)"
[[ "$objetivo" == "$desplegado" ]] && exit 0

if [[ "$FORZAR" -eq 0 && "$objetivo" == "$(cat "$ESTADO/commit-fallido" 2>/dev/null || true)" ]]; then
  avisar_una_vez "El commit ${objetivo:0:7} falló al desplegarse; se espera un commit nuevo (o --forzar)."
  exit 0
fi

imagen="$IMAGEN_BASE:sha-$objetivo"
if ! existe_imagen "$imagen"; then
  avisar_una_vez "Esperando la imagen $imagen (el CI todavía no la publica, falló, o el paquete no es público)."
  exit 0
fi

# Solo se despliegan commits de la rama principal (integrados por pull request).
git fetch --quiet origin "$RAMA"
git cat-file -e "$objetivo^{commit}" 2> /dev/null || git fetch --quiet origin "$objetivo"
if ! git merge-base --is-ancestor "$objetivo" "origin/$RAMA"; then
  avisar_una_vez "ERROR: ${objetivo:0:7} no pertenece a origin/$RAMA; no se despliega."
  exit 1
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  avisar_una_vez "ERROR: hay cambios locales en los archivos versionados de $DIR; no se despliega."
  exit 1
fi

imagen_anterior="$(leer_env IMAGEN_API)"
log "Desplegando ${objetivo:0:7} ($imagen)…"
git checkout --quiet --detach "$objetivo"
fijar_env IMAGEN_API "$imagen"

if levantar; then
  printf '%s' "$objetivo" > "$ESTADO/commit-desplegado"
  rm -f "$ESTADO/commit-fallido" "$ESTADO/ultimo-aviso"
  log "Desplegado ${objetivo:0:7}: todos los servicios quedaron sanos."
  # Limpieza: solo imágenes de este proyecto, conservando la actual y la anterior.
  docker image ls "$IMAGEN_BASE" --format '{{.Repository}}:{{.Tag}}' \
    | grep -vxF -e "$imagen" -e "${imagen_anterior:-ninguna}" \
    | xargs -r docker image rm > /dev/null 2>&1 || true
  exit 0
fi

log "ERROR: ${objetivo:0:7} no quedó sano. Registros de los servicios:"
docker compose ps || true
docker compose logs --tail 40 --no-color api || true
printf '%s' "$objetivo" > "$ESTADO/commit-fallido"
if [[ -n "$desplegado" && -n "$imagen_anterior" ]]; then
  log "Se vuelve a la versión anterior, ${desplegado:0:7}."
  git checkout --quiet --detach "$desplegado"
  fijar_env IMAGEN_API "$imagen_anterior"
  if levantar; then
    log "La versión anterior quedó en servicio."
  else
    log "ERROR: la versión anterior tampoco quedó sana; revisar a mano (docker compose ps)."
  fi
fi
exit 1
