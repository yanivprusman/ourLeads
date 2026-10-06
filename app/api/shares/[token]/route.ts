import { NextResponse } from "next/server";
import { asUser } from "@/lib/http";
import { revokeShare } from "@/lib/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kill a card link — it went to the wrong person, or the job is over. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/shares/[token]">) {
  return asUser(request, async (user) => {
    if (!revokeShare((await ctx.params).token, user.name))
      return NextResponse.json({ error: "no such live link" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}

/** The phone app's HTTP client has no DELETE verb either. */
export { DELETE as POST };
