# Local WhatsApp Agent

A local chatbot for chefs to ask about catering gigs and record interest.
The AI SDK model chooses tools; code checks access and requires a separate
confirmation before saving. Interest is not a booking.

## Run

```bash
pnpm install
pnpm agent:whatsapp        # Scripted offline demo, no API key needed
pnpm agent:whatsapp --live # Interactive model; uses paid API calls
```

For live mode, set these in the ignored `.env.local` file:

```dotenv
WHATSAPP_AGENT_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key
WHATSAPP_AGENT_MODEL=your-native-claude-model-id
```

AI Gateway is also supported: set the provider to `gateway`, use
`AI_GATEWAY_API_KEY`, and choose a `provider/model` ID. Type `/exit` to quit.
Use fictional data: live mode sends conversation context to the model service.

## How It Works

1. Identify the chef from the sender's phone and load their recent conversation.
2. Let the model request tools to list gigs, read details, propose interest,
   record confirmed interest, or request human help.
3. Save the reply, history, and tool changes together. Duplicate message IDs
   return the saved reply without repeating the work.

Example: “tell me about OB12” reads details; “count me in” creates a proposal;
“confirm” saves interest. Proposals expire after 15 minutes or an intervening turn.
Tools only access that chef's assigned, open gigs. Human help adds a local review
request; it does not notify staff.

## Code

- `lib/whatsapp/agent/conversation.ts`: handle one turn and choose the final reply.
- `lib/whatsapp/agent/tools.ts`: five tools and their access/confirmation checks.
- `lib/whatsapp/agent/store.ts`: validated JSON, file locking, and atomic saves.
- `lib/whatsapp/agent/model.ts`: select the live model/provider.

State lives in `.local/whatsapp-agent/demo.json` or `live.json`. The file store
is for development; a stopped process may leave a stale lock. Neither CLI mode
sends WhatsApp messages or writes to Supabase. Production work is summarized in
[the production plan](whatsapp-agent-production-plan.md).
