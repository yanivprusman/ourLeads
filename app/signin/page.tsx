import SignIn from "../_components/SignIn";

/** What `proxy.ts` shows at `/` to a browser that has not signed in. */
export default function SignInPage() {
  return <SignIn linkExpired={false} />;
}
