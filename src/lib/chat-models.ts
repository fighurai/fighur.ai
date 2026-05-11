export type ChatProvider = "anthropic" | "openai" | "groq" | "openrouter" | "nvidia";

export type ChatModelOption = {
  id: string;
  label: string;
  provider: ChatProvider;
  /** Model id passed to the upstream API (after provider prefix stripped in route) */
  apiModel: string;
};

/** Curated list — add keys in .env for each provider you use */
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    id: "anthropic:claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5",
    provider: "anthropic",
    apiModel: "claude-sonnet-4-5-20250929",
  },
  {
    id: "openai:gpt-4o-mini",
    label: "GPT-4o mini (OpenAI)",
    provider: "openai",
    apiModel: "gpt-4o-mini",
  },
  {
    id: "openai:gpt-4o",
    label: "GPT-4o (OpenAI)",
    provider: "openai",
    apiModel: "gpt-4o",
  },
  {
    id: "groq:llama-3.3-70b-versatile",
    label: "Llama 3.3 70B (Groq)",
    provider: "groq",
    apiModel: "llama-3.3-70b-versatile",
  },
  {
    id: "groq:openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq)",
    provider: "groq",
    apiModel: "openai/gpt-oss-120b",
  },
  {
    id: "groq:mixtral-8x7b-32768",
    label: "Mixtral 8x7B (Groq)",
    provider: "groq",
    apiModel: "mixtral-8x7b-32768",
  },
  {
    id: "openrouter:nvidia-nemotron-3-super-free",
    label: "Nemotron 3 Super (OpenRouter · free)",
    provider: "openrouter",
    apiModel: "nvidia/nemotron-3-super-120b-a12b:free",
  },
  {
    id: "openrouter:nvidia-nemotron-3-super",
    label: "Nemotron 3 Super (OpenRouter)",
    provider: "openrouter",
    apiModel: "nvidia/nemotron-3-super-120b-a12b",
  },
  {
    id: "openrouter:qwen/qwen2.5-72b-instruct",
    label: "Qwen 2.5 72B (OpenRouter)",
    provider: "openrouter",
    apiModel: "qwen/qwen2.5-72b-instruct",
  },
  {
    id: "openrouter:meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B (OpenRouter)",
    provider: "openrouter",
    apiModel: "meta-llama/llama-3.3-70b-instruct",
  },
  {
    id: "nvidia:nvidia/nemotron-4-340b-instruct",
    label: "Nemotron 4 340B (NVIDIA Spark / NIM)",
    provider: "nvidia",
    apiModel: "nvidia/nemotron-4-340b-instruct",
  },
  {
    id: "nvidia:meta/llama-3.1-405b-instruct",
    label: "Llama 3.1 405B (NVIDIA Spark / NIM)",
    provider: "nvidia",
    apiModel: "meta/llama-3.1-405b-instruct",
  },
];

function envHas(provider: ChatProvider): boolean {
  switch (provider) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY?.trim());
    case "groq":
      return Boolean(process.env.GROQ_API_KEY?.trim());
    case "openrouter":
      return Boolean(process.env.OPENROUTER_API_KEY?.trim());
    case "nvidia":
      return Boolean(process.env.NVIDIA_API_KEY?.trim());
    default:
      return false;
  }
}

export function getChatModelAvailability(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of CHAT_MODEL_OPTIONS) {
    out[m.id] = envHas(m.provider);
  }
  return out;
}

export function getChatModelById(id: string): ChatModelOption | undefined {
  return CHAT_MODEL_OPTIONS.find((m) => m.id === id);
}

/** Resolves client model id (may be stale after config changes) to a valid option. */
export function resolveChatModelOption(requestedId?: string | null): ChatModelOption {
  if (requestedId) {
    const found = getChatModelById(requestedId);
    if (found) return found;
  }
  const byDefault = getChatModelById(pickDefaultModelId());
  if (byDefault) return byDefault;
  return CHAT_MODEL_OPTIONS[0];
}

export function pickDefaultModelId(): string {
  const envModel =
    process.env.SMILE_DEFAULT_CHAT_MODEL?.trim() ||
    process.env.FIGHURAI_DEFAULT_CHAT_MODEL?.trim();
  if (envModel) {
    const opt = CHAT_MODEL_OPTIONS.find((m) => m.id === envModel);
    if (opt && envHas(opt.provider)) return envModel;
  }
  for (const m of CHAT_MODEL_OPTIONS) {
    if (envHas(m.provider)) return m.id;
  }
  return CHAT_MODEL_OPTIONS[0].id;
}
