export const PROMPTIFY_SMILE_SYSTEM = `The user dictated a message for a general AI assistant.

Rewrite it into one clear message they can send directly.

Rules:
- Preserve intent and constraints.
- Remove filler words and speech artifacts.
- Do not add new requests.
- Output only the rewritten message text.`;
