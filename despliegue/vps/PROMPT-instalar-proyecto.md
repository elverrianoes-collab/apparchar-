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

> **Mientras el PR 3 de la Entrega 4 (CI/CD y despliegue) no esté integrado**,
> `main` todavía no trae estos archivos. Están en la rama de referencia
> `feature/contenerizacion`. La fase 1 lo detecta y deja la copia en esa rama, para
> preparar todo desde ya. El agente siempre sigue `main`, así que el primer
> despliegue ocurre solo, unos minutos después de que el PR 3 se integre y el CI
> publique la imagen.

**Este servidor ya está en producción con otra aplicación** (la versión comercial
de Apparchar, que no es este proyecto). Esa aplicación tiene prioridad absoluta:
este proyecto se instala a su lado, aislado, sin tocar nada de ella.

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
   **agregar** el sitio del subdominio del proyecto. Antes de cambiarlo, haz una
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

- **El subdominio** del proyecto (por ejemplo, `proyecto.midominio.com`) y si ya
  creé el registro DNS `A` (o `AAAA`) que apunta a este servidor.
- **Un correo** para los avisos del certificado (Let's Encrypt), si el proxy del
  servidor es nginx con certbot.
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
SUBDOMINIO=proyecto.midominio.com                       # el subdominio que te di
sudo useradd --system --create-home --home-dir /var/lib/$NOMBRE --shell /usr/sbin/nologin "$NOMBRE"
sudo usermod -aG docker "$NOMBRE"
sudo install -d -o "$NOMBRE" -g "$NOMBRE" -m 755 "$DIR"
sudo -u "$NOMBRE" git clone https://github.com/elverrianoes-collab/apparchar- "$DIR"
# Si main todavía no trae los archivos de despliegue (PR 3 sin integrar), usa la rama de referencia.
if [ ! -f "$DIR/compose.vps.yaml" ]; then
  sudo -u "$NOMBRE" git -C "$DIR" checkout --quiet feature/contenerizacion && echo "Copia en la rama de referencia de la Entrega 4"
fi
ls "$DIR/compose.vps.yaml" "$DIR/despliegue/vps/actualizar.sh"   # deben existir los dos
```

Crea el `.env` a partir de la plantilla, con secretos nuevos y sin mostrarlos:

```bash
cd "$DIR"
sudo -u "$NOMBRE" cp despliegue/vps/env.ejemplo .env
sudo chmod 600 .env
sudo -u "$NOMBRE" sed -i -e "s|__NOMBRE__|$NOMBRE|g" -e "s|__PUERTO__|$PUERTO|g" -e "s|__SUBDOMINIO__|$SUBDOMINIO|g" .env
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
   - Si responde **manifest unknown** y `git -C "$DIR" ls-tree origin/main compose.vps.yaml`
     no muestra nada: el PR 3 todavía no está integrado, así que no hay imagen
     para `main`. **No esperes**: sigue con las fases 3 y 4 y avísame. El agente hará
     el primer despliegue solo cuando el PR 3 se integre; entonces se completan los
     pasos 2 y 3 de esta fase y la fase 5.
   - Si responde **manifest unknown** con el PR 3 ya integrado: el CI todavía no
     termina para ese commit o falló. Revísalo en la pestaña *Actions* del
     repositorio, avísame y espera.
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

## Fase 3 · Subdominio con HTTPS en el proxy del servidor

1. **Estado previo.** Guarda en la bitácora la lista de sitios que atiende el proxy
   (`sudo nginx -T | grep server_name`, el Caddyfile o la configuración de
   Traefik) y el código HTTP de cada uno, con
   `curl -s -o /dev/null -w '%{http_code}' https://<sitio>`.
2. **DNS.** Comprueba que `dig +short <subdominio>` devuelva la IP pública del
   servidor. Si no, detente y avísame.
3. **Propuesta.** Muéstrame exactamente qué archivo vas a crear o qué bloque vas a
   agregar, a partir de la plantilla que corresponda en
   `despliegue/vps/proxy-servidor/`. **Espera mi aprobación.**
4. **Aplicar**, según el proxy:
   - **nginx:** respalda `/etc/nginx` (`sudo tar czf /var/lib/$NOMBRE/nginx-antes.tgz /etc/nginx`),
     crea el sitio nuevo, ejecuta `sudo nginx -t` y luego `sudo systemctl reload nginx`.
     Después ejecuta `sudo certbot --nginx -d <subdominio> -m <correo> --agree-tos --redirect --non-interactive`,
     que solo toca el bloque de ese subdominio.
   - **Caddy en el servidor:** respalda el Caddyfile y agrega el bloque al final.
     Ejecuta `caddy validate --config /etc/caddy/Caddyfile` y luego `sudo systemctl reload caddy`.
   - **Traefik u otro:** propone la configuración dinámica a partir de la plantilla
     y espera mi aprobación.
5. **Verificar:**
   ```bash
   curl -s "https://<subdominio>/salud"
   echo | openssl s_client -servername <subdominio> -connect <subdominio>:443 2>/dev/null | openssl x509 -noout -issuer -dates
   ```
   Si el proyecto todavía no se desplegó (PR 3 sin integrar), el subdominio
   responde **502** hasta el primer despliegue. Eso es lo esperado: por ahora
   verifica solo el certificado.
   Vuelve a medir los sitios existentes del paso 1: deben dar los mismos códigos.
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

- [ ] `https://<subdominio>/` abre el panel, `/app/` la cartelera y `/docs` Swagger UI.
- [ ] `https://<subdominio>/salud` responde `postgresql`, `valkey` y el commit de `main`.
- [ ] El certificado es válido, lo emite Let's Encrypt (u otra autoridad
      reconocida), no vence este semestre y se renueva solo (`systemctl list-timers | grep -i certbot`, o Caddy).
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
   `https://<subdominio>`. Con ella, la etapa «desplegar» del CI comprueba cada
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
