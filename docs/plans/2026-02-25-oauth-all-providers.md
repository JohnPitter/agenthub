# Plano: OAuth direto pelo AgentHub para todos os provedores

## Objetivo

Permitir que os usuários conectem OpenAI e Gemini via OAuth diretamente pelo browser do AgentHub, sem precisar instalar CLIs externos (Codex CLI, Gemini CLI). Claude não tem OAuth público — apenas API key.

## Estado Atual

| Provedor | API Key | OAuth CLI | OAuth Browser |
|----------|---------|-----------|---------------|
| Claude   | Env var | N/A       | N/A (Anthropic não tem OAuth público) |
| OpenAI   | Env/DB  | ~/.codex/auth.json | **JÁ EXISTE** (`/api/openai/oauth/start`) |
| Gemini   | Env/DB  | ~/.gemini/oauth_creds.json | **NÃO EXISTE** |

## O que precisa ser feito

### 1. Gemini OAuth via Browser (NOVO)

Criar o mesmo flow PKCE que já existe para OpenAI, mas usando Google OAuth2.

**Credenciais OAuth do Gemini CLI (públicas):**
- Client ID: set via `GEMINI_OAUTH_CLIENT_ID` env var
- Client Secret: set via `GEMINI_OAUTH_CLIENT_SECRET` env var
- Auth URL: `https://accounts.google.com/o/oauth2/v2/auth`
- Token URL: `https://oauth2.googleapis.com/token`
- Scopes: `openid email profile https://www.googleapis.com/auth/cloud-platform`
- Redirect URI: `http://localhost:3001/callback/gemini`

**Arquivos a criar/modificar:**

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `apps/orchestrator/src/routes/gemini-oauth.ts` | CRIAR | Rotas OAuth: `/start`, `/connection`, `/disconnect`, callback handler |
| `apps/orchestrator/src/services/gemini-oauth.ts` | MODIFICAR | Adicionar `buildGeminiAuthUrl()`, `exchangeGeminiCode()`, PKCE helpers |
| `apps/orchestrator/src/routes/gemini.ts` | MODIFICAR | Montar `geminiOAuthRouter` no path correto |
| `apps/orchestrator/src/index.ts` | MODIFICAR | Registrar callback público `/callback/gemini` |
| `apps/web/src/routes/settings.tsx` | MODIFICAR | Botão "Conectar com Google" no Gemini section |
| `apps/web/src/stores/usage-store.ts` | MODIFICAR | Adicionar fetch de `/api/gemini/oauth/connection` |

### 2. OpenAI — já funciona via browser

O flow já existe completo:
- Backend: `codex-oauth.ts` (service) + `codex-oauth-routes.ts` (routes)
- Frontend: botão existe mas pode não estar funcionando visualmente
- Verificar se o botão "Conectar com OpenAI" está abrindo o popup corretamente

### 3. Claude — apenas API key

Anthropic não oferece OAuth público para a API. Manter apenas:
- `ANTHROPIC_API_KEY` env var
- Possibilidade de salvar API key via Settings (integrations table) — ADICIONAR se não existe

### 4. Frontend Settings — unificar UX

Todos os provedores devem ter a mesma UX:
1. Botão primário: "Conectar com [Provedor]" (OAuth — onde disponível)
2. Alternativa: "Usar API Key" (campo de texto)
3. Status: Conectado (source: oauth/api_key/env)

## Implementação Detalhada

### Passo 1: `gemini-oauth.ts` — adicionar funções de OAuth browser

```typescript
// Adicionar ao arquivo existente:
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/cloud-platform";

export function buildGeminiAuthUrl(redirectUri: string, codeVerifier: string, state: string): string {
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: GEMINI_OAUTH_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: GOOGLE_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGeminiCode(code: string, redirectUri: string, codeVerifier: string): Promise<GeminiCredentials> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: GEMINI_OAUTH_CLIENT_ID,
      client_secret: GEMINI_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  // ... parse response, save to ~/.gemini/oauth_creds.json
}
```

### Passo 2: `gemini-oauth-routes.ts` — rotas OAuth

Seguir mesmo padrão do `codex-oauth.ts`:
- `GET /api/gemini/oauth/start` → retorna `{ authUrl }`
- `GET /api/gemini/oauth/connection` → check status
- `POST /api/gemini/oauth/disconnect` → delete `~/.gemini/oauth_creds.json`
- `GET /callback/gemini` → public callback handler

### Passo 3: Frontend — botões OAuth

Gemini section:
```tsx
<Button onClick={async () => {
  const { authUrl } = await api("/gemini/oauth/start");
  window.open(authUrl, "_blank", "width=500,height=700");
}}>
  Conectar com Google
</Button>
```

### Passo 4: Claude API key via DB

Adicionar ao `gemini.ts` pattern:
- `GET /api/claude/status` → check env var + integrations table
- `POST /api/claude/connect` → save API key encrypted
- `POST /api/claude/disconnect` → remove

## Dependências entre passos

1. `gemini-oauth.ts` (service functions)
2. `gemini-oauth-routes.ts` (backend routes)
3. `index.ts` (register routes)
4. `settings.tsx` (frontend buttons)
5. Claude API key routes
6. Testar todos os flows

## Como testar

1. Gemini OAuth: Clicar "Conectar com Google" → login → redirect → verificar status
2. OpenAI OAuth: Clicar "Conectar com OpenAI" → login → redirect → verificar status
3. Claude API key: Colar API key → validar → verificar agentes Claude funcionam
4. Cada provedor: criar task com agent usando modelo do provedor → verificar execução
