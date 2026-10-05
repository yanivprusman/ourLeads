import { NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { asUser } from "@/lib/http";
import { runCommand } from "@/lib/command";
import { transcribe } from "@/lib/transcribe";
import { dataDir } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Say the status." Either a recording (multipart field `audio`) — transcribed
 * here, so the phone and the browser need no speech engine of their own — or
 * typed text (JSON `{ text }`).
 */
export async function POST(request: Request) {
  return asUser(request, async (user) => {
    let said: string;
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const audio = form.get("audio");
      if (!(audio instanceof Blob) || audio.size === 0)
        return NextResponse.json({ error: "no recording" }, { status: 400 });
      const dir = path.join(dataDir(), "commands");
      await mkdir(dir, { recursive: true });
      const ext = audio.type.includes("mp4") || audio.type.includes("m4a") ? ".m4a" : audio.type.includes("ogg") ? ".ogg" : ".webm";
      const file = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
      await writeFile(file, Buffer.from(await audio.arrayBuffer()));
      try {
        said = await transcribe(file);
      } finally {
        await unlink(file).catch(() => {});
      }
      if (!said.trim()) return NextResponse.json({ error: "לא נשמע כלום בהקלטה" }, { status: 422 });
    } else {
      const body = (await request.json()) as { text?: string };
      said = String(body.text ?? "");
    }
    return NextResponse.json(await runCommand(said, user.name));
  });
}
