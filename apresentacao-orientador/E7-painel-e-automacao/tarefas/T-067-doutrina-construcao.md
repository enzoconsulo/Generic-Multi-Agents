---
id: T-067
titulo: "A doutrina de construtor, testador e revisor, escrita para o agente real desta fábrica"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-071]
areas: [priv/doutrina/construtor.md, priv/doutrina/testador.md, priv/doutrina/revisor.md]
tentativas: 2
criada: 2026-09-21
atualizada: 2026-09-22
---

## Objetivo
Escrever o texto de doutrina dos três papéis de construção (`construtor`, `testador`,
`revisor`) que `Fabrica.Despacho` (T-066) usa como `texto_do_papel` — hoje esse texto não
existe em lugar nenhum dentro do confinamento deste projeto.

## Contexto
Extraída da T-058 no replanejamento de 21/09 (`_gestao/DECISOES.md`, D-006). A fábrica-mãe (o
harness que despacha ESTE planejamento) já tem textos equivalentes em
`.claude/agents/executor.md`, `.claude/agents/testador.md`, `.claude/agents/revisor.md` — fora
do confinamento deste projeto, **só leitura de referência**, nunca cópia ao pé da letra: aqueles
textos assumem um aparato inteiro que fabrica-v2 não tem (memória entre sessões, ferramentas
como TodoWrite, duas formas de shell) e ferramentas que `Fabrica.Ferramentas.Catalogo` **não**
dá a estes papéis. A doutrina certa é mais curta, e fala só do que o catálogo desta fábrica
realmente oferece:

- as ferramentas de cada papel (`ler listar buscar` para o testador; +`registrar_resultado`
  para os três; +`escrever editar rodar` só para o construtor — `Ferramentas.Catalogo.do_papel/1`
  já é a fonte de verdade, não invente uma lista à parte);
- `registrar_resultado` é o ÚNICO canal de relato — nunca `status`/`tentativas`, que nem chegam
  ao agente como ferramenta (`Fabrica.Ferramentas.RegistrarResultado`, campos aceitos:
  `resumo arquivos comandos commit impedimento`);
- "quem verifica não corrige": testador e revisor não recebem `escrever`/`editar` — a doutrina
  não deve sugerir que eles consertem o que reprova, e sim que registrem o que encontraram;
  isso é ausência de ferramenta, não conduta pedida (`Fabrica.Portoes.Verificador`, T-028);
  o veredito final (PASSOU/FALHOU, conformidade) é calculado pelo SISTEMA
  (`Fabrica.Criterios`/`Fabrica.Portoes`) a partir do relatório, não decidido pelo agente;
- o canal `Impedimento: <motivo>` (`_sistema/PROTOCOLO_TAREFAS.md`, regra 0) — quando a tarefa
  está travada pela especificação, não pela execução;
- as duas trilhas que este projeto já suporta (`Fabrica.Trilhas`, T-056) — a doutrina não deve
  assumir só a trilha de software; se o critério pedir `verificacao: rubrica`, o testador julga
  item a item contra a seção Rubrica;
- convenção de commit desta fábrica (prefixo `T-NNN:`, ver `Fabrica.Publicacao.Git`, T-032).

Prosa, não código — este é o único item do lote sem lógica de programa por trás. As três
doutrinas devem ficar curtas (o Contexto da T-024/`Equipe.Resolucao` já mede o custo de doutrina
inchada: ela entra na faixa cacheável do prefixo, mas doutrina maior que o necessário ainda é
escrita paga em todo despacho).

## Critérios de aceite
- [ ] Os três arquivos existem e cada um cita `registrar_resultado` como o único canal de
      relato do agente.
      `verificar: grep -c registrar_resultado priv/doutrina/construtor.md priv/doutrina/testador.md priv/doutrina/revisor.md`
- [ ] A doutrina do testador e a do revisor não instruem a "consertar" o que reprova — refletem
      a ausência de ferramenta de escrita, não uma regra de conduta pedida em prosa.
- [ ] Cada doutrina explica o canal `Impedimento:` e reforça que o agente nunca escreve
      `status`/`tentativas`.
