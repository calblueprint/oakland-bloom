import type { StaffRpc } from "@/lib/whatsapp/staffApi";
import { getAccount } from "@/lib/auth/account";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createStaffApi } from "@/lib/whatsapp/staffApi";

const api = createStaffApi({
  getAccount,
  createRpc: () => {
    const client = getSupabaseAdminClient();
    // Only the handler's validated RPC names and arguments reach this server-only client.
    return client.rpc.bind(client) as unknown as StaffRpc;
  },
});

/** Lists the help queue, or reads one chef's conversation for signed-in administrators. */
export const GET = api.GET;

/** Takes over/resumes a chat, resolves help, queues a staff reply, or records explicit alert consent. */
export const POST = api.POST;
