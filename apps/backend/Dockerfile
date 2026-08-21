# ── Stage 1: Install dependencies ────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --prefer-offline

# ── Stage 2: Build TypeScript ─────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl
COPY package*.json tsconfig.json ./
RUN npm install --prefer-offline

COPY prisma/ ./prisma/
COPY src/ ./src/

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

# Copy prisma schema for migrations
COPY prisma/ ./prisma/

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/ || exit 1

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
