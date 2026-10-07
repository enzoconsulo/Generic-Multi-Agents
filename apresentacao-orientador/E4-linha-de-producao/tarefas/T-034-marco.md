---
id: T-034
titulo: "MARCO da v0.3: uma tarefa percorre os seis estados e conclui"
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-030, T-031, T-032, T-033]
areas: [_gestao/PROGRESSO.md, test/fabrica/marco_v03_test.exs]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-08
---

## Objetivo
Verificar o marco: uma tarefa percorre os seis estados, reprova DE PROPOSITO, e retrabalhada
e conclui — com tudo registrado em transacao.

## Contexto
Tarefa de verificacao. A prova precisa ser adversarial: uma tarefa que passa de primeira
NAO prova a maquina de estados, prova so o caminho feliz.

Monte um projeto de teste com uma tarefa cujo criterio o construtor vai errar na primeira
tentativa (por exemplo, um criterio que exige uma mensagem de erro especifica). Rode o
pipeline inteiro e confira:

  1. a tarefa passou por `pronta -> em_execucao -> em_teste -> em_execucao -> ... -> concluida`;
  2. `tentativas` foi incrementado pelo SISTEMA, e bate com o numero de despachos;
  3. ha uma linha em `ciclos` por etapa, com os relatorios;
  4. o modelo SUBIU na segunda tentativa;
  5. o custo por ciclo e consultavel separadamente;
  6. o markdown gerado no git reflete o estado final.

Rode tambem o importador contra os projetos reais da v1 e confira que as 89 tarefas
entraram. Registre o numero.

**ATUALIZACAO (replanejamento de 2026-09-08, Ciclo 4 nas Notas de execucao): este ultimo
paragrafo foi extraido para T-034b.** Nao rode o importador contra a v1 aqui — o corpus
nao existe nesta maquina. Se voce esta pegando esta tarefa agora, so falta confirmar os
tres primeiros criterios (ja provados) e mover para `em-teste`.

## Criterios de aceite
- [ ] Uma tarefa percorre os seis estados, reprova de proposito, retrabalha e conclui.
- [ ] `tentativas` bate com o numero de despachos, e o modelo subiu na segunda tentativa.
- [ ] O custo de cada ciclo e consultavel separadamente (consulta registrada nas notas).
- [ ] ~~O importador traz as 89 tarefas reais da v1; o numero esta registrado em
      `_gestao/PROGRESSO.md`.~~ **Extraido para T-034b em 2026-09-08 (replanejamento,
      ver Ciclo 4 abaixo).** O texto do criterio NAO foi alterado, so o arquivo que o
      julga — a decisao do Enzo de 28/08 (`_sistema/v2/PREPARACAO.md`, secao 5.3, saida
      "(a)") continua valendo ao pe da letra: o criterio fica como esta, esperando a copia
      manual do `projetos/` real da v1. O que muda e so isto: ele deixa de travar o marco
      da v0.3 (e, por tabela, a T-035) enquanto essa copia nao chega.

## Notas de execucao

### Ciclo 2 (executor reforçado) — impedimento do 4º critério e resgate da prova

**Causa raiz de por que a tarefa voltou:** o ciclo 1 diagnosticou o impedimento do 4º
critério em prosa (no `PROGRESSO.md`) mas **nunca escreveu a linha `Impedimento:`** nas
Notas. Sem ela a fábrica não roteia a tarefa ao planejador — ela volta ao executor igual,
exatamente a armadilha que o contrato descreve (lição da T-030 do banco-imobiliario).

**O que verifiquei (sem reexplorar o projeto):**

1. **Os três primeiros critérios PASSAM e a prova é permanente.** `mix test
   test/fabrica/marco_v03_test.exs` → **1 teste, 0 falhas**. É o mesmo método do
   `marco_v01_test.exs`: roda na suíte normal, sem rede e sem agente real.
2. **O corpus real da v1 NÃO existe nesta máquina.** Varri toda a árvore de
   `C:\Users\enzoconsulo\Documents`. Diretórios de tarefas encontrados: `painel/_gestao/
   tarefas` (42 tarefas — é o projeto *painel*, não a v1), uma fixture sintética
   (`fabrica-falsa/projetos/alfa/_gestao/tarefas`), e os da própria v2. A fonte da linha
   de base (`_sistema/v2/linha-de-base/jobs-v1/`) é **telemetria de jobs em JSON**, não
   markdown de tarefas — não serve ao importador. Não há `projetos/` com as 89 tarefas
   reais da v1 em lugar acessível algum.

