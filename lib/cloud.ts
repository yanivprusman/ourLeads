import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Yaniv's own business number, on Meta's WhatsApp Cloud API (2026-10-09).
 *
 * The partner chats come from the personal account's bridge (lib/bridge.ts).
 * This number is different: it has no phone behind it — Meta holds it and
 * posts every incoming message to our webhook (app/api/whatsapp/route.ts), and
 * we answer through the Graph API. It is where customers from his own ads and
 * sites write, and where the assistant (lib/assistant.ts) answers while he is
 * busy on a job.
 *
 * `OURLEADS_WA_CLOUD_CONFIG` names a JSON file (mode 600) with
 * `{ phone_number_id, access_token, app_secret, verify_token, graph_version, alert_jid_pigeons_windows, alert_jid_building }`, plus `pin` —
 * the two-step PIN set at registration. Nothing reads `pin`; it is kept there, and only there, because
 * whoever knows it can move the number into a WhatsApp app and take it off the API.
 * Unset means the line is not set up yet — the webhook says so and nothing is
 * read or sent. Set but unreadable is an error, never a quiet "not set up".
 */
export interface CloudConfig {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
  /**
   * Where Yaniv hears about a customer — WhatsApp groups on his personal number (the line has no phone
   * to ring), one per kind of work, the split Dudu's two sites had: pigeons and windows, and the rest.
   */
  alertJids: Record<Line, string>;
}

/** The kind of work a business-line lead is: pigeons and windows, or everything else at height. */
export const LINES = ["pigeons_windows", "building"] as const;
export type Line = (typeof LINES)[number];
export const isLine = (v: unknown): v is Line => typeof v === "string" && (LINES as readonly string[]).includes(v);

export function cloudConfigured(): boolean {
  return !!process.env.OURLEADS_WA_CLOUD_CONFIG?.trim();
}

export function cloud(): CloudConfig {
  const file = process.env.OURLEADS_WA_CLOUD_CONFIG?.trim();
  if (!file) throw new Error("OURLEADS_WA_CLOUD_CONFIG is not set — the business WhatsApp line is not set up");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`cannot read the Cloud API config ${file}: ${(e as Error).message}`);
  }
  const need = (k: string) => {
    const v = typeof raw[k] === "string" ? (raw[k] as string).trim() : "";
    if (!v) throw new Error(`${file} must contain ${k}`);
    return v;
  };
  return {
    phoneNumberId: need("phone_number_id"),
    accessToken: need("access_token"),
    appSecret: need("app_secret"),
    verifyToken: need("verify_token"),
    graphVersion: need("graph_version"),
    alertJids: { pigeons_windows: need("alert_jid_pigeons_windows"), building: need("alert_jid_building") },
  };
}

/**
 * The chat id a business-line customer is filed under. Not `…@s.whatsapp.net`:
 * the same customer may also write to Yaniv's personal number, and that chat
 * (lib/customerChats.ts) is a different conversation with a different history.
 */
export const BUSINESS_SUFFIX = "@business";
export const businessJid = (waId: string) => `${waId.replace(/\D/g, "")}${BUSINESS_SUFFIX}`;
export const waIdOf = (jid: string) => jid.slice(0, -BUSINESS_SUFFIX.length);
export const isBusinessJid = (jid: string) => jid.endsWith(BUSINESS_SUFFIX);

/** "972501234567" → "0501234567", the way phones are kept on a lead. */
export function localPhone(waId: string): string {
  return waId.replace(/\D/g, "").replace(/^972/, "0");
}

/**
 * Meta signs the raw body with the app secret (`X-Hub-Signature-256: sha256=…`).
 * Without this check, anyone who learns the URL could post "customers" onto the
 * board — and make the assistant answer them from Yaniv's number.
 */
