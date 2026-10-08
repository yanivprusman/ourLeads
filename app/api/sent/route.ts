import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { deletableSends } from "@/lib/cardText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent sends that can still be deleted: `?leadId=9` for that lead's cards, none for the reports. */
export async function GET(request: Request) {
  return asUser(request, () => {
    const raw = new URL(request.url).searchParams.get("leadId");
    return NextResponse.json({ sends: deletableSends(raw === null ? undefined : Number(raw)) });
  });
}