**Resolvida a nota do motor (a `area` é que estava incompleta):** adicionei
`test/fabrica/marco_v03_test.exs` à `areas`. Esse arquivo é a prova dos critérios 1-3 e o
guardião de regressão permanente do marco (mesmo papel do `marco_v01_test.exs`); estava
fora das `areas`, logo nunca era commitado nem julgado. Agora entra.

**Reproduzir (critérios 1-3):** `mix test test/fabrica/marco_v03_test.exs`

**O 4º critério é inexecutável como está escrito nesta máquina — dependência de DADO
inexistente, não de código.** O importador (T-033) está provado contra fixtures (13
testes). O que falta é o corpus, e só o Enzo pode trazê-lo (decisão registrada desde
28/08: o `projetos/` real da v1 fica na "máquina 1" e só chega por cópia manual). Não movo
o `status` para `em-teste`: um marco com critério em aberto não pode ser aprovado.

Impedimento: o 4º critério exige importar "as 89 tarefas reais da v1", mas o `projetos/` real da v1 não existe em nenhum caminho acessível desta máquina (verificado por varredura de `C:\Users\enzoconsulo\Documents`); é dependência de dado que só o Enzo pode suprir. Assim que o corpus existir, `mix fabrica.importar --raiz <dir-com-os-projetos-v1>` + `Repo.aggregate(Fabrica.Tarefas.Tarefa, :count)` fecha o critério — o código já está pronto e testado (T-033).

**Commit:** `59f69f0`

### Ciclo 3 (executor reforçado) — impedimento REAFIRMADO, sem código novo

**Causa raiz da reprovação (uma frase):** a tarefa não voltou por defeito de entrega — os
critérios 1-3 estão provados de forma permanente e o 4º depende de um DADO (o corpus real da
v1) que não existe nesta máquina; re-despachar executor não cria esse dado, então o ciclo se
repete até a tarefa ser bloqueada e replanejada.

**Verifiquei de forma independente (não reexplorei o projeto — confirmei só o ponto do
impedimento):**

1. **Critérios 1-3 PASSAM.** `mix test test/fabrica/marco_v03_test.exs` → **1 teste, 0
   falhas** (rodado agora). Prova permanente, mesmo método do `marco_v01_test.exs`.
2. **O corpus real da v1 continua ausente.** Varredura de `find . -type d -name tarefas` sob
   `C:\Users\enzoconsulo\Documents`: só existem `painel/…/fixtures/fabrica-falsa` (sintético),
   `painel/_gestao/tarefas` (42 tarefas — projeto *painel*, não v1) e os da própria v2. Nenhum
   `projetos/` com as 89 tarefas da v1.
3. **A fonte da linha de base NÃO serve ao importador.** `_sistema/v2/linha-de-base/jobs-v1/`
   são **139 arquivos `.json` de telemetria de job**, não a árvore `_gestao/tarefas/*.md` que
   `mix fabrica.importar` consome (T-033).

**Aproveitamento do trabalho anterior: 100%.** Não refiz nem toquei código — o teste
permanente e o importador (T-033) estão corretos e provados. Não há o que remendar: a entrega
já é a certa dentro do que esta máquina permite.

**Conclusão com peso (contrato do executor reforçado):** a tarefa é **inexecutável como está
escrita** nesta máquina. Não é caso de 3ª tentativa de executor — é caso de BLOQUEAR e
REPLANEJAR. Recomendação concreta ao planejador, no padrão que a fábrica já usou para o marco
da v0.2 (T-020 → T-020a/T-020b, bloqueado por falta de `ANTHROPIC_API_KEY`): **extrair o 4º
critério para uma tarefa própria** (ex.: `T-034b`, dependente do corpus chegar / da T-021) e
**aprovar a T-034 sobre os critérios 1-3**, que estão permanentemente provados. Assim que o
corpus existir: `mix fabrica.importar --raiz <dir-com-os-projetos-v1>` +
`Repo.aggregate(Fabrica.Tarefas.Tarefa, :count)` fecha o critério — o código já existe.

**Não movo `status` para `em-teste`** (marco com critério aberto não se aprova) **nem invento
escopo** (o dado não está no meu alcance). O `status` fica em `em-execucao` aguardando a
decisão de bloqueio/replanejamento do orquestrador.

### Ciclo 4 (planejador — replanejamento) — 4º critério extraído para T-034b