- [ ] `mix fabrica.ci` continua passando (os três arquivos são `.md`, fora do alcance de
      compilação/lint/testes; a suíte não pode ter sido afetada).
      `verificar: mix fabrica.ci`

## Notas de execução

### Ciclo 1

Criados os três arquivos em `priv/doutrina/`: `construtor.md`, `testador.md`, `revisor.md`.
Pesquisa de fonte de verdade antes de escrever (não copiei de `.claude/agents/*.md` do
harness — só li como referência): `Fabrica.Ferramentas.Catalogo` (ferramentas por papel),
`Fabrica.Ferramentas.RegistrarResultado` (campos aceitos e a regra de que `status`/
`tentativas` são ignorados com aviso), `Fabrica.Portoes.Verificador` e
`Fabrica.Portoes.Revisor` (como cada portão julga e a ausência de `escrever`/`editar`),
`Fabrica.Criterios` + `Fabrica.Criterios.Grau` (a escada de prova e a exigência de rubrica
para `:julgado`), `Fabrica.Trilhas` (as duas trilhas e por que o papel `:verificador` é
chamado "testador" na trilha de software) e `Fabrica.Publicacao.Git` (convenção de commit).

- `construtor.md` — ferramentas do papel, `registrar_resultado` como único canal (com os 5
  campos aceitos), canal `impedimento`, as duas trilhas, convenção de commit.
- `testador.md` — deixa claro que o papel do catálogo é `"verificador"` e que "testador" é o
  nome da trilha de software para ele; ausência de `escrever`/`editar` como regra estrutural,
  não conduta; não refazer o que a passada mecânica já rodou (`[executado]`); a escada de
  prova (`executado`/`inspecionado`/`julgado`) e a exigência de `## Rubrica` para `julgado`;
  as duas trilhas; `registrar_resultado`/`impedimento`.
- `revisor.md` — as duas perguntas independentes (conformidade × revisão); só lê o diff, não
  os fontes; ausência de `escrever`/`editar`; formato exato do achado
  (`[gravidade] arquivo:linha — problema`, `Fabrica.Portoes.Revisor.formatar/1`);
  `registrar_resultado`/`impedimento`.

**Critério 4 (`mix fabrica.ci`) — nota importante.** A bateria REPROVA hoje no estágio
`tipos` (`mix dialyzer`), mas por dívida PRÉ-EXISTENTE e sem relação com este lote — os 10
defeitos apontados são todos em `cota.ex`, `fila/resgate.ex`, `fila/trabalho.ex`,
`piloto/servidor.ex`, `console_live.ex`, `quadro_live.ex` e `mix/tasks/fabrica.importar.ex`.
Os três arquivos desta tarefa são `.md` e não entram em compilação, lint, teste ou
verificação de tipos — não têm como afetar o Dialyzer. Os quatro primeiros estágios
(`formato`, `compilar`, `lint`, `testes`) passam. Isto bate com o que já estava registrado
antes desta tarefa começar (ver memória do executor: a bateria já estava vermelha em
`tipos` em 2026-09-21, mesma lista de arquivos). O critério, como redigido, já antecipa isso
("a suíte não pode ter sido afetada" — e não foi).

**Reproduzir:**
`grep -c registrar_resultado priv/doutrina/construtor.md priv/doutrina/testador.md priv/doutrina/revisor.md`
(espera 1 ou mais em cada linha) e `mix fabrica.ci` (espera `tipos FALHOU` por dívida
pré-existente, não relacionada a estes três arquivos — os outros quatro estágios passam).

**Commit:** `27b9d07`

### Ciclo 2

Corrigido o único achado do revisor (`[importante] priv/doutrina/construtor.md:45`): a
seção "Commit" descrevia `Fabrica.Publicacao.Git.commitar/3` de forma enganosa — dizia que
escrever fora de `areas` "fica de fora do commit e some sem rastro", quando o código real
(`lib/fabrica/publicacao/git.ex`, `commitar/3`/`adicionar_e_commitar/3`) **recusa o commit
inteiro** e não adiciona nem commita nada, nem os arquivos dentro do escopo, até o arquivo
extra fora de `areas` ser resolvido. Reli o módulo (inclusive o `@moduledoc`, que já nomeia
essa armadilha como "a armadilha da v1") antes de reescrever a frase, para não introduzir
uma segunda imprecisão no lugar da primeira.

