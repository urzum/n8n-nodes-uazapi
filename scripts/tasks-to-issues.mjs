#!/usr/bin/env node
/**
 * Abre uma GitHub Issue por task ainda aberta em docs/specs/*-tasks.md e
 * grava " (#n)" no heading da task. O arquivo continua sendo onde a task é
 * ESCRITA (Description / Acceptance / Verify / Files); o GitHub passa a ser
 * a única fonte do ESTADO (aberta, fechada, quem pegou).
 *
 * Idempotente: heading com "(#n)" é pulado; título que já existe no GitHub
 * reaproveita o número em vez de duplicar (cobre write-back que falhou).
 *
 * Labels, sem ato manual: a área vem do nome do arquivo (`fiscal-nfe-tasks.md`
 * → `fiscal-nfe`) e quem executa vem da natureza da task — `go-live-tasks.md`
 * fecha com ato no mundo (`ready-for-human`); o resto um agente pega sozinho
 * (`ready-for-agent`). Mesmo par do aFillCloud, pra ler igual nos dois repos.
 *
 * Uso: node scripts/tasks-to-issues.mjs [--dry] [--file docs/specs/x-tasks.md] [--ids F5,L4] [--relabel]
 *   --ids      processa só esses ids e ignora as heurísticas de "feito" (para
 *              id que colide com o escopo de commit de outra feature).
 *   --relabel  reaplica as labels em toda issue já aberta pelo script (lê a
 *              linha "Origem:" do corpo). Não cria issue.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const DIR = path.join(ROOT, "docs", "specs");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const onlyIdx = args.indexOf("--file");
const only = onlyIdx >= 0 ? path.resolve(ROOT, args[onlyIdx + 1]) : null;
const idsIdx = args.indexOf("--ids");
const forced = idsIdx >= 0 ? new Set(args[idsIdx + 1].split(",")) : null;
const relabel = args.includes("--relabel");

const WHO = {
  agent: ["ready-for-agent", "0E8A16", "Especificada, com Verify escrito; um agente pega sozinho"],
  human: ["ready-for-human", "8A6100", "Fecha com um ato no mundo (conta, aprovacao, compra)"],
};
/** Área + quem executa, a partir do arquivo de tasks. */
function labelsFor(relTasksFile) {
  const area = path.basename(relTasksFile).replace(/-tasks\.md$/, "");
  const who = area === "go-live" ? WHO.human : WHO.agent;
  return { area, who };
}
const knownLabels = new Set();
function ensureLabel(name, color, description) {
  if (dry || knownLabels.has(name)) return;
  // --force atualiza cor/descrição se já existe; nunca falha por duplicata.
  execFileSync("gh", ["label", "create", name, "--color", color, "--description", description, "--force"], { stdio: "ignore" });
  knownLabels.add(name);
}
function applyLabels(number, relTasksFile) {
  const { area, who } = labelsFor(relTasksFile);
  ensureLabel(area, "5319E7", `Tasks de docs/specs/${area}-tasks.md`);
  ensureLabel(...who);
  if (!dry) execFileSync("gh", ["issue", "edit", String(number), "--add-label", `${area},${who[0]}`], { stdio: "ignore" });
}

// "## GL1 — Título", "#### AO-A1. Título", "## ✅ L3. Título"
const HEADING =
  /^(#{2,4})\s+(✅\s*)?([A-Z][A-Z0-9-]*\d+[a-z]?)[.\s]*[—–-]?\s*(.*?)\s*$/;
// Mesmas regras de "feito" que o quadro do temp-mem já aplicava aos arquivos:
// marca no heading, status de arquivo inteiro, ou id no escopo de um commit.
const DONE_RE = /(\(#\d+\)\s*$|CANCELADO|DEFERIDO|✅|☑)/;
const FILE_DONE_RE = /^\W*Status\W.*(CONCLU[IÍ]DO|ENTREGUE|IMPLEMENTAD|COMPLETO)/im;
const scopesDone = new Set(
  execFileSync("git", ["log", "--format=%s"], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.match(/^[a-z]+\(([A-Z][A-Z0-9-]*\d+[a-z]?)\)/)?.[1])
    .filter(Boolean)
);

const files = (only ? [only] : readdirSync(DIR)
  .filter((f) => f.endsWith("-tasks.md"))
  .map((f) => path.join(DIR, f)));

const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" }).trim();
const allIssues = JSON.parse(
  gh("issue", "list", "--state", "all", "--limit", "1000", "--json", relabel ? "number,title,body" : "number,title")
);
const existing = new Map(allIssues.map((i) => [i.title, i.number]));

if (relabel) {
  let n = 0;
  for (const issue of allIssues) {
    const origem = issue.body?.match(/Origem: `([^`]+)`/)?.[1];
    if (!origem) continue;
    applyLabels(issue.number, origem);
    const { area, who } = labelsFor(origem);
    console.log(`#${issue.number} ${area}, ${who[0]}`);
    n++;
  }
  console.log(dry ? "(dry-run: nada aplicado)" : `${n} issue(s) rotulada(s)`);
  process.exit(0);
}

let created = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const text = readFileSync(file, "utf8");
  if (!forced && FILE_DONE_RE.test(text)) continue;
  const lines = text.split("\n");
  const spec = file.replace(/-tasks\.md$/, "-spec.md");
  let touched = false;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING);
    if (!m || /\(#\d+\)\s*$/.test(lines[i])) continue;
    const [, hashes, , id, rawTitle] = m;
    if (forced ? !forced.has(id) : DONE_RE.test(lines[i]) || scopesDone.has(id)) continue;
    const title = `${id} — ${rawTitle.replace(/\s*\(#\d+\)$/, "")}`;

    // corpo = da linha seguinte até o próximo heading de nível <= este
    let j = i + 1;
    while (j < lines.length && !new RegExp(`^#{2,${hashes.length}}\\s`).test(lines[j])) j++;
    const body = [
      lines.slice(i + 1, j).join("\n").replace(/\n---\s*$/, "").trim(),
      "",
      `Origem: \`${rel}\``,
      existsSync(spec) ? `Spec: \`${path.relative(ROOT, spec)}\`` : null,
    ].filter((l) => l !== null).join("\n");

    let number = existing.get(title);
    if (dry) {
      console.log(`${number ? "reusa" : "cria "} ${title}  ← ${rel}`);
    } else if (!number) {
      const url = gh("issue", "create", "--title", title, "--body", body);
      number = Number(url.split("/").pop());
      existing.set(title, number);
      applyLabels(number, rel);
      created++;
      console.log(`#${number} ${title}`);
    } else {
      console.log(`#${number} já existia: ${title}`);
    }
    if (number) {
      lines[i] = `${lines[i]} (#${number})`;
      touched = true;
    }
  }
  if (touched && !dry) writeFileSync(file, lines.join("\n"));
}
console.log(dry ? "(dry-run: nada criado)" : `${created} issue(s) criada(s)`);
