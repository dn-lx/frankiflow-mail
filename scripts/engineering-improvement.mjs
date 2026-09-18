import fs from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required.');

const apiBase = `https://api.github.com/repos/${repository}`;
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'frankiflow-engineering-improvement-agent'
};

async function api(path, options = {}) {
  const response = await fetch(apiBase + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}

const now = new Date();
const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const sinceIso = since.toISOString();

const [runsData, pullsData, commitsData] = await Promise.all([
  api('/actions/runs?per_page=100'),
  api('/pulls?state=all&sort=updated&direction=desc&per_page=50'),
  api(`/commits?since=${encodeURIComponent(sinceIso)}&per_page=100`)
]);

const runs = (runsData.workflow_runs || []).filter(run =>
  new Date(run.created_at) >= since && run.name !== 'Daily Engineering Improvement'
);
const pulls = (pullsData || []).filter(pr => new Date(pr.updated_at) >= since);
const commits = commitsData || [];

const failed = runs.filter(run => ['failure', 'timed_out', 'action_required'].includes(run.conclusion));
const cancelled = runs.filter(run => run.conclusion === 'cancelled');
const successful = runs.filter(run => run.conclusion === 'success');
const securityFailures = failed.filter(run => /security/i.test(run.name));
const browserFailures = failed.filter(run => /browser|playwright/i.test(run.name));
const durations = runs
  .map(run => (new Date(run.updated_at) - new Date(run.created_at)) / 60000)
  .filter(value => Number.isFinite(value) && value >= 0);
const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

const recommendations = [];
function addRecommendation(title, evidence, action, success) {
  if (recommendations.length >= 3) return;
  recommendations.push({ title, evidence, action, success });
}

if (securityFailures.length) {
  addRecommendation(
    'Prioritize security-check failures',
    `${securityFailures.length} security workflow run(s) failed in the last 24 hours.`,
    'Review the failing Semgrep, secret-scan or dependency-audit step before adding unrelated changes.',
    'Security workflow returns green without suppressing a valid finding.'
  );
}

if (browserFailures.length) {
  addRecommendation(
    'Fix browser smoke-test regression',
    `${browserFailures.length} browser/Playwright workflow run(s) failed in the last 24 hours.`,
    'Open the retained Playwright report/trace, reproduce the failure locally, and add or correct the smallest relevant regression test.',
    'Affected browser smoke suite is stable across three consecutive runs.'
  );
}

if (failed.length && recommendations.length < 3) {
  addRecommendation(
    'Reduce CI rework',
    `${failed.length} of ${runs.length} observed workflow run(s) failed or timed out.`,
    'Group failures by workflow and fix the most repeated root cause instead of increasing retries.',
    'Failure rate falls below the current 24-hour baseline over the next 3–7 days.'
  );
}

if (avgDuration > 10 && recommendations.length < 3) {
  addRecommendation(
    'Shorten feedback time',
    `Average observed workflow duration is ${avgDuration.toFixed(1)} minutes.`,
    'Profile the slowest workflow and prefer caching, affected-test selection or parallelism before removing valuable checks.',
    'Average feedback time drops below 10 minutes without reducing required checks.'
  );
}

if (commits.length >= 4 && pulls.length === 0 && recommendations.length < 3) {
  addRecommendation(
    'Keep review artifacts in PRs',
    `${commits.length} commit(s) were recorded but no PR was updated in the last 24 hours.`,
    'Route normal feature work through feature/develop PRs so independent review and CI evidence remain durable.',
    'Next multi-commit feature has a PR with tests/checks documented.'
  );
}

if (!recommendations.length) {
  addRecommendation(
    'Keep the current engineering loop',
    `No repeated repo-local CI failure pattern was detected: ${successful.length} successful run(s), ${failed.length} failed run(s).`,
    'Do not add another plugin today. Keep measuring the current stack and address only evidence-backed friction.',
    'Maintain or improve the 7-day failure and rework trend.'
  );
}

const report = [
  '# Daily Engineering Improvement',
  '',
  `Generated: ${now.toISOString()}`,
  `Window: previous 24 hours`,
  '',
  '## Delivery health',
  '',
  `- Workflow runs observed: **${runs.length}**`,
  `- Successful: **${successful.length}**`,
  `- Failed/timed out/action required: **${failed.length}**`,
  `- Cancelled: **${cancelled.length}**`,
  `- Average workflow duration: **${avgDuration.toFixed(1)} min**`,
  `- PRs updated: **${pulls.length}**`,
  `- Commits: **${commits.length}**`,
  '',
  '## Improvement actions',
  '',
  ...recommendations.flatMap((item, index) => [
    `### ${index + 1}. ${item.title}`,
    `- Evidence: ${item.evidence}`,
    `- Action: ${item.action}`,
    `- Success metric: ${item.success}`,
    ''
  ]),
  '## Tooling rule',
  '',
  'Recommend a new plugin/tool only when repeated evidence shows a gap. Prefer reconfiguring the current stack before adding overlap. This report evaluates repository/process signals only and does not score individual developers.',
  ''
].join('\n');

await fs.writeFile('engineering-improvement-report.md', report, 'utf8');

const issues = await api('/issues?state=open&per_page=100');
const title = 'Daily Engineering Improvement';
const existing = issues.find(issue => !issue.pull_request && issue.title === title);
const body = report + '\n---\n_This issue is updated automatically by the repository workflow._\n';

if (existing) {
  await api(`/issues/${existing.number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body })
  });
} else {
  await api('/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body })
  });
}

process.stdout.write(report);
