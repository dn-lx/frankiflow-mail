# Observability and Sentry activation — frankiflow-mail

The repository contains privacy-safe Sentry browser scaffolding in `observability/sentry-browser.mjs`, but **Sentry is not considered active until an actual Sentry project/DSN and SDK loader are connected and a test event is verified**.

## Activation

1. Create/select the Sentry project for this application.
2. Use Sentry's official JavaScript Browser SDK/Loader for the deployment.
3. Provide the public DSN through deployment/runtime configuration. Do not commit Sentry auth tokens.
4. Load the Sentry SDK before calling `initSentryBrowser(...)`.
5. Pass an explicit environment and release identifier.
6. Send one synthetic non-sensitive test error and verify it reaches the correct Sentry project.
7. Review Sentry's data-scrubbing/PII settings before production activation.

## Privacy rules

- `sendDefaultPii` remains disabled.
- Do not attach message bodies, booking details, mail content, customer addresses, authentication tokens, payment details or other sensitive records.
- The local scaffold filters common sensitive field names as a second layer; it is not a substitute for Sentry project-side scrubbing.
- Session Replay stays disabled unless separately reviewed for privacy risk.
- Sentry auth tokens and upload credentials are secrets.

Once activated, tag releases/environments so errors can be tied back to GitHub changes.
