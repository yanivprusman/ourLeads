import { NextResponse } from "next/server";
import { cloud, cloudConfigured, incomingMessages, signatureValid } from "@/lib/cloud";
import { storeIncoming } from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The business line's webhook (lib/cloud.ts). Meta is the only caller, so there
 * is no sign-in here: GET is Meta's one-time check that we own the URL, and every
 * POST must carry Meta's signature over the exact body.
 *
 * A POST only stores the messages and answers 200 at once — Meta retries what is
 * slow to answer. Reading them and replying is the ingest loop's job (lib/assistant.ts).
 */
export async function GET(request: Request) {
  if (!cloudConfigured()) return new Response("business line not set up", { status: 503 });
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === cloud().verifyToken)
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  if (!cloudConfigured()) return new Response("business line not set up", { status: 503 });
  const raw = await request.text();
  if (!signatureValid(raw, request.headers.get("x-hub-signature-256"), cloud().appSecret))
    return new Response("bad signature", { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const added = storeIncoming(incomingMessages(payload));
  if (added) console.log(`[ourleads/business] stored ${added} message(s)`);
  return NextResponse.json({ ok: true });
}
