---
description: Gera o guia de teste no n8n de uma feature (HTML curto, para quem monta workflow)
---

Feature visível no n8n termina com um guia para **quem monta o workflow**, não para quem programou. É a última issue da feature.

1. Leia `docs/specs/<feature>-spec.md` (critérios de sucesso) e as issues fechadas (`gh issue view <n> --comments`).
2. Cada critério vira "faça no n8n → o que você deve ver", um sinal por passo. Sem comando, sem arquivo, sem jargão de código. Critério só verificável por comando vai em "validado pela equipe técnica".
3. Pré-condições: versão do pacote instalada, credencial, **número de teste** (nunca de cliente).
4. Escreva `docs/guias/<feature>.html`. Inclua: o que mudou, passos, como reportar (passo + print), o que ficou de fora.
5. Leia como quem nunca viu o node: cada "o que você deve ver" é verdadeiro nesta versão e falso na anterior.
6. Feche pelo `/ship`; depois feche a issue-mãe com o caminho do guia.

$ARGUMENTS
