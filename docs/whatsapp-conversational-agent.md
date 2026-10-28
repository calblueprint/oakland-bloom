# Local WhatsApp Conversational Agent

This prototype connects normalized inbound messages to an AI SDK tool loop,
chef-scoped tools, and a local JSON store. It supports questions and natural
follow-up conversation, with server-controlled confirmation before saving an
interest response. Interest does not constitute a booking.

## Run the Scripted Offline Demo

Install project dependencies with `pnpm install`, then run:

```bash
pnpm agent:whatsapp
```

The default mode uses the SDK's `MockLanguageModelV4`; it makes no paid model
calls and requires no provider credentials. Three scripted messages exercise the
real agent and tools:

1. “tell me about OB12” reads opportunity details through `get_opportunity`.
2. “that works, count me in” calls `propose_interest`; the server asks for
   confirmation without recording interest.
3. “confirm” calls `record_interest`; the server reports the saved response.

The CLI prints its mode, state file, replies, and tool inputs and outputs. The
demo persists fictional state in `.local/whatsapp-agent/demo.json`. Each run uses
new provider-prefixed message IDs, so repeating the demo exercises the tools
again. Its model decisions are scripted: this validates SDK orchestration,
confirmation, and persistence, not a model's ability to interpret natural language.

## Opt Into an Interactive Model

Configure `.env.local` with the provider credentials and model ID you want to
use. For a direct Anthropic API key:

```dotenv
WHATSAPP_AGENT_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key
WHATSAPP_AGENT_MODEL=your-native-claude-model-id
```

The direct provider sends requests to Anthropic's API using `@ai-sdk/anthropic`.
Choose a native model ID returned by Anthropic's Models API. The developer's
local `.env.local` selects a model; no credential is stored in tracked files.

Alternatively, for AI Gateway:

```dotenv
WHATSAPP_AGENT_PROVIDER=gateway
AI_GATEWAY_API_KEY=your-key
WHATSAPP_AGENT_MODEL=your-provider/your-model
```

```bash
pnpm agent:whatsapp --live
```

Only explicit `--live` mode makes model API calls, which may incur charges. It
uses the selected provider and model without a hardcoded model version.
Type conversational questions as the fixed fictional chef; use `/exit` to leave.
A failed turn prints an error and allows another attempt.

Live mode has its own `.local/whatsapp-agent/live.json`, separate from the demo.
Both files are development data. Keep their chef details, opportunities, and
conversation text fictional: live mode sends that local conversation context and
tool results to the configured model service. Do not put real chef information
or credentials into a conversation. Neither mode sends WhatsApp messages or
writes to Supabase.

## Tools and Identity

| Tool                 | Effect                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `list_opportunities` | Read open opportunities assigned to the bound chef.                                        |
| `get_opportunity`    | Read an assigned, open opportunity by reference.                                           |
| `propose_interest`   | Propose an interest response using a quote from the current message; request confirmation. |
| `record_interest`    | Save the server-bound pending proposal after a later explicit confirmation.                |
| `request_human_help` | Add a local review request; no external notification.                                      |

The server resolves identity from the normalized sender phone number and rejects
unknown senders. Tool input cannot select another chef. Opportunity tools check
the chef's assignments, and `record_interest` accepts no model-supplied chef ID,
reference, or interest value. No broadcast or booking tools exist.

Pending confirmations expire after 15 minutes and are invalidated by an
intervening turn. The server supplies the exact proposed reference and interest
value in its confirmation prompt and the final persisted result in its reply.
Recent conversation is model context, not permission to write.

## State and Integration Plan

`lib/whatsapp/agent/conversation.ts` owns the tool loop and server checks;
`lib/whatsapp/agent/store.ts` owns validated local state. The model sees the last
12 conversation turns, while authoritative chef assignments, pending proposals,
interest responses, handoffs, and replay receipts live separately in the store.

The file store uses exclusive locks and an atomic replacement to commit a turn's
effects together. A repeated provider message ID returns its saved result;
reusing an ID with different content or sender fails. A model or commit failure
does not persist a partial conversation or response. These locks and JSON files
are for local development, not production persistence or a hosted worker queue.
An interrupted process can leave a lock file; establish that no process still
uses the store before removing a stale lock.

The existing generated Supabase schema has `whatsapp_user` and
`whatsapp_catering`; it does not provide this agent's full opportunity,
assignment, proposal, handoff, history, and receipt model.
`whatsapp_catering.is_accepted` also needs an explicit product mapping before
treating it as an interest response. Production requires an adapter and schema
design for transactional writes, authorization, provider-message idempotency,
retention, and concurrency.

This change adds no server route, provider transport, webhook verification, or
Supabase changes. A production integration must verify inbound signatures,
resolve trusted sender identity, and persist before acknowledging delivery. Keep
the agent import separate from `lib/whatsapp/index.ts` so the dependency-free
parser harness remains usable without installing the agent SDK.
