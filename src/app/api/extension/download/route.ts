import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "downloads", "fighur-page-theme.zip");
  try {
    const bytes = await readFile(filePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="fighur-page-theme.zip"',
        "Cache-Control": "no-store",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch {
    return Response.json({ error: "Extension package not found." }, { status: 404 });
  }
}
