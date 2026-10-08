import "server-only";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { bridge } from "./config";

/**
 * Access to the WhatsApp bridge on the leader. All calls go through its
 * authenticated endpoints — never a second whatsmeow session (one account
 * allows exactly one linked client; a second one kicks the first off forever).
 * The only send is `sendText`, to `REPORT_CHAT` — see lib/config.ts.
 */

async function call(pathname: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const cfg = bridge();
  const res = await fetch(`${cfg.apiUrl}${pathname}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${cfg.token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`bridge ${pathname} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function dbquery(sql: string, params: (string | number)[] = []): Promise<unknown[][]> {
  const res = await call(
    "/dbquery",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ database: "messages", sql, params }),
    },
    15_000,
  );
  const json = (await res.json()) as { success: boolean; message?: string; rows?: unknown[][] };
  if (!json.success) throw new Error(`bridge dbquery failed: ${json.message ?? "unknown error"}`);
  return json.rows ?? [];
}

export interface BridgeMessage {
  id: string;
  chatJid: string;
  sender: string;
  content: string;
  timestamp: string;
  fromMe: boolean;
  mediaType: string;
  filename: string;
}

/** Messages in these chats at or after `since` (ISO), oldest first. */
export async function messagesSince(jids: string[], since: string): Promise<BridgeMessage[]> {
  const ph = jids.map(() => "?").join(",");
  const rows = await dbquery(
    `SELECT id, chat_jid, sender, COALESCE(content,''), timestamp, is_from_me, COALESCE(media_type,''), COALESCE(filename,'')
     FROM messages
     WHERE chat_jid IN (${ph}) AND julianday(timestamp) >= julianday(?) AND deleted_at IS NULL
     ORDER BY julianday(timestamp) ASC LIMIT 500`,
    [...jids, since],
  );
  return rows.map((r) => ({
    id: String(r[0]),
    chatJid: String(r[1]),
    sender: String(r[2]),
    content: String(r[3]),
    timestamp: String(r[4]),
    fromMe: r[5] === true || r[5] === 1 || r[5] === "1",
    mediaType: String(r[6]),
    filename: String(r[7]),
  }));
}

const EXT: Record<string, string> = {
  image: ".jpg",
  video: ".mp4",
  audio: ".ogg",
  document: "",
  sticker: ".webp",
};

/**
 * Fetch one message's media into `dir` and return the local file name.
 * The bridge decrypts it on the leader (`/download`), then streams the bytes
 * here (`/mediafile`).
 */
export async function downloadMedia(
  messageId: string,
  chatJid: string,
  mediaType: string,
  filename: string,
  dir: string,
): Promise<string> {
  const res = await call(
    "/download",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, chat_jid: chatJid }),
    },
    120_000,
  );
  const json = (await res.json()) as { success: boolean; message?: string; path?: string };
  if (!json.success || !json.path) throw new Error(`bridge download failed: ${json.message ?? "no path"}`);

  const file = await call(`/mediafile?path=${encodeURIComponent(json.path)}`, { method: "GET" }, 120_000);
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(filename) || path.extname(json.path) || EXT[mediaType] || "";
  const name = `${messageId.replace(/[^A-Za-z0-9_-]/g, "")}${ext}`;
  await writeFile(path.join(dir, name), bytes);
  return name;
}

/** Send a plain text message from Yaniv's own number. */
export async function sendText(jid: string, message: string): Promise<void> {
  const res = await call(
    "/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: jid, message }),
    },
    30_000,
  );
  const json = (await res.json()) as { success: boolean; message?: string };
  if (!json.success) throw new Error(`bridge send failed: ${json.message ?? "unknown error"}`);
}
