# @urzum/n8n-nodes-uazapi — Design

Data: 2026-10-03
API alvo: uazapiGO 2.4.4 (contrato: https://docs.uazapi.com/openapi-bundled.json)

## Objetivo

Trocar o padrão "Webhook + Filter + Set normalizador + HTTP Request" por nodes nativos no n8n self-hosted:
receber mensagem já normalizada e responder escolhendo a ação num menu.

**Sucesso =** o fluxo atual do Armando (`start → Filtra msg smileIA → normalizacao` e `envia_text`)
é reproduzido com `Uazapi Trigger → ...→ Uazapi (Enviar Texto)`, sem Filter, sem Set, sem HTTP Request,
e com o mesmo formato de `message.*` / `attachment.*` / `instance.*`.

## Falha crítica e recuperação

| Falha que mata | Como evitamos / voltamos |
|---|---|
| Loop: o bot responde à própria mensagem | Envio sempre carimba `track_source` (padrão `automa_uazapi`); trigger descarta esse `track_source` por padrão |
| Trigger sobrescreve webhook existente (Chatwoot, outro sistema) | Nunca usa o "modo simples" do `POST /webhook`; usa só `action: add` / `delete` com ID próprio |
| Webhook órfão / duplicado após reativar ou reiniciar n8n | `checkExists` procura pela URL do workflow antes de criar; `delete` remove só o ID dele |
| POST forjado na URL do webhook | Trigger descarta payload cujo `token` ≠ token da instância configurada |
| Erro silencioso | Toda falha de API vira `NodeApiError` com status, endpoint e corpo da resposta; trigger loga payload descartado (motivo) em nível debug |

Retry de envio duplica mensagem se a uazapi aceitou mas a resposta se perdeu (timeout). Não eliminável
sem idempotência no lado da uazapi — documentado no README.

## Escopo

**v1:** Enviar mensagens, Receber (Trigger), Instância.
**Fora (v2+):** grupos, contatos, chats, etiquetas, newsletters, business, CRM, criar/deletar instância,
rotacionar tokens (ações destrutivas com admin token exigem confirmação explícita — não cabem num node).

## Pacote

- Nome npm: `@urzum/n8n-nodes-uazapi` (pré-requisito: escopo `@urzum` pertencer ao Armando no npm).
- Scaffold: `@n8n/node-cli` (`n8n-node new --template programmatic/example`), estilo **programático** (`execute()`), TypeScript, `strict: true`.
- Instalação: n8n self-hosted → Settings → Community Nodes → Install → `@urzum/n8n-nodes-uazapi`.
- Node `Uazapi` com `usableAsTool: true` (disponível como ferramenta do AI Agent).

### Peças

| Peça | Arquivo | Responsabilidade |
|---|---|---|
| Credencial `Uazapi API` | `credentials/UazapiApi.credentials.ts` | Server URL, Admin Token (opcional) |
| Node `Uazapi` | `nodes/Uazapi/Uazapi.node.ts` | Recurso → Operação; monta e envia requisição |
| Node `Uazapi Trigger` | `nodes/UazapiTrigger/UazapiTrigger.node.ts` | Ciclo de vida do webhook + filtro + normalização |
| Cliente | `nodes/shared/client.ts` | `request(ctx, instanceToken, method, path, body)`, resolução de token, erros |
| Normalizador | `nodes/shared/normalize.ts` | Função pura `normalize(body, opts) → NormalizedMessage` |
| Descrições | `nodes/Uazapi/descriptions/*.ts` | Campos de cada operação (um arquivo por recurso) |

## Credencial `Uazapi API`

| Campo | Tipo | Obrigatório | Nota |
|---|---|---|---|
| Server URL | string | sim | ex.: `https://smileia.uazapi.com` (sem barra final; normalizado) |
| Admin Token | password | não | habilita o modo "Da lista" e o teste de credencial |

Teste da credencial: com Admin Token → `GET /instance/all`; sem → `GET /status`.

## Seleção de instância (ambos os nodes)

Campo `Instância` do tipo `resourceLocator` com dois modos:

- **Da lista** — `listSearch` chama `GET /instance/all` (header `admintoken`), mostra `name (status, profileName)`,
  valor = `id`. Na execução, o token é obtido de `/instance/all` **uma vez por execução** (cache em memória
  por `id`), não por item.
- **Por token** — string/expressão, ex.: `{{ $json.instance.token }}`. Usado direto no header `token`.

Sem Admin Token na credencial, o modo "Da lista" lança erro claro: "Configure o Admin Token na credencial ou use o modo Por token".

## Node `Uazapi`

### Recurso: Mensagem

Campos comuns a todos os envios: `Número` (obrigatório; número ou chatid), e em "Opções":
`Track Source` (padrão `automa_uazapi`, editável), `Track ID`, `Responder a (replyid)`, `Menções`,
`Delay (ms)`, `Marcar chat como lido`, `Marcar mensagens como lidas`, `Encaminhada`, `Assíncrono`.

| Operação | Endpoint | Campos próprios |
|---|---|---|
| Enviar Texto | `POST /send/text` | Texto; opções: Link Preview (+ título/descrição/imagem/grande) |
| Enviar Mídia | `POST /send/media` | Tipo (image, video, videoplay, document, audio, myaudio, ptt, ptv, sticker), Arquivo (URL/base64 **ou** propriedade binária do item), Legenda; opções: Nome do documento, Mimetype, Thumbnail, Visualização única |
| Enviar Contato | `POST /send/contact` | Nome completo, Telefones; opções: Empresa, E-mail, URL |
| Enviar Localização | `POST /send/location` | Latitude, Longitude; opções: Nome, Endereço |
| Enviar Menu | `POST /send/menu` | Tipo (button, list, poll, carousel), Texto, Opções (lista); opções: Rodapé, Texto do botão da lista, Qtd. selecionável, Imagem do botão |
| Reagir | `POST /message/react` | ID da mensagem, Emoji (vazio remove) |
| Marcar como Lida | `POST /message/markread` | IDs das mensagens |
| Enviar Presença | `POST /message/presence` | Presença (digitando, gravando, pausado), Duração (ms) |

`track_source` é **sempre** enviado nos `/send/*` (string livre; pode ser apagado pelo usuário).
Arquivo binário: se o usuário escolher "Propriedade binária", o node converte para base64 antes do envio.

### Recurso: Instância

| Operação | Endpoint | Campos |
|---|---|---|
| Status | `GET /instance/status` | — |
| Conectar | `POST /instance/connect` | opções: Telefone (gera código de pareamento em vez de QR) |
| Desconectar | `POST /instance/disconnect` | — |

Saída = JSON da uazapi como veio. Conectar devolve QR code/código de pareamento no JSON.

## Node `Uazapi Trigger`

### Campos

| Campo | Padrão | Efeito |
|---|---|---|
| Instância | — | lista ou token (o token é necessário para registrar o webhook) |
| Eventos | `messages` | multi-select dos eventos da uazapi (`messages`, `messages_update`, `connection`, `presence`, `call`, `groups`, `chats`, `labels`, `contacts`, `history`, ...) |
| Ignorar Track Source | `automa_uazapi` | lista separada por vírgula; mensagem com `message.track_source` igual a um deles é descartada. Vazio = não filtra |
| Excluir na origem | nenhum | multi-select → `excludeMessages` (`wasSentByApi`, `wasNotSentByApi`, `fromMeYes`, `fromMeNo`, `isGroupYes`, `isGroupNo`) |
| Saída | Normalizada | `Normalizada` ou `Bruta` |
| Mídia | Não baixar | `Não baixar` / `Link` / `Link + base64` (chama `POST /message/download`) |
| Transcrever áudio | false | com Mídia ≠ Não baixar, áudio é transcrito e o texto vai para `message.content` |

### Ciclo de vida do webhook

- `checkExists`: `GET /webhook` → existe item com `url === webhookUrl`? Guarda o `id` em `staticData` e retorna true.
- `create`: `POST /webhook` `{action:"add", enabled:true, url, events, excludeMessages, addUrlEvents:false, addUrlTypesMessages:false}` → guarda `id`.
- `delete`: `POST /webhook` `{action:"delete", id}`; se não houver `id` salvo, busca pela URL. 404 = já removido (sucesso).
- Nunca chama `POST /webhook` sem `action` (modo simples sobrescreve o webhook principal).

### Processamento de cada POST recebido

1. Responde 200 imediatamente (n8n `responseMode: onReceived`).
2. `body.token !== tokenDaInstância` → descarta.
3. `EventType === "messages"` e `message.track_source` ∈ lista ignorada → descarta.
4. `EventType !== "messages"` → emite o body bruto.
5. Saída Bruta → emite body. Saída Normalizada → `normalize(body)`; se Mídia ≠ Não baixar e a mensagem tem mídia → `POST /message/download` e preenche `attachment.file_url` / `attachment.base64` (/ `message.content` se transcrição). Falha no download **não** descarta a mensagem: emite com `attachment.download_error` preenchido.

### Formato normalizado

Mantém os nomes do Set `normalizacao` atual. Fonte = `body.message` (`msg`), `content = msg.content || {}`.

| Campo | Regra |
|---|---|
| `message.message_id` | `msg.messageid` |
| `message.chat_id` / `message.jid` | `msg.chatid` |
| `message.pushName` | `msg.senderName` |
| `message.whatsapp` / `message.sender` | número do `chatid` quando termina em `@s.whatsapp.net` (o cliente, também em mensagens `fromMe`); senão, se `!fromMe`, número de `msg.sender_pn`; senão `msg.sender_lid` |
| `message.lid` | `msg.sender_lid` |
| `message.origem` | `grupo` se `chatid` contém `@g.`, senão `individual` |
| `message.content_type` | `msg.messageType` em minúsculas |
| `message.participant` | em grupo: número de `sender_pn` (fallback `sender`); individual: `''` |
| `message.content` | mesma lógica do Set atual (botões, imagem com legenda, extendedText com anúncio/citação/interativa, conversation preservando quebras, filtro de base64) |
| `message.timestamp` | `msg.messageTimestamp` → ISO 8601 |
| `message.event` | `outbound` se `fromMe`, senão `inbound` |
| `message.role` | `user` se `!fromMe`; `assistant` se `fromMe && wasSentByApi` (IA/automação via API); `human` se `fromMe && !wasSentByApi` (resposta digitada no WhatsApp) |
| `message.source` / `message.track` / `message.track_id` | `msg.source` / `msg.track_source` / `msg.track_id` |
| `message.reply` | `content.key.ID` ?? `content.contextInfo.stanzaID` ?? `msg.quoted` ?? `''` |
| `message.was_sent_by_api` | `msg.wasSentByApi` |
| `attachment.title` / `mimetype` / `filename` / `fileid` / `extension` / `content_url` | como no Set atual |
| `attachment.contato` | **array** `{nome, telefones[], empresa, cargo}` (era string) |
| `attachment.location.{end,latitude,longitude}` | como no Set atual |
| `attachment.link` | como no Set atual |
| `attachment.file_url` / `attachment.base64` | vazios, ou preenchidos pelo download |
| `instance.token` | `body.token` |
| `instance.owner` | `body.owner` sem `@...` |
| `instance.name` | `body.instanceName` |
| `instance.base_url` | `body.BaseUrl` |
| `raw` | body completo |

## Erros

- Cliente central converte qualquer resposta ≠ 2xx em `NodeApiError` com: método, endpoint, status, corpo da uazapi. 401/403 → mensagem "Token inválido ou sem permissão (instância X)".
- `continueOnFail()` respeitado item a item no node `Uazapi` (erro vai no `json.error` do item).
- "Retry on Fail" é o nativo do n8n; o node não faz retry próprio.
- Uazapi fora do ar no trigger: o webhook simplesmente não chega; ativação do workflow falha com erro claro se `checkExists/create` não alcançar a API.

## Testes

- **Normalizador (unitário, Vitest):** fixtures JSON em `test/fixtures/` com saída esperada — imagem (payload real fornecido, token removido), texto/conversation, extendedText com anúncio, resposta de botão, contato (1 e vários), localização, mensagem de grupo, `fromMe`.
- **Node Uazapi (unitário):** com HTTP mockado, cada operação gera método/URL/headers/body esperados; modo lista resolve token uma vez para N itens; `track_source` padrão aplicado.
- **Trigger (unitário):** `checkExists/create/delete` geram as chamadas certas e nunca o modo simples; filtros de token e track_source descartam corretamente.
- **Manual:** `npm run dev` (n8n local com o pacote) contra a instância real: enviar texto/mídia, receber texto/imagem/áudio, desativar e conferir que o webhook sumiu de `GET /webhook` e o webhook principal ficou intacto.
- `npm run lint` (regras de community node do n8n) sem erros antes de publicar.

## Interface

Rótulos e descrições da UI em inglês (padrão dos nodes nativos e exigência de capitalização do lint
`n8n-node lint`). README em português.

## Publicação

Desde 2026-05-01 o n8n exige publicação via GitHub Actions com npm provenance
(`.github/workflows/publish.yml` do scaffold).

1. Conta npm com escopo `@urzum` e Trusted Publisher configurado (repo `urzum/n8n-nodes-uazapi`, workflow `publish.yml`).
2. `npm run release` (lint + build + bump + changelog + tag + push) — com aprovação do Armando.
3. O push da tag dispara `publish.yml`, que publica com provenance.
4. n8n → Settings → Community Nodes → Install → `@urzum/n8n-nodes-uazapi`.
