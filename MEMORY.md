# MEMORY.md — n8n-nodes-uazapi

Última atualização: 2026-10-03 · Commit verificado: (primeiro commit)

## Estado atual

Spec aprovada (`docs/specs/n8n-nodes-uazapi-spec.md`). Estrutura de agentes montada. Código ainda não existe.

## Em andamento

Plano escrito, aguardando aprovação do Armando: `docs/specs/n8n-nodes-uazapi-plan.md`.

## Próximo passo seguro

Após aprovação: `node scripts/tasks-to-issues.mjs` e começar pela T1.

## Bloqueios

- Publicar exige `npm login` do Armando e o escopo `@urzum` no npm.

## Decisões

- Node programático, não declarativo — `docs/decisoes.md`.
- Trigger usa só `action: add/delete` no `POST /webhook` — `docs/decisoes.md`.
- Anti-loop por `track_source` (`automa_uazapi`), não por `wasSentByApi` — `docs/decisoes.md`.
- `message.role` com três valores: `user`, `assistant`, `human` — `docs/decisoes.md`.

## Onde mais procurar

`docs/specs/`, `docs/decisoes.md`, `gh issue list`.
