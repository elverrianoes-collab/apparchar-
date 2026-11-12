# Prompt para Claude Code · Instalar el proyecto en el VPS

> **Cómo usarlo.** Entra por SSH al VPS con un usuario que tenga `sudo`, abre
> Claude Code en tu carpeta personal (`claude`) y pega todo lo que está debajo de
> la línea. Claude Code va a pedir permiso antes de cada comando; revisa en
> especial los que llevan `sudo` y los que tocan el proxy del servidor.

---

## Contexto

Vas a instalar **el proyecto** en este servidor. Es la aplicación web académica
del curso Tecnologías Web 2026-B (Unitrópico): una API REST en Node.js que también
sirve la web, con PostgreSQL 17, una caché Valkey 8 y un proxy Caddy, todo con
Docker Compose. El código está en el repositorio público
`https://github.com/elverrianoes-collab/apparchar-` (rama `main`). El repositorio
ya trae todo lo necesario para este servidor:

- `compose.yaml` + `compose.vps.yaml`: el conjunto en modo producción. El proxy
  del proyecto escucha **solo en una dirección interna** (`127.0.0.1:<puerto>`), y
  cada servicio tiene tope de memoria, CPU y registros.
- `despliegue/vps/actualizar.sh`: el agente de despliegue. Cada minuto, si `main`
  tiene un commit nuevo y el CI ya publicó su imagen
  `ghcr.io/elverrianoes-collab/proyecto-tecweb:sha-<commit>`, lo despliega. Si algo
  no queda sano, vuelve a la versión anterior.
- `despliegue/vps/respaldar.sh`: respaldo diario de la base.
- `despliegue/vps/systemd/`: plantillas de los temporizadores.
- `despliegue/vps/env.ejemplo`: plantilla del `.env`.
- `despliegue/vps/proxy-servidor/`: plantillas del sitio para nginx, Caddy o Traefik.
- `docs/despliegue-vps.md`: cómo funciona y cómo se opera.

