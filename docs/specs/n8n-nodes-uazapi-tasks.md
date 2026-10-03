# Tasks — n8n-nodes-uazapi

Passo a passo de cada task: `docs/specs/n8n-nodes-uazapi-plan.md`. Estado: GitHub Issues.

### T1 — Scaffold, credencial Uazapi API e transport (#3)
- Description: Scaffold `@n8n/node-cli` 0.50.4, credencial com Server URL + Admin Token opcional, `uazapiRequest`/`resolveInstanceToken`.
- Acceptance: `admintoken` só vai quando não há `token`; modo lista resolve token por id; sem Admin Token o erro diz como corrigir.
- Verify: `npx vitest run test/transport.test.ts && npm run build`
- Files: `credentials/UazapiApi.credentials.ts`, `nodes/shared/transport.ts`, `test/helpers.ts`, `test/transport.test.ts`, `package.json`

### T2 — Node Uazapi: instância, recurso Instance e Send Text (#4)
- Description: Seletor de instância (lista/token), Get Status/Connect/Disconnect, Send Text com `track_source` padrão `automa_uazapi`.
- Acceptance: 3 itens em modo lista fazem 1 chamada a `/instance/all`; "By Token" não chama `/instance/all`; Continue On Fail devolve o erro no item.
- Verify: `npx vitest run && npm run build && npm run lint`
- Files: `nodes/shared/instanceLocator.ts`, `nodes/Uazapi/Uazapi.node.ts`, `nodes/Uazapi/instance.ts`, `nodes/Uazapi/message.ts`, `test/uazapi-node.test.ts`

### T3 — Operações restantes de mensagem (#5)
- Description: Send Media (URL/base64/binário), Contact, Location, Menu, React, Mark as Read, Send Presence.
- Acceptance: cada operação gera o método, caminho e corpo do contrato da uazapi.
- Verify: `npx vitest run test/message-call.test.ts && npm run lint`
- Files: `nodes/Uazapi/message.ts`, `test/message-call.test.ts`

### T4 — Normalizador (#6)
- Description: `normalizeMessage` com os campos do Set "normalizacao" e roles `user`/`assistant`/`human`.
- Acceptance: mensagem `fromMe` mantém o número do cliente em `message.whatsapp`; corpo vazio não quebra.
- Verify: `npx vitest run test/normalize.test.ts`
- Files: `nodes/shared/normalize.ts`, `test/normalize.test.ts`, `test/fixtures/image-inbound.json`

### T5 — Uazapi Trigger: ciclo do webhook, filtros e saída (#7)
- Description: Webhook próprio via `action: add/delete`, troca ao mudar eventos, descarte por token e por `track_source`.
- Acceptance: nenhum `POST /webhook` sai sem `action`; desativar remove só o id dele; payload com token errado é descartado com warn.
- Verify: `npx vitest run test/trigger.test.ts && npm run lint`
- Files: `nodes/UazapiTrigger/UazapiTrigger.node.ts`, `nodes/UazapiTrigger/webhookConfig.ts`, `nodes/UazapiTrigger/UazapiTrigger.node.json`, `package.json`, `test/trigger.test.ts`

### T6 — Download de mídia e transcrição no trigger (#8)
- Description: Opção Media (nenhum/link/link+base64) e Transcribe Audio via `/message/download`.
- Acceptance: falha no download ainda emite a mensagem com `attachment.download_error` e loga warn com o id.
- Verify: `npx vitest run test/media.test.ts`
- Files: `nodes/UazapiTrigger/media.ts`, `nodes/UazapiTrigger/UazapiTrigger.node.ts`, `test/media.test.ts`

### T7 — README, CHANGELOG, teste ao vivo e guia (#9)
- Description: Documentação em português, roteiro ao vivo no `npm run dev` com o número de teste, guia de teste.
- Acceptance: os 8 passos do roteiro ao vivo do plano registrados com resultado; fixture real de áudio adicionada.
- Verify: `npx vitest run && grep -c '{{' docs/guias/n8n-nodes-uazapi.html` (esperado `0`)
- Files: `README.md`, `CHANGELOG.md`, `MEMORY.md`, `docs/guias/n8n-nodes-uazapi.html`, `test/fixtures/audio-inbound.json`
