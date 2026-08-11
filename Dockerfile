# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build ----
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY mcp/package.json mcp/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

# --------------------------------------------------------------- runtime ----
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/server/package.json server/
RUN npm ci --omit=dev -w @agentic-kanban/server

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

# The container runs as `node`; make sure the volume mount point is writable.
RUN mkdir -p /data && chown node:node /data

ENV PORT=3001 \
    KANBAN_DB=/data/kanban.db \
    KANBAN_WEB_DIST=/app/web/dist
VOLUME /data
EXPOSE 3001

USER node
CMD ["node", "server/dist/index.js"]
