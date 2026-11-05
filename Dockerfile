# syntax=docker/dockerfile:1
# =============================================================================
#  ProjectArmageddon — Container-Abbild (DEP-2, OPTION neben systemd)
# =============================================================================
#  Nicht gebaut, nicht gestartet: ob Container überhaupt gewünscht sind, ist eine
#  offene Entscheidung des Auftraggebers (docs/deploy-plan.md, Abschnitt 12).
#  Geprüft wird diese Datei ohne Docker in tests/container-dateien.test.js.
#
#  Bauen (Version und Git-Stand kommen als Argumente, im Abbild gibt es kein .git):
#
#    docker build \
#      --build-arg PA_GIT_SHA=$(git rev-parse HEAD) \
#      --build-arg SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) \
#      -t projectarmageddon:$(node -p "require('./package.json').version") .
#
#  Rollback = voriges Abbild-Tag starten (deploy/compose.yaml, PA_TAG).
#  Die Idle-Bremse (AGENTS.md §5) läuft auch hier auf dem HOST: siehe
#  deploy/compose.yaml und docs/deploy-plan.md Abschnitt 11.
# =============================================================================

# Gleiche Node-Hauptversion wie CI und package.json `engines` (>=22).
ARG NODE_IMAGE=node:22-bookworm-slim

# --- Stufe 1: Client bauen (mit devDependencies) ------------------------------
FROM ${NODE_IMAGE} AS bau
WORKDIR /bau
ARG PA_GIT_SHA=unbekannt
ARG SOURCE_DATE_EPOCH
ENV PA_GIT_SHA=${PA_GIT_SHA} SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
# Genau das, was `vite build` liest (geprüft: dieselben 1553 Dateien in dist/ wie im Repo-Build).
COPY index.html vite.config.mjs ./
COPY public ./public
COPY src ./src
COPY scripts/release/bauinfo.mjs ./scripts/release/bauinfo.mjs
RUN npm run build

# --- Stufe 2: nur Produktionsabhängigkeiten -----------------------------------
FROM ${NODE_IMAGE} AS abh
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# --- Stufe 3: Laufzeit (nicht-root, nur Server + dist) ------------------------
FROM ${NODE_IMAGE} AS laufzeit
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    LOG_FORMAT=json \
    PA_STATE_PATH=/data/lobbies.json
WORKDIR /app
COPY --from=abh --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json package-lock.json ./
COPY --chown=root:root scripts/server.mjs ./scripts/server.mjs
COPY --chown=root:root src/server ./src/server
COPY --chown=root:root src/engine ./src/engine
COPY --chown=root:root src/shared ./src/shared
COPY --from=bau --chown=root:root /bau/dist ./dist
# Spielstand außerhalb des Abbilds; der Benutzer `node` (UID 1000, im Basisabbild) darf nur dort schreiben.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 3000
# HOST=0.0.0.0 gilt nur IM Container. Nach außen veröffentlicht compose.yaml den Port
# ausschließlich auf 127.0.0.1 — öffentlich ist nur der Reverse-Proxy (DEP-3).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))"]
# Direkt node (nicht npm): SIGTERM erreicht den Server, der den Zustand sichert (scripts/server.mjs).
STOPSIGNAL SIGTERM
CMD ["node", "scripts/server.mjs"]
