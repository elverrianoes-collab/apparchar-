# Despliegue en el VPS

La versión pública del proyecto corre en un VPS **compartido** con otra aplicación
en producción. Por eso el despliegue está pensado para convivir con ella sin
riesgo: el proyecto tiene su propio nombre en el servidor (`proyecto`), no usa los
puertos 80 ni 443, tiene topes de recursos y se despliega solo, sin que GitHub
guarde llaves de acceso al servidor. Las decisiones están en
[`decisiones.md`](decisiones.md) (D-28 a D-30).

- **Instalación:** [`despliegue/vps/PROMPT-instalar-proyecto.md`](../despliegue/vps/PROMPT-instalar-proyecto.md)
  es el prompt para que Claude Code lo instale paso a paso en el servidor, con
  puntos de aprobación antes de cada cambio delicado.
- **Archivos:** [`compose.vps.yaml`](../compose.vps.yaml) y [`despliegue/vps/`](../despliegue/vps/).

## Cómo queda en el servidor

```
Internet ──HTTPS──► proxy del servidor (ya existía: nginx, Caddy o Traefik)
                     │  sitio nuevo: <subdominio> → 127.0.0.1:VPS_PUERTO
                     ▼
            proyecto · proxy (Caddy, solo en 127.0.0.1)
                     ▼
            proyecto · api ──► proyecto · db (volumen proyecto_datos-postgres)
                         └──► proyecto · cache (Valkey, sin disco)
```

| Pieza | En el servidor |
|---|---|
| Copia del repositorio | `/opt/proyecto` (dueño: usuario de sistema `proyecto`) |
| Configuración y secretos | `/opt/proyecto/.env` (permisos 600; plantilla en `despliegue/vps/env.ejemplo`) |
| Proyecto de compose | `proyecto` (`COMPOSE_PROJECT_NAME`): contenedores `proyecto-*`, redes y volúmenes `proyecto_*` |
| Puerto | `127.0.0.1:18080` (`VPS_PUERTO`); el firewall no cambia |
| HTTPS | El proxy del servidor, con un sitio nuevo para el subdominio (plantillas en `despliegue/vps/proxy-servidor/`) |
| Recursos | Topes de 64 MB (proxy), 384 MB (api), 384 MB (db) y 96 MB (cache); registros de 10 MB × 3 por servicio. En reposo usa unos 150 MB |
| Despliegue | `proyecto-despliegue.timer` (cada minuto) → `despliegue/vps/actualizar.sh` |
| Respaldos | `proyecto-respaldo.timer` (diario, 03:30) → `/opt/proyecto/respaldos/` (7 días) |

### Publicación en una subcarpeta

Cuando el proyecto no tiene subdominio propio, se publica en una subcarpeta de un
dominio que ya atiende otra aplicación (en este servidor,
`https://apparchar.sbs/proyecto/`):

- El proxy del servidor recibe `/proyecto/…`, quita el prefijo y pasa la petición
  a `127.0.0.1:VPS_PUERTO`. Las plantillas son `proxy-servidor/nginx-ruta.conf.ejemplo`,
  `Caddyfile-ruta.ejemplo` y `traefik-ruta.yml.ejemplo`; se agregan al sitio
  existente sin cambiar sus otras reglas.
- `RUTA_BASE=/proyecto` en el `.env` le dice a la API bajo qué ruta la ven los
  navegadores: la raíz redirige a `app/panel.html` (relativa) y Swagger UI usa
  `/proyecto/` como servidor.
- La web usa rutas relativas y el panel busca la API en la misma subcarpeta, así
  que ninguna petición sale de `/proyecto/`. Las claves de `sessionStorage` usan el
  prefijo `tecweb.` para no chocar con las de la otra aplicación del mismo origen.

## Cómo se despliega una versión

1. Un pull request se integra a `main`.
2. El CI ([`ci-cd.yaml`](../.github/workflows/ci-cd.yaml)) corre `revisar` y
   `compose`, y solo si pasan, publica la imagen
   `ghcr.io/elverrianoes-collab/proyecto-tecweb:sha-<commit>`.
3. En el servidor, el agente ve en menos de un minuto que `main` cambió y que su
   imagen ya existe. Comprueba que el commit pertenezca a `main`, deja
   `/opt/proyecto` en ese commit, fija `IMAGEN_API` y ejecuta
   `docker compose up --wait`.
4. Si los cuatro servicios quedan sanos, la versión queda en servicio. Si no,
   vuelve a la anterior en segundos y no reintenta ese commit hasta que llegue uno
   nuevo.
5. Mientras tanto, la etapa `desplegar` del CI consulta `URL_PUBLICA/salud` hasta
   que informa el commit integrado. Así el historial de *Actions* muestra que
   quedó publicado.

Del merge a la URL, unos 5 a 7 minutos: la mayor parte es el CI.

**Por qué «pull» y no SSH desde el CI.** Con SSH, GitHub tendría que guardar una
llave con acceso a Docker en un servidor de producción ajeno al curso, y un flujo
modificado en una rama podría usarla. Con el agente, el servidor solo lee el
repositorio público y la imagen publicada: no hay ninguna credencial del servidor
fuera de él.

## Operación

Todos los comandos van en `/opt/proyecto`, como el usuario `proyecto`
(`sudo -u proyecto …`), para que compose tome el nombre del proyecto del `.env`.

| Para… | Comando |
|---|---|
| Ver el estado | `docker compose ps` · `curl -s http://127.0.0.1:18080/salud` |
| Ver los despliegues en vivo | `journalctl -u proyecto-despliegue.service -f` |
| Ver los registros de la API | `docker compose logs -f api` |
| Desplegar ya, sin esperar el minuto | `bash despliegue/vps/actualizar.sh` |
| Reintentar un commit que falló | `bash despliegue/vps/actualizar.sh --forzar` |
| Volver a una versión anterior | Escribir el commit en `.despliegue/fijar-commit`. Para volver a seguir `main`, borrar el archivo. |
| Respaldar ahora | `bash despliegue/vps/respaldar.sh` |
| Restaurar un respaldo | `docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < respaldos/<archivo>.dump` |
| Detener sin perder datos | `docker compose stop` (nunca `down --volumes`) |
| Pausar los despliegues | `sudo systemctl stop proyecto-despliegue.timer` |

## Lo que nunca se hace en este servidor

- Comandos globales de Docker (`system prune`, `volume prune`…), reiniciar o
  actualizar Docker, o usar `docker compose` fuera de `/opt/proyecto`.
- Construir la imagen o ejecutar `npm` en el servidor.
- Ejecutar `servidor/db/semilla.js` con datos: borra la base.
- Tocar la configuración del proxy del servidor sin respaldo, sin `nginx -t` o
  `caddy validate`, y sin comprobar después los demás sitios.

## Alternativa: Render

[`render.yaml`](../render.yaml) sigue en el repositorio como plan B: el mismo
Dockerfile en Render, con PostgreSQL y Key Value administrados. Para usarlo hay
que crear el *Blueprint* en Render y definir el secreto `RENDER_DEPLOY_HOOK`; el
CI lo dispara solo si ese secreto existe. El plan gratuito tiene dos límites: el
servicio se apaga después de 15 minutos sin tráfico (la primera visita tarda
entre 30 y 60 s) y la base gratuita vence a los 30 días.
