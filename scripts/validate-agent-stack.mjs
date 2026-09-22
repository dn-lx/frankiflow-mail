import { readFile, access } from 'node:fs/promises'

const required = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  'docs/PROJECT-MEMORY.md',
  'docs/CURRENT-HANDOFF.md',
  'docs/MCP-SETUP.md',
  'docs/AGENT-PLATFORM-WORKFLOWS.md',
  'docs/AGENT-ORCHESTRATION.md',
  'docs/MODEL-ROUTING-POLICY.md',
  'docs/MEMORY-CONTEXT-POLICY.md',
  'docs/DOCUMENTATION_POLICY.md',
  '.agents/skills/mcp-usage/SKILL.md',
  '.agents/skills/context7/SKILL.md',
  '.agents/skills/graphify/SKILL.md',
  '.agents/skills/memory-context/SKILL.md',
  '.agents/skills/quality-gates/SKILL.md',
  '.agents/skills/security-boundary-review/SKILL.md',
  '.agents/skills/release-workflow/SKILL.md',
]

const missing = []
for (const path of required) {
  try { await access(path) } catch { missing.push(path) }
}

if (missing.length) {
  console.error('Missing required agent-stack files:')
  for (const path of missing) console.error(`- ${path}`)
  process.exit(1)
}

for (const adapter of ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md']) {
  const content = await readFile(adapter, 'utf8')
  if (!content.includes('AGENTS.md')) {
    console.error(`${adapter} must point back to canonical AGENTS.md`)
    process.exit(1)
  }
}

const agents = await readFile('AGENTS.md', 'utf8')
for (const phrase of ['develop', 'main', 'docs/MCP-SETUP.md', 'docs/PROJECT-MEMORY.md', 'docs/CURRENT-HANDOFF.md']) {
  if (!agents.includes(phrase)) {
    console.error(`AGENTS.md is missing required reference: ${phrase}`)
    process.exit(1)
  }
}

console.log(`Agent stack valid: ${required.length} required files present and adapters point to AGENTS.md.`)
