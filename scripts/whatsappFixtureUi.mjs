import { randomInt, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import postgres from "postgres";
import { z } from "zod";

const host = "127.0.0.1";
const port = 55325;
const origin = `http://${host}:${port}`;
const maxRequestBytes = 8192;

// Keep the database address fixed. Neither the browser nor .env.local can
// redirect this tool to a shared Supabase project.
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const chefId = z.enum(["chef-a", "chef-b"]);
const cateringFields = {
  title: z.string().trim().min(1).max(120),
  guestCount: z.number().int().min(1).max(500),
  location: z.string().trim().max(200),
};
const cateringDraft = z.strictObject(cateringFields);
const fixtureAction = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("create_catering"),
    chef: chefId,
    ...cateringFields,
  }),
  z.strictObject({
    action: z.literal("create_booking"),
    chef: chefId,
    amenity: z.enum(["oven", "bar_prep_table", "salad_bar_table", "kitchen"]),
  }),
  z.strictObject({
    action: z.literal("update_catering"),
    id: z.uuid(),
    guestCount: cateringFields.guestCount,
    location: cateringFields.location,
    status: z.enum(["open", "closed"]),
  }),
  z.strictObject({
    action: z.literal("update_booking"),
    id: z.uuid(),
    status: z.enum(["pending", "approved", "denied"]),
  }),
  z.strictObject({
    action: z.literal("set_consent"),
    chef: chefId,
    optedIn: z.boolean(),
  }),
]);

