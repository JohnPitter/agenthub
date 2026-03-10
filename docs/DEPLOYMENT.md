# Deployment Guide

## Pré-requisitos

- Docker e Docker Compose instalados
- OpenRouter API Key (opcional — pode ser configurado via Admin panel)
- Git instalado no host (para operações git dos agentes)

## Deploy com Docker Compose (Recomendado)

### 1. Configurar variáveis de ambiente

```bash
# Criar arquivo .env na raiz do projeto
cat > .env << EOF
OPENROUTER_API_KEY=sk-or-...
EOF
```

### 2. Build e start

```bash
# Build das imagens
docker compose build

# Iniciar em background
docker compose up -d

# Verificar logs
docker compose logs -f
```

### 3. Acessar

- **Web UI:** http://localhost
- **API:** http://localhost:3001

### 4. Parar

```bash
docker compose down
```

## Deploy Manual (sem Docker)

### 1. Instalar dependências

```bash
pnpm install
pnpm build
```

### 2. Configurar ambiente

```bash
export OPENROUTER_API_KEY=sk-or-...
export ORCHESTRATOR_PORT=3001
export NODE_ENV=production
```

### 3. Iniciar o orchestrator

```bash
cd apps/orchestrator
node dist/index.js
```

### 4. Servir o frontend

O frontend é estático (build em `apps/web/dist`). Sirva com nginx, caddy, ou qualquer servidor HTTP:

```bash
# Exemplo com serve
npx serve apps/web/dist -p 80
```

## Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Não | — | API key do OpenRouter (pode ser configurada via Admin panel) |
| `ORCHESTRATOR_PORT` | Não | `3001` | Porta do servidor backend |
| `NODE_ENV` | Não | `development` | Ambiente (`production` em deploy) |

## Volumes e Dados

### SQLite Database
O banco de dados SQLite é salvo em `~/.agenthub/agenthub.db`. No Docker, é mapeado via volume:

```yaml
volumes:
  agenthub-data:  # Persiste em /root/.agenthub
```

### Backup

```bash
# Backup do banco
docker compose exec orchestrator cp /root/.agenthub/agenthub.db /root/.agenthub/backup.db
docker compose cp orchestrator:/root/.agenthub/backup.db ./backup.db
```

## Desenvolvimento com Docker

Para desenvolvimento com hot-reload:

```bash
docker compose -f docker-compose.dev.yml up
```

Isso monta os diretórios `src/` como volumes, permitindo edição local com reload automático.

## Troubleshooting

### Porta em uso
```bash
# Verificar processos usando a porta
lsof -i :3001
lsof -i :80
```

### Banco corrompido
```bash
# Remover e recriar
docker compose down -v  # Remove volumes
docker compose up -d    # Recria tudo
```

### Logs do container
```bash
docker compose logs orchestrator
docker compose logs web
```
