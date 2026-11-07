import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createMetaClient,
  MediaRejectedError,
  MetaApiError,
} from "../lib/whatsapp/metaClient.ts";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** A fake Graph API that records requests and replies from a queue. */
function fakeMeta(...replies) {
  const requests = [];
  const client = createMetaClient({
    phoneNumberId: "PHONE",
    accessToken: "TOKEN",
    apiVersion: "v26.0",
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method ?? "GET",
        headers: init.headers ?? {},
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      });
      const reply = replies.shift();
      assert.ok(reply, `unexpected request to ${url}`);
      return typeof reply === "function" ? reply() : reply;
    },
  });
  return { client, requests };
}
const sent = id => json({ messages: [{ id }] });

test("text replies return a prefixed ID so status callbacks can be matched", async () => {
  const { client, requests } = fakeMeta(sent("wamid.out"));
  const result = await client.sendText(
    "15555550123",
    "one sec, pulling up OB12",
    {
      replyTo: "meta:wamid.in",
    },
  );
  assert.deepEqual(result, { providerMessageId: "meta:wamid.out" });
  assert.equal(
    requests[0].url,
    "https://graph.facebook.com/v26.0/PHONE/messages",
  );
  assert.equal(requests[0].headers.Authorization, "Bearer TOKEN");
  assert.deepEqual(requests[0].body, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "15555550123",
    type: "text",
    text: { body: "one sec, pulling up OB12", preview_url: false },
    context: { message_id: "wamid.in" },
  });
});

test("gig templates send named variables and an optional image header", async () => {
  const { client, requests } = fakeMeta(sent("wamid.t"));
  await client.sendTemplate("15555550123", {
    name: "gig_alert_image",
    language: "es",
    bodyParameters: { first_name: "Amina", gig: "OB12" },
    headerImageId: "media-1",
  });
  assert.deepEqual(requests[0].body.template, {
    name: "gig_alert_image",
    language: { code: "es" },
    components: [
      {
        type: "header",
        parameters: [{ type: "image", image: { id: "media-1" } }],
      },
      {
        type: "body",
        parameters: [
          { type: "text", parameter_name: "first_name", text: "Amina" },
          { type: "text", parameter_name: "gig", text: "OB12" },
        ],
      },
    ],
  });
});

test("positional template variables keep their order", async () => {
  const { client, requests } = fakeMeta(sent("wamid.t"));
  await client.sendTemplate("15555550123", {
    name: "gig_alert",
    language: "en_US",
    bodyParameters: ["Amina", "OB12"],
  });
  assert.deepEqual(requests[0].body.template.components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "Amina" },
        { type: "text", text: "OB12" },
      ],
    },
  ]);
});

test("read + typing is one call, and typing can be left off", async () => {
  // Typing should only show when a reply will actually follow.
  const { client, requests } = fakeMeta(
    json({ success: true }),
    json({ success: true }),
  );
  await client.markReadAndTyping("meta:wamid.in");
  await client.markReadAndTyping("meta:wamid.in", { typing: false });
  assert.deepEqual(requests[0].body, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: "wamid.in",
    typing_indicator: { type: "text" },
  });
  assert.equal(requests[1].body.typing_indicator, undefined);
});

test("reactions and images target the raw wamid", async () => {
  const { client, requests } = fakeMeta(sent("wamid.r"), sent("wamid.i"));
  await client.sendReaction("15555550123", "meta:wamid.thanks", "🙏");
  await client.sendImage("15555550123", "media-1", { caption: "kitchen map" });
  assert.deepEqual(requests[0].body.reaction, {
    message_id: "wamid.thanks",
    emoji: "🙏",
  });
  assert.deepEqual(requests[1].body.image, {
    id: "media-1",
    caption: "kitchen map",
  });
});

