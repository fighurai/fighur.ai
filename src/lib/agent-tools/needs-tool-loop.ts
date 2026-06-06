import type { DeviceManifest } from "@/lib/device-manifest";
import { isImageGenerationAvailable } from "@/lib/integrations/image-generation-api";
import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";

const LIVE_DATA_PATTERN =
  /\b(weather|forecast|temperature|web search|search the web|look up|current news|latest news|breaking news|price of|stock price|inbox|my emails|my calendar|upcoming events|schedule today|gmail|outlook)\b/i;

const IMAGE_GEN_PATTERN =
  /\b(generate|create|make|draw|design|render|produce|paint)\b.*\b(image|photo|picture|illustration|portrait|headshot|banner|artwork|poster|wallpaper)\b/i;

const PHOTO_REALISTIC_PATTERN =
  /\b(photo(?:realistic)?|photorealistic|dslr|camera|product shot|stock photo|realistic image)\b/i;

/** Connected OAuth/device capabilities that require the Anthropic tool loop. */
function needsIntegrationTools(
  flags: Partial<ChatIntegrationFlags>,
  deviceManifest: DeviceManifest | null,
): boolean {
  if (deviceManifest?.entries.length && flags.deviceFiles) return true;
  if (flags.gmail || flags.googleCalendar || flags.outlook || flags.microsoft365) return true;
  if (flags.workMode === "cowork" && (flags.deviceFiles || flags.gmail || flags.outlook)) return true;
  return false;
}

/**
 * Use the fast Anthropic stream (ChatGPT-like) unless live integrations or live-data intent needs tools.
 * URL content is prefetched server-side, so links alone do not require the tool loop.
 */
export function needsAgentToolLoop(
  flags: Partial<ChatIntegrationFlags>,
  userText: string,
  deviceManifest: DeviceManifest | null,
): boolean {
  if (needsIntegrationTools(flags, deviceManifest)) return true;
  if (LIVE_DATA_PATTERN.test(userText)) return true;
  if (
    isImageGenerationAvailable() &&
    (IMAGE_GEN_PATTERN.test(userText) || PHOTO_REALISTIC_PATTERN.test(userText))
  ) {
    return true;
  }
  return false;
}
