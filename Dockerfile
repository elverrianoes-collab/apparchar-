# Imagen de la API de Apparchar (también sirve la web en /app).
# Multietapa (decisión D-30 en docs/decisiones.md):
#   dependencias → solo las de producción, instaladas con npm ci desde el lockfile.
#   pruebas      → todas las dependencias y `npm run revisar` (docker build --target pruebas).
#   ejecucion    → la imagen final: Node, el código y nada más, con un usuario sin privilegios.
# La versión de Node va fija para que la imagen de hoy sea la misma dentro de un mes.
ARG NODE_IMAGEN=node:22.23.5-alpine3.24

FROM ${NODE_IMAGEN} AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# 1. Dependencias de producción. Solo se copian package.json y el lockfile: mientras
#    no cambien, Docker reutiliza esta capa y un cambio de código no reinstala nada.
FROM base AS dependencias
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

# 2. Pruebas: contrato, coherencia y pruebas del backend dentro de la imagen.
#    No forma parte de la imagen final; el CI la construye antes de publicar.
FROM base AS pruebas
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run revisar

# 3. Ejecución.
FROM base AS ejecucion
ARG COMMIT_SHA=""
ENV NODE_ENV=production \
    PORT=3000 \
    COMMIT_SHA=${COMMIT_SHA}
COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json ./
COPY api ./api
COPY servidor ./servidor
COPY web ./web
# El código queda de root y solo lectura para el proceso; únicamente .datos (PGlite,
# cuando no hay DATABASE_URL) es escribible por el usuario «node» (uid 1000).
RUN mkdir -p .datos && chown node:node .datos
USER node
EXPOSE 3000
# Usa el mismo PORT que la API: algunas plataformas (Render, por ejemplo) lo cambian.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/salud" > /dev/null || exit 1
CMD ["node", "servidor/index.js"]
