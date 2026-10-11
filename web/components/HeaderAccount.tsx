import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

const linkClass = "rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink";

/** "Sign in" for visitors; a round initial linking to the account page for signed-in users. */
export async function HeaderAccount() {
  const user = await getCurrentUser();
  if (!user) return <SignInLink />;
  return (
    <Link
      href="/account"
      title={`Signed in as ${user.email}`}
      aria-label="Your account"
      className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-accent-ink"
    >
      {user.email.charAt(0)}
    </Link>
  );
}

export function SignInLink() {
  return (
    <Link href="/login" className={`${linkClass} font-medium text-ink`}>
      Sign in
    </Link>
  );
}
