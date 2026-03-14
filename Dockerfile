# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/web/package.json apps/web/
COPY apps/orchestrator/package.json apps/orchestrator/

RUN pnpm install --frozen-lockfile

# ---- Stage 2: Build ----
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/orchestrator/node_modules ./apps/orchestrator/node_modules

COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/web apps/web
COPY apps/orchestrator apps/orchestrator
COPY tsconfig.json turbo.json ./

# Build packages first (shared → database → orchestrator)
RUN pnpm --filter @agenthub/shared build
RUN pnpm --filter @agenthub/database build

# Build orchestrator (backend)
RUN pnpm --filter @agenthub/orchestrator build

# Build web (frontend)
RUN pnpm --filter @agenthub/web build

# ---- Stage 3: Runtime ----
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install nginx + git + chromium (for WhatsApp Web.js / Puppeteer)
RUN apk add --no-cache nginx git chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Tell Puppeteer to use system Chromium instead of downloading its own
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy orchestrator build + runtime deps
COPY --from=builder /app/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=builder /app/apps/orchestrator/package.json ./apps/orchestrator/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/database ./packages/database
COPY --from=deps /app/apps/orchestrator/node_modules ./apps/orchestrator/node_modules
COPY package.json pnpm-workspace.yaml ./

# Copy web build (static files)
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Nginx config — serves frontend + proxies /api and /socket.io to orchestrator
RUN mkdir -p /run/nginx && printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    location /api/ {\n\
        proxy_pass http://127.0.0.1:3001;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Upgrade $http_upgrade;\n\
        proxy_set_header Connection "upgrade";\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
\n\
    location /socket.io/ {\n\
        proxy_pass http://127.0.0.1:3001;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Upgrade $http_upgrade;\n\
        proxy_set_header Connection "upgrade";\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
    }\n\
\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
        expires 30d;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/http.d/default.conf

ENV NODE_ENV=production
ENV ORCHESTRATOR_PORT=3001

EXPOSE 80

# Start both nginx and orchestrator
CMD sh -c "cd /app/apps/orchestrator && node dist/index.js & nginx -g 'daemon off;'"