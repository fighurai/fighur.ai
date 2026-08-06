import type { DeviceManifest } from "@/lib/device-manifest";
import { isImageGenerationAvailable } from "@/lib/integrations/image-generation-api";
import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";
import type { WorkMode } from "@/lib/work-mode";

const LIVE_DATA_PATTERN =
  /\b(weather|forecast|temperature|web search|search the web|look up|look\s*up|current news|latest news|breaking news|price of|stock price|inbox|my emails|my calendar|upcoming events|schedule today|gmail|outlook|research|investigate|sources?|cite|citation|competitor|market scan)\b/i;

const IMAGE_GEN_PATTERN =
  /\b(generate|create|make|draw|design|render|produce|paint)\b.*\b(image|photo|picture|illustration|portrait|headshot|banner|artwork|poster|wallpaper)\b/i;

const PHOTO_REALISTIC_PATTERN =
  /\b(photo(?:realistic)?|photorealistic|dslr|camera|product shot|stock photo|realistic image)\b/i;

const CODE_EXEC_PATTERN =
  /\b(calculate|compute|run (this )?code|execute|evaluate|parse (this )?json|transform (this )?csv|sum of|average of|regex)\b/i;

const ARTIFACT_PATTERN =
  /\b(export|downloadable|csv|spreadsheet|memo|proposal|generate (a )?(doc|document|file|report)|save as (md|markdown|csv|json|html))\b/i;

const APP_SAVE_PATTERN =
  /\b(save (this |the )?(app|project|site|website)|register (the )?app|add to (my )?apps|app management)\b/i;

const SKILLISH_PATTERN =
  /\b(code review|review (this|my) (pr|code|diff)|write (a )?(readme|docs|api reference|tutorial)|scaffold|full[- ]?stack|dashboard|landing page|automate|workflow|pipeline)\b/i;

/** Connected OAuth/device capabilities that require the tool loop. */
function needsIntegrationTools(
  flags: Partial<ChatIntegrationFlags>,
  deviceManifest: DeviceManifest | null,
): boolean {
  if (deviceManifest?.entries.length && flags.deviceFiles) return true;
  if (flags.gmail || flags.googleCalendar || flags.outlook || flags.microsoft365) return true;
  if (flags.workMode === "cowork" && (flags.deviceFiles || flags.gmail || flags.outlook)) return true;
  return false;
}

function workModeWantsTools(mode: WorkMode | undefined): boolean {
  return mode === "cowork" || mode === "codex";
}

/**
 * Use the agent tool loop when live integrations, live-data intent, skills-ish work,
 * or CoWork/Codex modes need tools. URL content is also prefetched server-side.
 */
export function needsAgentToolLoop(
  flags: Partial<ChatIntegrationFlags>,
  userText: string,
  deviceManifest: DeviceManifest | null,
): boolean {
  if (needsIntegrationTools(flags, deviceManifest)) return true;
  if (workModeWantsTools(flags.workMode)) return true;
  if (LIVE_DATA_PATTERN.test(userText)) return true;
  if (CODE_EXEC_PATTERN.test(userText)) return true;
  if (ARTIFACT_PATTERN.test(userText)) return true;
  if (APP_SAVE_PATTERN.test(userText)) return true;
  if (SKILLISH_PATTERN.test(userText)) return true;
  if (
    isImageGenerationAvailable() &&
    (IMAGE_GEN_PATTERN.test(userText) || PHOTO_REALISTIC_PATTERN.test(userText))
  ) {
    return true;
  }
  return false;
}

/** Providers that can run the FigHur tool loop. */
export function providerSupportsToolLoop(provider: string): boolean {
  return (
    provider === "anthropic" ||
    provider === "openai" ||
    provider === "groq" ||
    provider === "openrouter" ||
    provider === "nvidia"
  );
}