> **Estado del repositorio (12 de noviembre de 2026).** La publicación en una
> subcarpeta (`RUTA_BASE` y las plantillas `*-ruta.*`) llega con el pull request
> «Permite publicar el proyecto en una subcarpeta». Si `despliegue/vps/proxy-servidor/nginx-ruta.conf.ejemplo`
> no existe en `main`, detente y avísame: falta integrarlo.
>
> Los PR 1, 2 y 3 de la
> Entrega 4 ya están integrados en `main` (#10, #11 y #12), así que `main` trae
> todos los archivos de despliegue. El CI de cada integración a `main` publica la
> imagen del commit; el agente la despliega sola. El PR 4 (rendimiento y
> documentación) se despliega también solo cuando se integre.

**Este servidor ya está en producción con otra aplicación** (la versión comercial
de Apparchar, que no es este proyecto). Esa aplicación tiene prioridad absoluta:
este proyecto se instala a su lado, aislado, sin tocar nada de ella.

### Dónde se publica

El proyecto se publica en una **subcarpeta del dominio de esa otra aplicación**:

**`https://apparchar.sbs/proyecto/`**

- El proxy del servidor ya atiende `apparchar.sbs` con HTTPS. Solo se le **agregan**
  las reglas de `/proyecto` dentro del sitio existente; no hace falta DNS nuevo ni
  certificado nuevo.
- El proxy quita el prefijo `/proyecto` antes de pasar la petición al proyecto
  (`/proyecto/salud` llega como `/salud`). La API lo sabe por `RUTA_BASE=/proyecto`
  en el `.env`: con eso arma la redirección de la raíz y el servidor de Swagger UI.
  La web usa rutas relativas y encuentra la API bajo la misma subcarpeta.
- Todo lo que no empiece por `/proyecto` sigue yendo a la otra aplicación, igual
  que hoy.

### Identidad del proyecto en el servidor

Usa estos valores en todo: nombres, carpetas, usuarios, unidades y proyecto de compose.

| Variable | Valor |
|---|---|
| `NOMBRE` | `proyecto`. Si ya existe algo con ese nombre (carpeta, usuario, proyecto de compose, volumen o unidad de systemd), usa `proyecto-tecweb` y avísame. |
| `DIR` | `/opt/$NOMBRE` (la copia del repositorio) |
| Usuario del sistema | `$NOMBRE`, sin inicio de sesión, con su carpeta en `/var/lib/$NOMBRE` y en el grupo `docker` |
| Proyecto de compose | `$NOMBRE` (con `COMPOSE_PROJECT_NAME` en el `.env`) |
| Unidades de systemd | `$NOMBRE-despliegue.service/.timer` y `$NOMBRE-respaldo.service/.timer` |
| Puerto interno | `18080` si está libre; si no, el siguiente libre a partir de 18081 |

## Reglas que no se negocian

1. **No afectes a la aplicación que ya está en producción.** No detengas,
   reinicies, actualices, modifiques ni borres contenedores, imágenes, volúmenes,
   redes, bases de datos, carpetas, usuarios, unidades de systemd ni archivos de
   configuración que no hayas creado tú en esta instalación.
2. **Nada de comandos globales de Docker.** Prohibido `docker system prune`,
   `docker volume prune`, `docker network prune`, `docker image prune -a`,
   `docker rm -f $(docker ps -aq)` y cualquier `docker compose` fuera de `$DIR`. Todo
   comando de compose se ejecuta dentro de `$DIR`, como el usuario `$NOMBRE`,
   para que tome `COMPOSE_PROJECT_NAME` del `.env`.
3. **No reinicies ni actualices Docker** (ni `docker.service`, ni `containerd`, ni
   el paquete `docker-ce`). Eso reiniciaría todos los contenedores del servidor.
   Si Docker no está instalado o Compose es anterior a 2.24, detente y pregúntame.
   Solo se puede actualizar el paquete `docker-compose-plugin`, que no reinicia nada,
   y únicamente con mi permiso.
4. **No uses los puertos 80 ni 443** y no abras puertos en el firewall. El
   proyecto solo escucha en la dirección interna. El HTTPS lo pone el proxy que ya
   tiene el servidor.
5. **El proxy del servidor solo se toca con mi aprobación**, y solo para
   **agregar** las reglas de `/proyecto` dentro del sitio `apparchar.sbs`. No
   cambies ninguna otra línea de ese sitio (ni su `location /`, ni sus
   certificados, ni sus cabeceras). Antes de cambiarlo, haz una
   copia de su configuración y guarda el estado de los sitios existentes. Valida la
   configuración antes de aplicarla, usa `reload` y nunca `restart`, y comprueba
   después que los sitios existentes responden igual que antes. Si ese proxy corre
   en un contenedor de otra aplicación, **no lo modifiques**: explícame las
   opciones y espera.
6. **No construyas imágenes en el servidor** ni ejecutes `npm`. El proyecto usa la
   imagen que publica el CI.
7. **Secretos.** Genéralos en el servidor y guárdalos solo en `$DIR/.env`
   (permisos 600, dueño `$NOMBRE`). No los muestres en pantalla, no los copies a
   otro archivo y no los escribas en la bitácora.
8. **Nunca ejecutes `servidor/db/semilla.js` ni `npm run demo`** con datos en la
   base: borran la base. Los datos de demostración solo se cargan si te lo pido y
   la base está vacía.
9. **No actualices el sistema** (`apt upgrade`). Antes de instalar cualquier
   paquete (por ejemplo, `certbot` o `dnsutils`), dime cuál es y por qué.
10. **Si algo no cuadra, detente y pregúntame**: un puerto ocupado, un nombre en
    uso, un proxy desconocido, un DNS que no apunta al servidor, poca memoria o
    poco disco.

## Antes de empezar, pídeme

- **Confirmación de la dirección pública:** `https://apparchar.sbs/proyecto/`.
  Comprueba en la fase 0 que la otra aplicación **no use ya** rutas que empiecen
  por `/proyecto` (`curl -s -o /dev/null -w '%{http_code}' https://apparchar.sbs/proyecto/`
  debe dar 404 o la página de «no encontrado» de esa aplicación). Si responde
  otra cosa, detente y pregúntame.
- **Si quiero cargar los datos de demostración** al terminar (solo con la base vacía).

## Fase 0 · Reconocimiento (solo lectura)

No cambies nada en esta fase. Recoge esta información y preséntame un informe
corto con un plan:

```bash
cat /etc/os-release; uname -m; nproc; free -m; df -h / /var/lib/docker 2>/dev/null
docker version --format 'Docker {{.Server.Version}}'; docker compose version; git --version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
docker compose ls --all
docker volume ls; docker network ls
sudo ss -ltnp
systemctl list-units --type=service --state=running | grep -Ei 'nginx|caddy|traefik|apache|httpd|haproxy' || true
ls -la /opt /srv 2>/dev/null
```

Comprueba también que los nombres del proyecto estén libres:

```bash
NOMBRE=proyecto
docker compose ls --all | grep -iw "$NOMBRE" || echo "sin proyecto de compose $NOMBRE"
docker volume ls --format '{{.Name}}' | grep "^${NOMBRE}_" || echo "sin volúmenes ${NOMBRE}_*"
id "$NOMBRE" 2>/dev/null || echo "sin usuario $NOMBRE"
ls -d "/opt/$NOMBRE" 2>/dev/null || echo "sin carpeta /opt/$NOMBRE"
systemctl list-unit-files | grep "^$NOMBRE-" || echo "sin unidades $NOMBRE-*"
sudo ss -ltn | grep -E ':(18080|18081|18082) ' || echo "18080-18082 libres"
```

El informe debe decir:
- qué proceso atiende los puertos 80 y 443, si corre en el servidor o en un
  contenedor, y de qué aplicación es;
- el nombre y el puerto interno que vas a usar;
- la memoria y el disco libres. El proyecto usa unos 150 MB en reposo, con un tope
  de unos 930 MB entre los cuatro servicios.

**Espera mi visto bueno antes de seguir.**

## Fase 1 · Preparación

```bash
NOMBRE=proyecto; DIR=/opt/$NOMBRE; PUERTO=18080       # los valores acordados en la fase 0
SUBDOMINIO=apparchar.sbs                                # dominio público (compartido con la otra aplicación)
RUTA_BASE=/proyecto                                     # subcarpeta del proyecto
sudo useradd --system --create-home --home-dir /var/lib/$NOMBRE --shell /usr/sbin/nologin "$NOMBRE"
sudo usermod -aG docker "$NOMBRE"
sudo install -d -o "$NOMBRE" -g "$NOMBRE" -m 755 "$DIR"
sudo -u "$NOMBRE" git clone https://github.com/elverrianoes-collab/apparchar- "$DIR"
ls "$DIR/compose.vps.yaml" "$DIR/despliegue/vps/actualizar.sh"   # deben existir los dos
```

Crea el `.env` a partir de la plantilla, con secretos nuevos y sin mostrarlos:

```bash
cd "$DIR"
sudo -u "$NOMBRE" cp despliegue/vps/env.ejemplo .env
sudo chmod 600 .env
sudo -u "$NOMBRE" sed -i -e "s|__NOMBRE__|$NOMBRE|g" -e "s|__PUERTO__|$PUERTO|g" -e "s|__SUBDOMINIO__|$SUBDOMINIO|g" -e "s|__RUTA_BASE__|$RUTA_BASE|g" .env
for clave in JWT_SECRETO PASARELA_CLAVE POSTGRES_PASSWORD; do
  sudo -u "$NOMBRE" sed -i "s|^$clave=__GENERAR__|$clave=$(openssl rand -base64 48 | tr -d '\n/+=')|" .env
done
sudo grep -v '^#' .env | grep -c '__'   # debe dar 0: no queda ningún valor por reemplazar
```

Si el proxy del servidor corre **dentro de un contenedor**, `127.0.0.1` no le
sirve. En ese caso, usa en `VPS_ENLACE` la dirección de la puerta de enlace de
`docker0` (`ip -4 addr show docker0`) y avísame.

## Fase 2 · Primer despliegue

1. Comprueba que el CI ya publicó la imagen del último commit de `main`:
   ```bash
   SHA=$(git -C "$DIR" ls-remote origin refs/heads/main | cut -f1)
   docker manifest inspect "ghcr.io/elverrianoes-collab/proyecto-tecweb:sha-$SHA" > /dev/null && echo "imagen disponible"
   ```
   - Si responde **denied** o **unauthorized**: el paquete es privado. Pídeme que
     lo haga público (GitHub → perfil → *Packages* → `proyecto-tecweb` →
     *Package settings* → *Change visibility* → *Public*) y espera.
   - Si responde **manifest unknown**: el CI todavía no termina para ese commit
     (tarda unos 5 a 7 minutos desde la integración) o falló. Revisa la pestaña
     *Actions* del repositorio. Mientras termina, **no esperes**: sigue con las
     fases 3 y 4 y avísame. El agente hará el primer despliegue solo en cuanto la
     imagen exista; entonces se completan los pasos 2 y 3 de esta fase y la fase 5.
2. Ejecuta el agente una vez, a mano:
   ```bash
   sudo -u "$NOMBRE" bash "$DIR/despliegue/vps/actualizar.sh"
   ```
   Debe terminar con `Desplegado <commit>: todos los servicios quedaron sanos.`
3. Verifica el conjunto:
   ```bash
   cd "$DIR" && sudo -u "$NOMBRE" docker compose ps   # los 4 servicios «healthy»
   curl -s "http://127.0.0.1:$PUERTO/salud"           # postgresql, valkey y el commit
   sudo ss -ltnp | grep ":$PUERTO "                   # solo 127.0.0.1
   ```
4. Si pedí datos de demostración y la base está vacía:
   `cd "$DIR" && sudo -u "$NOMBRE" docker compose exec api node servidor/db/semilla.js`

## Fase 3 · Publicar en `https://apparchar.sbs/proyecto/`

1. **Estado previo.** Guarda en la bitácora la lista de sitios que atiende el proxy
   (`sudo nginx -T | grep server_name`, el Caddyfile o la configuración de
   Traefik) y el código HTTP de cada uno, con
   `curl -s -o /dev/null -w '%{http_code}' https://<sitio>`. Mide también 3 o 4
   rutas reales de `apparchar.sbs` (la raíz, su API, un archivo estático).
2. **Ubicar el sitio.** Encuentra el archivo y el bloque que atienden
   `apparchar.sbs` en el puerto 443 (`sudo nginx -T | grep -n "server_name.*apparchar.sbs"`).
3. **Propuesta.** Muéstrame el archivo, la línea exacta donde vas a insertar y el
   texto, a partir de la plantilla que corresponda:
   - nginx: `despliegue/vps/proxy-servidor/nginx-ruta.conf.ejemplo`
   - Caddy: `despliegue/vps/proxy-servidor/Caddyfile-ruta.ejemplo`
   - Traefik: `despliegue/vps/proxy-servidor/traefik-ruta.yml.ejemplo` (archivo nuevo)

   Reemplaza `__RUTA_BASE__` por `/proyecto`, `__PUERTO__` por `$PUERTO`,
   `__SUBDOMINIO__` por `apparchar.sbs` y `__NOMBRE__` por `$NOMBRE`.
   **Espera mi aprobación.**
4. **Aplicar**, según el proxy:
   - **nginx:** respalda `/etc/nginx` (`sudo tar czf /var/lib/$NOMBRE/nginx-antes.tgz /etc/nginx`)
     y copia aparte el archivo del sitio. Pega los dos `location` **dentro** del
     `server` de `apparchar.sbs` del puerto 443, **antes** de su `location /`.
     Ejecuta `sudo nginx -t` y solo si da `ok`, `sudo systemctl reload nginx`.
     No hace falta certbot: el sitio ya tiene su certificado.
   - **Caddy en el servidor:** respalda el Caddyfile, pega las líneas dentro del
     bloque `apparchar.sbs`, antes de su `reverse_proxy`. Ejecuta
     `caddy validate --config /etc/caddy/Caddyfile` y luego `sudo systemctl reload caddy`.
   - **Traefik:** crea el archivo dinámico nuevo a partir de la plantilla (ajusta
     `entryPoints` y `tls` a los que usa el router existente de `apparchar.sbs`).
   - Si el proxy corre en un contenedor de la otra aplicación, **no lo modifiques**:
     explícame las opciones y espera.
5. **Verificar:**
   ```bash
   curl -s https://apparchar.sbs/proyecto/salud                          # estado ok, postgresql, valkey y el commit
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://apparchar.sbs/proyecto      # 301 a /proyecto/
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Accept: text/html' https://apparchar.sbs/proyecto/   # 302 a /proyecto/app/panel.html
   curl -s -o /dev/null -w '%{http_code}\n' https://apparchar.sbs/proyecto/docs/                # 200
   ```
   Si el proyecto todavía no se desplegó (imagen aún sin publicar), `/proyecto/`
   responde **502** hasta el primer despliegue. Eso es lo esperado.
   **Vuelve a medir los sitios y rutas del paso 1:** deben dar los mismos códigos.
   Si alguno cambió, **revierte** con la copia de respaldo, recarga y avísame.

## Fase 4 · Automatización

```bash
for unidad in despliegue.service despliegue.timer respaldo.service respaldo.timer; do
  sed -e "s|__NOMBRE__|$NOMBRE|g" -e "s|__DIR__|$DIR|g" -e "s|__USUARIO__|$NOMBRE|g" \
    "$DIR/despliegue/vps/systemd/NOMBRE-$unidad" | sudo tee "/etc/systemd/system/$NOMBRE-$unidad" > /dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now "$NOMBRE-despliegue.timer" "$NOMBRE-respaldo.timer"
systemctl list-timers | grep "$NOMBRE"
sudo systemctl start "$NOMBRE-respaldo.service" && sudo ls -la "$DIR/respaldos"
journalctl -u "$NOMBRE-despliegue.service" -n 20 --no-pager
```

## Fase 5 · Verificación final

Marca cada punto con su evidencia (comando y resultado, sin secretos):

- [ ] `https://apparchar.sbs/proyecto/` abre el panel y dice «Conectado a la API en
      https://apparchar.sbs/proyecto»; `/proyecto/app/index.html` abre la cartelera y
      `/proyecto/docs/` Swagger UI, cuyo servidor es `/proyecto/`.
- [ ] `https://apparchar.sbs/proyecto/salud` responde `postgresql`, `valkey` y el commit de `main`.
- [ ] En las herramientas del navegador (pestaña *Red*), el panel no hace ninguna
      petición fuera de `/proyecto/`.
- [ ] El certificado de `apparchar.sbs` es el mismo de antes y sigue válido.
- [ ] Los datos sobreviven a un reinicio: crea un organizador de prueba con
      `POST /organizadores`, ejecuta `docker compose restart` (en `$DIR`, como
      `$NOMBRE`), inicia sesión con él y bórralo con `DELETE /organizadores/{id}`.
- [ ] `docker stats --no-stream` muestra los topes de memoria de los cuatro servicios del proyecto.
- [ ] El puerto del proyecto solo escucha en la dirección interna (`ss -ltnp`).
- [ ] El temporizador de despliegue está activo y su registro dice `Desplegado` o nada nuevo.
- [ ] Existe un respaldo en `$DIR/respaldos/` con permisos `600`.
- [ ] **La otra aplicación del servidor responde igual que antes** (los mismos
      códigos de la fase 3) y sus contenedores siguen con el mismo `STATUS` que en la fase 0.

## Al terminar, entrégame

1. Un resumen con la URL, el nombre, el puerto interno, las unidades de systemd,
   la memoria y el disco libres después de instalar, y cualquier decisión que
   tomaste.
2. La bitácora en `/var/lib/$NOMBRE/INSTALACION.md`, con los comandos y
   resultados de cada fase, **sin ningún secreto**.
3. Lo que debo configurar en GitHub: en el repositorio, *Settings → Secrets and
   variables → Actions → Variables*, la variable `URL_PUBLICA` con
   `https://apparchar.sbs/proyecto`. Con ella, la etapa «desplegar» del CI comprueba cada
   despliegue.

## Operación, para después

- **Ver el despliegue en vivo:** `journalctl -u $NOMBRE-despliegue.service -f`
- **Reintentar un commit que falló:** `sudo -u $NOMBRE bash $DIR/despliegue/vps/actualizar.sh --forzar`
- **Volver a una versión anterior:** escribe el commit en
  `$DIR/.despliegue/fijar-commit`; para volver a seguir `main`, borra el archivo.
- **Detener sin borrar datos:** `cd $DIR && sudo -u $NOMBRE docker compose stop`
  (nunca `down --volumes`).
- **Restaurar un respaldo:** ver el encabezado de `despliegue/vps/respaldar.sh`.
- **Más detalle:** `docs/despliegue-vps.md`.
