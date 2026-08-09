# Multi-stage build for production-ready Next.js app

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536

RUN npm run build

# Explicit schema migrator. Production startup validates schema and never
# mutates it, so operators run this target as a separate, auditable step.
FROM node:22-alpine AS migrator
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache bash libc6-compat \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --chown=nextjs:nodejs --from=deps /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json package-lock.json tsconfig.json ./
COPY --chown=nextjs:nodejs src ./src
COPY --chown=nextjs:nodejs scripts ./scripts
RUN mkdir -p /var/lib/chip /var/backups/chip \
    && chown -R nextjs:nodejs /var/lib/chip /var/backups/chip
USER nextjs
CMD ["npm", "run", "migrate"]

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --chown=nextjs:nodejs --from=builder /app/public ./public
COPY --chown=nextjs:nodejs --from=builder /app/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]

# Dedicated queue worker. Connect this only to a rootless, restricted container
# engine; the web image intentionally contains no container client.
FROM node:22-alpine AS eda-worker
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache bash docker-cli \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --chown=nextjs:nodejs --from=deps /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json package-lock.json tsconfig.json ./
COPY --chown=nextjs:nodejs src ./src
COPY --chown=nextjs:nodejs scripts ./scripts
RUN mkdir -p /var/lib/chip /var/backups/chip \
    && chown -R nextjs:nodejs /var/lib/chip /var/backups/chip
USER nextjs
CMD ["npm", "run", "eda:worker"]

# Authenticated enterprise integration gateway. This service owns outbound
# provider credentials and is deployed independently from the web process.
FROM node:22-alpine AS enterprise-adapter
WORKDIR /app
ENV NODE_ENV=production
ENV CHIP_ADAPTER_HOST=0.0.0.0
ENV CHIP_ADAPTER_PORT=3010
RUN apk add --no-cache libc6-compat \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --chown=nextjs:nodejs --from=deps /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json package-lock.json tsconfig.json ./
COPY --chown=nextjs:nodejs src ./src
COPY --chown=nextjs:nodejs scripts ./scripts
USER nextjs
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3010/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["npm", "run", "integrations:adapter"]

# Keep the production web server as the default image when callers use
# `docker build .` without an explicit target.
FROM runner AS production
