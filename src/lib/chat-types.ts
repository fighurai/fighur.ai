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
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};
