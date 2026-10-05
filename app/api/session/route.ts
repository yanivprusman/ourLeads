import { NextResponse } from "next/server";
import { clearSessionCookieHeader, sessionCookieHeader, userByToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sign a browser in with a partner's access code (their token). */
export async function POST(request: Request) {
  let code = "";
  try {
    code = String(((await request.json()) as { code?: string }).code ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  let user;
  try {
    user = code ? userByToken(code) : null;
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
  if (!user) return NextResponse.json({ ok: false, error: "wrong_code" }, { status: 401 });
  return NextResponse.json({ ok: true, name: user.name }, { headers: { "Set-Cookie": sessionCookieHeader(request, user) } });
}

export async function DELETE() {
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
}
