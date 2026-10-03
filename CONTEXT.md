# Glossário

| Termo | Significa |
|---|---|
| Instância | Um número de WhatsApp conectado na uazapi. Tem `id`, `name` e `token` próprios |
| Token (da instância) | Header `token`; abre só aquela instância. Vem em `body.token` no webhook |
| Admin token | Header `admintoken`; lista/cria/apaga instâncias do servidor inteiro |
| Server URL | `https://<sub>.uazapi.com` — onde a API está. Diferente da URL do webhook (que é do n8n) |
| chatid | ID da conversa: `<número>@s.whatsapp.net` (individual) ou `<id>@g.us` (grupo) |
| LID | ID anônimo do WhatsApp (`<n>@lid`), usado quando o número não é exposto |
| `sender_pn` | Número real de quem enviou (`<número>@s.whatsapp.net`), quando a uazapi conhece |
| `track_source` | Rótulo livre que o envio carimba na mensagem e volta no webhook. Padrão do pacote: `automa_uazapi` |
| `track_id` | ID livre de rastreio por mensagem (aceita repetidos) |
| `wasSentByApi` | A mensagem saiu pela API (não pelo celular) |
| `fromMe` | A mensagem saiu da conta conectada (API ou celular) |
| role | `user` (cliente), `assistant` (IA/automação via API), `human` (resposta digitada no WhatsApp) |
| Normalizada | Saída do trigger com `message.*`, `attachment.*`, `instance.*` e `raw` — mesmo formato para todo tipo de mensagem |
| Webhook (uazapi) | Destino cadastrado na instância; o trigger cria e remove o seu via `action: add/delete` |
