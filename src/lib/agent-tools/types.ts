import type { UserLocationHint } from "@/lib/client-location";
import type { DeviceOpsPayload } from "@/lib/device-ops-parse";
import type { DeviceManifest } from "@/lib/device-manifest";
import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";

export type AgentToolContext = {
  request: Request;
  flags: Partial<ChatIntegrationFlags>;
  deviceManifest: DeviceManifest | null;
  userLocation: UserLocationHint | null;
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
  /** When set, the chat stream appends a device-ops block so the Apply popup appears. */
  deviceOps?: DeviceOpsPayload;
};
