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

## Migração para a v2 em Elixir/OTP

Análise completa em `_sistema/MIGRACAO_V2.md`; o projeto da v2 está nos `.docx` da raiz.
As duas decisões abaixo foram fechadas pelo usuário em **2026-08-28**.

- **A fábrica NÃO paga por token — ela consome COTA.** OAuth, `subscriptionType: pro`,
  `hasExtraUsageEnabled: false`, sem `ANTHROPIC_API_KEY`. Todo valor em dólar registrado
  pelo sistema (`US$ 22,55` numa rodada, `R$ 550` numa noite) é **estimativa contábil de
  tokens, não fatura**. Não trate esses números como dinheiro gasto, e não proponha
  "economia" que só faça sentido contra uma fatura por API. O que aperta de verdade é a
  parede de cota — daí `ehLimiteDeUso`, `horaDeReabertura` e o rearme do piloto.
- **O CACHE DA v1 JÁ ENTREGA ~80% DE ECONOMIA — não proponha "ligar cache".** Medido em
  28/08 sobre os 27 jobs de `dados/jobs/` com contabilidade completa: 93,14% dos tokens de
  entrada são LEITURA de cache (0,1×), 6,66% escrita, 0,20% preço cheio; razão 14:1; custo
  efetivo 0,18–0,21× do mesmo trabalho sem cache.
  **O que sobra, e é o alvo real: a escrita é 6,66% dos tokens e ~50% da conta de entrada**,
  porque cada despacho é sessão nova e sessão nova escreve prefixo novo (~21 por rodada).
  Multiplicador de escrita conferido contra os 12 jobs com custo real do SDK: fica entre
  1,25× e 2,0×, mais perto de 1,75× — **compatível com mistura de TTL de 5 min e 1 h**, ou
  seja, o CLI já usa o TTL longo em parte.
- **O operário da v2 é DUPLO, com padrão no CLI.** `behaviour Fabrica.Operario` com
  `Falso` (F1, marco), `ClaudeCLI` (F2, **padrão de operação**, roda na assinatura) e
  `MessagesAPI`/Req (F2, controle de `cache_control`, TTL e pontos de corte). **Não reabra
  como "Req ou SDK"** — a decisão foi não escolher, e o motivo é que ir só de Req empilha
  três apostas numa fase (laço novo + ferramentas novas + cobrança nova). O prêmio do Req
  é dimensionado e específico: transformar ~21 escritas de prefixo por rodada em 1–2. Por
  isso a **F2 ganha um marco a mais**: o prefixo do projeto é escrito uma vez e lido pelos
  despachos seguintes, provado por `cache_read_input_tokens`.
- **Três armadilhas de cache que a v1 não tem como ver** (referência: skill `claude-api`,
  `shared/prompt-caching.md`): a **janela de 20 blocos** para trás (uma volta com centenas
  de `tool_use`/`tool_result` erra o cache em silêncio); o **mínimo cacheável por modelo**,
  que não é monotônico — 512 no Opus 5, 1024 no Sonnet 5, **4096 no Haiku 4.5**, e o
  `testador` roda em Haiku; e **requisições paralelas idênticas não compartilham cache**.
- **PERFIL ALVO DA v2: 8 GB de RAM e 4 núcleos.** Pedido do usuário em 28/08 ("leve, rodando
  em qualquer computador médio"). É restrição de arquitetura, não preferência: desenvolver na
  máquina forte é ótimo, **depender dela não**. Medido: BEAM, PostgreSQL e pgvector juntos
  pesam pouco (o índice HNSW de 20k × 384 dim não moveu a memória livre). **A única peça
  pesada do desenho inteiro é o modelo de embedding local.**
- **O EMBEDDING TAMBÉM É ADAPTADOR, e a memória semântica é OPCIONAL.** `behaviour
  Fabrica.Embedder` com `Falso` (v0.1, determinístico por hash — é o que a suíte usa para
  sempre), `Servico` (v0.5, padrão em máquina modesta) e `Local` (v0.5, Bumblebee, opcional).
  **Nenhuma versão anterior à v0.5 carrega modelo nenhum**, e sem a v0.5 a fábrica funciona
  inteira — só não cita precedente. Não reabra como "precisa de GPU/muita RAM": não precisa.
- **O GIT FICA, inteiro, na v2** — está explícito nos dois documentos ("reconstrói o mundo
  lendo o banco **e o git**"; "tarefa concluída vira um commit próprio"; "a indexação roda
  ao commitar"). A decisão do banco muda **uma coisa só**: o markdown deixa de ser onde o
  agente escreve estado, e passa a ser gerado a partir do banco e commitado. Recuperação
  continua com duas fontes (banco + árvore git). E isso **reduz** cota, não aumenta: hoje o
  agente gasta voltas lendo e reescrevendo o arquivo da tarefa; `registrar_resultado` é uma
  volta estruturada, e volta é o termo dominante da conta.
- **Na v2 o banco é a verdade; o agente reporta por FERRAMENTA, nunca escrevendo estado.**
  `registrar_resultado` grava na mesma transação da transição; a ferramenta de mudar status
  não existe para agente nenhum — impossibilidade, não regra pedida no prompt. É a
  generalização do que a v1 já tinha descoberto com `ultima-reprovacao: # NÃO ESCREVA.
  Campo do MOTOR`. O markdown vira artefato GERADO e commitado, para leitura humana.
  Consequências já aceitas: os 12 prompts são reescritos, o importador das 89 tarefas é
  tarefa explícita da F3, e **backup do Postgres vira requisito da F1** (na v1 o git do
  projeto cobria isso de graça).
