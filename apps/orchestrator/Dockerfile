# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/orchestrator/package.json apps/orchestrator/

RUN pnpm install --frozen-lockfile

# ---- Stage 2: Build ----
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/apps/orchestrator/node_modules ./apps/orchestrator/node_modules

COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/orchestrator apps/orchestrator
COPY tsconfig.json turbo.json ./

RUN pnpm --filter @agenthub/orchestrator build

# ---- Stage 3: Runtime ----
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy built output and runtime deps
COPY --from=builder /app/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=builder /app/apps/orchestrator/package.json ./apps/orchestrator/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared ./packages/shared
COPY --from=deps /app/packages/database ./packages/database
COPY --from=deps /app/apps/orchestrator/node_modules ./apps/orchestrator/node_modules
COPY package.json pnpm-workspace.yaml ./

# Data directory for SQLite
RUN mkdir -p /root/.agenthub

ENV NODE_ENV=production
ENV ORCHESTRATOR_PORT=3001

EXPOSE 3001

WORKDIR /app/apps/orchestrator

CMD ["node", "dist/index.js"]
