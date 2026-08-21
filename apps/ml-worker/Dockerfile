# Build context: project ROOT
# docker-compose.yml sets: context: .  dockerfile: apps/ml-worker/Dockerfile

# ── Stage 1: Dependencies ─────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY apps/ml-worker/package*.json ./
RUN npm install --omit=dev --prefer-offline

# ── Stage 2: Build TypeScript ─────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl
COPY apps/ml-worker/package*.json apps/ml-worker/tsconfig.json ./
RUN npm install --prefer-offline

COPY apps/ml-worker/src/ ./src/
# Prisma schema lives in apps/backend/prisma — copy it for client generation
COPY apps/backend/prisma/schema.prisma ./prisma/

RUN npx prisma generate
RUN npm run build

# ── Stage 3: Runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Prisma engine requires openssl
RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Copy production node_modules first
COPY --from=deps /app/node_modules ./node_modules

# Copy built output and generated Prisma client over top
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

CMD ["node", "dist/index.js"]
