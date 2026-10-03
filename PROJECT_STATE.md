# Estado do projeto

Projeto: n8n-nodes-uazapi
Estágio: desenvolvimento
Ambiente: local (n8n via `npm run dev`); n8n self-hosted do Armando para teste manual
Usuários reais: não
Dados reais: sim (instância uazapi real nos testes manuais)
Política de push: direto-no-main
Política de deploy: aprovação-obrigatória (deploy = `npm publish`)
Risco do banco: não-aplicável
Política de MCP em produção: não-aplicável
Provedor do banco: não-aplicável
Projeto remoto do banco: não-aplicável
Branch do banco: não-aplicável
Caminho de migration: não-aplicável
Starter: @n8n/node-cli (versão registrada no package.json)
Repositório: https://github.com/urzum/n8n-nodes-uazapi
Última revisão: 2026-10-03

## Deploy

Pacote npm `@urzum/n8n-nodes-uazapi` (público). Instalação: n8n → Settings → Community Nodes.

## Falha que mata este projeto

| Falha | Como voltamos | Status |
|---|---|---|
| Loop: bot responde à própria mensagem | Envio carimba `track_source` (`automa_uazapi`); trigger descarta por padrão | hipótese |
| Trigger sobrescreve o webhook principal da instância | Só `action: add/delete` com ID próprio; teste unitário garante que o modo simples nunca é chamado | hipótese |
| Webhook órfão/duplicado após reativar | `checkExists` busca pela URL antes de criar | hipótese |
| POST forjado na URL do webhook | Trigger descarta payload com `token` diferente da instância | hipótese |
| Versão publicada quebra workflows | `npm unpublish` só em 72h; caminho real é publicar patch e o Armando reinstalar a versão anterior pela tela Community Nodes | hipótese |

## Nunca (sem exceção)

- Commitar token (instância ou admin).
- `--force` em `main`.

## Pergunte antes

- `npm publish` (qualquer versão).
- Teste manual que envia mensagem para número que não seja o de teste.
- Criar, deletar ou desconectar instância real.

## Livre

- Push direto em `main` — "pode criar a repo exatamente como falou" (Armando, 2026-10-03) — expira na primeira versão publicada.

## Limite de aprovação

Ações fora das políticas acima exigem aprovação do Armando.
