# Depuração — reproduza antes, adivinhe nunca

- Nenhuma correção sem reproduzir a falha onde você vê o estado. Patch para "confirmar hipótese" é palpite.
- Antes: `grep -n 'Tags:.*<tec>' LESSON.md` (tags: `n8n`, `uazapi`, `typescript`).
- Payload estranho do webhook: salve o body (sem token) como fixture em `test/fixtures/` e reproduza no teste do normalizador. Vira teste de regressão de graça.
- "Funciona no `npm run dev`, falha no n8n do Armando": é ambiente até prova em contrário — versão do n8n, pacote instalado (Settings → Community Nodes mostra a versão), cache do node. Reproduza com `git clone` limpo + `npm ci` + `npm run build`.
- Erro da uazapi: leia o corpo da resposta inteiro (o `NodeApiError` carrega). Confira no contrato se o campo mudou.
- Saída de comando suspeita: repita com `rtk proxy <cmd>` antes de concluir; o filtro pode resumir errado.
- Dois fixes falharam: pare, escreva o que sabe e o que não sabe, e pergunte.
