/** Client-side image prep for chat vision (compress + data URL). */

export const MAX_IMAGE_DATA_URL_CHARS = 280_000;
export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

export function isImageUpload(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("FileReader returned no data"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () =>
      reject(
        new Error(
          "Browser could not decode this image. Try PNG or JPEG, or re-export from Preview/Photos.",
        ),
      );
    el.src = src;
  });
}

/**
 * Resize + JPEG compress until under char budget (progressive — keeps brochure text readable).
 */
export async function prepareImageAttachmentDataUrl(file: File): Promise<string> {
  const sourceUrl = await fileToDataUrl(file);
  const img = await loadImage(sourceUrl);

  const maxDimensions = [2048, 1600, 1280, 1024, 800, 640, 480];
  const qualities = [0.92, 0.85, 0.75, 0.65, 0.5, 0.4, 0.32];

  for (const maxDim of maxDimensions) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create image canvas");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of qualities) {
      const jpeg = canvas.toDataURL("image/jpeg", q);
      if (jpeg.length <= MAX_IMAGE_DATA_URL_CHARS) return jpeg;
    }

    const png = canvas.toDataURL("image/png");
    if (png.length <= MAX_IMAGE_DATA_URL_CHARS) return png;
  }

  throw new Error(
    "Image is still too large after compression. Try a smaller screenshot or crop the file.",
  );
}
