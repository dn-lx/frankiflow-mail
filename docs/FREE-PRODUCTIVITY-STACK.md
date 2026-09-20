# Free development productivity stack

Repository-managed checks are enabled without paid service accounts:

- Dependabot sends grouped weekly npm and GitHub Actions updates to `develop`.
- Playwright runs serious/critical axe-core accessibility checks.
- Security CI runs Semgrep, Gitleaks and a production dependency audit.
- Lighthouse CI uploads a seven-day performance, accessibility, best-practices and SEO report.
- The optional ZAP workflow runs only with a manually supplied preview URL or a repository variable named `ZAP_TARGET_URL`.

External services remain opt-in because they require account settings or credentials:

1. Create a Sentry browser project, keep PII and replay disabled, provide its DSN through the hosting environment, and send one synthetic event.
2. Create a PostHog project, configure only allowlisted product events, and do not send form values or customer data.
3. Add public production URLs to UptimeRobot using five-minute HTTP checks.
4. Configure CodeRabbit to review PRs whose base branch is `develop` where the public repository qualifies for its free open-source plan.
5. Connect Context7 in the coding client for current public library documentation.
6. Set `ZAP_TARGET_URL` to a stable read-only deploy-preview URL if scheduled passive scanning is wanted.

Do not place DSNs, API keys or service tokens in source. Netlify and GitHub environment settings own runtime secrets.
