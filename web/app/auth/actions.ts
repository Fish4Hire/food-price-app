"use server";

// Server actions for signing in and out. They run on the server when a form is submitted.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

/** Email the visitor a one-time sign-in link. New emails get an account automatically. */
export async function sendSignInLink(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  // Send the link back to whichever address the visitor is using (live site or local testing).
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? `https://${requestHeaders.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/account` },
  });
  if (error) {
    const message =
      error.status === 429
        ? "Too many sign-in emails were sent recently. Please wait a few minutes and try again."
        : "We couldn't send the email. Please try again.";
    return { status: "error", message };
  }
  return { status: "sent", email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
