# Go-live — n8n-nodes-uazapi

### GL1 — Escopo npm `@urzum` e Trusted Publisher (#1)
- Description: O Armando garante o escopo `@urzum` no npm e cadastra o Trusted Publisher (repo `urzum/n8n-nodes-uazapi`, workflow `publish.yml`).
- Acceptance: a página do pacote no npm mostra o Trusted Publisher configurado para `urzum/n8n-nodes-uazapi`.
- Verify: npmjs.com → pacote → Settings → Trusted Publishers.
- Files: nenhum

### GL2 — Primeira versão publicada e instalada (#2)
- Description: `npm run release` aprovado pelo Armando; `publish.yml` publica com provenance; instalação no n8n de produção dele.
- Acceptance: `npm view @urzum/n8n-nodes-uazapi version` responde `0.1.0` com provenance, e o node aparece em Settings → Community Nodes do n8n do Armando.
- Verify: `npm view @urzum/n8n-nodes-uazapi dist.attestations` não vazio.
- Files: nenhum
