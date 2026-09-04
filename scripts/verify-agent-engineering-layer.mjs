import { readFileSync, existsSync } from "node:fs";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/agent-engineering/README.md",
  "docs/agent-engineering/AGENT_CONTRACTS.md",
  "docs/agent-engineering/REVIEW_PROTOCOL.md",
  "docs/agent-engineering/LEARNING_PROTOCOL.md",
  "docs/agent-engineering/HANDOFF_TEMPLATE.md",
  "docs/agent-engineering/ECC_ADOPTION_NOTES.md",
  ".agent-memory/.gitignore",
  ".agent-memory/README.md",
  ".github/pull_request_template.md",
];

const failures = [];

const requireFile = (path) => {
  if (!existsSync(path)) {
    failures.push(`missing required file: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
};

for (const file of requiredFiles) requireFile(file);

const agents = requireFile("AGENTS.md");
const claude = requireFile("CLAUDE.md");
const contracts = requireFile("docs/agent-engineering/AGENT_CONTRACTS.md");
const review = requireFile("docs/agent-engineering/REVIEW_PROTOCOL.md");
const learning = requireFile("docs/agent-engineering/LEARNING_PROTOCOL.md");
const adoption = requireFile("docs/agent-engineering/ECC_ADOPTION_NOTES.md");
const memoryIgnore = requireFile(".agent-memory/.gitignore");
const prTemplate = requireFile(".github/pull_request_template.md");

const mustContain = (name, text, markers) => {
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${name} missing required marker: ${marker}`);
  }
};

mustContain("AGENTS.md", agents, [
  "Code written is not evidence that an issue is fixed.",
  "CI green is not GA.",
  "branch -> PR -> exact-head CI",
  "Repo Architect Agent",
  "Implementation Agent",
  "TDD/Test Agent",
  "Security Reviewer",
  "Independent Code Reviewer",
  "Evidence Agent",
  "GA Gate Agent",
  "Learning Agent",
  "INSUFFICIENT EVIDENCE",
  "Do not duplicate historical users/accounts",
  "Session memory is context, not policy.",
]);

mustContain("CLAUDE.md", claude, ["AGENTS.md", "authoritative engineering constitution"]);

const roleNames = [
  "Repo Architect Agent",
  "Implementation Agent",
  "TDD/Test Agent",
  "Security Reviewer",
  "Independent Code Reviewer",
  "Evidence Agent",
  "GA Gate Agent",
  "Learning Agent",
];

for (const role of roleNames) {
  const heading = `## ${roleNames.indexOf(role) + 1}. ${role}`;
  if (!contracts.includes(heading)) failures.push(`AGENT_CONTRACTS.md missing role heading: ${heading}`);
}

mustContain("REVIEW_PROTOCOL.md", review, [
  "## Fresh-context requirement",
  "## Confidence filter",
  "more than 80% confident",
  "## Pre-report gate",
  "Zero findings is a valid review result.",
  "## Output format",
]);

mustContain("LEARNING_PROTOCOL.md", learning, [
  "## Trust model",
  "unreviewed context",
  "## Local memory boundary",
  ".agent-memory/",
  "Do not preserve ephemeral facts as durable rules",
  "## Learning workflow",
  "## Promotion destinations",
]);

mustContain("ECC_ADOPTION_NOTES.md", adoption, [
  "does not currently depend on the ECC runtime",
  "## Adopted principles",
  "## Deliberately not imported",
  "exact-SHA staging",
  "## Optional future adoption gate",
]);

const ignoreLines = memoryIgnore
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => !line.startsWith("#"));

for (const marker of ["*", "!.gitignore", "!README.md"]) {
  if (!ignoreLines.includes(marker)) failures.push(`.agent-memory/.gitignore missing fail-closed marker: ${marker}`);
}

mustContain("pull_request_template.md", prTemplate, [
  "## Risk class",
  "## RED / acceptance contract",
  "## Independent review",
  "## Exact-SHA CI",
  "## Staging / external-system acceptance",
  "## Gate verdict",
  "PASS | FAIL | BLOCKED | INSUFFICIENT EVIDENCE",
]);

if (failures.length) {
  console.error("Agent engineering policy verification failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Agent engineering policy verification passed (${requiredFiles.length} governed files, ${roleNames.length} role contracts).`);
