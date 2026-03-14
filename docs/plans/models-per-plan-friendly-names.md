# Plano: Modelos por Plano + Nomes Amigáveis

**Data:** 2026-03-14
**Complexidade:** Complexa (schema, backend, frontend, shared)

## Objetivo

1. Admin pode escolher quais modelos cada plano pode usar
2. Seleção de modelos nos agentes respeita os modelos do plano do usuário
3. Nomes de modelos exibidos de forma amigável e agrupados por provider

## Arquivos Afetados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `packages/shared/src/constants/models.ts` | **Criar** | MODEL_CATALOG com id, label, provider, category |
| `packages/shared/src/index.ts` | **Modificar** | Exportar MODEL_CATALOG |
| `packages/database/src/schema/plans.ts` | **Modificar** | Adicionar `allowedModels` jsonb |
| `apps/orchestrator/src/routes/admin.ts` | **Modificar** | Aceitar allowedModels no CRUD de plans |
| `apps/orchestrator/src/routes/plans.ts` | **Modificar** | GET /plans/models filtra por plano do usuário |
| `apps/web/src/routes/agents.tsx` | **Modificar** | Usar MODEL_CATALOG para labels, remover MODEL_LABELS hardcoded |
| `apps/web/src/components/agents/agent-config-dialog.tsx` | **Modificar** | Agrupar modelos por provider com nomes amigáveis |
| `apps/web/src/routes/admin.tsx` | **Modificar** | Adicionar seleção de modelos por plano |
| `apps/web/src/stores/admin-store.ts` | **Modificar** | Plan interface com allowedModels |

## Fluxo

1. Admin configura OpenRouter → habilita modelos globalmente
2. Admin cria plano → escolhe subset de modelos habilitados para aquele plano
3. Usuário seleciona plano
4. Ao configurar agente → GET /plans/models retorna apenas modelos do plano do usuário
5. Nomes exibidos como "Claude Sonnet 4.5" ao invés de "claude-sonnet-4-5-20250929"