export function signatureValid(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const want = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

/** One incoming message, as the webhook hands it over (only the parts we keep). */
export interface CloudMessage {
  id: string;
  from: string;
  /** Unix seconds. */
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  video?: { id?: string; caption?: string };
  audio?: { id?: string };
  document?: { id?: string; caption?: string; filename?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

export interface Incoming {
  message: CloudMessage;
  /** The customer's WhatsApp profile name, if Meta sent one. */
  profileName: string | null;
}

/** The messages in a webhook post. Status updates (sent/delivered/read) are not messages and are dropped. */
export function incomingMessages(payload: unknown): Incoming[] {
  const out: Incoming[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: unknown[] }[]) {
    for (const change of (entry.changes ?? []) as { field?: string; value?: Record<string, unknown> }[]) {
      if (change.field !== "messages" || !change.value) continue;
      const contacts = (change.value.contacts ?? []) as { wa_id?: string; profile?: { name?: string } }[];
      for (const m of (change.value.messages ?? []) as CloudMessage[]) {
        if (!m?.id || !m.from) continue;
        const c = contacts.find((x) => x.wa_id === m.from);
        out.push({ message: m, profileName: c?.profile?.name?.trim() || null });
      }
    }
  }
  return out;
}

/** What we store for a message: its text, its media kind, and Meta's id for the media. */
export function messageParts(m: CloudMessage): { content: string; mediaType: string; mediaRef: string | null } {
  switch (m.type) {
    case "text":
      return { content: m.text?.body ?? "", mediaType: "", mediaRef: null };
    case "image":
      return { content: m.image?.caption ?? "", mediaType: "image", mediaRef: m.image?.id ?? null };
    case "video":
      return { content: m.video?.caption ?? "", mediaType: "video", mediaRef: m.video?.id ?? null };
    case "audio":
      return { content: "", mediaType: "audio", mediaRef: m.audio?.id ?? null };
    case "document":
      return { content: [m.document?.filename, m.document?.caption].filter(Boolean).join(" — "), mediaType: "document", mediaRef: m.document?.id ?? null };
    case "location": {
      const l = m.location ?? {};
      const where = [l.name, l.address].filter(Boolean).join(", ");
      return { content: `[מיקום] ${where ? `${where} ` : ""}https://waze.com/ul?ll=${l.latitude},${l.longitude}&navigate=yes`, mediaType: "", mediaRef: null };
    }
    case "button":
      return { content: m.button?.text ?? "", mediaType: "", mediaRef: null };
    case "interactive":
      return { content: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "", mediaType: "", mediaRef: null };
    default:
      return { content: `[${m.type} — סוג הודעה שהאפליקציה לא קוראת]`, mediaType: "", mediaRef: null };
  }
}

async function graph(cfg: CloudConfig, pathname: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${pathname}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${cfg.accessToken}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Graph ${pathname} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "application/pdf": ".pdf",
};

/** Fetch a message's media from Meta into `dir`; returns the file name. */
export async function downloadCloudMedia(mediaId: string, dir: string): Promise<string> {
  const cfg = cloud();
  const meta = (await (await graph(cfg, encodeURIComponent(mediaId))).json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error(`Graph gave no URL for media ${mediaId}`);
  // The media URL is on Meta's CDN and needs the same bearer token.
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.accessToken}` }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`media ${mediaId} download HTTP ${res.status}`);
  const mime = (meta.mime_type ?? "").split(";")[0].trim();
  const name = `cloud-${mediaId.replace(/[^\w-]/g, "")}${EXT[mime] ?? ""}`;
  await writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
  return name;
}

/**
 * Send a text to a customer. Free-form text is only accepted inside the 24-hour
 * window his last message opened — every send here is an answer to him, so it
 * always is. Returns Meta's message id.
 */
export async function sendCloudText(waId: string, body: string): Promise<string> {
  const cfg = cloud();
  const res = await graph(cfg, `${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: waId, type: "text", text: { body, preview_url: false } }),
  });
  const json = (await res.json()) as { messages?: { id?: string }[] };
  const id = json.messages?.[0]?.id;
  if (!id) throw new Error("Graph accepted the message but returned no id");
  return id;
}

/** What Meta says about the number: CLOUD_API + CONNECTED is the only healthy answer (lib/cloudHealth.ts). */
export async function phoneNumberStatus(): Promise<{ status: string | null; platformType: string | null; name: string | null }> {
  const cfg = cloud();
  const res = await graph(cfg, `${encodeURIComponent(cfg.phoneNumberId)}?fields=status,platform_type,verified_name`);
  const j = (await res.json()) as { status?: string; platform_type?: string; verified_name?: string };
  return { status: j.status ?? null, platformType: j.platform_type ?? null, name: j.verified_name ?? null };
}
