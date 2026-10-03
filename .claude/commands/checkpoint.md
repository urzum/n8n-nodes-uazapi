---
description: Registra o estado no MEMORY.md e dá push conforme o PROJECT_STATE.md
---

1. `git status --short`, `git log --oneline origin/main..HEAD`. Nada novo? Diga "nada novo desde o último checkpoint" e pare.
2. `node scripts/tasks-to-issues.mjs` — task nova vira issue.
3. `gh issue list --assignee @me --state open`. Issue entregue sem `Closes #n` fecha com a prova (`gh issue close <n> --comment "<hash e Verify>"`). Pendência nova vira issue, não prosa.
4. Sobrescreva `MEMORY.md` (estado, em andamento, próximo passo seguro, bloqueios, decisões). Decisão nova: texto em `docs/decisoes.md`. Bug corrigido com evidência: `LESSON.md`. Mudou autoridade: `PROJECT_STATE.md`.
5. `node scripts/check-agent-pointers.mjs && node scripts/check-docs.mjs`.
6. Commit só de documentos: `docs: checkpoint YYYY-MM-DD — <resumo>`. Código staged junto = pare e pergunte. Push conforme `PROJECT_STATE.md`.

$ARGUMENTS
