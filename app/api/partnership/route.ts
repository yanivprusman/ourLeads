import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { approve, partnership, setTerms } from "@/lib/partnership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return asUser(request, () => NextResponse.json(partnership()));
}

/** Change terms: `{ dayRate: 1200, mode: "days", … }`. The changer approves the new version; the other partner's approval is cleared. */
export async function PUT(request: Request) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      return NextResponse.json(setTerms(user, body));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  });
}

/** Approve the version on screen: `{ approve: "<updatedAt>" }`. */
export async function POST(request: Request) {
  return asUser(request, async (user) => {
    const body = (await request.json().catch(() => ({}))) as { approve?: unknown };
    if (typeof body.approve !== "string") return NextResponse.json({ error: "approve must be the version (updatedAt) being approved" }, { status: 400 });
    try {
      return NextResponse.json(approve(user, body.approve));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 409 });
    }
  });
}
