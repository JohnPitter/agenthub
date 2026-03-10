# Contributing to AgentHub

Obrigado por considerar contribuir para o AgentHub! 🎉

## Como Contribuir

### Reportar Bugs

Se você encontrou um bug:

1. **Verifique** se já não existe uma issue similar
2. **Crie uma nova issue** com:
   - Descrição clara do problema
   - Passos para reproduzir
   - Comportamento esperado vs atual
   - Screenshots (se aplicável)
   - Versão do Node.js e do AgentHub

### Sugerir Features

Para sugerir novas funcionalidades:

1. **Abra uma issue** com a tag `enhancement`
2. Descreva o caso de uso
3. Explique como a feature agregaria valor
4. Se possível, sugira uma implementação

### Pull Requests

1. **Fork** o repositório
2. **Crie uma branch** a partir de `master`:
   ```bash
   git checkout -b feature/minha-feature
   ```
3. **Implemente** suas mudanças
4. **Teste** localmente:
   ```bash
   pnpm build
   pnpm typecheck
   ```
5. **Commit** usando Conventional Commits:
   ```bash
   git commit -m "feat: adiciona nova funcionalidade X"
   ```
6. **Push** para sua fork:
   ```bash
   git push origin feature/minha-feature
   ```
7. **Abra um Pull Request** com:
   - Descrição clara das mudanças
   - Referência a issues relacionadas
   - Screenshots/GIFs (se UI)
   - Checklist de testes realizados

## Convenções de Código

### TypeScript

- Use **TypeScript strict mode**
- Prefira **interfaces** para tipos públicos
- Use **types** para unions e helpers internos
- Sempre adicione tipos explícitos em funções públicas

### Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — Nova funcionalidade
- `fix:` — Correção de bug
- `docs:` — Mudanças em documentação
- `style:` — Formatação, ponto e vírgula faltando, etc
- `refactor:` — Refatoração de código
- `test:` — Adição ou correção de testes
- `chore:` — Tarefas de manutenção

Exemplos:
```bash
feat(analytics): add agent ranking chart
fix(git): handle merge conflicts correctly
docs(readme): update installation steps
```

### Estrutura de Componentes React

```typescript
// 1. Imports
import { useState } from "react";
import { api } from "../lib/utils";

// 2. Types/Interfaces
interface MyComponentProps {
  id: string;
  onUpdate: (data: Data) => void;
}

// 3. Component
export function MyComponent({ id, onUpdate }: MyComponentProps) {
  // 3.1 State
  const [loading, setLoading] = useState(false);

  // 3.2 Effects
  useEffect(() => {
    // ...
  }, [id]);

  // 3.3 Handlers
  const handleClick = async () => {
    // ...
  };

  // 3.4 Render
  return (
    <div className="...">
      {/* JSX */}
    </div>
  );
}
```

### CSS (Tailwind)

- Prefira **utility classes** do Tailwind
- Use `cn()` para classes condicionais:
  ```typescript
  className={cn(
    "base-classes",
    active && "active-classes",
    error && "error-classes"
  )}
  ```
- Evite `@apply` (use utilities diretamente)

### Backend

- Use `async/await` ao invés de Promises diretas
- Sempre trate erros com try/catch
- Use o logger estruturado:
  ```typescript
  logger.info("Task created", "tasks", { taskId });
  logger.error("Failed to create task", "tasks", { error });
  ```
- Valide inputs com Zod schemas

## Estrutura de Pastas

```
apps/
  web/
    src/
      components/   # Componentes reutilizáveis
      routes/       # Páginas (rotas)
      hooks/        # Custom hooks
      stores/       # Estado global (Zustand)
      lib/          # Utilities e helpers
  orchestrator/
    src/
      routes/       # Routers Express
      agents/       # Lógica de agents
      git/          # Git service
      realtime/     # WebSocket handlers
      lib/          # Utilities
packages/
  database/
    src/
      schema/       # Schemas Drizzle
  shared/
    src/
      types/        # Tipos compartilhados
      constants/    # Constantes
```

## Testes

### Rodando Testes

```bash
# Unit tests (quando implementados)
pnpm test

# Type checking
pnpm typecheck

# Build test
pnpm build
```

### Escrevendo Testes

- Um arquivo de teste por componente/função
- Nomeie arquivos como `*.test.ts` ou `*.test.tsx`
- Use describe/it para estruturar
- Teste casos de sucesso e erro
- Mock dependências externas

## Desenvolvimento Local

### Setup Inicial

```bash
# Instalar dependências
pnpm install

# Copiar .env.example
cp apps/orchestrator/.env.example apps/orchestrator/.env

# Adicionar sua API key
# OPENROUTER_API_KEY=sk-or-...

# Rodar migrations
pnpm db:push

# Seed database (opcional)
pnpm db:seed
```

### Dev Workflow

```bash
# Terminal 1: Backend
pnpm dev:orchestrator

# Terminal 2: Frontend
pnpm dev:web

# Terminal 3: Type checking (watch mode)
pnpm typecheck --watch
```

### Debugging

- Use `console.log` ou `logger.*` no backend
- Use React DevTools no frontend
- Use `debugger;` statements quando necessário
- Backend logs aparecem no terminal do orchestrator

## Database Migrations

Quando alterar schemas:

```bash
# Push mudanças para o DB
pnpm db:push

# Abrir Drizzle Studio (GUI)
pnpm db:studio
```

## Review Process

Pull Requests passam por:

1. **Type checking** — `pnpm typecheck`
2. **Build test** — `pnpm build`
3. **Code review** — Pelos mantenedores
4. **Manual testing** — Funcionalidade testada localmente

## Questões?

- Abra uma [issue de pergunta](https://github.com/seu-usuario/agenthub/issues/new)
- Ou entre em contato através do GitHub Discussions

---

**Obrigado por contribuir! 🚀**
