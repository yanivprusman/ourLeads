import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { busyState, setBusy } from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Busy mode: while on, the assistant answers customers on the business line for us. */
export async function GET(request: Request) {
  return asUser(request, () => NextResponse.json(busyState()));
}

/** `{ busy: true | false }` — stays as set until someone sets it again. */
export async function POST(request: Request) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as { busy?: unknown };
    if (typeof body.busy !== "boolean") return NextResponse.json({ error: "busy must be true or false" }, { status: 400 });
    const state = setBusy(body.busy, user.name);
    console.log(`[ourleads/assistant] busy ${body.busy ? "on" : "off"} by ${user.name}`);
    return NextResponse.json(state);
  });
}