test("a non-Meta message ID is refused before any request is made", async () => {
  // Sending a Twilio SID to Meta would fail confusingly at the API.
  const { client, requests } = fakeMeta();
  await assert.rejects(
    client.sendReaction("15555550123", "twilio:SM1", "🙏"),
    /meta: message ID/,
  );
  assert.equal(requests.length, 0);
});

test("API errors say whether a retry can help", async () => {
  const { client } = fakeMeta(
    json({ error: { message: "rate limited", code: 130429 } }, 429),
    json({ error: { message: "bad param", code: 100 } }, 400),
  );
  await assert.rejects(client.sendText("1555", "hi"), error => {
    assert.ok(error instanceof MetaApiError);
    assert.equal(error.retryable, true);
    assert.equal(error.code, 130429);
    return true;
  });
  await assert.rejects(client.sendText("1555", "hi"), error => {
    assert.equal(error.retryable, false);
    assert.match(error.message, /bad param/);
    return true;
  });
});

test("a send with no message ID is an error, not a silent success", async () => {
  const { client } = fakeMeta(json({ messages: [] }));
  await assert.rejects(client.sendText("1555", "hi"), /no message ID/);
});

const photo = new TextEncoder().encode("fake jpeg bytes");
const base64 = createHash("sha256").update(photo).digest("base64");
const hex = createHash("sha256").update(photo).digest("hex");
const lookup = (overrides = {}) =>
  json({
    url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1",
    mime_type: "image/jpeg",
    sha256: base64,
    file_size: photo.byteLength,
    id: "media-1",
    ...overrides,
  });

test("downloads a chef photo with a fresh URL and verifies its hash", async () => {
  const { client, requests } = fakeMeta(lookup(), () => new Response(photo));
  const media = await client.downloadMedia("media-1", base64);
  assert.deepEqual(media, { bytes: photo, mimeType: "image/jpeg" });
  assert.equal(
    requests[0].url,
    "https://graph.facebook.com/v26.0/media-1?phone_number_id=PHONE",
  );
  // The short-lived URL is fetched with the token, never stored or returned.
  assert.equal(requests[1].headers.Authorization, "Bearer TOKEN");
});

test("accepts a hex SHA-256 as well as Meta's base64 form", async () => {
  const { client } = fakeMeta(
    lookup({ sha256: hex }),
    () => new Response(photo),
  );
  await client.downloadMedia("media-1");
});

test("refuses tampered, oversized, or unsupported media before it is stored", async () => {
  // Anything stored is shown to admins and the model, so it must be what Meta sent.
  const tampered = fakeMeta(lookup(), () => new Response("other bytes"));
  await assert.rejects(
    tampered.client.downloadMedia("media-1", base64),
    MediaRejectedError,
  );

  const huge = fakeMeta(lookup({ file_size: 6 * 1024 * 1024 }));
  await assert.rejects(
    huge.client.downloadMedia("media-1"),
    MediaRejectedError,
  );

  const audio = fakeMeta(lookup({ mime_type: "audio/ogg; codecs=opus" }));
  await assert.rejects(
    audio.client.downloadMedia("media-1"),
    /Unsupported media type/,
  );

  // Stickers have a much smaller cap than photos.
  const bigSticker = fakeMeta(
    lookup({
      mime_type: "image/webp",
      file_size: undefined,
      sha256: undefined,
    }),
    () => new Response(new Uint8Array(600 * 1024)),
  );
  await assert.rejects(
    bigSticker.client.downloadMedia("media-1"),
    /limit is 512000/,
  );
});

test("uploads gig media once and returns the reusable ID", async () => {
  const { client, requests } = fakeMeta(json({ id: "media-9" }));
  const id = await client.uploadMedia(photo, "image/jpeg", "gig.jpg");
  assert.equal(id, "media-9");
  assert.equal(requests[0].url, "https://graph.facebook.com/v26.0/PHONE/media");
  assert.ok(requests[0].body instanceof FormData);
  assert.equal(requests[0].body.get("messaging_product"), "whatsapp");
  assert.equal(requests[0].body.get("type"), "image/jpeg");
});
