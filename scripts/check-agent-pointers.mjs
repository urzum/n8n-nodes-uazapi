#!/usr/bin/env node
// Confere se todo caminho citado nos arquivos de instrução dos agentes existe.
// Placa quebrada não dá erro sozinha: o agente confia nela e se perde.
// Uso: node scripts/check-agent-pointers.mjs  (exit 1 se algum caminho sumiu)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const files = [
  "AGENTS.md",
  "CLAUDE.md",
  "MEMORY.md",
  "PROJECT_STATE.md",
  ...readdirSync("docs/agents").map((f) => `docs/agents/${f}`),
  ...readdirSync(".claude/commands").map((f) => `.claude/commands/${f}`),
];

const ROOTS = /^(nodes|credentials|test|docs|scripts|\.claude|\.github)\//;
const ROOT_FILES = /^[A-Z_]+\.md$/;

const broken = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [, raw] of text.matchAll(/`([^`\s]+)`/g)) {
    const ref = raw.replace(/[),.:;]+$/, "");
    if (/[<>*{}$]|NNN/.test(ref)) continue; // placeholder ou glob
    if (!ROOTS.test(ref) && !ROOT_FILES.test(ref)) continue;
    // artefato gerado (ex.: apps/web/.next) só existe depois do build: não é placa
    if ([ref, `${ref}/`].some((r) => spawnSync("git", ["check-ignore", "-q", r]).status === 0)) continue;
    if (!existsSync(ref)) broken.push(`${file}: ${ref}`);
  }
}

if (broken.length) {
  console.error(`Caminho citado que não existe (${broken.length}):\n  ${broken.join("\n  ")}`);
  process.exit(1);
}
console.log(`ok: ${files.length} arquivos de instrução, nenhum caminho quebrado`);
