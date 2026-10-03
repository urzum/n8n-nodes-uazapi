# Como uma mudança nasce

| Modo | Quando | Fluxo |
|---|---|---|
| Rápido | texto, descrição de campo, fix de 1 linha | faz → `npm run build && npm test` → commit sem issue |
| Estruturado | operação nova, mudança no normalizador ou no trigger | spec → plano → tasks → implementa |
| Controlado | ciclo de vida do webhook, publicar no npm | Estruturado + aprovação do Armando antes de aplicar/publicar |

- Feature nova começa pelo `superpowers:brainstorming`; a spec vai para `docs/specs/<feature>-spec.md` (não para a pasta padrão da skill).
- Plano em `docs/specs/<feature>-plan.md`; tasks em `docs/specs/<feature>-tasks.md` no formato:
  ```markdown
  ### T3 — <título>
  - Description:
  - Acceptance: <fato verificável>
  - Verify: <comando que prova>
  - Files: <≤ 5 caminhos>
  ```
- `node scripts/tasks-to-issues.mjs` abre as issues e grava `(#n)` no heading. O arquivo guarda o texto; a issue, o estado.
- Pegar task: `gh issue list --search "no:assignee"` → `gh issue edit <n> --add-assignee @me`.
- Antes de codar, declare em 1-3 linhas: suposições, a falha possível desta task e como voltamos.
- Teste antes da implementação onde há regra: normalizador, filtros do trigger, montagem de payload. Descrição de campo, não.
- Fechar: `/ship`. Fim de sessão: `/checkpoint`.
