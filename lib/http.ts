import "server-only";
import { NextResponse } from "next/server";
import { authorize } from "./auth";
import type { User } from "./config";

/** Run a handler as a signed-in partner, or answer 401 with the reason. */
export async function asUser(
  request: Request,
  fn: (user: User) => Promise<Response> | Response,
): Promise<Response> {
  let a;
  try {
    a = authorize(request);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: 401 });
  try {
    return await fn(a.user);
  } catch (e) {
    console.error("[outleads]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
