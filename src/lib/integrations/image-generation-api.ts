export type ImageGenerationResult =
  | { ok: true; dataUrl: string; revisedPrompt?: string; provider: string }
  | { ok: false; error: string };

function openAiKey(): string | null {
  const k =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.SMILE_OPENAI_API_KEY?.trim() ||
    process.env.IMAGE_GEN_API_KEY?.trim() ||
    process.env.SMILE_IMAGE_GEN_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

export function isImageGenerationAvailable(): boolean {
  return Boolean(openAiKey());
}

type GenerateImageOptions = {
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  quality?: "standard" | "hd";
};

/** Generate a raster image via OpenAI DALL·E 3 (returns data URL for Canvas + chat). */
export async function generateImage(
  prompt: string,
  options?: GenerateImageOptions,
): Promise<ImageGenerationResult> {
  const key = openAiKey();
  if (!key) {
    return {
      ok: false,
      error:
        "Image generation is not configured. Add OPENAI_API_KEY in Vercel environment variables.",
    };
  }

  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, error: "prompt is required" };

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: trimmed.slice(0, 4000),
      n: 1,
      size: options?.size ?? "1024x1024",
      quality: options?.quality ?? "standard",
      response_format: "b64_json",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Image API failed (${res.status}): ${errText.slice(0, 400)}` };
  }

  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; revised_prompt?: string }>;
  };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "Image API returned no image data." };

  return {
    ok: true,
    dataUrl: `data:image/png;base64,${b64}`,
    revisedPrompt: data.data?.[0]?.revised_prompt,
    provider: "openai-dall-e-3",
  };
}

/** Markdown the existing artifact pipeline understands. */
export function imageResultToMarkdown(
  result: Extract<ImageGenerationResult, { ok: true }>,
  alt = "Generated image",
): string {
  return `![${alt}](${result.dataUrl})`;
}
