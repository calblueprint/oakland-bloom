# WhatsApp Agent Production Plan

Proposed next steps for the [local prototype](whatsapp-conversational-agent.md).
These are plans, not implemented behavior. This replaces the earlier group-post
and Twilio sandbox recommendations in [the research](whatsapp-bot-research.md).

## Product

- Give each chef a 1:1 chat for gig alerts, questions, and interest responses.
- Disclose that the assistant is automated; let staff take over a conversation.
- Keep replies short and use the chef's language. Interest is not a booking.
- Proposed change: clear yes/no replies get a receipt and an undo option;
  ambiguous replies need clarification. The current prototype still requires
  a separate confirmation. Agree on this change before implementing it.

## Design

Use Meta Cloud API directly. The proposed path is:

```text
Signed webhook → Supabase inbox → per-chef worker → agent/tools → outbox → Meta
```

Save inbound messages before acknowledging them. Process one turn per chef at a
time, deduplicate provider IDs, and commit decisions and outgoing replies together.
Keep chef identity, gig access, and writes under server control. Pause the agent
during staff takeover. A Supabase adapter must replace the prototype's JSON store;
the existing legacy tables do not cover its full state model.

## Build Order

1. Get a dedicated number, start business verification, and collect chef opt-in.
   Confirm template category, language support, and delivery rules with Meta.
2. Add database storage and a signed webhook with duplicate-safe ingest.
3. Connect one complete flow: receive a reply, resolve the chef and gig, save
   interest, and send a receipt. Add retries and staff takeover.
4. Add admin gig publishing and approved templates for proactive alerts.
5. Add image storage/model input, then message batching and typing indicators.
   Evaluate voice transcription by language before enabling it.
6. Test access isolation, ambiguous intent, duplicate delivery, rollback, opt-out,
   takeover, and closed messaging windows. Review multilingual conversations
   with staff and chefs before a pilot.

## Before Launch

Confirm current platform rules rather than relying on the research's dated pricing
and limits. Template approval/category and US delivery restrictions are launch
checks. Enforce opt-out and the customer-service window in code. Validate sender
identity formats, retry behavior, retention, and outbound duplicate handling.

Reference docs: [Meta messaging](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages),
[templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization),
[opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in),
and [webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview).