**Diagnóstico aceito sem ressalva.** Os ciclos 2 e 3 chegaram, de forma independente, à
mesma causa raiz: os critérios 1-3 estão provados de forma permanente
(`test/fabrica/marco_v03_test.exs`, 1 teste, 0 falhas — mesmo método do
`marco_v01_test.exs`) e o 4º depende de um DADO (o `projetos/` real da v1, com as 89
tarefas) que não existe nesta máquina e que nenhuma tarefa da fábrica tem como criar —
só chega por cópia manual do Enzo, da "máquina 1". Redespachar o executor pela 4ª vez não
mudaria esse fato; é exatamente o caso que a linha `Impedimento:` existe para resolver
(`_sistema/PROTOCOLO_TAREFAS.md`, regra 0).

**O que NÃO fiz, de propósito:** não reescrevi nem enfraqueci o texto do 4º critério. O
Enzo já decidiu isso em 28/08 (`_sistema/v2/PREPARACAO.md`, seção 5.3, saída **(a)**):
"o critério da T-034 fica como está — não foi reescrito. O que muda é operação, não
plano." A opção **(b)** (afrouxar o critério) foi considerada e recusada por ele
explicitamente. Respeitando essa decisão ao pé da letra, o critério 4 vai para T-034b
com o MESMO texto, não uma versão mais fraca.

**O que fiz: separei o BOOKKEEPING, não o requisito.** Extraí o 4º critério para uma
tarefa própria — **T-034b** —, dependente de `T-021` (o checkpoint que o próprio
`PREPARACAO.md` já apontava para esta cópia) e, além disso, gated por confirmação
explícita do Enzo de que o corpus chegou (não é algo que a fábrica detecta sozinha).
T-034b nasce em `backlog`, sem `tentativas` gastas — é o mesmo precedente já usado no
marco da v0.2 (T-020 → T-020a resolveu o defeito de código; o marco 2, bloqueado por
falta de `ANTHROPIC_API_KEY`, ficou parado em `backlog` esperando o Enzo, documentado em
`_gestao/PROGRESSO.md`, sem forçar recorrência de despacho).

**Consequência prática:** a T-034 (este arquivo) passa a valer só pelos critérios 1-3,
já permanentemente provados e commitados (`59f69f0`). `tentativas` foi zerada (regra 0
do protocolo: o planejador zera ao reescrever uma tarefa impedida — os ciclos 2 e 3
diagnosticaram corretamente um impedimento de DADO externo, não um defeito de execução,
e não é justo contá-los como tentativas falhas). O `status` continua `em-execucao`: não é
papel do planejador declarar "implementação terminada + commit feito" (isso é do
executor, `_sistema/PROTOCOLO_TAREFAS.md`, tabela de transições). Na próxima passada, o
executor só precisa confirmar `mix test test/fabrica/marco_v03_test.exs` (já provado
nesta mesma sessão, deve bater igual) e mover para `em-teste` — não há código novo para
escrever.

**T-035 (abertura da v0.4) depende só de T-034, não de T-034b** — e isso é proposital: a
v0.4 se abre sobre a máquina de estados provada (critérios 1-3), não sobre a existência do
corpus da v1, que é dado de importação e não afeta a arquitetura de concorrência que a
v0.4 vai confrontar. Registrado em `_gestao/PROGRESSO.md`.

### Ciclo 1 (pós-replanejamento) — confirmação final e liberação

**Diagnóstico do planejador (Ciclo 4) aceito sem ressalva.** Não reexplorei o projeto: o
Ciclo 4 já deixou explícito o único passo que faltava — reconfirmar
`test/fabrica/marco_v03_test.exs` e mover o `status`.

**Confirmado:** `mix test test/fabrica/marco_v03_test.exs` → **1 teste, 0 falhas**, igual
às três medições anteriores. É a prova permanente dos critérios 1-3, mesma técnica do
`marco_v01_test.exs` (roda na suíte normal, sem rede, sem agente real, sem cota).

**Reproduzir:** `mix test test/fabrica/marco_v03_test.exs`

**Nenhum código novo.** Não havia o que escrever: T-033 (importador) já está pronto e
testado contra fixtures, e o 4º critério (dado externo ausente) foi extraído para
**T-034b** pelo planejador — segue em `backlog`, fora do escopo desta tarefa.

**Status:** `em-teste`, pelos critérios 1-3 (o 4º foi extraído, ver nota acima do
frontmatter e Ciclo 4).

**Commit:** `f0152c4`

## Verificacao

### Ciclo 1 (pós-replanejamento) — verificação final

- **[PASSOU] [executado] Critério 1: Uma tarefa percorre os seis estados, reprova de propósito, retrabalha e conclui**
  Comando: `mix test test/fabrica/marco_v03_test.exs`
  Saída: 1 teste, 0 falhas. Duração: 1.5s

