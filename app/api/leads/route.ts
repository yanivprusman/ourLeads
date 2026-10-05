import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { board } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return asUser(request, (user) => NextResponse.json(board({ id: user.id, name: user.name })));
}
