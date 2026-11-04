import type { InboundBatch } from "./inboundMessage.ts";
import { createClient } from "@supabase/supabase-js";

/**
 * Takes a Supabase URL/secret key and returns a function that saves one batch.
 * That function resolves after the `ingest_inbound` RPC saves its transaction.
 * The RPC is defined by the WhatsApp migration and must be
 * idempotent on provider message IDs, since Meta retries and may duplicate.
 *
 * Uses the secret (service-role) key, so this must only run on the server. Until
 * the migration is applied the RPC fails, and the webhook returns 503: Meta keeps
 * retrying instead of the message being dropped.
 */
export function createSupabaseIngest(url: string, secretKey: string) {
  // This client acts as the server, not a logged-in chef. Do not keep a browser
  // session or refresh user tokens while handling provider callbacks.
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (batch: InboundBatch): Promise<void> => {
    // RPC means "call a database function". Postgres saves this batch together;
    // the webhook awaits this promise before sending HTTP 200.
    const { error } = await client.rpc("ingest_inbound", { batch });
    // Supabase returns database errors as data; throw so the webhook sends 503
    // instead of acknowledging a batch that was never saved.
    if (error) throw new Error(`ingest_inbound failed: ${error.message}`);
  };
}