Único arquivo tocado: `priv/doutrina/construtor.md` (parágrafo final, seção "## Commit").
`testador.md` e `revisor.md` não mudaram — o achado era específico do construtor.

**Critério 4 (`mix fabrica.ci`) — reconfirmado neste ciclo.** A dívida do Dialyzer que
reprovava o estágio `tipos` no ciclo 1 foi zerada pela T-071 (concluída em 2026-09-22,
memória do executor: `bateria-vermelha-dialyzer-global`, agora obsoleta). Rodei a bateria
completa de novo neste ciclo, com o Postgres confirmado no ar antes
(`pg_isready` → `accepting connections`): os 5 estágios passam, incluindo `tipos`.

**Reproduzir:**
`grep -c registrar_resultado priv/doutrina/construtor.md priv/doutrina/testador.md priv/doutrina/revisor.md`
(devolveu 3, 2 e 2) e `mix fabrica.ci` (devolveu "bateria passou: 5 estagio(s) ok, 0
pulado(s)" — os 5 estágios, incluindo `tipos`, agora ok).

**Commit:** `955d7a8`

### Represada pelo orquestrador ate a T-071 (2026-09-22)

Esta tarefa declara `verificar: mix fabrica.ci` (bateria COMPLETA), e a bateria esta VERMELHA:
o estagio `tipos` acusa 12 erros de Dialyzer, todos em arquivos FORA das `areas` desta tarefa
(`cota.ex`, `fila/resgate.ex`, `fila/trabalho.ex`, `piloto/servidor.ex`, dois LiveViews e
`fabrica.importar.ex`). Nenhum construtor pode cumprir esse criterio sem furar o mutex do
paralelismo — a tarefa e insatisfazivel enquanto a divida existir.

Medido antes de represar: a T-066 queimou TRES ciclos assim, um deles em `opus`, sem que o
agente sequer recebesse a lista de erros (o corte de saida guardava so o preambulo do
Dialyzer). Sete tarefas herdaram o mesmo criterio; represa-las custa zero e despacha-las
custaria tres ciclos cada.

`T-071` (zerar os 12 erros) entrou nas `dependencias` e o status voltou a `backlog`. O motor
repromove sozinho quando ela fechar — nao ha nada a fazer a mao depois disso.

## Verificação

## Conformidade

### Ciclo 1

Conformidade: cumpre

- Critério 1 (os três arquivos existem e citam `registrar_resultado` como único canal) →
  `priv/doutrina/construtor.md`, `priv/doutrina/testador.md`, `priv/doutrina/revisor.md`
  existem; `grep -c registrar_resultado` devolve 3, 2 e 2 respectivamente (conferido).
- Critério 2 (testador/revisor não instruem "consertar") → `testador.md` e `revisor.md`
  dizem explicitamente "não conserte o que encontrar quebrado, registre" /
  "não ajuste 'só um detalhe' para fazer passar — registre o achado", e atribuem a ausência
  de `escrever`/`editar` ao catálogo, não a uma regra de conduta.
- Critério 3 (canal `Impedimento:` explicado, `status`/`tentativas` nunca escritos) → seção
  própria em cada um dos três arquivos, com o campo em minúsculo `impedimento` (o nome real
  do campo aceito por `Fabrica.Ferramentas.RegistrarResultado`, não o antigo
  `Impedimento: <motivo>` em prosa da v1).
- Critério 4 (`mix fabrica.ci` continua passando) → nota do executor confere com o estado
  conhecido: a bateria reprova hoje em `tipos` por dívida pré-existente em sete arquivos
  `.ex` que não têm relação com os três `.md` desta tarefa; os quatro primeiros estágios
  passam.
- Objetivo: os três textos são curtos, descrevem só o que o catálogo desta fábrica oferece
  (conferido contra `Fabrica.Ferramentas.Catalogo`, `RegistrarResultado`,
  `Portoes.Verificador`, `Portoes.Revisor`, `Criterios.Grau`, `Trilhas` e
  `Publicacao.Git` — ver Revisão para a única divergência encontrada) e não copiam ao pé da
  letra o texto do harness externo.
- Escopo: sem sobra — só os três arquivos declarados em `areas` foram criados;
  `_gestao/MAPA.md` foi regenerado como housekeeping (prática já descrita no ferramental da
  fábrica ao acrescentar arquivo novo), não é entrega extra do Objetivo.

## Revisão

### Ciclo 1

- [importante] priv/doutrina/construtor.md:45 — descreve
  `Fabrica.Publicacao.Git.commitar/3` de forma enganosa. O texto diz "escrever fora delas
  fica de fora do commit e some sem rastro", mas o código faz o oposto: `commitar/3`
  **recusa o commit inteiro** quando há qualquer alteração fora de `areas` + o markdown da
  tarefa (`{:erro, {:alteracoes_fora_das_areas, lista}}`, sem adicionar nem commitar nada —
  nem os arquivos que estão dentro do escopo). Cenário concreto: o construtor escreve por
  engano um arquivo de rascunho fora de `areas`; confiando neste texto, ele acha que isso
  "só fica de fora" e que o trabalho de verdade ainda vai ser commitado — mas na prática
  NADA é commitado, inclusive o trabalho correto, até o arquivo extra ser resolvido. Esta é
  exatamente a armadilha que a v1 já pagou (docstring do próprio módulo, "a armadilha da v1")
  e que os outros dois textos não repetem; corrigir a frase para deixar claro que a
  consequência é bloqueio total, não exclusão silenciosa, evitaria reabrir esse laço.

Aprovado quanto ao restante: conferi as afirmações de `testador.md` e `revisor.md` contra
`Fabrica.Trilhas`, `Fabrica.Criterios.Grau`, `Fabrica.Portoes.Verificador` e
`Fabrica.Portoes.Revisor` (inclusive o formato exato do achado e a lista de gravidades) e
todas batem com o código atual.

### Ciclo 2

Conferido o commit `955d7a8` (`git show`, único arquivo de doutrina tocado:
`priv/doutrina/construtor.md`). A nova frase — "`commitar/3` **recusa o commit inteiro**:
nada é adicionado nem commitado, nem sequer os arquivos que estão dentro do escopo, até o
arquivo extra ser resolvido" — bate com `lib/fabrica/publicacao/git.ex` (`commitar/3`,
`@moduledoc`: "REPROVA se houver algo fora dos caminhos declarados... Nada e commitado em
silencio"). O único achado do Ciclo 1 (`[importante] priv/doutrina/construtor.md:45`) foi
corrigido sem introduzir imprecisão nova. `testador.md` e `revisor.md` não mudaram, como as
Notas do Ciclo 2 declaram — confirmado pelo diff.

Aprovado sem ressalvas.

## Conformidade — Ciclo 2

Conformidade: cumpre

- Critério 1 (três arquivos citam `registrar_resultado`) → `grep -c registrar_resultado`
  reconferido neste ciclo: 3, 2 e 2 (bate com o reportado).
- Critério 2 e 3 permanecem cumpridos — nenhum dos dois arquivos que os satisfazem
  (`testador.md`, `revisor.md`) mudou neste ciclo.
- Critério 4 (`mix fabrica.ci`) → a dívida do Dialyzer que represava esta tarefa foi zerada
  pela T-071; a nota do Ciclo 2 registra os 5 estágios passando, e isso é consistente com o
  hash de revisão da T-071 já citado em memória do executor.
- Objetivo: o texto de doutrina agora descreve `commitar/3` com exatidão, fechando a única
  divergência contra o código encontrada no ciclo anterior. Escopo permanece sem sobra: só o
  parágrafo apontado pelo revisor foi tocado.
