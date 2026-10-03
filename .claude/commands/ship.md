---
description: Verificação completa, code-review, commit que fecha a issue, push e esteira
---

Fechamento de tarefa. Em sequência — se algo falhar, **pare e reporte**, não conserte de cabeça.

1. **Sanity**: `git status` e `git diff --stat`. `.env*`, token ou fixture com token real staged = aborte e pergunte.
2. **Build**: `npm run build`.
3. **Lint**: `npm run lint`.
4. **Testes**: `npm test`.
5. **Ponteiros** (se tocou arquivo de instrução): `node scripts/check-agent-pointers.mjs && node scripts/check-docs.mjs`.
6. **Verify da issue**: rode o comando do campo Verify e guarde a saída.
7. **Code review**: `/code-review` no diff, antes do commit. Achado real se corrige aqui.
8. **Commit**: inglês, Conventional Commits (`feat(T3): …`), corpo curto com o porquê e `Closes #<n>`. `git add` por caminho; nunca `-A`, `--no-verify`, `--force`.
9. **Push**: conforme `PROJECT_STATE.md`.
10. **Esteira**: `gh run watch $(gh run list -L1 --json databaseId -q '.[0].databaseId') --exit-status`, em segundo plano. Vermelho: `gh run view <id> --log-failed`, corrija na mesma sessão.
11. **Prova na issue**: `gh issue comment <n>` com hash, link da esteira, saída do Verify, o que não existia para rodar e **o que não foi tocado**.
12. **Reporte**: hash, arquivos tocados, esteira.

Mudança sem issue: pule 6 e 11 e diga que pulou. Nunca `npm publish` aqui.

$ARGUMENTS
