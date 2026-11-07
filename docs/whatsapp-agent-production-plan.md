# WhatsApp Handoff Checklist

The [test setup](whatsapp-conversational-agent.md) is implemented for one test
recipient. Before handing it to Oakland Bloom:

- Add local inference on NPO-owned hardware. Keep the guarded tools and database
  checks; test tool accuracy, supported languages, response speed, and timeouts.
  Local mode must not silently fall back to paid inference.
- Package automatic startup/recovery, backups, and short staff instructions.
  WhatsApp still needs internet, an incoming callback, and Meta credentials.
- Connect an admin client to the staff API for help, takeover, and delivery review.
- Agree on retention, a production privacy notice, chef opt-in, and the live number.
  Review Meta's current messaging/template rules before proactive gig alerts.
- Approve the catering alert template before sending outside the reply window.
- Run a small staff-reviewed pilot. Multi-chef rollout, images, and voice remain
  future work; the current worker is limited to its test phone. Kitchen assistance
  requests staff review; booking creation/approval still needs agreed rules.