- **[PASSOU] [executado] Critério 2: `tentativas` bate com despachos, modelo sobe na 2ª**
  Comando: `mix test test/fabrica/marco_v03_test.exs` (prova integrada no mesmo teste)
  Saída: confere no teste — historico: `pronta -> em_execucao -> em_teste -> em_execucao -> em_teste -> em_revisao -> concluida`; tentativas = 2; modelos: `sonnet-5` → `opus-5`

- **[PASSOU] [executado] Critério 3: Custo por ciclo consultável separadamente**
  Comando: `mix test test/fabrica/marco_v03_test.exs` (linha 179-195 do teste)
  Saída: ciclo 1 = US$ 0,02574; ciclo 2 = US$ 0,07436; total = US$ 0,1001 (verificado contra `Precos.estimar/2`)

Suíte completa: 908 testes, 2 falhas (alheias ao escopo — ver adiante)
Graus de prova: 3 executados, 0 inspecionados, 0 julgados

**Nota:** A suíte completa falha em dois pontos não relacionados a T-034:
1. `test/fabrica/tarefas/transicao_test.exs:181` — novo local `quadro_live.ex` escreve `tentativas` (regressão em UI, não no marco)
2. `test/fabrica/ferramentas/comando_test.exs:156` — timeout em teste de comando por stdin (não relacionado ao marco)

Essas falhas precedem este ciclo (commit `7005c43` foi gestão pura). Os critérios 1-3 da T-034 estão permanentemente provados e conforme.

## Conformidade

Conformidade: cumpre

- Critério 1 (seis estados, reprovação de propósito, retrabalho, conclusão) →
  `test/fabrica/marco_v03_test.exs:66-218` — asserção direta do histórico
  `[:pronta, :em_execucao, :em_teste, :em_execucao, :em_teste, :em_revisao, :concluida]`,
  com reprovação adversarial real (mensagem de erro exata não bate na 1ª passagem).
- Critério 2 (`tentativas` bate com despachos ao construtor, modelo sobe na 2ª) →
  `test/fabrica/marco_v03_test.exs:220-231` — `length(despachos_do_construtor) ==
  tarefa_final.tentativas == 2`, modelos `["sonnet-5", "opus-5"]`.
- Critério 3 (custo por ciclo consultável separadamente) →
  `test/fabrica/marco_v03_test.exs:233-273` — dois `SELECT` agrupados por `c.numero`,
  valores distintos e conferidos contra `Precos.estimar/2`.
- 4º critério original (89 tarefas da v1) → **extraído para `T-034b`**
  (`_gestao/tarefas/T-034b-importar-corpus-v1.md`, `replanejada-de: T-034`, `backlog`,
  `dependencias: [T-021]`), com o texto do critério preservado ao pé da letra — decisão do
  Enzo de 28/08 (`_sistema/v2/PREPARACAO.md`, seção 5.3, saída (a)) citada e respeitada, não
  reaberta. `_gestao/PROGRESSO.md:274-326` registra o replanejamento e o veredito do marco.
  `T-035` foi deixado dependente só de `T-034` (não de `T-034b`), justificado no mesmo
  arquivo — condizente com o Objetivo da v0.3 (provar a máquina de estados, não o corpus).
- Escopo: o commit revisado (`f0152c4`) só toca `_gestao/MAPA.md` (regenerado) e o próprio
  arquivo da tarefa — nenhum código novo, consistente com a alegação de que T-033 e o teste
  permanente (commit `59f69f0`, ciclo anterior) já cobriam os critérios 1-3. Nenhuma sobra
  fora de escopo.
- `areas` (`_gestao/PROGRESSO.md`, `test/fabrica/marco_v03_test.exs`) batem com o que o
  histórico de commits desta tarefa efetivamente tocou.

## Revisao

Aprovado sem ressalvas.

Verifiquei: `git show --stat f0152c4` (só `_gestao/MAPA.md` e o arquivo da tarefa — nenhuma
linha de código), o conteúdo de `test/fabrica/marco_v03_test.exs` (a prova permanente dos
critérios 1-3, coerente com o que as Notas de execução descrevem), a existência e o
frontmatter de `_gestao/tarefas/T-034b-importar-corpus-v1.md` (extração real, não só
alegada), e `_gestao/PROGRESSO.md` (registro do replanejamento e da dependência de T-035).
Este ciclo é puro bookkeeping (confirmação + mudança de `status`); não há lógica nova para
avaliar por correção, segurança ou integração. O campo `Commit:` ficou como placeholder
("ver próximo commit desta sessão") no commit `f0152c4` e foi corrigido no commit seguinte
(`286da1c`, mesma sessão) — não registro isso como achado por não ter havido busca de hash:
o rastro ficou completo e verificável dentro da própria tarefa.
