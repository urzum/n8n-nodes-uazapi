# Antes de declarar pronto

Pronto = funciona + falha observável + caminho de volta existe.

- [ ] `npm run build` verde.
- [ ] `npm run lint` verde (regras de community node do n8n; reprovam na verificação e quebram a instalação).
- [ ] `npm test` verde. Teste novo do arquivo exato rodou e falhou antes da implementação.
- [ ] Verify da issue rodado, saída guardada para a prova.
- [ ] Mexeu no trigger? Teste confirma que nenhum `POST /webhook` sai sem `action`.
- [ ] Mexeu no normalizador? Todas as fixtures em `test/fixtures/` passam; campo novo tem fixture.
- [ ] Mudança visível no n8n? `npm run dev` e conferir o node na tela; dizer o que não foi testado ao vivo.
- [ ] Mexeu em arquivo de instrução? `node scripts/check-agent-pointers.mjs` e `node scripts/check-docs.mjs`.
