# @urzum/n8n-nodes-uazapi

Nodes do n8n para a API [uazapiGO](https://docs.uazapi.com/) (WhatsApp): enviar mensagens, gerenciar a instância e receber mensagens já normalizadas, sem Webhook + Filter + Set + HTTP Request.

## Instalação

n8n self-hosted → **Settings → Community Nodes → Install** → `@urzum/n8n-nodes-uazapi`.

## Credencial

Credencial **Uazapi API**:

| Campo | Obrigatório | Nota |
|---|---|---|
| Server URL | sim | ex.: `https://minhaempresa.uazapi.com` (sem barra final) |
| Admin Token | não | habilita a lista de instâncias. Sem ele, escolha a instância por **By Token** |

O teste da credencial chama `GET /instance/all` (com Admin Token) ou `GET /status` (sem).

## Uazapi (ação)

| Resource | Operações |
|---|---|
| Message | Send Text, Send Media, Send Contact, Send Location, Send Menu, React, Mark as Read, Send Presence |
| Instance | Get Status, Connect |

**Instância:** `From List` (precisa do Admin Token; o token é buscado uma vez por execução) ou `By Token`.
Para responder pelo mesmo número que recebeu a mensagem, use no `By Token`: `{{ $json.instance.token }}`.

Todo envio carimba `track_source = automa_uazapi` (editável). É isso que o Trigger usa para não responder a si mesmo.

## Uazapi Trigger

Cria o próprio webhook na instância (`action: add`) e o remove ao desativar o workflow (`action: delete`, só o id dele).
**Nunca toca o webhook principal da instância**: Chatwoot ou qualquer outro sistema continuam intactos.

| Campo | Padrão | Efeito |
|---|---|---|
| Events | `messages` | eventos da uazapi que chegam ao workflow |
| Ignore Track Source | `automa_uazapi` | mensagens com esses `track_source` (separados por vírgula) são descartadas. Vazio = não filtra |
| Exclude at Source | nenhum | a uazapi nem envia (ex.: só mensagens de clientes) |
| Output | Normalized | `Normalized` ou `Raw` |
| Media | Do Not Download | `Link` ou `Link and Base64` baixa via uazapi |
| Transcribe Audio | desligado | com Media ligado, a transcrição vai para `message.content` |

Payload com `token` diferente do da instância é descartado (POST forjado). Eventos que não são `messages` saem brutos.
Falha no download de mídia não descarta a mensagem: sai com `attachment.download_error`.

## Formato normalizado

Mesmos nomes do Set `normalizacao` anterior.

| Campo | Conteúdo |
|---|---|
| `message.message_id` | id da mensagem |
| `message.chat_id` / `message.jid` | chatid |
| `message.pushName` | nome de quem enviou |
| `message.whatsapp` / `message.sender` | número do **cliente** (também em mensagens enviadas por você) |
| `message.lid` | LID do remetente |
| `message.origem` | `individual` ou `grupo` |
| `message.content_type` | tipo em minúsculas (`imagemessage`, `conversation`...) |
| `message.participant` | em grupo, número de quem falou |
| `message.content` | texto (legenda, botão, resposta citada, anúncio...) |
| `message.timestamp` | ISO 8601 (UTC) |
| `message.event` | `inbound` ou `outbound` |
| `message.role` | `user` (cliente), `assistant` (enviada pela API) ou `human` (digitada no WhatsApp) |
| `message.source` / `track` / `track_id` | origem, `track_source`, `track_id` |
| `message.reply` | id da mensagem respondida |
| `message.was_sent_by_api` | booleano |
| `attachment.*` | `title`, `mimetype`, `filename`, `fileid`, `extension`, `content_url`, `file_url`, `base64`, `link`, `location.{end,latitude,longitude}` |
| `attachment.contato` | lista `{nome, telefones[], empresa, cargo}` |
| `instance.*` | `token`, `owner`, `name`, `base_url` |
| `raw` | body completo da uazapi |

## Limitações conhecidas

- Retry de envio pode duplicar a mensagem se a uazapi aceitou mas a resposta se perdeu. O retry é o nativo do n8n (Retry on Fail); o node não faz retry próprio.
- O link de mídia gerado pela uazapi vale 2 dias.
- Em modo `From List`, o Trigger consulta `/instance/all` a cada evento recebido. Para alto volume, use `By Token`.
