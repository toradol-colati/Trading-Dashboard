# ── API Gateway Dockerfile ────────────────────────────────────
# Node.js 20 Alpine — Fastify + WebSocket + node-pg-migrate
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runner

RUN addgroup -S ugt && adduser -S ugt -G ugt
WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/src/db/migrations/ ./dist/db/migrations/

USER ugt
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
