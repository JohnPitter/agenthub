# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy ALL source first, then install (pnpm creates node_modules after source exists)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json turbo.json ./
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/web apps/web
COPY apps/orchestrator apps/orchestrator

# Install dependencies (node_modules created here, not overwritten by COPY)
RUN pnpm install --frozen-lockfile

# Build all packages in dependency order
RUN pnpm --filter @agenthub/shared build
RUN pnpm --filter @agenthub/database build
RUN pnpm --filter @agenthub/orchestrator build
RUN pnpm --filter @agenthub/web build

# ---- Stage 2: Runtime ----
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install nginx + git + chromium (for WhatsApp / Puppeteer) + build tools (native modules)
RUN apk add --no-cache nginx git chromium nss freetype harfbuzz ca-certificates ttf-freefont python3 make g++

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy orchestrator build + runtime deps
COPY --from=builder /app/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=builder /app/apps/orchestrator/package.json ./apps/orchestrator/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/apps/orchestrator/node_modules ./apps/orchestrator/node_modules
COPY package.json pnpm-workspace.yaml ./

# Copy web build (static files)
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Nginx config
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

CMD ["sh", "-c", "cd /app/apps/orchestrator && node dist/index.js & nginx -g 'daemon off;'"]
