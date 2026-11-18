import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { resolveAgentModel } from "../lib/whatsapp/agent/conversation.ts";
import { createNotificationWorker } from "../lib/whatsapp/agent/notifications.ts";
import { createMetaClient } from "../lib/whatsapp/metaClient.ts";
import { createWorkerWake } from "./whatsappReplies.mjs";

const wakeChannel = "wa_fixture_delivery";
const recoveryPollMs = 5_000;
const receiptPollMs = 1_000;
const localDatabase = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const safeReplyWindowMs = (24 * 60 - 1) * 60_000;

/** Bounds database requests so a lost connection cannot stall either loop. */
function supabase(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, options) =>
        fetch(input, { ...options, signal: AbortSignal.timeout(5_000) }),
    },
  });
}

/** Checks consent and the last verified WhatsApp inbound in one hosted read. */
async function readPilotWindow(hosted, phone) {
  const now = Date.now();
  const { data, error } = await hosted
    .from("chefs")
    .select("inbound:wa_messages(provider_message_id,sent_at)")
    .eq("wa_phone", phone)
    .eq("active", true)
    .not("opted_in_at", "is", null)
    .is("opted_out_at", null)
    .eq("inbound.phone", phone)
    .eq("inbound.provider", "meta")
    .eq("inbound.direction", "inbound")
    .like("inbound.provider_message_id", "meta:wamid.%")
    // Leave time to finish preparing the notice before the conversation expires.
    .gt("inbound.sent_at", new Date(now - safeReplyWindowMs).toISOString())
    .lte("inbound.sent_at", new Date(now).toISOString())
    .order("sent_at", { ascending: false, referencedTable: "inbound" })
    .limit(1, { referencedTable: "inbound" })
    .maybeSingle();
  if (error) throw new Error("Could not check the pilot conversation window.");
  return data?.inbound[0] ?? null;
}

/** Wakes the worker after commit, when both the fixture and its notice are visible. */
async function listenForFixtures(sql, wake) {
  await sql`
    create or replace function whatsapp_test.wake_fixture_delivery() returns trigger
    language plpgsql set search_path='' as $$
    begin
      if new.kind='catering' then perform pg_notify('wa_fixture_delivery',''); end if;
      return new;
    end;
    $$
  `;
  await sql`
    create or replace trigger wake_fixture_delivery after insert on whatsapp_test.fixture_ui_items
    for each row execute function whatsapp_test.wake_fixture_delivery()
  `;
  // PostgreSQL sends an empty signal. The outbox still owns the work.
  return sql.listen(wakeChannel, wake);
}

/** Gives the existing SQL eligibility checks one verified inbound ID and timestamp. */
async function withPilotWindow(tx, chefId, phone, inbound, check) {
  // The local DB never receives the chat text. The row is already processed so
  // it cannot trigger a reply, and it is removed before the transaction commits.
  const [imported] = await tx`
    insert into public.wa_messages(direction,provider,provider_message_id,chef_id,phone,sent_at,processed_at)
    values ('inbound','meta',${inbound.provider_message_id},${chefId},${phone},${inbound.sent_at},now())
    on conflict (provider_message_id) do nothing returning id
  `;
  // Run the actual eligibility checks with the same role as the hosted worker.
  await tx`set local role service_role`;
  const result = await check();
  await tx`reset role`;
  if (imported)
    await tx`delete from public.wa_messages where id=${imported.id}`;
  return result;
}

/** Claims this fixture through the shared outbox, without changing other notices. */
async function claimFixture(sql, fixture, phone, inbound, workerId) {
  // The normal claim skips locked rows. Hold the other notices on a separate
  // connection so seeded notices and older lab fixtures stay queued.
  return sql.begin(async excluded => {
    await excluded`
      select id from public.wa_notifications
      where chef_id=${fixture.chef_id} and id<>${fixture.id}
        and status in ('pending','blocked')
      order by id for update skip locked
    `;
    return sql.begin(async claim => {
      // If a bulk eligibility update needs an excluded row, roll back instead
      // of waiting on our own transaction.
      await claim`set local statement_timeout='2s'`;
      const [row] = await withPilotWindow(
        claim,
        fixture.chef_id,
        phone,
        inbound,
        () => claim`
          select public.claim_wa_notification_for_agent(${phone},${workerId}::uuid,null,null) as notice
        `,
      );
      // A concurrent insert could appear after the exclusion query. A mismatch
      // rolls back the claim before the notification worker can send anything.
      if (row.notice && row.notice.id !== fixture.id)
        throw new Error("The claim returned a different fixture.");
      return row.notice;
    });
  });
}

