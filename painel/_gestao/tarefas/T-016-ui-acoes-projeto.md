---
id: T-016
titulo: Página do projeto operacional — trabalhar, analisar e acompanhar ao vivo
projeto: painel-fabrica
status: backlog
prioridade: media
dependencias: [T-006, T-012, T-014]
areas: [web/src/paginas/projeto/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Ações por projeto na própria página: Trabalhar neste projeto, Gerar/Atualizar análise e
Status do projeto; indicador de lock/job ativo do projeto; kanban e abas atualizando
sozinhos quando um job termina.

## Contexto
- Reusar `web/src/lib/sse.ts` (T-014). Tocar SOMENTE `web/src/paginas/projeto/`.
- Botões chamam `POST /api/acoes/trabalhar|analisar|status` com `{ projeto }`; modal de
  confirmação com a descrição do que vai acontecer (mesmo padrão da T-015).
- Enquanto houver job ativo com lock deste projeto: botões conflitantes desabilitados
  com explicação ("Projeto ocupado por: <título do job>") e log ao vivo acessível na
  página (painel embutido ou atalho para `/jobs` com o job aberto).
- Ao receber pelo SSE o evento de término de job do projeto: refetch automático de
  `GET /api/projetos/:nome` (kanban, plano e análise refletem o que o fluxo mudou).
- Aba Análise: mostra ANALISE.md renderizado + data da última análise (do rodapé) e o
  botão "Atualizar análise"; quando não existe, o aviso da T-006 ganha o botão "Gerar
  análise agora".
- Aviso especial: se o projeto da página for `painel-fabrica`, exibir alerta claro antes
  de disparar Trabalhar ("este fluxo altera o código do painel em execução") — risco
  registrado na especificação.

## Critérios de aceite
- [ ] Botão "Trabalhar neste projeto" dispara `/trabalhar <nome>` e o progresso ao vivo
      fica visível sem sair do navegador.
- [ ] Botão de análise dispara o job; ao concluir, a aba Análise mostra o conteúdo novo
      sem F5 (refetch automático via SSE).
- [ ] Com job ativo do projeto, os botões conflitantes ficam desabilitados com a
      explicação do lock; ao terminar, reabilitam sozinhos.
- [ ] Ao término de um job do projeto, o kanban reflete os novos status das tarefas sem
      recarregar manualmente.
- [ ] Na página do painel-fabrica, o alerta especial aparece antes de confirmar
      Trabalhar.

## Notas de execução


## Verificação


## Revisão

