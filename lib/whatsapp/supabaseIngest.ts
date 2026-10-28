import type { InboundBatch } from "./inboundMessage.ts";
import { createClient } from "@supabase/supabase-js";

/**
 * Persists a webhook batch through the `ingest_inbound` Postgres function in one
 * transaction. The function is defined by the WhatsApp migration and must be
 * idempotent on provider message IDs, since Meta retries and may duplicate.
 *
 * Uses the secret (service-role) key, so this must only run on the server. Until
 * the migration is applied the RPC fails, and the webhook returns 503: Meta keeps
 * retrying instead of the message being dropped.
 */
export function createSupabaseIngest(url: string, secretKey: string) {
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (batch: InboundBatch): Promise<void> => {
    const { error } = await client.rpc("ingest_inbound", { batch });
    if (error) throw new Error(`ingest_inbound failed: ${error.message}`);
  };
}
