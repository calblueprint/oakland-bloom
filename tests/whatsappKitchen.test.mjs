import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { z } from "zod";
import { createKitchenTools } from "../lib/whatsapp/agent/kitchen.ts";

const now = new Date("2030-11-07T18:00:00.000Z");
const interval = {
  amenity: "Oven",
  startAt: "2030-11-11T12:00:00-08:00",
  endAt: "2030-11-11T13:00:00-08:00",
};
const text =
  "Please ask staff about using the Oven on November 11 from noon to 1 PM for 3 people.";
const booking = {
  id: randomUUID(),
  ...interval,
  people: 3,
  status: "pending",
};

/** Exercises real tool schemas and callbacks with a scoped fake kitchen backend. */
function setup({
  status = "no_approved_conflicts",
  linked = true,
  fail = false,
  kitchen = true,
  message = text,
  result,
  bookings = [booking],
} = {}) {
  const state = {
    version: 1,
    chefs: [
      {
        id: "chef-a",
        name: "Test Chef",
        phone: "15555550101",
        userId: linked ? randomUUID() : null,
      },
    ],
    opportunities: [],
    conversations: [],
    responses: [],
    handoffs: [],
    receipts: [],
  };
  const activity = { handedOff: false, kitchenReview: false };
  const events = [];
  const tools = createKitchenTools({
    state,
    chefId: "chef-a",
    message: {
      provider: "meta",
      providerMessageId: "meta:kitchen-test",
      from: "15555550101",
      text: message,
    },
    now,
    activity,
    kitchen: kitchen
      ? {
          async listBookings() {
            events.push("list");
            if (fail) throw new Error("private database detail");
            return bookings;
          },
          async checkAvailability(input) {
            events.push("availability");
            if (fail) throw new Error("private database detail");
            return result ?? { ...input, status };
          },
        }
      : undefined,
    async runTool(name, input, action) {
      events.push(name);
      return z.json().parse(await action());
    },
  });
  return {
    state,
    activity,
    events,
    async call(name, input = {}) {
      const tool = tools[name];
      return tool.execute(tool.inputSchema.parse(input), {
        toolCallId: "test",
        messages: [],
      });
    },
  };
}

test("own bookings preserve status and include explicit Oakland time labels", async () => {
  const app = setup();
  const rows = await app.call("list_my_kitchen_bookings");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, booking.id);
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[0].timeZone, "America/Los_Angeles");
  assert.match(rows[0].startsLocal, /12:00 PM/);
  assert.ok(!("user" in rows[0]));
});

test("missing backend or linked account never reads kitchen records", async () => {
  for (const options of [{ kitchen: false }, { linked: false }]) {
    const app = setup(options);
    for (const name of [
      "list_my_kitchen_bookings",
      "check_kitchen_availability",
      "request_kitchen_booking_review",
    ]) {
      const input =
        name === "list_my_kitchen_bookings"
          ? {}
          : {
              ...interval,
              ...(name === "request_kitchen_booking_review"
                ? { people: 3, sourceQuote: text }
                : {}),
            };
      assert.deepEqual(await app.call(name, input), {
        error: "kitchen_unavailable",
      });
    }
    assert.ok(!app.events.includes("list"));
    assert.ok(!app.events.includes("availability"));
    assert.equal(app.state.handoffs.length, 0);
  }
});

test("failed or malformed reads do not become empty bookings or an availability claim", async () => {
  const failure = setup({ fail: true });
  assert.deepEqual(await failure.call("list_my_kitchen_bookings"), {
    error: "kitchen_unavailable",
  });
  assert.deepEqual(await failure.call("check_kitchen_availability", interval), {
    error: "kitchen_unavailable",
  });
  const leaked = setup({
    bookings: [{ ...booking, otherChefId: "private-id" }],
  });
  assert.deepEqual(await leaked.call("list_my_kitchen_bookings"), {
    error: "kitchen_unavailable",
  });
  const malformed = setup({
    bookings: [{ ...booking, endAt: booking.startAt }],
  });
  assert.deepEqual(await malformed.call("list_my_kitchen_bookings"), {
    error: "kitchen_unavailable",
  });
});

test("availability output must match the requested amenity and exact instants", async () => {
  const app = setup();
  const output = await app.call("check_kitchen_availability", interval);
  assert.equal(output.status, "no_approved_conflicts");
  assert.match(output.notice, /approved booking conflicts only/);
  for (const result of [
    { ...interval, status: "no_approved_conflicts", amenity: "Other room" },
    {
      ...interval,
      status: "no_approved_conflicts",
      startAt: "2030-11-11T14:00:00-08:00",
    },
    { ...interval, status: "no_approved_conflicts", chef: "private-owner" },
  ]) {
    assert.deepEqual(
      await setup({ result }).call("check_kitchen_availability", interval),
      { error: "kitchen_unavailable" },
    );
  }
});

test("ambiguous timestamps, past/equal/reversed ranges and overlong queries fail closed", async () => {
  const ambiguous = { ...interval, startAt: "2030-11-11T12:00:00" };
  await assert.rejects(setup().call("check_kitchen_availability", ambiguous));
  await assert.rejects(
    setup().call("check_kitchen_availability", {
      ...interval,
      startAt: "2030-11-11T12:00:00.0001-08:00",
    }),
  );
  for (const input of [
    { ...interval, startAt: "2030-11-01T12:00:00-08:00" },
    { ...interval, endAt: interval.startAt },
    { ...interval, endAt: "2030-11-11T11:00:00-08:00" },
    { ...interval, endAt: "2031-01-01T12:00:00-08:00" },
  ]) {
    const app = setup();
    assert.deepEqual(await app.call("check_kitchen_availability", input), {
      error: "invalid_kitchen_interval",
    });
    assert.ok(!app.events.includes("availability"));
  }
});

