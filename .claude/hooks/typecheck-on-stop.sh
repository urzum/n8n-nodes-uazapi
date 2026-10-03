#!/usr/bin/env bash
# Roda typecheck se algum .ts mudou. exit 2 devolve o erro ao agente,
# então ele corrige antes de dizer que terminou.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}"
[ -d node_modules ] || exit 0

CHANGED=$(
  { git diff --name-only HEAD 2>/dev/null
    git diff --name-only --cached 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | sort -u
)
echo "$CHANGED" | grep -qE '\.ts$' || exit 0

OUT=$(npx --no-install tsc --noEmit -p tsconfig.json 2>&1)
if [ $? -ne 0 ]; then
  echo "--- typecheck falhou ---" >&2
  echo "$OUT" | tail -40 >&2
  exit 2
fi
exit 0
