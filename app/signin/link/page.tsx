import { userByLink } from "@/lib/auth";
import { linkUsed } from "@/lib/db";
import LinkSignIn from "../../_components/LinkSignIn";
import SignIn from "../../_components/SignIn";

export const dynamic = "force-dynamic";

/** Where a sign-in link lands: who it is for, and one button that uses it. */
export default async function LinkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const exp = Number(p.exp);
  const sig = p.sig ?? "";
  const user = userByLink(p.u ?? "", exp, sig);
  if (!user) return <SignIn linkExpired />;
  if (linkUsed(sig)) return <SignIn linkUsed />;
  return <LinkSignIn name={user.name} u={user.id} exp={exp} sig={sig} />;
}
