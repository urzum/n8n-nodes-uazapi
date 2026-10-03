# API uazapi

Contrato: `https://docs.uazapi.com/openapi-bundled.json` (consulte antes de mudar payload). Guias: `https://docs.uazapi.com/llms.txt`.

## Autenticação

- Header `token` = instância. Header `admintoken` = servidor (só `/instance/all` na v1).
- No modo "Da lista", o token vem de `GET /instance/all`, uma vez por execução, cache por `id`. Não grave token em parâmetro de node.

## Webhook (trigger)

- `POST /webhook` sem `action` sobrescreve o webhook principal. Só `action: "add"` (sem `id`) e `action: "delete"` (com `id`).
- `checkExists`: `GET /webhook` e compara `url` com a URL do workflow; guarda o `id` em `staticData`.
- `delete` sem `id` salvo busca pela URL; não achar = já removido, sucesso.
- Payload traz `token`; diferente do token da instância configurada = descarta.
- `newsletter_messages` e `status_posts` só chegam se nomeados em `events`.

## Envio

- Todo `/send/*` leva `track_source` (padrão `automa_uazapi`). Vazio só se o usuário apagar.
- `number` aceita número ou chatid.
- `delay` em ms mostra "digitando" antes de enviar.
- Retry do n8n pode duplicar envio se a resposta se perdeu; não há idempotência do lado da uazapi.

## Mídia recebida

- `content.URL` do webhook é o arquivo criptografado do WhatsApp; não serve como link.
- `POST /message/download` com `{id, return_link, return_base64, generate_mp3, transcribe}` devolve link público/base64/transcrição.

## Erros

- Resposta ≠ 2xx vira `NodeApiError` com método, endpoint, status e corpo da uazapi.
- 401/403: token errado ou sem permissão. Diga qual instância.