test("booking review saves one exact staff request, never a reservation or catering response", async () => {
  const app = setup();
  const input = { ...interval, people: 3, sourceQuote: text };
  assert.deepEqual(await app.call("request_kitchen_booking_review", input), {
    status: "queued_for_review",
    bookingConfirmed: false,
  });
  assert.deepEqual(await app.call("request_kitchen_booking_review", input), {
    status: "queued_for_review",
    bookingConfirmed: false,
  });
  assert.equal(app.state.handoffs.length, 1);
  assert.match(
    app.state.handoffs[0].reason,
    /Oven;.*12:00:00\.000 GMT-8.*13:00:00\.000 GMT-8.*Oakland.*3 people/,
  );
  assert.match(app.state.handoffs[0].reason, /Not booked/);
  assert.equal(app.activity.handedOff, true);
  assert.equal(app.activity.kitchenReview, true);
  assert.deepEqual(app.state.responses, []);
  assert.equal(booking.status, "pending");
});

test("a second distinct kitchen request cannot falsely claim it was queued", async () => {
  const app = setup();
  const first = { ...interval, people: 3, sourceQuote: text };
  await app.call("request_kitchen_booking_review", first);
  const saved = structuredClone(app.state.handoffs[0]);
  for (const change of [
    { amenity: "Prep Table" },
    { people: 4 },
    { endAt: "2030-11-11T14:00:00-08:00" },
    { endAt: "2030-11-11T13:00:01-08:00" },
    { endAt: "2030-11-11T13:00:00.001-08:00" },
  ]) {
    assert.deepEqual(
      await app.call("request_kitchen_booking_review", { ...first, ...change }),
      { error: "clarification_required" },
    );
    assert.deepEqual(app.state.handoffs, [saved]);
  }
});

test("generic help for the message does not count as a saved kitchen request", async () => {
  const app = setup();
  const generic = {
    chefId: "chef-a",
    messageId: "meta:kitchen-test",
    reason: "Chef asked for help.",
    createdAt: now.toISOString(),
  };
  app.state.handoffs.push(generic);
  app.activity.handedOff = true;
  assert.deepEqual(
    await app.call("request_kitchen_booking_review", {
      ...interval,
      people: 3,
      sourceQuote: text,
    }),
    { error: "clarification_required" },
  );
  assert.deepEqual(app.state.handoffs, [generic]);
  assert.equal(app.activity.kitchenReview, false);
});

test("an existing identical review sets receipt flags without duplicating the request", async () => {
  const first = setup();
  const input = { ...interval, people: 3, sourceQuote: text };
  await first.call("request_kitchen_booking_review", input);
  const app = setup();
  app.state.handoffs.push(structuredClone(first.state.handoffs[0]));
  assert.deepEqual(await app.call("request_kitchen_booking_review", input), {
    status: "queued_for_review",
    bookingConfirmed: false,
  });
  assert.equal(app.state.handoffs.length, 1);
  assert.equal(app.activity.handedOff, true);
  assert.equal(app.activity.kitchenReview, true);
});

test("busy and unknown amenities do not create staff requests or booking claims", async () => {
  for (const status of ["busy", "unknown_amenity"]) {
    const app = setup({ status });
    const result = await app.call("request_kitchen_booking_review", {
      ...interval,
      people: 3,
      sourceQuote: text,
    });
    assert.equal(result.status, status);
    assert.equal(result.bookingConfirmed, false);
    assert.equal(app.state.handoffs.length, 0);
    assert.equal(app.activity.kitchenReview, false);
  }
});

test("review requires a current source quote and explicit details, not a bare confirmation or cancel", async () => {
  for (const message of ["confirm", "cancel", "yes please", "never mind"]) {
    const app = setup({ message });
    assert.deepEqual(
      await app.call("request_kitchen_booking_review", {
        ...interval,
        people: 3,
        sourceQuote: message,
      }),
      { error: "clarification_required" },
    );
    assert.ok(!app.events.includes("availability"));
  }
  const app = setup();
  assert.deepEqual(
    await app.call("request_kitchen_booking_review", {
      ...interval,
      people: 3,
      sourceQuote: "not in the current message",
    }),
    { error: "clarification_required" },
  );
  for (const people of [0, -1, 1.5])
    await assert.rejects(
      app.call("request_kitchen_booking_review", {
        ...interval,
        people,
        sourceQuote: text,
      }),
    );
  assert.equal(app.state.handoffs.length, 0);
});

test("the longest supported amenity still produces a valid bounded handoff reason", async () => {
  const app = setup();
  const result = await app.call("request_kitchen_booking_review", {
    ...interval,
    amenity: "A".repeat(255),
    people: Number.MAX_SAFE_INTEGER,
    sourceQuote: text,
  });
  assert.equal(result.status, "queued_for_review");
  assert.ok(app.state.handoffs[0].reason.length <= 500);
  assert.ok(app.state.handoffs[0].reason.includes("A".repeat(255)));
});
