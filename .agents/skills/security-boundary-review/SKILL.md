---
name: security-boundary-review
description: Review authentication, Supabase authorization, storage, customer data and browser/server trust boundaries in FrankiFlow changes.
---

# Security boundary review

Trace each protected action from browser input to the enforcing server or database policy. Treat browser checks and public Supabase keys as non-authoritative.

- Identify the actor, resource, tenant or owner relationship, and allowed operation.
- Verify authorization in RLS, RPC or Edge Function code; never infer it from hidden UI.
- Test an allowed request and a denied cross-user or anonymous request when a local backend is available.
- Check storage policies, rendered HTML, redirects and external requests for data exposure.
- Confirm logs, analytics and error reports exclude credentials, message bodies, addresses and payment data.
- Escalate changes to RLS, auth, privileged functions or secrets for independent security review.
