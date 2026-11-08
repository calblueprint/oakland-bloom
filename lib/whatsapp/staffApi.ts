import { z } from "zod";

const uuid = z.uuid();
const mutation = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("takeover"),
    chefId: uuid,
    takeover: z.boolean(),
  }),
  z.strictObject({ action: z.literal("resolve"), handoffId: uuid }),
  z.strictObject({
    action: z.literal("reply"),
    chefId: uuid,
    body: z.string().trim().min(1).max(4000),
    requestId: uuid,
  }),
  z.strictObject({
    action: z.literal("consent"),
    chefId: uuid,
    optedIn: z.boolean(),
    evidence: z.string().trim().min(1).max(500),
  }),
]);

type StaffRpcName =
  | "get_wa_staff_queue"
  | "get_wa_staff_conversation"
  | "set_wa_staff_takeover"
  | "resolve_wa_handoff"
  | "queue_wa_staff_reply"
  | "set_wa_alert_consent";

export type StaffRpc = (
  name: StaffRpcName,
  args: Record<string, unknown>,
) => PromiseLike<{
  data: unknown;
  error: { code?: string } | null;
}>;

type Account = { userId: string; isAdmin: boolean } | null;
type Dependencies = {
  getAccount: () => Promise<Account>;
  createRpc: () => StaffRpc;
};

/** Returns private JSON responses; staff conversations must never enter shared caches. */
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Gives callers stable errors without exposing database messages or private configuration. */
function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

/** Reads at most 16 KiB, including when Content-Length is absent or misleading. */
async function readMutation(request: Request) {
  const limit = 16 * 1024;
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > limit) {
    return error("body_too_large", "Keep the request under 16 KiB.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return error("invalid_body", "Send a JSON request body.", 400);
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return error("body_too_large", "Keep the request under 16 KiB.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const result = mutation.safeParse(JSON.parse(text));
    return result.success
      ? result.data
      : error("invalid_body", "Check the action and its fields.", 400);
  } catch {
    return error("invalid_body", "Send a valid JSON request body.", 400);
  }
}

/** Maps the database's deliberate access/state errors to public HTTP statuses. */
function databaseError(code?: string) {
  if (code === "42501")
    return error("forbidden", "Administrator access is required.", 403);
  if (code === "P0002")
    return error(
      "not_found",
      "That conversation or request was not found.",
      404,
    );
  if (code === "22023")
    return error("invalid_request", "Check the request fields.", 400);
  if (code === "55000")
    return error(
      "state_conflict",
      "That action is unavailable in the current conversation state.",
      409,
    );
  return error("unavailable", "Unable to complete the staff request.", 503);
}

/** Compares browser Origin with the direct HTTP authority, not Next's normalized internal hostname. */
function isSameOrigin(request: Request) {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    const site = request.headers.get("sec-fetch-site");
    // Browsers control Host on requests. Forwarded hosts require proxy trust
    // configuration, so an arbitrary x-forwarded-host must never grant access.
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !/^(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::[0-9]+)?$/i.test(host) ||
      (site !== null && site !== "same-origin" && site !== "none")
    ) {
      return false;
    }
    const expected = new URL(`${url.protocol}//${host}`).origin;
    return request.headers.get("origin") === expected;
  } catch {
    return false;
  }
}

/** Builds cookie-authenticated staff endpoints; actor identity always comes from the verified session. */
export function createStaffApi({ getAccount, createRpc }: Dependencies) {
  /** Authenticates and validates a request before creating a privileged database client. */
  async function handle(request: Request) {
    try {
      const account = await getAccount();
      if (!account) return error("signed_out", "Sign in to continue.", 401);
      if (!account.isAdmin)
        return error("forbidden", "Administrator access is required.", 403);
      if (!uuid.safeParse(account.userId).success)
        return error("unavailable", "Unable to verify the staff account.", 503);

      let name: StaffRpcName;
      let args: Record<string, unknown>;
      if (request.method === "GET") {
        const query = new URL(request.url).searchParams;
        const chefIds = query.getAll("chefId");
        if (
          [...query.keys()].some(key => key !== "chefId") ||
          chefIds.length > 1 ||
          (chefIds.length === 1 && !uuid.safeParse(chefIds[0]).success)
        ) {
          return error(
            "invalid_query",
            "Use one valid chefId or omit it for the help queue.",
            400,
          );
        }
        name = chefIds.length
          ? "get_wa_staff_conversation"
          : "get_wa_staff_queue";
        args = chefIds.length ? { chef_id: chefIds[0] } : {};
      } else if (request.method === "POST") {
        // Browser cookies alone cannot authorize cross-site staff actions.
        if (!isSameOrigin(request)) {
          return error(
            "origin_rejected",
            "Send this action from the same origin as the app.",
            403,
          );
        }
        if (
          !/^application\/json(?:\s*;|$)/i.test(
            request.headers.get("content-type") ?? "",
          )
        ) {
          return error("unsupported_media_type", "Use application/json.", 415);
        }
        const input = await readMutation(request);
        if (input instanceof Response) return input;
        if (input.action === "takeover") {
          name = "set_wa_staff_takeover";
          args = { chef_id: input.chefId, takeover: input.takeover };
        } else if (input.action === "resolve") {
          name = "resolve_wa_handoff";
          args = { handoff_id: input.handoffId };
        } else if (input.action === "reply") {
          name = "queue_wa_staff_reply";
          args = {
            chef_id: input.chefId,
            body: input.body,
            request_id: input.requestId,
          };
        } else {
          name = "set_wa_alert_consent";
          args = {
            chef_id: input.chefId,
            opted_in: input.optedIn,
            evidence: input.evidence,
          };
        }
      } else {
        return error("method_not_allowed", "Use GET or POST.", 405);
      }
      const result = await createRpc()(name, {
        ...args,
        actor_id: account.userId,
      });
      if (result.error) return databaseError(result.error.code);
      return json({ data: result.data });
    } catch {
      return error("unavailable", "Unable to complete the staff request.", 503);
    }
  }
  return { GET: handle, POST: handle };
}
