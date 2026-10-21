"use server";

import { redirect } from "next/navigation";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { getSupabaseServerClient } from "@/lib/supabase";
import Logger from "../logging";

// first auth screen: sends the email to sign in if it has an account, sign up if not
export async function continueWithEmail(rawEmail: string) {
  const email = normalizeEmail(String(rawEmail));

  if (!isValidEmail(email)) {
    return { error: { code: "invalid_email" } };
  }

  const supabase = await getSupabaseServerClient();
  const { data: exists, error } = await supabase.rpc("email_exists", {
    p_email: email,
  });

  if (error) {
    Logger.error(`Error checking email: ${error.message} (${error.code})`);
    return { error: { code: "unknown" } };
  }

  const q = encodeURIComponent(email);
  redirect(exists ? `/login/password?email=${q}` : `/sign-up?email=${q}`);
}
