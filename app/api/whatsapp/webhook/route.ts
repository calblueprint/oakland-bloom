import type { InboundBatch } from "@/lib/whatsapp/inboundMessage";
import { createClient } from "@supabase/supabase-js";
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

/** Builds the server-only callback that saves a batch before the webhook acknowledges it. */
function createSupabaseIngest(url: string, secretKey: string) {
  // Provider callbacks have no logged-in chef; use the private server key.
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (batch: InboundBatch): Promise<void> => {
    // RPC means "call a database function". It saves the batch in one transaction
    // and deduplicates provider IDs. Apply the WhatsApp migrations before running it.
    const { error } = await client.rpc("ingest_inbound", { batch });
    // Throw returned database errors so the handler sends 503 for a provider retry.
    if (error) throw new Error(`ingest_inbound failed: ${error.message}`);
  };
}
