---
name: email-safety-review
description: Review FrankiFlow Mail sending, receiving, rendering and mailbox changes for authorization, privacy and delivery safety.
---

# Email safety review

- Trace the authenticated mailbox owner through each read, send, draft and attachment operation.
- Verify mailbox ownership in RLS, RPC or Edge Function code; hidden UI is not authorization.
- Treat subjects, bodies, headers and attachments as untrusted content and render them safely.
- Keep provider keys server-side and validate sender and recipient rules.
- Check retries and idempotency so requests and webhooks cannot duplicate delivery.
- Exclude message bodies, addresses, tokens and attachments from logs, analytics and error reports.
- Use mocked or sandbox delivery during routine validation.
