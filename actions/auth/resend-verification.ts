"use server";

import { headers } from "next/headers";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { getSupabaseServerClient } from "@/lib/supabase";
import Logger from "../logging";

export type ResendVerificationErrorCode =
  "invalid_email" | "rate_limited" | "unknown";

// sends a new "verify your email" link, for when the first one expired or never
// arrived. Supabase rate limits this per address
export async function resendVerification(
  rawEmail: string,
): Promise<{ error?: ResendVerificationErrorCode }> {
  // server action args come straight off the network, so don't trust their types
  const email = normalizeEmail(typeof rawEmail === "string" ? rawEmail : "");
  if (!isValidEmail(email)) return { error: "invalid_email" };

  // the server client stores the PKCE verifier in a cookie, same as sign-up,
  // so /auth/callback can finish the new link in this browser
  const supabase = await getSupabaseServerClient();
  const origin = (await headers()).get("origin");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });

  if (error) {
    Logger.error(
      `Error resending verification: ${error.message} (${error.code})`,
    );
    return {
      error:
        error.code === "over_email_send_rate_limit" ||
        error.code === "over_request_rate_limit"
          ? "rate_limited"
          : "unknown",
    };
  }

  return {};
}