/** Uses the shared worker for formatting, sending, and recording one fixture notice. */
async function sendFixture(
  { sql, local, hosted, phone, model, meta },
  fixture,
) {
  const inbound = await readPilotWindow(hosted, phone);
  if (!inbound) return false;

  // The recovery RPC parks old ambiguous sends for review. It never retries
  // a message Meta might already have delivered.
  const recovered = await local.rpc("resume_wa_after_uncertain_send", {
    target_phone: phone,
  });
  if (recovered.error) throw new Error("Could not recover the local outbox.");
  const worker = createNotificationWorker({
    model,
    phone,
    meta,
    rpc: async (name, args) => {
      if (name === "claim_wa_notification_for_agent") {
        const data = await claimFixture(
          sql,
          fixture,
          phone,
          inbound,
          args.worker_id,
        );
        return { data, error: null };
      }
      assert.equal(args.notification_id, fixture.id);
      if (name === "prepare_wa_agent_notice") {
        // The shared worker prepares again after formatting to catch edits,
        // expired conversation windows, or consent changes before sending.
        const data = await sql.begin(tx =>
          withPilotWindow(tx, fixture.chef_id, phone, inbound, async () => {
            const [row] = await tx`
            select public.prepare_wa_agent_notice(${fixture.id}::uuid,${args.worker_id}::uuid,${args.styled_body},${phone}) as ready
          `;
            return row.ready;
          }),
        );
        return { data, error: null };
      }
      return local.rpc(name, args);
    },
  });
  return worker.sendNext();
}

/** Matches Meta receipts to sent fixtures by provider ID. Acceptance alone is not delivery. */
async function syncReceipts({ sql, hosted, phone }) {
  const notices = await sql`
    select n.provider_message_id,c.ref_code,n.created_at,n.send_started_at
    from public.wa_notifications n
    join whatsapp_test.fixture_ui_items f on f.id=n.catering_id and f.kind='catering'
    join public.whatsapp_catering c on c.catering_id=f.id
    join public.chefs chef on chef.id=n.chef_id and chef.wa_phone=${phone}
    left join public.wa_notification_receipts r on r.provider_message_id=n.provider_message_id
    where n.kind='catering_alert' and n.status='sent' and n.provider_message_id is not null
      and n.sent_at>clock_timestamp()-interval '10 minutes'
      and (r.provider_message_id is null or r.status='failed')
    order by n.sent_at limit 50
  `;
  if (!notices.length) return;

  const { data, error } = await hosted
    .from("wa_notification_receipts")
    .select("provider_message_id,status,recorded_at")
    .in(
      "provider_message_id",
      notices.map(notice => notice.provider_message_id),
    );
  if (error) throw new Error("Could not check Meta delivery receipts.");

  const noticesById = new Map(
    notices.map(row => [row.provider_message_id, row]),
  );
  for (const receipt of data) {
    const notice = noticesById.get(receipt.provider_message_id);
    if (!notice) continue;
    // Meta may follow a failure with stronger evidence. Keep the first success
    // time so reading the message later cannot inflate the delivery measurement.
    const [saved] = await sql`
      insert into public.wa_notification_receipts as existing(provider_message_id,status,recorded_at)
      values (${receipt.provider_message_id},${receipt.status},${receipt.recorded_at})
      on conflict (provider_message_id) do update
      set status=excluded.status,recorded_at=excluded.recorded_at
      where existing.status='failed' and excluded.status in ('delivered','read')
      returning status
    `;
    if (!saved) continue;
    const receiptTime = Date.parse(receipt.recorded_at);
    console.log(
      JSON.stringify({
        fixture: notice.ref_code,
        delivery: receipt.status,
        queueToReceiptMs: receiptTime - notice.created_at.getTime(),
        sendToReceiptMs: receiptTime - notice.send_started_at.getTime(),
      }),
    );
  }
}

/** Picks only new catering assignments from this lab for the opted-in test chef. */
async function deliverNextFixture(context, startedAt) {
  const { sql, phone } = context;
  const [fixture] = await sql`
    select n.id,n.chef_id,c.ref_code from public.wa_notifications n
    join whatsapp_test.fixture_ui_items f on f.id=n.catering_id and f.kind='catering'
    join public.whatsapp_catering c on c.catering_id=f.id and c.meal_name like 'TEST — %'
    join public.chefs chef on chef.id=n.chef_id and chef.wa_phone=${phone}
    join public.users u on u.userid=chef.user_id and u.email='chef-a@example.test'
    where f.created_at>=${startedAt}::timestamptz and n.kind='catering_alert'
      and n.status in ('pending','blocked') and chef.active
      and chef.opted_in_at is not null and chef.opted_out_at is null
    order by n.created_at,n.id limit 1
  `;
  if (!fixture) return false;
  if (!(await sendFixture(context, fixture))) return false;
  console.log(`${fixture.ref_code} accepted by Meta.`);
  return true;
}

