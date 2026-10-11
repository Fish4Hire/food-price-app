import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isOwner } from "@/lib/menus";

const linkClass = "rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink";

/**
 * "Sign in" for visitors; a round initial linking to the account page for signed-in
 * users. Owners also get the private "Eat out" link.
 */
export async function HeaderAccount() {
  const user = await getCurrentUser();
  if (!user) return <SignInLink />;
  const owner = await isOwner();
  return (
    <>
      {owner && (
        <Link href="/eat" className={linkClass}>
          Eat out
        </Link>
      )}
      <Link
        href="/account"
        title={`Signed in as ${user.email}`}
        aria-label="Your account"
        className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-accent-ink"
      >
        {user.email.charAt(0)}
      </Link>
    </>
  );
}

export function SignInLink() {
  return (
    <Link href="/login" className={`${linkClass} font-medium text-ink`}>
      Sign in
    </Link>
  );
}
