export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  /** Primary use case: Coding, Reasoning, General, Fast, Budget */
  category: string;
  /** Skill tags for filtering and display */
  tags: string[];
}

/** All available model categories */
export const MODEL_CATEGORIES = [
  { id: "coding", label: "Coding", description: "Otimizados para geração e edição de código", icon: "Code2" },
  { id: "reasoning", label: "Raciocínio", description: "Pensamento profundo e resolução de problemas complexos", icon: "Brain" },
  { id: "general", label: "General", description: "Balanceados para múltiplas tarefas", icon: "Sparkles" },
  { id: "fast", label: "Rápido", description: "Respostas rápidas com boa qualidade", icon: "Zap" },
  { id: "budget", label: "Econômico", description: "Baixo custo para tarefas simples", icon: "DollarSign" },
  { id: "vision", label: "Visão", description: "Suporte a imagens e multimodal", icon: "Eye" },
] as const;

export type ModelCategory = typeof MODEL_CATEGORIES[number]["id"];

/**
 * Catalog of AI models verified against OpenRouter API (2026-03-14).
 * Each entry includes friendly label, provider, category, and skill tags.
 */
export const MODEL_CATALOG: Record<string, ModelInfo> = {
  // ═══════════════════════════════════════════
  // Anthropic
  // ═══════════════════════════════════════════
  "anthropic/claude-opus-4.6": {
    id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6", provider: "Anthropic",
    category: "coding", tags: ["melhor-codigo", "raciocinio", "1M-contexto", "premium"],
  },
  "anthropic/claude-opus-4.5": {
    id: "anthropic/claude-opus-4.5", label: "Claude Opus 4.5", provider: "Anthropic",
    category: "reasoning", tags: ["raciocinio", "criativo", "premium"],
  },
  "anthropic/claude-opus-4.1": {
    id: "anthropic/claude-opus-4.1", label: "Claude Opus 4.1", provider: "Anthropic",
    category: "coding", tags: ["codigo", "raciocinio", "premium"],
  },
  "anthropic/claude-opus-4": {
    id: "anthropic/claude-opus-4", label: "Claude Opus 4", provider: "Anthropic",
    category: "coding", tags: ["codigo", "raciocinio", "premium"],
  },
  "anthropic/claude-sonnet-4.6": {
    id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "Anthropic",
    category: "coding", tags: ["melhor-custo-beneficio", "codigo", "1M-contexto"],
  },
  "anthropic/claude-sonnet-4.5": {
    id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic",
    category: "general", tags: ["balanceado", "codigo", "1M-contexto"],
  },
  "anthropic/claude-sonnet-4": {
    id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", provider: "Anthropic",
    category: "general", tags: ["balanceado", "codigo"],
  },
  "anthropic/claude-3.7-sonnet": {
    id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet", provider: "Anthropic",
    category: "general", tags: ["balanceado", "thinking"],
  },
  "anthropic/claude-3.7-sonnet:thinking": {
    id: "anthropic/claude-3.7-sonnet:thinking", label: "Claude 3.7 Sonnet (Thinking)", provider: "Anthropic",
    category: "reasoning", tags: ["raciocinio", "thinking"],
  },
  "anthropic/claude-haiku-4.5": {
    id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic",
    category: "fast", tags: ["rapido", "economico", "codigo"],
  },
  "anthropic/claude-3.5-haiku": {
    id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", provider: "Anthropic",
    category: "fast", tags: ["rapido", "economico"],
  },
  "anthropic/claude-3-haiku": {
    id: "anthropic/claude-3-haiku", label: "Claude 3 Haiku", provider: "Anthropic",
    category: "budget", tags: ["mais-barato", "rapido"],
  },

  // ═══════════════════════════════════════════
  // OpenAI
  // ═══════════════════════════════════════════
  "openai/o3": {
    id: "openai/o3", label: "o3", provider: "OpenAI",
    category: "reasoning", tags: ["melhor-raciocinio", "matematica", "premium"],
  },
  "openai/o4-mini": {
    id: "openai/o4-mini", label: "o4 Mini", provider: "OpenAI",
    category: "reasoning", tags: ["raciocinio", "custo-beneficio"],
  },
  "openai/gpt-4.1": {
    id: "openai/gpt-4.1", label: "GPT-4.1", provider: "OpenAI",
    category: "coding", tags: ["codigo", "instrucoes", "balanceado"],
  },
  "openai/gpt-4.1-mini": {
    id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "OpenAI",
    category: "fast", tags: ["rapido", "codigo", "custo-beneficio"],
  },
  "openai/gpt-4.1-nano": {
    id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "OpenAI",
    category: "budget", tags: ["mais-barato", "rapido"],
  },

  // ═══════════════════════════════════════════
  // Google
  // ═══════════════════════════════════════════
  "google/gemini-3.1-pro-preview": {
    id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "Google",
    category: "coding", tags: ["codigo", "raciocinio", "1M-contexto"],
  },
  "google/gemini-3-pro-preview": {
    id: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", provider: "Google",
    category: "general", tags: ["balanceado", "1M-contexto"],
  },
  "google/gemini-3-flash-preview": {
    id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", provider: "Google",
    category: "fast", tags: ["rapido", "1M-contexto"],
  },
  "google/gemini-2.5-pro": {
    id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google",
    category: "reasoning", tags: ["raciocinio", "codigo", "1M-contexto"],
  },
  "google/gemini-2.5-flash": {
    id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google",
    category: "fast", tags: ["rapido", "custo-beneficio", "1M-contexto"],
  },
  "google/gemini-2.5-flash-lite": {
    id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "Google",
    category: "budget", tags: ["mais-barato", "rapido", "1M-contexto"],
  },
  "google/gemini-2.0-flash-001": {
    id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", provider: "Google",
    category: "budget", tags: ["mais-barato", "rapido", "1M-contexto"],
  },

  // ═══════════════════════════════════════════
  // DeepSeek
  // ═══════════════════════════════════════════
  "deepseek/deepseek-r1-0528": {
    id: "deepseek/deepseek-r1-0528", label: "DeepSeek R1", provider: "DeepSeek",
    category: "reasoning", tags: ["raciocinio", "economico", "open-source"],
  },
  "deepseek/deepseek-v3.2": {
    id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", provider: "DeepSeek",
    category: "coding", tags: ["codigo", "mais-barato", "open-source"],
  },
  "deepseek/deepseek-chat-v3.1": {
    id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", provider: "DeepSeek",
    category: "general", tags: ["balanceado", "economico", "open-source"],
  },

  // ═══════════════════════════════════════════
  // Mistral
  // ═══════════════════════════════════════════
  "mistralai/codestral-2508": {
    id: "mistralai/codestral-2508", label: "Codestral", provider: "Mistral",
    category: "coding", tags: ["codigo", "256K-contexto"],
  },
  "mistralai/devstral-medium": {
    id: "mistralai/devstral-medium", label: "Devstral Medium", provider: "Mistral",
    category: "coding", tags: ["codigo", "agentes"],
  },
  "mistralai/devstral-small": {
    id: "mistralai/devstral-small", label: "Devstral Small", provider: "Mistral",
    category: "coding", tags: ["codigo", "economico"],
  },
  "mistralai/mistral-large": {
    id: "mistralai/mistral-large", label: "Mistral Large", provider: "Mistral",
    category: "general", tags: ["balanceado", "multilingual"],
  },

  // ═══════════════════════════════════════════
  // Meta (Llama)
  // ═══════════════════════════════════════════
  "meta-llama/llama-4-maverick": {
    id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "Meta",
    category: "general", tags: ["1M-contexto", "open-source"],
  },
  "meta-llama/llama-4-scout": {
    id: "meta-llama/llama-4-scout", label: "Llama 4 Scout", provider: "Meta",
    category: "fast", tags: ["rapido", "open-source", "327K-contexto"],
  },
  "meta-llama/llama-3.3-70b-instruct": {
    id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "Meta",
    category: "budget", tags: ["economico", "open-source"],
  },

  // ═══════════════════════════════════════════
  // Cohere
  // ═══════════════════════════════════════════
  "cohere/command-a": {
    id: "cohere/command-a", label: "Command A", provider: "Cohere",
    category: "general", tags: ["agentes", "256K-contexto"],
  },

  // ═══════════════════════════════════════════
  // Codex (ChatGPT OAuth — internal)
  // ═══════════════════════════════════════════
  "gpt-5.3-codex": {
    id: "gpt-5.3-codex", label: "GPT-5.3 Codex", provider: "OpenAI",
    category: "coding", tags: ["codigo", "agentes"],
  },
  "gpt-5.2-codex": {
    id: "gpt-5.2-codex", label: "GPT-5.2 Codex", provider: "OpenAI",
    category: "coding", tags: ["codigo", "agentes"],
  },
  "gpt-5.1-codex": {
    id: "gpt-5.1-codex", label: "GPT-5.1 Codex", provider: "OpenAI",
    category: "coding", tags: ["codigo", "agentes"],
  },
  "gpt-5-codex-mini": {
    id: "gpt-5-codex-mini", label: "GPT-5 Codex Mini", provider: "OpenAI",
    category: "coding", tags: ["codigo", "economico"],
  },

  // ═══════════════════════════════════════════
  // Aliases (non-OpenRouter format for DEFAULT_AGENTS)
  // ═══════════════════════════════════════════
  "claude-opus-4-6": {
    id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "Anthropic",
    category: "coding", tags: ["melhor-codigo", "raciocinio", "1M-contexto", "premium"],
  },
  "claude-sonnet-4-5-20250929": {
    id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", provider: "Anthropic",
    category: "general", tags: ["balanceado", "codigo", "1M-contexto"],
  },
  "claude-haiku-4-5-20251001": {
    id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "Anthropic",
    category: "fast", tags: ["rapido", "economico"],
  },
};

