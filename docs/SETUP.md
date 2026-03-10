# AgentHub - Setup Guide

Guia completo para configurar o AgentHub em uma nova máquina.

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** 18+ ([download](https://nodejs.org/))
- **pnpm** 8+ (instalar: `npm install -g pnpm`)
- **Git** ([download](https://git-scm.com/))
- **OpenRouter API Key** (opcional — [obter aqui](https://openrouter.ai/keys) ou configurar via painel Admin)

## 🚀 Instalação Rápida

### 1. Clone o repositório

```bash
git clone https://github.com/JohnPitter/agenthub.git
cd agenthub
```

### 2. Instale as dependências

```bash
pnpm install
```

Este comando irá:
- Instalar todas as dependências do monorepo
- Configurar os workspaces (web, orchestrator, packages)
- Preparar o ambiente de desenvolvimento

### 3. Configure as variáveis de ambiente

```bash
# Copie o template de configuração
cp apps/orchestrator/.env.example apps/orchestrator/.env
```

Edite o arquivo `apps/orchestrator/.env` e configure:

```bash
# OPCIONAL (pode ser configurado via Admin panel)
# OPENROUTER_API_KEY=sk-or-xxxxx

# RECOMENDADO - Gere uma chave de criptografia
# Execute este comando e copie o resultado:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=sua_chave_gerada_aqui
```

### 4. Inicialize o banco de dados

```bash
pnpm db:push
```

Este comando cria as tabelas necessárias no SQLite.

**(Opcional)** Popule com dados de exemplo:
```bash
pnpm db:seed
```

### 5. Build do projeto

```bash
pnpm build
```

### 6. Inicie o servidor

**Opção 1: Development mode (hot reload)**
```bash
# Terminal 1: Backend
pnpm dev:orchestrator

# Terminal 2: Frontend
pnpm dev:web
```

**Opção 2: Production mode**
```bash
pnpm start
```

### 7. Acesse a aplicação

Abra seu navegador em:
- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001

## 🔧 Configuração Avançada

### Database Location

Por padrão, o banco SQLite é criado em `apps/orchestrator/data/agenthub.db`.

Para alterar, edite no `.env`:
```bash
DATABASE_PATH=./custom/path/agenthub.db
```

### Porta Customizada

Para usar uma porta diferente:
```bash
ORCHESTRATOR_PORT=8080
```

E atualize também em `apps/web/src/lib/socket.ts`:
```typescript
const SOCKET_URL = "http://localhost:8080";
```

### Git Integration

Para usar as features de Git:

1. Certifique-se de ter Git instalado: `git --version`
2. Configure credenciais Git (SSH ou HTTPS)
3. Na UI do AgentHub, vá em **Project Settings → Git**
4. Configure o remote URL e método de autenticação

**SSH:**
```bash
# Gere uma SSH key se não tiver
ssh-keygen -t ed25519 -C "seu-email@example.com"

# Adicione ao GitHub/GitLab
cat ~/.ssh/id_ed25519.pub
```

**HTTPS:**
- Use um Personal Access Token
- GitHub: Settings → Developer settings → Personal access tokens
- Configure no AgentHub com permissões de `repo`

### WhatsApp Integration (Opcional)

```bash
# Nenhuma configuração adicional necessária
# Na primeira conexão, escaneie o QR code
```

O AgentHub irá:
1. Gerar um QR code no console
2. Escanear com WhatsApp (Dispositivos Vinculados)
3. Salvar a sessão em `.wwebjs_auth/`

### Telegram Integration (Opcional)

```bash
# 1. Crie um bot com @BotFather no Telegram
# 2. Copie o token fornecido
# 3. Adicione ao .env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

## 🧪 Verificação da Instalação

### 1. Check de Dependências

```bash
# Verificar Node.js
node --version  # Deve ser >= 18

# Verificar pnpm
pnpm --version  # Deve ser >= 8

# Verificar Git
git --version
```

### 2. Type Checking

```bash
pnpm typecheck
```

Deve executar sem erros.

### 3. Build Test

```bash
pnpm build
```

Todos os packages devem buildar com sucesso.

### 4. Teste Manual

1. Acesse http://localhost:5173
2. Crie um novo projeto
3. Adicione um agent
4. Crie uma task
5. Execute a task
6. Verifique os logs no terminal do orchestrator

## 📁 Estrutura de Arquivos

Após a instalação, você terá:

```
agenthub/
├── apps/
│   ├── orchestrator/
│   │   ├── data/              # SQLite database
│   │   ├── dist/              # Build output
│   │   └── .env               # ⚠️ NÃO COMMITAR
│   └── web/
│       └── dist/              # Build output
├── node_modules/              # Dependencies
├── .turbo/                    # Turbo cache
└── pnpm-lock.yaml            # Lock file
```

## 🐛 Troubleshooting

### Erro: "OpenRouter API key not configured"

**Solução:** Configure a API key do OpenRouter via painel Admin ou adicione `OPENROUTER_API_KEY` no arquivo `.env` em `apps/orchestrator/.env`.

### Erro: "Port 3001 already in use"

**Solução:**
```bash
# Opção 1: Mate o processo na porta 3001
# Windows:
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:3001 | xargs kill -9

# Opção 2: Use outra porta no .env
ORCHESTRATOR_PORT=3002
```

### Erro: "Module not found"

**Solução:**
```bash
# Limpe node_modules e reinstale
rm -rf node_modules
pnpm install
```

### Database não cria

**Solução:**
```bash
# Crie o diretório manualmente
mkdir -p apps/orchestrator/data

# Execute migration novamente
pnpm db:push
```

### WhatsApp QR Code não aparece

**Solução:**
```bash
# Limpe a sessão antiga
rm -rf .wwebjs_auth
rm -rf .wwebjs_cache

# Reinicie o orchestrator
pnpm dev:orchestrator
```

## 🔄 Atualizações

Para atualizar para a versão mais recente:

```bash
# Pull das mudanças
git pull origin master

# Reinstalar dependências (se package.json mudou)
pnpm install

# Rebuild
pnpm build

# Update database schema (se schema mudou)
pnpm db:push
```

## 📚 Próximos Passos

Após a instalação:

1. **Leia o [README.md](README.md)** para entender as features
2. **Explore o [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)** para ver o roadmap
3. **Leia o [CONTRIBUTING.md](CONTRIBUTING.md)** se quiser contribuir
4. **Experimente** criando seu primeiro projeto e agent!

## 💡 Dicas

- Use `pnpm db:studio` para visualizar o banco de dados graficamente
- Ative `DEBUG=true` no `.env` para logs detalhados
- Use o Command Palette (⌘K ou Ctrl+K) para ações rápidas na UI
- Configure git auto-commit/push nas settings do projeto

## 🆘 Precisa de Ajuda?

- **Issues:** [GitHub Issues](https://github.com/JohnPitter/agenthub/issues)
- **Documentação:** Este README e DEVELOPMENT_PLAN.md
- **Logs:** Verifique o terminal do orchestrator para erros detalhados

---

**Pronto para começar! 🚀**