class FixtureError extends Error {
  /** Carries a message the local page can safely show. */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Finds the two seeded demo accounts without exposing phone numbers to the page. */
async function fixtureChefs(sql) {
  return sql`
    select split_part(u.email, '@', 1) id, u.name, u.userid,
        c.id as "transportId", c.whatsapp_user_id as "cateringId",
        (c.opted_in_at is not null and c.opted_out_at is null) as "optedIn"
    from public.users u
    join public.chefs c on c.user_id=u.userid
    where u.email in ('chef-a@example.test','chef-b@example.test')
      and u.is_approved and not u.is_admin and c.whatsapp_user_id is not null
    order by u.email
  `;
}

/** Reads only this tool's fixtures and each one's most recent real outbox state. */
async function fixtureSnapshot(sql) {
  const chefs = (await fixtureChefs(sql)).map(({ id, name, optedIn }) => ({
    id,
    name,
    optedIn,
  }));
  const fixtures = await sql`
    with entries as (
      select f.id, f.kind, u.name chef, c.meal_name title, c.request_status status,
             c.ref_code reference, c.num_people::integer "guestCount",
             c.location, c.event_at as "when", null::text amenity, f.created_at
      from whatsapp_test.fixture_ui_items f
      join public.whatsapp_catering c on f.kind='catering' and c.catering_id=f.id
      join public.whatsapp_user u on u.chef_id=c.chef
      union all
      select f.id, f.kind, u.name, coalesce(to_jsonb(b)->>'title','Kitchen reservation'),
             b.approval_status, null, null, null, b.start_time, b.amenity, f.created_at
      from whatsapp_test.fixture_ui_items f
      join public.booking_event b on f.kind='booking' and b.id=f.id
      join public.users u on u.userid=b."user"
    )
    select e.id,e.kind,e.chef,e.title,e.status,e.reference,e."guestCount",
           e.location,e."when",e.amenity,n.status as "noticeStatus"
    from entries e
    left join lateral (
      select status from public.wa_notifications
      where (e.kind='catering' and catering_id=e.id)
         or (e.kind='booking' and booking_id=e.id)
      order by created_at desc,id desc limit 1
    ) n on true
    order by e.created_at desc,e.id
    limit 50
  `;
  return { chefs, fixtures };
}

/** Creates one future fixture and registers it for later edits in the same transaction. */
async function addFixture(sql, action, chef) {
  const id = randomUUID();
  const kind = action.action === "create_catering" ? "catering" : "booking";
  if (kind === "catering") {
    await sql`
      insert into public.whatsapp_catering
        (catering_id,chef,meal_name,num_people,is_accepted,day_created,event_at,location)
      values (${id},${chef.cateringId},${"TEST — " + action.title},${action.guestCount},
        false,now(),now()+interval '7 days',${action.location || null})
    `;
  } else {
    // Pick a slot beyond existing fixtures. Use the common columns so this
    // works with either the older fixture schema or the newer booking schema.
    await sql`select pg_advisory_xact_lock(hashtext('wa_fixture_ui_booking'))`;
    await sql`
      insert into public.booking_event
        (id,amenity,"user",start_time,end_time,num_people,has_conflicts,approval_status)
      select ${id},${action.amenity},${chef.userid},start_at,start_at+interval '1 hour',2,'{}','pending'
      from (
        select date_trunc('minute',greatest(now()+interval '7 days',max(end_time)+interval '1 hour')) start_at
        from public.booking_event where isfinite(end_time)
      ) slot
    `;
  }
  await sql`insert into whatsapp_test.fixture_ui_items(id,kind) values(${id},${kind})`;
}

/** Updates only a tracked fixture of the expected kind. All values are query parameters. */
async function updateFixture(sql, action) {
  let changed;
  if (action.action === "update_catering") {
    changed = await sql`
      update public.whatsapp_catering c
      set num_people=${action.guestCount},location=${action.location || null},request_status=${action.status}
      from whatsapp_test.fixture_ui_items f
      where f.id=${action.id} and f.kind='catering' and c.catering_id=f.id
      returning c.catering_id
    `;
  } else {
    changed = await sql`
      update public.booking_event b set approval_status=${action.status}
      from whatsapp_test.fixture_ui_items f
      where f.id=${action.id} and f.kind='booking' and b.id=f.id
      returning b.id
    `;
  }
  if (!changed.length)
    throw new FixtureError(
      404,
      "This fixture was not created by the test page.",
    );
}

/** Runs the selected test operation through normal database triggers and consent checks. */
async function changeFixtures(sql, action) {
  await sql.begin(async tx => {
    if (
      action.action === "update_catering" ||
      action.action === "update_booking"
    ) {
      await updateFixture(tx, action);
      return;
    }

    const chef = (await fixtureChefs(tx)).find(item => item.id === action.chef);
    if (!chef)
      throw new FixtureError(
        404,
        "That test chef has not been seeded. Run pnpm db:test.",
      );
    if (action.action === "set_consent") {
      const [admin] = await tx`
        select userid from public.users where email='admin@example.test' and is_admin and is_approved
      `;
      if (!admin)
        throw new FixtureError(
          409,
          "The test admin has not been seeded. Run pnpm db:test.",
        );
      await tx`select public.set_wa_alert_consent(
        ${admin.userid},${chef.transportId},${action.optedIn},'Synthetic fixture UI test')`;
      return;
    }
    await addFixture(tx, action, chef);
  });
  // Read the outbox after commit so the page can show what the real triggers queued.
  return fixtureSnapshot(sql);
}

/** Asks Claude for fictional form values. The prompt contains no database or user data. */
async function generateCateringDraft() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.WHATSAPP_AGENT_MODEL?.trim();
  if (!apiKey || !model || model.includes("/"))
    throw new FixtureError(
      503,
      "Set ANTHROPIC_API_KEY and a native Claude WHATSAPP_AGENT_MODEL in .env.local.",
    );
  const themes = [
    "garden lunch",
    "community dinner",
    "workshop snack break",
    "weekend brunch",
    "harvest supper",
  ];
  try {
    const result = await generateText({
      model: createAnthropic({ apiKey })(model),
      system:
        "Generate fictional catering data for a software test. Use an invented event, a plausible guest count from 1 to 500, and an invented venue. Avoid actual people, addresses, phone numbers, and real venue names.",
      prompt: `Make a short example for a ${themes[randomInt(themes.length)]}.`,
      output: Output.object({ schema: cateringDraft }),
      maxOutputTokens: 512,
      maxRetries: 0,
      timeout: 15_000,
    });
    return cateringDraft.parse(result.output);
  } catch {
    throw new FixtureError(
      502,
      "Claude couldn't generate a draft. You can retry or fill in the form.",
    );
  }
}

