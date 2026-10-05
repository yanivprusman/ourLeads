import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-cookie";

/**
 * Which screen a browser gets at `/`: the board, or the sign-in form. This
 * only decides what is SHOWN — every API route checks the caller itself.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  return NextResponse.rewrite(new URL("/signin", request.url));
}

export const config = { matcher: "/" };
