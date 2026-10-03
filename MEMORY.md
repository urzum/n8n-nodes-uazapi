# MEMORY.md — n8n-nodes-uazapi

Última atualização: 2026-10-03 · Commit verificado: (primeiro commit)

## Estado atual

Spec aprovada (`docs/specs/n8n-nodes-uazapi-spec.md`). Estrutura de agentes montada. Código ainda não existe.

## Em andamento

Plano aprovado (2026-10-03, modo Native). Implementação com a sessão dev `plugin-uazapi-c4`; revisão final na sessão de planejamento. Issues #3 a #9.

## Próximo passo seguro

T1 (#3) em diante, na ordem do plano.

## Bloqueios

- Publicar exige `npm login` do Armando e o escopo `@urzum` no npm.

## Decisões

- Node programático, não declarativo — `docs/decisoes.md`.
- Trigger usa só `action: add/delete` no `POST /webhook` — `docs/decisoes.md`.
- Anti-loop por `track_source` (`automa_uazapi`), não por `wasSentByApi` — `docs/decisoes.md`.
- `message.role` com três valores: `user`, `assistant`, `human` — `docs/decisoes.md`.

## Onde mais procurar

`docs/specs/`, `docs/decisoes.md`, `gh issue list`.
