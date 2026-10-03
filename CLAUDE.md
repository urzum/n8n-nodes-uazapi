@AGENTS.md

## Só o Claude Code

- Hook `Stop` roda typecheck quando um `.ts` mudou (`.claude/hooks/typecheck-on-stop.sh`); exit 2 = corrija antes de encerrar.
- `npm publish` está negado em `.claude/settings.json`: publicar é ato do Armando.
- Comandos: `/ship`, `/checkpoint`, `/checkpoint-dry`, `/guia-de-teste` (em `.claude/commands/`).
