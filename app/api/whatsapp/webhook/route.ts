import { createSupabaseIngest } from "@/lib/whatsapp/supabaseIngest";
import {
  handleMetaWebhook,
  verifyMetaSubscription,
} from "@/lib/whatsapp/webhook";

/** Answers Meta's GET subscription check using the configured verification token. */
export async function GET(request: Request) {
  // Meta calls this when we register the webhook, to check that we own the URL.
  return verifyMetaSubscription(
    new URL(request.url),
    requireEnv("WHATSAPP_VERIFY_TOKEN"),
  );
}

/** Wires private settings and database ingest into the shared POST handler, returning its response. */
export async function POST(request: Request) {
  // Keep the route thin: load private configuration and hand off to testable code.
  // The handler saves messages only. It does not call the model or send replies.
  return handleMetaWebhook(request, {
    appSecret: requireEnv("WHATSAPP_APP_SECRET"),
    verifyToken: requireEnv("WHATSAPP_VERIFY_TOKEN"),
    ingest: createSupabaseIngest(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SECRET_KEY"),
    ),
  });
}

// A missing secret fails the request (500) rather than accepting unverified
// traffic; Meta retries until the deployment is configured.
/** Returns a required environment value, or throws so an unconfigured request fails safely. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
