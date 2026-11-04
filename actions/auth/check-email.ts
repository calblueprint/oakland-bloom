"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
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
  const clientKey = createHash("sha256")
    .update(clientIp(await headers()))
    .digest("hex");

  let result;
  try {
    result = await getSupabaseAdminClient().rpc("email_exists", {
      p_email: email,
      p_client_key: clientKey,
    });
  } catch (err) {
    // e.g. SUPABASE_SECRET_KEY missing: show the form's error, not a crash
    Logger.error(`Error checking email: ${(err as Error).message}`);
    return { error: { code: "unknown" } };
  }
  const { data: exists, error } = result;

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

// the first x-forwarded-for entry is whatever the client sent, so it can't key a
// rate limit. prefer headers the host sets itself, then the hop it appended last
function clientIp(h: Headers) {
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}
