# ============================================================
# Stage 1: Dependencies
# ============================================================

FROM node:22-alpine AS deps

WORKDIR /app

COPY package*.json ./

RUN npm ci


# ============================================================
# Stage 2: Build
# ============================================================

FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL=http://backend:5000/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build


# ============================================================
# Stage 3: Runtime
# ============================================================

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Important:
# Next.js standalone server otherwise picks up Docker's
# container HOSTNAME. Explicitly bind the HTTP server to
# all container interfaces.
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1

CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]