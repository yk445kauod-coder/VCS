# syntax=docker/dockerfile:1

# ---- build the dashboard ----------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY web ./web
COPY public ./public
RUN npm run build:web

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY plugins ./plugins
COPY --from=web /app/web-dist ./web-dist

# SQLite lives here; mount a volume to persist it.
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]

ENV PORT=8787 \
    HOST=0.0.0.0 \
    DUTY_DATA_DIR=/app/data \
    SQLITE_PATH=/app/data/duty.sqlite

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "src/server/index.ts"]