/** Accepts small JSON bodies only, keeping the stream open until a 413 can be sent. */
async function readJson(request) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new FixtureError(415, "Expected a JSON request.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > maxRequestBytes)
      throw new FixtureError(413, "Request is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FixtureError(400, "Invalid JSON request.");
  }
}

/** Serves one page and two JSON operations, scoped to this exact loopback origin. */
function createFixtureServer(sql, html) {
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );

    try {
      // Reject aliases or requests from a different site. The browser never gets
      // a database key, and a different site cannot silently trigger writes.
      if (
        request.headers.host !== `${host}:${port}` ||
        (request.method === "POST" && request.headers.origin !== origin)
      )
        throw new FixtureError(403, "Open this tool on its local address.");

      if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }

      let data;
      if (request.method === "GET" && request.url === "/api/fixtures") {
        data = await fixtureSnapshot(sql);
      } else if (request.method === "POST" && request.url === "/api/fixtures") {
        const action = fixtureAction.safeParse(await readJson(request));
        if (!action.success)
          throw new FixtureError(
            400,
            "Check the fixture fields and try again.",
          );
        data = await changeFixtures(sql, action.data);
      } else if (request.method === "POST" && request.url === "/api/generate") {
        const body = z.strictObject({}).safeParse(await readJson(request));
        if (!body.success)
          throw new FixtureError(400, "Unexpected generation request.");
        data = await generateCateringDraft();
      } else {
        throw new FixtureError(404, "Page not found.");
      }

      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(data));
    } catch (error) {
      const safe = error instanceof FixtureError;
      if (!safe)
        console.error("Fixture operation failed:", error.code ?? "unknown");
      response.writeHead(safe ? error.status : 500, {
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({
          error: safe
            ? error.message
            : "Could not change the fake database. Check that pnpm db:test ran successfully.",
        }),
      );
    }
  });
}

/** Starts only when the dedicated database has the synthetic migration marker. */
async function main() {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  });
  try {
    const [marker] =
      await sql`select to_regclass('whatsapp_test.migrations') is not null as ready`;
    if (!marker.ready) throw new Error("Synthetic marker missing.");
    const [baseline] =
      await sql`select 1 from whatsapp_test.migrations where name='supabase/test-schema.sql'`;
    if (!baseline || (await fixtureChefs(sql)).length !== 2)
      throw new Error("Fixture accounts missing.");

    // This table is local to the fixture stack. It prevents edits to seeded
    // or teammates' synthetic rows even if a browser posts another row's UUID.
    await sql`
      create table if not exists whatsapp_test.fixture_ui_items (
        id uuid primary key,kind text not null check(kind in ('catering','booking')),
        created_at timestamptz not null default now()
      )
    `;
    const html = await readFile(
      new URL("./whatsappFixtureUi.html", import.meta.url),
    );
    const server = createFixtureServer(sql, html);
    server.listen(port, host);
    await once(server, "listening");
    console.log(`WhatsApp fixture lab: ${origin} (local fake database only)`);

    /** Waits for active local requests, then closes the database connection. */
    function stop() {
      server.close(() => void sql.end({ timeout: 5 }));
    }
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    await sql.end({ timeout: 5 });
    console.error(
      error.code === "EADDRINUSE"
        ? `The fixture lab is already running on ${origin}.`
        : "Could not open the synthetic fixture lab. Run pnpm db:test first.",
    );
    process.exitCode = 1;
  }
}

await main();
