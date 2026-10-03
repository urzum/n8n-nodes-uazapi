# Decisões

Uma seção por decisão. Símbolos entre crases para o `grafo consultar` achar.

## 2026-10-03 — Node programático (`execute()`), não declarativo

No modo "Da lista", cada execução precisa trocar o `id` da instância pelo token dela (`GET /instance/all`)
antes de chamar `/send/*`. O estilo declarativo (routing) não faz esse passo duplo de forma limpa.
Gerar a partir do OpenAPI daria os 158 endpoints com UX ruim e sem essa resolução.

## 2026-10-03 — Trigger nunca usa o modo simples do `POST /webhook`

O modo simples (sem `action`) cria ou **atualiza** o webhook único da instância, ou seja, sobrescreve
Chatwoot ou outro sistema plugado. O trigger usa `action: "add"` e `action: "delete"` com o `id` dele,
e `checkExists` procura pela URL do workflow para não duplicar.

## 2026-10-03 — Anti-loop por `track_source`, não por `wasSentByApi`

O Armando quer receber mensagens enviadas por API de outras origens. `excludeMessages: ["wasSentByApi"]`
cortaria tudo. O node `Uazapi` sempre manda `track_source` (padrão `automa_uazapi`, editável) e o trigger
descarta esses valores (campo texto, padrão `automa_uazapi`, vazio = recebe tudo). Texto livre, não
booleano, para quem quiser outros valores e filtrar depois.

## 2026-10-03 — `message.role` com três valores

`user` = `!fromMe`; `assistant` = `fromMe && wasSentByApi` (IA/automação); `human` = `fromMe && !wasSentByApi`
(resposta digitada no WhatsApp). O Armando grava as três no histórico.

## 2026-10-03 — Instância por lista (admin token) ou por token

O payload do webhook traz `token`; responder pelo mesmo número com `{{ $json.instance.token }}` é o caso
mais comum. Admin token é opcional na credencial e só habilita o dropdown. Ações destrutivas
(criar/deletar instância, rotacionar token) ficam fora da v1.