/** Keeps reading delivery callbacks while the send loop works on the next fixture. */
async function watchReceipts(context, signal) {
  while (!signal.aborted) {
    await syncReceipts(context).catch(() =>
      console.error("Fixture receipt check failed. Retrying."),
    );
    await sleep(receiptPollMs, undefined, { signal }).catch(() => {});
  }
}

/** Drains ready fixtures, then waits for a database signal or the recovery poll. */
async function drainQueue(context, startedAt, wake, signal) {
  while (!signal.aborted) {
    const sent = await deliverNextFixture(context, startedAt).catch(error => {
      console.error(
        "Fixture send check failed.",
        Number.isInteger(error.code) ? error.code : "",
      );
      return false;
    });
    if (!sent && !signal.aborted) await wake.wait(recoveryPollMs);
  }
}

/** Requires an explicit one-phone hosted pilot and the dedicated local DB marker. */
async function main() {
  const env = process.env;
  const config = parseEnv(
    await readFile(
      new URL("../.env.whatsapp-test.local", import.meta.url),
      "utf8",
    ),
  );
  const phone = config.WHATSAPP_TEST_RECIPIENT;
  assert.ok(
    /^[1-9]\d{1,14}$/.test(phone) && env.WHATSAPP_RECIPIENTS?.trim() === phone,
    "The hosted pilot allowlist must match the single seeded test phone.",
  );
  assert.ok(
    config.WHATSAPP_SYNTHETIC_DATABASE === "1" &&
      new URL(config.NEXT_PUBLIC_SUPABASE_URL).origin ===
        "http://127.0.0.1:55321",
    "Run the dedicated local test database first.",
  );
  assert.match(
    env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/,
    "Use the hosted pilot Supabase URL for read-only delivery evidence.",
  );
  assert.ok(
    env.WHATSAPP_PHONE_NUMBER_ID &&
      env.WHATSAPP_ACCESS_TOKEN &&
      env.WHATSAPP_GRAPH_API_VERSION,
    "Provide the hosted pilot's Meta sender and access token.",
  );
  const local = supabase(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.SUPABASE_SECRET_KEY,
  );
  const hosted = supabase(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
  );
  const meta = createMetaClient({
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    apiVersion: env.WHATSAPP_GRAPH_API_VERSION,
    fetch: (input, options) =>
      fetch(input, { ...options, signal: AbortSignal.timeout(15_000) }),
  });
  const model = resolveAgentModel(env).model;
  const sql = postgres(localDatabase, {
    max: 4,
    connect_timeout: 5,
    // The reserved connection holds the process lock for the whole run.
    max_lifetime: null,
    onnotice: () => {},
  });
  const wake = createWorkerWake();
  const stop = new AbortController();
  /** Wakes idle loops so the current send can finish before closing the database. */
  function shutdown() {
    stop.abort();
    wake.wake();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
    const [seed] = await sql`
      select 1 from whatsapp_test.migrations m, public.users u join public.chefs c on c.user_id=u.userid
      where m.name='supabase/test-schema.sql' and u.email='chef-a@example.test' and c.wa_phone=${phone}
    `;
    assert.ok(seed, "The approved test phone must be assigned to Test Chef A.");
    const lock = await sql.reserve();
    const [owner] =
      await lock`select pg_try_advisory_lock(hashtext('wa_fixture_delivery')) as acquired`;
    assert.ok(owner.acquired, "A fixture delivery worker is already running.");

    // The database clock matches fixture timestamps. Starting the live worker
    // should never send old fixtures that were created during offline tests.
    const [startup] = await sql`select clock_timestamp()::text as started_at`;
    const listener = await listenForFixtures(sql, wake.wake);
    const context = { sql, local, hosted, phone, model, meta };
    console.log(
      `Fixture delivery listening for Test Chef A (ending ${phone.slice(-4)}).`,
    );

    await Promise.all([
      drainQueue(context, startup.started_at, wake, stop.signal),
      watchReceipts(context, stop.signal),
    ]);
    await listener.unlisten();
    await lock`select pg_advisory_unlock(hashtext('wa_fixture_delivery'))`;
    lock.release();
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(error => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Could not start fixture delivery. Check the local database and pilot settings.",
  );
  process.exitCode = 1;
});
