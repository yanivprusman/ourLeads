import { open } from "node:fs/promises";
import path from "node:path";
import { isMediaSig } from "@/lib/auth";
import { dataDir } from "@/lib/config";
import { ensurePoster, ensureThumb, sourceOfThumb, videoOfPoster } from "@/lib/poster";

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
  const dir = path.join(dataDir(), "media");
  // A thumbnail of a poster needs the poster first.
  const thumbOf = sourceOfThumb(file);
  const video = videoOfPoster(thumbOf ?? file);
  if (video) {
    try {
      await ensurePoster(dir, video);
    } catch (e) {
      return new Response(`poster failed: ${e instanceof Error ? e.message : e}`, { status: 500 });
    }
  }
  if (thumbOf) {
    try {
      await ensureThumb(dir, thumbOf);
    } catch (e) {
      return new Response(`thumbnail failed: ${e instanceof Error ? e.message : e}`, { status: 500 });
    }
  }
  let fh;
  try {
    fh = await open(path.join(dir, file));
  } catch {
    return new Response("not found", { status: 404 });
  }
  try {
    const size = (await fh.stat()).size;
    const headers: Record<string, string> = {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    };
    // Byte ranges: Safari on an iPhone will not play a video without them, and seeking needs them everywhere.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (!range) return new Response(new Uint8Array(await fh.readFile()), { headers });
    let start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (start < 0) start = 0;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    end = Math.max(end, start);
    const buf = new Uint8Array(end - start + 1);
    await fh.read(buf, 0, buf.length, start);
    return new Response(buf, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}` } });
  } finally {
    await fh.close();
  }
}
