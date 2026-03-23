FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production \
    PORT=3210 \
    GW_HOST=127.0.0.1 \
    GW_PORT=18789 \
    HOME=/home/node

WORKDIR /data

RUN mkdir -p /app/dist /home/node/.openclaw/agents/main/sessions /data \
  && chown -R node:node /app /data /home/node/.openclaw

COPY --from=builder --chown=node:node /app/dist /app/dist

USER node

EXPOSE 3210

CMD ["node", "/app/dist/server.js"]
