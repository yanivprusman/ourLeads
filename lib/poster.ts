import "server-only";
import { execFile } from "node:child_process";
import { access, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * A still frame for a video, so a lead that arrived as a video shows it at the top
 * of its card instead of a bare header (Yaniv, 2026-10-08: lead #25 came as a video
 * and a voice note and looked like it had no media at all).
 *
 * The poster is `<video>.poster.jpg` beside the video and is made the first time
 * someone asks for it (app/api/media), so videos already on the board get one too
 * and nothing needs a backfill.
 */
const SUFFIX = ".poster.jpg";
const run = promisify(execFile);

export function posterName(video: string): string {
  return video + SUFFIX;
}

/** The video a poster file name belongs to, or null when it is not a poster. */
export function videoOfPoster(file: string): string | null {
  return file.endsWith(SUFFIX) ? file.slice(0, -SUFFIX.length) : null;
}

/** Make the poster for `video` in `dir` unless it is already there. Throws when ffmpeg cannot. */
export async function ensurePoster(dir: string, video: string): Promise<void> {
  const out = path.join(dir, posterName(video));
  try {
    await access(out);
    return;
  } catch {}
  // Written aside and renamed, so two viewers opening the card at once never serve half a JPEG.
  const tmp = `${out}.${process.pid}.${Date.now()}.tmp.jpg`;
  // `thumbnail` picks the most representative of the first frames — the very first is often black.
  try {
    await run(
      "ffmpeg",
      ["-v", "error", "-y", "-i", path.join(dir, video), "-vf", "thumbnail=60,scale='min(960,iw)':-2", "-frames:v", "1", tmp],
      { timeout: 30_000 },
    );
    await rename(tmp, out);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}