/** Get friendly label for a model ID. Falls back to formatted ID if not in catalog. */
export function getModelLabel(modelId: string): string {
  const info = MODEL_CATALOG[modelId];
  if (info) return info.label;
  const parts = modelId.split("/");
  const name = parts[parts.length - 1] ?? modelId;
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Get provider for a model ID */
export function getModelProvider(modelId: string): string {
  const info = MODEL_CATALOG[modelId];
  if (info) return info.provider;
  const parts = modelId.split("/");
  return parts.length > 1 ? (parts[0]?.charAt(0).toUpperCase() + (parts[0]?.slice(1) ?? "")) : "Unknown";
}

/** Get category for a model ID */
export function getModelCategory(modelId: string): string {
  return MODEL_CATALOG[modelId]?.category ?? "general";
}

/** Get tags for a model ID */
export function getModelTags(modelId: string): string[] {
  return MODEL_CATALOG[modelId]?.tags ?? [];
}

/** Tag display labels and colors */
export const TAG_CONFIG: Record<string, { label: string; color: string }> = {
  "melhor-codigo": { label: "Melhor p/ Código", color: "text-brand bg-brand-light" },
  "melhor-raciocinio": { label: "Melhor p/ Raciocínio", color: "text-purple bg-purple-light" },
  "melhor-custo-beneficio": { label: "Melhor Custo-Benefício", color: "text-success bg-success-light" },
  "mais-barato": { label: "Mais Barato", color: "text-success bg-success-light" },
  "codigo": { label: "Código", color: "text-info bg-info-light" },
  "raciocinio": { label: "Raciocínio", color: "text-purple bg-purple-light" },
  "thinking": { label: "Thinking", color: "text-purple bg-purple-light" },
  "rapido": { label: "Rápido", color: "text-warning bg-warning-light" },
  "economico": { label: "Econômico", color: "text-success bg-success-light" },
  "premium": { label: "Premium", color: "text-warning bg-warning-light" },
  "balanceado": { label: "Balanceado", color: "text-info bg-info-light" },
  "open-source": { label: "Open Source", color: "text-neutral-fg2 bg-neutral-bg3" },
  "1M-contexto": { label: "1M Contexto", color: "text-brand bg-brand-light" },
  "256K-contexto": { label: "256K Contexto", color: "text-brand bg-brand-light" },
  "327K-contexto": { label: "327K Contexto", color: "text-brand bg-brand-light" },
  "agentes": { label: "Agentes", color: "text-info bg-info-light" },
  "criativo": { label: "Criativo", color: "text-purple bg-purple-light" },
  "instrucoes": { label: "Instruções", color: "text-info bg-info-light" },
  "multilingual": { label: "Multilingual", color: "text-neutral-fg2 bg-neutral-bg3" },
  "matematica": { label: "Matemática", color: "text-purple bg-purple-light" },
};
