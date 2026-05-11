export type ChatRole = "user" | "assistant";

export type ChatBuildArtifact = {
  language: string;
  code: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};
