---
id: T-058
titulo: "MARCO da v1.0: um projeto inteiro, sem intervencao"
projeto: fabrica-v2
versao: v1.0
status: bloqueada
prioridade: alta
dependencias: [T-052, T-053, T-055, T-056, T-057, T-020, T-066, T-067, T-068, T-069, T-070, T-073, T-074, T-075, T-084, T-085, T-086, T-087, T-088, T-089, T-090, T-091, T-094, T-095, T-096]
areas: [_gestao/PROGRESSO.md, _gestao/ENTREGA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-10-01
---

## Objetivo
Verificar o marco final: um projeto inteiro e planejado, construido e entregue sem
intervencao, com o custo acompanhado na tela. E fechar a comparacao com a linha de base.

## Contexto
Tarefa de verificacao, e ela e a entrega do TCC.

Escolha um projeto NOVO e PEQUENO — 8 a 12 tarefas, nao um dos tres projetos vivos da v1.
Migrar projeto em voo nunca foi o plano. De o pedido em linguagem natural, ligue o piloto
com os dois tetos, e nao toque em mais nada.

Confira, ao fim:
  1. o projeto foi planejado, construido, verificado, revisado e documentado;
  2. a intervencao humana foi UMA: o pedido inicial;
  3. o custo por tarefa aparece na tela e no banco;
  4. rode tambem um projeto da trilha GENERICA (um documento ou um deck), para provar as
     duas trilhas.

**E entao feche a medicao** contra a `LINHA_DE_BASE.md` da T-008. Os quatro numeros:
proporcao de despacho desperdicado, custo por tarefa concluida, contexto por despacho, e o
que se perde ao matar um agente em voo.

Grave `_gestao/ENTREGA.md` com a comparacao. **Se algum numero piorou, escreva isso.** Um TCC
que reporta um resultado misto e honesto vale mais que um que reporta so o que deu certo — e
a banca vai perguntar exatamente pelo numero que faltar.

## Criterios de aceite
- [ ] Um projeto novo e pequeno e entregue de ponta a ponta com UMA intervencao humana.
- [ ] Um projeto da trilha generica tambem e entregue, com os graus de prova rotulados.
- [ ] `ENTREGA.md` compara os quatro numeros com a `LINHA_DE_BASE.md`, incluindo os que pioraram.
- [ ] O custo por tarefa esta visivel na tela e consultavel no banco.

## Notas de execucao

### Ciclo 1

Impedimento: nao existe hoje, em producao, nenhum caminho que ligue "o piloto esta ligado" a
"um agente real esta trabalhando" — os quatro criterios pedem rodar o pipeline INTEIRO
(planejar, construir, verificar, revisar, documentar) com UMA intervencao humana, e essa
composicao nunca foi montada.

**O que foi conferido antes de tocar em qualquer coisa** (dependencias T-052/053/055/056/057
todas `concluida`, confirmado):

1. **`Fabrica.Piloto.Servidor` decide e agenda, mas nao ha quem execute.** O proprio moduledoc
   (`lib/fabrica/piloto/servidor.ex`, secao "O que NAO esta aqui, de proposito") diz: "Rodar o
   agente de verdade (`Fabrica.Agente.Supervisor.iniciar/4` + `Fabrica.Agente.Laco`) continua
   sem chamador em producao". Conferido por grep: `Agente.Supervisor.iniciar/4` **nunca** e
   chamado em `lib/` fora dessa propria frase de documentacao — so em testes e em probes
   manuais (`priv/probes/*.exs`).
2. **`Fabrica.Fila.Trabalho.perform/1` (o worker do Oban que o piloto enfileira) confirma o
   mesmo buraco pelo lado do worker**, no proprio moduledoc, secao "O que `perform/1` NAO faz,
   ainda": "Hoje ele so registra que a etapa esta pronta para ser atendida. Ligar isto ao
   `Fabrica.Agente.Supervisor`... e trabalho de orquestracao que nao esta nas `areas` desta
   tarefa". Ou seja: ligar o piloto move a tarefa para `em_execucao` e cria o `Oban.Job`, e
   NADA depois disso faz o trabalho de verdade — a tarefa ficaria presa, sem nada denunciar.
3. **Nao existe modulo "planejador"** que traduza um pedido em linguagem natural num grafo de
   8 a 12 tarefas com dependencias e criterios (grep por `Fabrica.Planejador` em `lib/`: vazio;
   "planejador" so aparece como conceito de PAPEL em comentarios, nunca como codigo). O
   criterio 1 ("um projeto foi planejado... com UMA intervencao: o pedido inicial") nao tem
   como ser cumprido sem esse modulo.
4. **Nao existe botao nem mix task que inicie um agente real.**
   `lib/fabrica_web/live/componentes/controles.ex` so tem `pedir_parar`/`confirmar_parar`/
   `retomar` — pressupoe um agente JA rodando por outro meio. `lib/mix/tasks/` tem so
   `fabrica.backup`, `fabrica.ci`, `fabrica.importar`, `fabrica.mapa`, `fabrica.restaurar`;
   nenhum "trabalhar"/"despachar". O evento `"ligar"` do LiveView do piloto
   (`lib/fabrica_web/live/componentes/piloto.ex:50`) liga a MECANICA de decisao — nao um
   agente.
5. **O marco mais basico do projeto ainda nao foi verificado.** `T-020` ("MARCO da v0.2: uma
   tarefa resolvida") continua `status: backlog` — nunca um agente real resolveu uma tarefa
   real de ponta a ponta nesta fabrica-v2. Ela depende de `T-020b` (tambem `backlog`), que por
   sua vez depende de `T-017b` (`status: pronta`, nao `concluida`). Isto e mais grave do que
   "T-058 e dificil": e a prova de que a escada de marcos anteriores (v0.2 -> v1.0) tem um
   degrau faltando ANTES deste.

**Por que isto nao e "so mais dificil".** Os quatro criterios da T-058 pressupoem uma
composicao ponta-a-ponta que nunca existiu nem como probe manual — os probes ja escritos
(`priv/probes/cli_governanca.exs`, `marco_v02_agente.exs`) exercitam UM despacho isolado
chamado a mao em `iex`, nao uma fila que se auto-alimenta do planejamento ate a entrega. Rodar
"de verdade" hoje exigiria escrever, no minimo: (a) o modulo/tarefa que decompoe um pedido em
tarefas, (b) a cola entre `Fila.Trabalho.perform/1` e `Agente.Supervisor.iniciar/4`, e (c)
alguma forma de o `Portoes.Verificador`/`Portoes.Revisor` (T-028) tambem serem despachados como
agentes reais dentro do mesmo laco — nenhum dos tres esta nas `areas` desta tarefa
(`_gestao/PROGRESSO.md`, `_gestao/ENTREGA.md`), e cada um e trabalho de tarefa propria, nao um
ajuste dentro de uma tarefa de VERIFICACAO.

**Nao tentei contornar escrevendo essa cola aqui.** Seria trabalho de codigo fora do
confinamento desta tarefa (que e so verificacao + documentacao) e um escopo do tamanho de
varias tarefas somadas — exatamente o que a regra "nao altere criterios de aceite nem escopo"
e "se descobrir trabalho novo no caminho, NAO o faca" pedem para eu registrar, e nao fazer.

**Sugestao para o planejador** (mesmo padrao ja usado em T-034 -> T-034b neste projeto):
extrair desta tarefa uma ou mais tarefas de infraestrutura que fechem a composicao real antes
de reagendar o marco:
- ligar `Fila.Trabalho.perform/1` a `Agente.Supervisor.iniciar/4` (o worker do Oban de fato
  sobe o agente, em vez de so marcar "pronto para ser atendido");
- decidir e implementar como um "planejador" vira codigo (agente com prompt proprio? modulo
  puro que so estrutura o que o Enzo digitar?);
- fechar `T-020`/`T-020b`/`T-017b` primeiro — o marco de "um agente resolve uma tarefa" e
  pre-requisito logico do marco de "um projeto inteiro e resolvido", mesmo que o grafo de
  dependencias formal da T-058 nao aponte para eles.

Nada foi alterado em `_gestao/PROGRESSO.md` nem criado em `_gestao/ENTREGA.md` neste ciclo: o
ENTREGA.md e a comparacao final, e escrever um rascunho dele antes de o pipeline rodar de
verdade fabricaria uma entrega que nao aconteceu.

**Reproduzir a conferencia:** `grep -rn "Agente.Supervisor.iniciar/4" lib/` (so aparece em
comentario) e `grep -rn "Fabrica.Planejador" lib/` (vazio).

**Commit:** `d2b1749`

### Ciclo 2 (executor reforcado)

**Causa raiz, em uma frase:** a T-058 pede VERIFICAR um pipeline ponta-a-ponta
(planejar -> construir -> verificar -> revisar -> documentar) que NAO EXISTE em producao —
falta o modulo que decompoe um pedido em tarefas, falta a cola entre
`Fila.Trabalho.perform/1` e `Agente.Supervisor.iniciar/4`, e o marco pre-requisito T-020
("um agente resolve uma tarefa") nunca passou.

**Aproveitamento:** reusei 100% do diagnostico do ciclo 1 e reverifiquei cada afirmacao de
forma independente (nenhum codigo escrito, nenhum remendo — remendar aqui seria escrever
codigo fora do confinamento `areas: [PROGRESSO.md, ENTREGA.md]`). As quatro checagens
bateram, e achei um quinto fato que reforca o impedimento.

Reverificado nesta maquina, hoje:

1. `grep -rn "Agente.Supervisor.iniciar" lib/` → **uma unica ocorrencia**, e e a frase do
   moduledoc de `lib/fabrica/piloto/servidor.ex:24` ("O que NAO esta aqui, de proposito").
   Nenhuma chamada real em producao.
2. `grep -rn "Planejador" lib/` → **vazio** para o modulo; "planejador" aparece so como
   nome de PAPEL em comentarios (`criterios.ex`, `equipe/resolucao.ex`, `catalogo.ex`, …).
   Nao ha codigo que traduza um pedido em linguagem natural num grafo de 8-12 tarefas.
3. `lib/fabrica/fila/trabalho.ex:131-135` — `perform/1` na integra: `Logger.info(...)` +
   `:ok`. Ele NAO chama o supervisor; o proprio moduledoc (linhas 34-40, "O que `perform/1`
   NAO faz, ainda") confirma. Ligar o piloto move a tarefa para `em_execucao` e cria o
   `Oban.Job`, e o job so registra "pronta para ser atendida" — nada faz o trabalho.
4. **T-020** (`status: backlog`), **T-020b** (`backlog`), **T-017b** (`pronta`, nao
   `concluida`). O marco "um agente real resolve uma tarefa real" — pre-requisito logico
   deste — nunca foi verificado.
5. **Novo:** `_gestao/tarefas/T-020c-marco-2-messages-api.md` declara
   `dependencias: [T-058]`. Ou seja, a v0.2 tem uma metade de marco pendurada NESTE marco
   final — a escada v0.2 -> v1.0 tem um degrau faltando ANTES do topo, e uma dependencia
   apontando de volta para o topo.

**Veredito do executor reforcado: IMPEDIMENTO CONFIRMADO — a tarefa nao tem como ser
cumprida como esta escrita.** Os quatro criterios pressupoem uma composicao ponta-a-ponta
que nunca existiu (nem como probe manual). Cumpri-los exige, no minimo, tres tarefas de
INFRAESTRUTURA de producao (planejador; cola `perform/1`->`Supervisor.iniciar/4`; despacho
dos portoes T-028 como agentes reais no mesmo laco) mais o fechamento de T-017b/T-020b/T-020
— tudo fora das `areas` desta tarefa de verificacao. Redespachar um executor de novo nao
mudaria esse fato: e impedimento de ARQUITETURA AUSENTE, nao defeito de execucao.

**Recomendacao ao planejador (mesmo padrao T-034 -> T-034b):** manter a T-058 como o marco
de verificacao que ela e, extrair as tarefas de infraestrutura acima como pre-requisitos, e
so reagendar o marco quando existir um caminho de producao que leve "piloto ligado" ate
"agente real trabalhando" — comecando por fazer T-020 passar. Nao zerar `tentativas` a
esmo: este ciclo diagnosticou impedimento de dependencia inexistente, nao falha de execucao
(regra 0 do protocolo).

**Nada gravado em `_gestao/ENTREGA.md` nem alterado em `_gestao/PROGRESSO.md`** — pelo mesmo
motivo do ciclo 1: o ENTREGA.md e a comparacao final contra a `LINHA_DE_BASE.md`, e
escrever qualquer numero antes de o pipeline rodar de verdade fabricaria uma entrega que
nao aconteceu.

**Reproduzir:** `grep -rn "Agente.Supervisor.iniciar" lib/` · `grep -rn "Planejador" lib/`
· `sed -n '131,135p' lib/fabrica/fila/trabalho.ex` · conferir `status:` em T-020, T-020b,
T-017b, T-020c.

### Ciclo 3 (planejador — replanejamento)

Reconferido, de forma independente, o diagnostico dos dois ciclos anteriores: bate. Nao
redespachei um terceiro executor porque os dois ja mediram a mesma causa raiz — impedimento de
arquitetura ausente, nao defeito de execucao (regra 0 do protocolo) — e um terceiro ciclo so
repetiria o gasto sem mudar o fato.

**Decisao registrada em `_gestao/DECISOES.md`, D-006.** Resumo: nao existe, em producao, o
caminho "piloto ligado -> agente real trabalhando". Investiguei o quanto ja esta pronto antes de
desenhar tarefa nova (a lacuna e menor do que a primeira leitura sugere: `Catalogo` ja tem o
papel `"planejador"`, `Prompt.Prefixo`/`Equipe.Resolucao` ja compoem tres das quatro faixas do
prefixo, `RegistrarResultado` ja e o unico canal de relato) e extraí cinco tarefas de
infraestrutura, na ordem de dependencia:

- **T-066** — `Fabrica.Despacho`: monta a mensagem inicial (pura), tarefa + papel + doutrina.
- **T-067** — a doutrina de construtor/testador/revisor, escrita para o agente real desta fabrica.
- **T-068** — `Fabrica.Planejador` + a doutrina do papel `planejador`.
- **T-069** — `mix fabrica.planejar`, a UNICA intervencao humana que o marco exige.
- **T-070** — a cola: `Fila.Trabalho.perform/1` sobe o agente real e fecha o laco com o `Piloto`.

**`dependencias` ganhou `T-020, T-066, T-067, T-068, T-069, T-070`.** `T-020` (marco da v0.2, "um
agente resolve uma tarefa real") nao estava na lista formal mas e pre-requisito logico — a
escada v0.2 -> v1.0 tinha um degrau faltando antes do topo, como os dois ciclos ja registraram.
`T-020` por sua vez so libera quando `T-020b` (que so libera quando `T-017b`, hoje `pronta`)
fechar — nenhuma tarefa nova precisou ser criada para essa metade da escada, ela ja existia e so
faltava ser puxada para dentro do grafo formal da T-058.

**`tentativas` voltada a 0** (regra 0 do protocolo: os dois ciclos diagnosticaram corretamente
um impedimento de dependencia, nao gastaram por defeito proprio — mesmo tratamento dado a T-034
em 08/09). **`status` continua `em-execucao`**: mover para `em-teste`/`pronta` nao e papel do
planejador, e nao ha o que um executor faca aqui ate as seis novas dependencias fecharem.

**Nada gravado em `_gestao/ENTREGA.md` nem alterado em `_gestao/PROGRESSO.md`** — mesmo motivo
dos dois ciclos anteriores: escrever qualquer numero antes do pipeline rodar de verdade
fabricaria uma entrega que nao aconteceu.

### Ciclo 4 (executor reforcado, 2026-09-27) — IMPEDIMENTO LEVANTADO, aguardando autorizacao

**Causa raiz das reprovacoes 1-3, em uma frase:** faltava, em producao, o caminho "piloto
ligado -> agente real trabalhando" (sem `Fabrica.Planejador`, sem doutrina de papel, e com
`Fila.Trabalho.perform/1` sendo apenas `Logger.info` + `:ok`). **Esse impedimento acabou.**

**Aproveitamento:** reusei o diagnostico dos ciclos 1-3 e reverifiquei o estado atual. Nenhum
codigo escrito nem remendo — a mudanca nao esta no codigo, esta nas dependencias que fecharam.

Reverificado hoje, por codigo (nao so por `status:`):
1. As **14** `dependencias` do frontmatter (T-052/053/055/056/057/020/066/067/068/069/070/073/
   074/075) estao **todas `status: concluida`**.
2. `lib/fabrica/fila/trabalho.ex:266` — `perform/1` agora chama de fato
   `SupervisorDeAgentes.iniciar(tarefa.id, papel, funcao, ...)`, que roda `Laco.rodar/1` com
   `ferramentas: ferramentas_do(tarefa, papel, coletor)` (linha 258) — nao mais `%{}` vazio nem
   `Logger.info + :ok`.
3. `lib/mix/tasks/fabrica.planejar.ex` existe — a UNICA intervencao humana que o marco pede.

**Ou seja: a T-058 e executavel pela primeira vez.** Os quatro criterios agora TEM como ser
cumpridos, rodando o pipeline de verdade.

**Por que parei aqui, em vez de disparar:** rodar a T-058 de verdade e `mix fabrica.planejar`
criar um projeto novo + ligar o `Piloto.Servidor`, que despacha `perform/1` -> sobe
`Operario.ClaudeCLI` -> invoca o binario `claude --print` REAL, a MESMA cota da assinatura de
uma sessao interativa. Isso roda por varias tarefas x papeis (construtor/verificador/revisor) x
ciclos de retrabalho, potencialmente por HORAS, e ja estourou teto antes (piloto automatico
parou em US$ 61,20 com teto de US$ 60,00, `_gestao/PROGRESSO.md`). E acao cara e dificil de
reverter (gasto de cota nao volta): exige autorizacao explicita do Enzo antes do disparo, com
os dois tetos definidos. Nada em `ENTREGA.md`/`PROGRESSO.md` foi escrito — escrever qualquer
numero antes do pipeline rodar fabricaria uma entrega que nao aconteceu.

**Nao e impedimento nem defeito de execucao; e um gatilho de custo aguardando o go-ahead
humano.** Sem `status`/`tentativas` alterados neste ciclo.

### Devolvida ao backlog pelo orquestrador (2026-09-21)

O impedimento declarado acima PROCEDE, e esta bem provado (quatro greps, com arquivo e linha).
A T-058 e o marco da v1.0 — ela so pode rodar quando existir o caminho de producao inteiro, e
hoje ele tem quatro buracos: sem `Fabrica.Despacho`, sem doutrina de papel, sem
`Fabrica.Planejador` e com `Fila.Trabalho.perform/1` ainda um `Logger.info` + `:ok`.

O planejador ja fez a parte dele: criou T-066 (despacho), T-067 (doutrina), T-068 (planejador),
T-069 (mix planejar) e T-070 (fila liga o agente real), e acrescentou as cinco as
`dependencias` desta tarefa.

**O que faltava era o status.** Ela tinha ficado em `em-execucao`, e ali o saneamento de
abertura a devolveria a `pronta` na proxima rodada — seria redespachada para declarar
exatamente o mesmo impedimento, de graca. `backlog` e o unico estado que respeita as
dependencias: o motor a repromove sozinho quando as cinco fecharem.

Nenhuma linha de codigo tocada.

### Ciclo 5 (planejador — despacho de "retrabalho" conferido, falso)

Despacho me chamou com `Situação: RETRABALHO — há reprovação registrada nas seções
Verificação/Conformidade/Revisão`. Conferi antes de tocar em qualquer coisa: **e falso**. As
tres secoes abaixo (`### AUTORIZADA pelo Enzo (2026-10-01) — tetos definidos pelo orquestrador (D-015)

O Enzo autorizou o disparo real ("Autorizada a T-58, defina um marco de gastos justo e pode testar
já"). Tetos, por projeto do marco — os DOIS freios que `Piloto.Decisao.ligar/2` exige:

| projeto | tamanho | teto de gasto | máximo de rodadas |
|---|---|---|---|
| software, NOVO e pequeno | 8 tarefas (o mínimo da faixa) | **US$ 60** | **20** |
| trilha genérica (documento) | 4-5 tarefas | **US$ 25** | **12** |

**Total do marco: US$ 85 de cota** (estimativa contábil, não fatura). Base: a `LINHA_DE_BASE.md`
mede US$ 7,82 por tarefa concluída na v1 — 8 × 7,82 ≈ 62. Se a v2 for ao menos tão eficiente quanto
a v1 (a tese do TCC), o projeto termina dentro do teto; se parar no teto, ISSO é o resultado, e vai
para a `ENTREGA.md` como número que piorou. Rodada = um despacho que o piloto lança (moduledoc de
`Piloto.Servidor`): 20 = 2,5× as 8 tarefas. O teto é conferido ENTRE rodadas: pode passar em até uma
rodada (~US$ 5; a v1 já parou em 61,20 com teto de 60).

**Antes do disparo, duas corretivas medidas hoje** (sem elas o piloto queimaria cota sem trabalhar):
T-084 (`--model sonnet-5` é recusado pelo CLI; `Precos` não conhece `claude-sonnet-5-5`) e T-085
(o agente real herda o `CLAUDE.md` da fábrica-mãe — 35 KB de instrução de ORQUESTRADOR em cada
despacho). Ambas entraram nas `dependencias`; `tentativas` zerado (impedimento externo resolvido).

**Antes do disparo — trilha genérica (D-015, adendo 5).** A v2 não tem a trilha genérica ligada em
produção (`Fabrica.Trilhas` sem chamador; nenhuma doutrina não-software em `priv/doutrina/`). O
disparo de hoje é SÓ o projeto de software; o critério 2 fica em aberto e a tarefa não fecha sem ele.

### Bloqueada pelo orquestrador (2026-10-01, 23:20 UTC) — disparo NEGADO pela permissão da sessão na nuvem

Com as 16 dependências concluídas, o orquestrador despachou a FASE 1 (subir a fábrica v2 destacada,
`mix fabrica.planejar` com o pedido do `gastos-cli`, ligar o piloto pela tela com US$ 60 / 20
rodadas). O classificador de segurança do modo automático da sessão RECUSOU o despacho ("Create
Unsafe Agents"): o piloto põe no ar, sem supervisão e por horas, agentes `claude` reais com Bash
aprovado e NÃO confinado (decisão da T-088, D-015 adendo 2). Nada foi disparado: nenhum projeto
criado, nenhuma cota gasta no marco.

Não é impedimento de código — é decisão do Enzo. Caminhos possíveis (detalhe no log do dia):
(a) o Enzo libera explicitamente o disparo nesta sessão/ambiente; (b) roda o marco em casa, pelo
painel; (c) antes, confinar o Bash do agente real (sandbox do próprio `claude`), o que tira o risco
que motivou a recusa — candidato a tarefa. O pedido literal do `gastos-cli` e o roteiro da fase 1
estão no log de 2026-10-01 (sessão 2, parte 2).

## Verificacao`, `## Conformidade`, `## Revisao`) estao vazias — nunca
houve passagem pelos portoes nesta tarefa, entao nao ha o que replanejar por reprovacao.

Reverifiquei tambem se o diagnostico do Ciclo 4 ainda procede, porque `status: em-execucao` com
`tentativas: 1` poderia ser um impedimento real disfarcado: as 14 `dependencias` do frontmatter
continuam **todas `concluida`** (conferido agora, por `status:` de cada arquivo, nao só de
memoria). O caminho de producao que faltava (planejador, doutrina, cola `perform/1` ->
`Supervisor.iniciar/4`) fechou e segue fechado.

**Nao ha nada para o planejador fazer aqui.** O Ciclo 4 nao e um impedimento de arquitetura nem
uma reprovacao de portao — e o executor tendo parado de proposito antes de disparar o piloto de
verdade, porque isso gasta cota real da assinatura do Enzo por horas (ja estourou teto uma vez:
US$ 61,20 contra teto de US$ 60,00). Isso e uma decisao que só o Enzo pode autorizar, com os dois
tetos definidos — nao e um vazio de tarefas/dependencias que eu resolvo escrevendo mais T-NNN.
Criar tarefa nova aqui seria inventar trabalho de planejamento para um problema que nao e de
planejamento.

**Nada alterado**: `status` continua `em-execucao`, `tentativas` continua `1`, `dependencias`
sem mudanca. Nenhum arquivo de `_gestao/PROGRESSO.md`/`_gestao/ENTREGA.md` tocado — o motivo e o
mesmo dos ciclos anteriores, mais o fato de que nao houve reprovacao real para corrigir.

**Reproduzir:** conferir `status:` de T-052/053/055/056/057/020/066/067/068/069/070/073/074/075
(todas `concluida`) e notar que `## Verificacao`, `## Conformidade`, `## Revisao` abaixo estao
vazias.

### Bloqueada pelo orquestrador (2026-10-01) — impedimento externo: autorização de custo

Os Ciclos 4 e 5 dizem a mesma coisa, e procede: as 14 dependências estão `concluida` e o que
falta é disparar o piloto de verdade (`claude --print` real, por horas, na cota da assinatura).
Isso é **custo externo** — pela regra 5 do CLAUDE.md da fábrica, só o Enzo autoriza, com os dois
tetos (gasto e rodadas) definidos.

**Por que `bloqueada` e não `em-execucao`:** em `em-execucao` o saneamento de abertura a devolve
a `pronta` e o motor a redespacha a cada rodada para declarar o mesmo impedimento — foi o que
aconteceu no Ciclo 5 (um planejador pago para concluir "nada a fazer"). `bloqueada` é o estado do
protocolo para impedimento externo e é o que aparece no /status como pendência DO USUÁRIO.

**Para destravar:** o Enzo autoriza o disparo com os dois tetos → orquestrador volta a tarefa a
`pronta` (o protocolo zera `tentativas`) e despacha o executor com os tetos no "Contexto extra".

## Verificacao


## Conformidade


## Revisao

### Orquestrador (2026-10-02, sessão 3) — o que mudou e o que ainda falta para o disparo

- **O motivo da recusa de 01/10 foi atacado:** T-090 (concluída) põe o Bash de construtor e verificador
  no sandbox do próprio `claude` (`--settings`, `failIfUnavailable`, sem válvula); sem sandbox, o papel
  com Bash não sobe (D-016). Sonda real: `42` dentro da raiz, gravação fora → `Read-only file system`.
  Consequência aceita: o piloto com Bash NÃO roda no Windows nativo — roda no Linux (nuvem) ou WSL2.
- **Parede de cota (cota do plano):** T-091 (concluída) liga a parede ao `Fabrica.Cota` e faz o piloto
  dormir em vez de parar. Os revisores acharam TRÊS furos no mesmo caminho, agora dependências desta:
  **T-094** (laço quente entre `reabre_em` e o rearme), **T-095** (despacho que bateu na parede é
  julgado: construtor vai a `em_teste` vazio, REVISOR aprova sem revisar) e **T-096** (parede conta como
  estagnação; religar ignora o sono salvo).
- **Ainda em aberto:** critério 2 (trilha genérica) — o planejador da trilha genérica não foi despachado
  nesta sessão (etapa 6 do pedido). E o classificador de segurança da sessão pode recusar o disparo de
  novo mesmo com o sandbox: se recusar, NÃO contornar (pedido do Enzo, 02/10).
- **Antes do marco inteiro:** ensaio com teto US$ 10 / 3 rodadas (pedido do Enzo), roteiro no log de
  01/10 ("Roteiro pronto da fase 1").

