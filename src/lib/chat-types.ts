export type ChatRole = "user" | "assistant";

export type ChatBuildFile = {
  path: string;
  language: string;
  code: string;
};

export type ChatBuildArtifact = {
  language: string;
  code: string;
  /** Codex multi-file project (optional). */
  files?: ChatBuildFile[];
  primaryPath?: string;
  /** True when extracted from an unclosed fence during streaming. */
  incomplete?: boolean;
  /**
   * Workspace mode — Claude Artifact / ChatGPT Canvas style.
   * `document` = rendered prose preview; `app` = site/code preview (default).
   */
  kind?: "document" | "app";
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};
