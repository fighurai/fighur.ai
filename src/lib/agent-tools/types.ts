import type { DeviceManifest } from "@/lib/device-manifest";
import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";

export type AgentToolContext = {
  request: Request;
  flags: Partial<ChatIntegrationFlags>;
  deviceManifest: DeviceManifest | null;
};

export type AgentToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type AgentToolResult = {
  content: string;
  isError?: boolean;
};
