# AGENTS.md — mapa do n8n-nodes-uazapi

Pacote npm `@urzum/n8n-nodes-uazapi`: community node do n8n (TypeScript) para a API uazapiGO (WhatsApp).
Sem banco, sem tela própria, sem deploy; o produto é o pacote publicado. Toca número de WhatsApp real.

## Nunca, em qualquer tarefa

- Chamar `POST /webhook` sem `action` — o modo simples sobrescreve o webhook principal da instância (Chatwoot, outro sistema). Ver `docs/agents/integracoes.md`.
- Commitar token de instância ou admin token, nem em fixture. Fixture real entra com `token` trocado por `TOKEN_REDACTED`.
- Publicar no npm sem aprovação do Armando (`PROJECT_STATE.md`).
- Rodar teste manual de envio contra número de cliente; só contra o número de teste combinado.

## Quando → onde

| Quando | Onde |
|---|---|
| Início da sessão e antes de publicar | `PROJECT_STATE.md` |
| Antes de feature/task/correção não-trivial | `docs/agents/fluxo.md` |
| O que o pacote deve fazer | `docs/specs/n8n-nodes-uazapi-spec.md` |
| Webhook, envio, token, API uazapi | `docs/agents/integracoes.md` |
| Antes de declarar pronto | `docs/agents/verificacao.md` |
| Bug que resistiu a 2 fixes | `docs/agents/debug.md` |
| Antes de debugar | `LESSON.md` (`grep -n 'Tags:.*<tec>' LESSON.md`) |
| Porquê de uma decisão | `MEMORY.md` → `docs/decisoes.md` |
| Domínio (chatid, LID, track_source, role) | `CONTEXT.md` |
| O que está aberto | `gh issue list` |
| Escrever node, credencial ou propriedade | `.agents/nodes.md`, `.agents/properties.md`, `.agents/nodes-programmatic.md`, `.agents/credentials.md` |

## Acoplamentos invisíveis

- Campo novo no normalizador → fixture esperada em `test/fixtures/` muda junto; workflows do Armando leem esses nomes.
- Node ou credencial nova → registrar em `package.json` (`n8n.nodes` / `n8n.credentials`); o build não avisa.
- Versão nova da API uazapi → conferir o contrato (`https://docs.uazapi.com/openapi-bundled.json`) antes de mudar payload.
- Mudou a versão publicada → `version` do `package.json` e tag git juntos.

## Comandos

```bash
npm run dev        # n8n local com o pacote carregado
npm run build
npm run lint       # regras de community node do n8n
npm test
```
