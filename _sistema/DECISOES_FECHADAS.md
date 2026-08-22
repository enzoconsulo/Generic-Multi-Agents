# Decisões fechadas — NÃO REABRIR sem sinal novo

Perguntas que já foram investigadas, respondidas e custaram sessão. Reabrir uma delas sem
evidência nova é pagar duas vezes pela mesma resposta. Se você está prestes a propor algo
desta lista, leia o motivo primeiro — e, se ainda achar que vale, diga explicitamente qual
FATO NOVO mudou o quadro.

(Resgatadas de `proximo_prompt.txt` em 2026-08-11, quando o handoff foi reescrito. Handoff é
rotativo por natureza; regra e decisão não podem morar nele.)

## Custo e medição

- **`modelUsage` do SDK é ACUMULADOR VIVO por job, não instantâneo por mensagem.**
  Sobrescrever está certo, NÃO há subcontagem. O "platô idêntico nos últimos `result`" tinha
  explicação boba: saíram numa janela de 2 ms e leram o acumulador já final. Prova: a soma de
  `costUSD` bate com `total_cost_usd` até a 9ª casa. Detalhe em `painel/CLAUDE.md`.
- **Prompt caching já está ligado e bem configurado.** O SDK NÃO expõe `cache_control` nem
  TTL (conferido no `sdk.d.ts` da versão PINADA). **Cachear em arquivo não ajuda** — o custo
  é por token NA REQUISIÇÃO, não por leitura de disco.
- **`effort` para economizar: está otimizando a parte pequena.** Ele mexe na GERAÇÃO (~16%
  da conta); contexto relido é ordens de grandeza maior. Ver também a armadilha "execução
  que não faz nada é sempre a mais barata" em `painel/CLAUDE.md`.
- **`getContextUsage()`: NÃO FAZER.** Mede tamanho de prefixo, que não é o driver; exige
  mudar o tipo `Consulta` do runner, que a suíte inteira usa para falsear o SDK. Reabrir SÓ
  SE tamanho de prefixo virar o gargalo medido.
- **`/status` pago duplica ~70% do que o painel calcula de graça em 15 ms.** DECISÃO DO
  USUÁRIO: fica como está.
- **Orçamento de ferramentas MEDE e não corta, de propósito** (T-065). Cortar exigiria
  converter chamadas em voltas, e despacho interrompido no meio custa igual sem entregar
  nada. Ver `pipeline/despachante.ts`, comentário de `orcamentoDeFerramentas`.

## Regras de custo que nasceram de estrago real

- **Já foram queimados R$ 550 numa noite em Fable/xhigh.** Execução real de fluxo roda em
  Haiku ou Sonnet. **NUNCA Fable/xhigh sem o usuário pedir.**
- **No painel não existe disparo "a seco":** `POST /api/acoes/:id` JÁ EXECUTA de verdade.
  Diga a estimativa ANTES de gastar.
- **ANTES DE PAGAR PARA MEDIR, PROCURE A EVIDÊNCIA QUE JÁ ESTÁ EM DISCO.** Uma pergunta que
  ia custar outra rodada de `/trabalhar` foi respondida de graça pela gravação SSE, pelos
  JSONs de `painel/dados/jobs/` e por uma soma. Vale igual hoje: a leitura inteira da rodada
  `0345125c` (11/08) saiu de `dados/jobs/` sem gastar um centavo de modelo.

## Disciplina de verificação

- **Corrigir o teste até passar ESCONDE o bug.** Se um teste falha, pergunte primeiro se ele
  está certo e o código errado.
- **Falha que se repete em TODA execução não é flaky.**
- **Documentação que mente é pior que documentação ausente** — e tarefa de documentação tem
  escopo declarado: confira o `areas:` em vez de confiar que "já foi coberto" (um README
  ficou mentindo por dois dias assim).
- **Mensagem de erro que assume um cenário e afirma categoricamente sobre outro é BUG.**

## Paralelismo e vazão do pipeline

- **`git worktree` por verificador: NÃO FAZER.** A hipótese era que o portão do meio, sendo
  1-wide, viraria o teto de vazão de um projeto maduro. Medido em 21/08 sobre os 43 jobs de
  pipeline com `.log.jsonl`: **o portão 1-wide nunca enfileirou ninguém — zero segundos de
  espera, em zero rodadas.** Não há um único par de verificadores consecutivos em nenhum log;
  o ganho teórico de uma verificação infinitamente larga é 0 s.
  A razão é que o gargalo é outro: **o paralelismo de CONSTRUTOR também não acontece.** Em 43
  rodadas houve 2 ocorrências de etapas realmente sobrepostas, e as duas são replanejador ×
  outra etapa — nenhuma é o 3-wide de construtores. A rodada típica despacha em série porque
  raramente há duas tarefas despacháveis com `areas` disjuntas ao mesmo tempo, e porque o teto
  de custo encerra antes.
  Custo do lado oposto: branch por verificador, `npm install` por worktree, e — o que decide —
  **memória**. A máquina tem 7,9 GB com ~1,3 GB livres, e a suíte de projeto já tem histórico
  de deixar 8 `node.exe` órfãos por estouro de tempo (ver `painel/CLAUDE.md`); duas suítes
  simultâneas é a receita do painel morrendo com job em voo. Some as evidências
  (`_gestao/evidencias/`), que num worktree seriam gravadas fora da árvore principal e
  precisariam voltar.
  Nota sobre a evidência que motivou o item: o handoff citava "quatro testadores em fila
  (545 s + 497 s + 233 s + 97 s)" medidos em 15/08. **Isso não é reencontrável** — as duas
  rodadas de 15/08 tiveram UM verificador cada, e nenhum job do pipeline tem quatro. Lição:
  número citado sem o arquivo de onde saiu vira premissa que ninguém consegue conferir.
  **Reabrir SÓ SE** um `.log.jsonl` mostrar verificadores consecutivos com espera real — o
  instrumento para isso é contar pares de etapas `verificador` sem nada entre elas.
