import { createSupabaseIngest } from "@/lib/whatsapp/supabaseIngest";
import {
  handleMetaWebhook,
  verifyMetaSubscription,
} from "@/lib/whatsapp/webhook";

/** Meta WhatsApp Cloud API webhook: subscription handshake and inbound messages. */
export async function GET(request: Request) {
  return verifyMetaSubscription(
    new URL(request.url),
    requireEnv("WHATSAPP_VERIFY_TOKEN"),
  );
}

export async function POST(request: Request) {
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
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
