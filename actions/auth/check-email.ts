"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import Logger from "../logging";

// first auth screen: sends the email to sign in if it has an account, sign up if not
export async function continueWithEmail(rawEmail: string) {
  const email = normalizeEmail(String(rawEmail));

  if (!isValidEmail(email)) {
    return { error: { code: "invalid_email" } };
  }

  // rate limit so users dont bomb with requests and hashed so raw IPs are not stored
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  const clientKey = createHash("sha256").update(ip).digest("hex");

  const supabase = getSupabaseAdminClient();
  const { data: exists, error } = await supabase.rpc("email_exists", {
    p_email: email,
    p_client_key: clientKey,
  });

  if (error) {
    if (error.message.includes("rate_limited")) {
      return { error: { code: "rate_limited" } };
    }
    Logger.error(`Error checking email: ${error.message} (${error.code})`);
    return { error: { code: "unknown" } };
  }

  const q = encodeURIComponent(email);
  redirect(exists ? `/login/password?email=${q}` : `/sign-up?email=${q}`);
}