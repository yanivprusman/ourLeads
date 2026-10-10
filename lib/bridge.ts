import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bridge } from "./config";

/**
 * Access to the WhatsApp bridge on the leader. All calls go through its
 * authenticated endpoints — never a second whatsmeow session (one account
 * allows exactly one linked client; a second one kicks the first off forever).
 * Sends go to `TEXT_TARGETS` chats (lib/config.ts) and to the business line's own
 * groups in the Cloud API config (alerts, and the clone in lib/mirror.ts).
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

/** Messages in each chat at or after that chat's own `since` (ISO), oldest first. */
export async function messagesInChats(chats: { jid: string; since: string }[]): Promise<BridgeMessage[]> {
  if (!chats.length) return [];
  const rows = await dbquery(
    `SELECT id, chat_jid, sender, COALESCE(content,''), timestamp, is_from_me, COALESCE(media_type,''), COALESCE(filename,'')
     FROM messages
     WHERE (${chats.map(() => "(chat_jid = ? AND julianday(timestamp) >= julianday(?))").join(" OR ")}) AND deleted_at IS NULL
     ORDER BY julianday(timestamp) ASC LIMIT 500`,
    chats.flatMap((c) => [c.jid, c.since]),
  );
  return rows.map(toMessage);
}

function toMessage(r: unknown[]): BridgeMessage {
  return {
    id: String(r[0]),
    chatJid: String(r[1]),
    sender: String(r[2]),
    content: String(r[3]),
    timestamp: String(r[4]),
    fromMe: r[5] === true || r[5] === 1 || r[5] === "1",
    mediaType: String(r[6]),
    filename: String(r[7]),
  };
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

/** Send a plain text message from Yaniv's own number. Returns the sent message's WhatsApp id. */
export async function sendText(jid: string, message: string): Promise<string> {
  const res = await call(
    "/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: jid, message }),
    },
    30_000,
  );
  const json = (await res.json()) as { success: boolean; message?: string; message_id?: string };
  if (!json.success) throw new Error(`bridge send failed: ${json.message ?? "unknown error"}`);
  if (!json.message_id) throw new Error("bridge send returned no message_id — the bridge on the leader is older than /api/revoke");
  return json.message_id;
}

/** Send a file (photo, video, voice note, document) from Yaniv's own number, with an optional caption. */
export async function sendMedia(jid: string, file: string, caption: string): Promise<string> {
  const res = await call(
    "/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: jid,
        message: caption,
        media_base64: (await readFile(file)).toString("base64"),
        media_filename: path.basename(file),
      }),
    },
    120_000,
  );
  const json = (await res.json()) as { success: boolean; message?: string; message_id?: string };
  if (!json.success) throw new Error(`bridge media send failed: ${json.message ?? "unknown error"}`);
  return json.message_id ?? "";
}

/** Delete one of our own sent messages for everyone. WhatsApp refuses once it is too old (~2 days). */
export async function revokeText(jid: string, messageId: string): Promise<void> {
  const res = await fetch(`${bridge().apiUrl}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bridge().token}` },
    body: JSON.stringify({ chat: jid, message_id: messageId }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!res.ok || !json.success) throw new Error(`bridge revoke failed: ${json.message ?? `HTTP ${res.status}`}`);
}
