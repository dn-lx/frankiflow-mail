# send-mail

`index.ts` supplies the Supabase and Resend SDKs to the runtime-independent handler. Keep `verify_jwt = true` when deploying this function. Its authorization also checks the active mailbox user and sender permissions; CORS does not grant mailbox access.

Run `node --test tests/send-mail.test.mjs` from the repository root. Tests use injected clients and never deliver real email.

Deploy only `send-mail` to the existing Supabase project using the Supabase CLI or Management API's multipart deployment, including both `index.ts` and `handler.mjs`. Preserve JWT verification and existing environment secrets. Never publish service-role, management or provider keys in the frontend.

The optional recovery request is `{ "action": "repair-attachments", "message_id": "<internal message UUID>" }`, sent to the same authenticated function. It retrieves original outbound files from the provider, stores them in the private `frankiflow-mail-attachments` bucket and links metadata to the existing internal message. It never sends email. Normal callers are checked through message RLS before server-only writes. Admin callers require a valid service credential. Provider retention and read permissions can limit historical recovery.

If delivery was confirmed but the Sent status update failed, the response is HTTP 200 with `ok: true`, `mail_message_id`, the provider `id`, and a `warning`. Clients must show that warning and must not retry delivery automatically. If the provider response is ambiguous, the function returns HTTP 502 with `delivery_unconfirmed: true` and retains the staged draft/files. Resolve provider delivery status before retrying. Explicit provider rejection or pre-delivery archival failure removes only this request's staged copy; the user's original draft stays intact.
