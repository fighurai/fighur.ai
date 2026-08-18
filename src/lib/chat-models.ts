export type ChatProvider = "anthropic" | "openai" | "groq" | "openrouter" | "nvidia";

export type ChatModelOption = {
  id: string;
  label: string;
  provider: ChatProvider;
  /** Model id passed to the upstream API (after provider prefix stripped in route) */
  apiModel: string;
};

/** Single production model — UI exposes it as Auto via /api/chat/models. */
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    id: "anthropic:claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5",
    provider: "anthropic",
    apiModel: "claude-sonnet-4-5-20250929",
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

/** Resolves to a model whose provider has an API key on the server. */
export function resolveChatModelOption(requestedId?: string | null): ChatModelOption | null {
  if (requestedId) {
    const found = getChatModelById(requestedId);
    if (found && envHas(found.provider)) return found;
  }
  const defaultId = pickDefaultModelId();
  if (defaultId) {
    const byDefault = getChatModelById(defaultId);
    if (byDefault) return byDefault;
  }
  return null;
}

const PREFERRED_DEFAULT_MODEL_ID = "anthropic:claude-sonnet-4-5-20250929";

export function pickDefaultModelId(): string | null {
  const envModel =
    process.env.SMILE_DEFAULT_CHAT_MODEL?.trim() ||
    process.env.FIGHURAI_DEFAULT_CHAT_MODEL?.trim();
  if (envModel) {
    const opt = CHAT_MODEL_OPTIONS.find((m) => m.id === envModel);
    if (opt && envHas(opt.provider)) return envModel;
  }
  const claude = CHAT_MODEL_OPTIONS.find((m) => m.id === PREFERRED_DEFAULT_MODEL_ID);
  if (claude && envHas(claude.provider)) return claude.id;
  for (const m of CHAT_MODEL_OPTIONS) {
    if (envHas(m.provider)) return m.id;
  }
  return null;
}

export function listConfiguredProviders(): ChatProvider[] {
  const providers: ChatProvider[] = ["anthropic", "openai", "groq", "openrouter", "nvidia"];
  return providers.filter((p) => envHas(p));
}

export function noChatProvidersMessage(): string {
  return "Chat is temporarily unavailable. Try again in a moment.";
}

/**
 * Friendly Auto-pill label from an API / catalog model id.
 * e.g. anthropic:claude-sonnet-4-5-20250929 → "Claude Sonnet 4.5"
 */
export function formatRoutedModelLabel(rawId: string | null | undefined): string {
  if (!rawId) return "Claude Sonnet 4.5";

  const catalog = CHAT_MODEL_OPTIONS.find(
    (m) => m.id === rawId || m.apiModel === rawId || m.id.endsWith(`:${rawId}`),
  );
  if (catalog?.label) return catalog.label;

  let s = rawId.replace(/^[^:]+:/, "").trim();
  // Drop dated Anthropic suffixes: ...-20250929
  s = s.replace(/-\d{8}(?:-[\w-]+)?$/i, "");

  // claude-sonnet-4-5 → Claude Sonnet 4.5
  const claude = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/i.exec(s);
  if (claude) {
    const family = claude[1].charAt(0).toUpperCase() + claude[1].slice(1).toLowerCase();
    const ver = claude[3] ? `${claude[2]}.${claude[3]}` : claude[2];
    return `Claude ${family} ${ver}`;
  }

  // gpt-4o / o3-mini style leftovers — title-case hyphens lightly
  s = s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      if (/^[a-z]+\d/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");

  return s || "Claude Sonnet 4.5";
}
