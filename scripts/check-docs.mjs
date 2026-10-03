// Número que um comando responde não se escreve em documento.
// "42 testes" vence sem avisar, e um agente confia nele em vez de rodar o comando.
// Uso: node scripts/check-docs.mjs  (exit 1 se achar número volátil)
import { readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const ARQUIVOS = ['AGENTS.md', 'MEMORY.md', 'PROJECT_STATE.md'];

const VOLATEIS = [
  { padrao: /\b\d+\s+testes?\b/gi, comando: 'npm test' },
  { padrao: /\b\d+\s+fixtures?\b/gi, comando: 'ls test/fixtures' },
  { padrao: /\b\d+\s+(operações|operacoes)\b/gi, comando: 'grep -c "value:" nodes/Uazapi/descriptions/*.ts' },
  { padrao: /\b\d+\s+endpoints?\b/gi, comando: 'consulte o openapi da uazapi' },
];

const achados = [];
for (const arquivo of ARQUIVOS) {
  let texto;
  try {
    texto = readFileSync(path.join(raiz, arquivo), 'utf8');
  } catch {
    continue;
  }
  texto.split('\n').forEach((linha, i) => {
    for (const { padrao, comando } of VOLATEIS) {
      for (const m of linha.matchAll(padrao)) {
        achados.push(`${arquivo}:${i + 1}  "${m[0]}"  → use \`${comando}\``);
      }
    }
  });
}

if (achados.length) {
  console.log(`✗  ${achados.length} número(s) volátil(eis) em documento:\n`);
  for (const a of achados) console.log(`   ${a}`);
  process.exit(1);
}
console.log('✓  nenhum número volátil nos documentos de instrução e estado');
