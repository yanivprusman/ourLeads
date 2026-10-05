import { readFile } from "node:fs/promises";
import path from "node:path";
import { isMediaSig } from "@/lib/auth";
import { dataDir } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".pdf": "application/pdf",
};

export async function GET(request: Request, ctx: RouteContext<"/api/media/[file]">) {
  const file = path.basename(decodeURIComponent((await ctx.params).file));
  const sig = new URL(request.url).searchParams.get("sig") ?? "";
  if (!isMediaSig(file, sig)) return new Response("forbidden", { status: 403 });
  try {
    const bytes = await readFile(path.join(dataDir(), "media", file));
    return new Response(bytes, {
      headers: {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
