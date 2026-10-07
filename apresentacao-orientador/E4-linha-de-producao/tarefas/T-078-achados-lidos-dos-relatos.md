---
id: T-078
titulo: "O portão do revisor lê os achados também do `registrar_resultado` — onde a doutrina manda escrevê-los"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-077]
areas: [lib/fabrica/fila/trabalho.ex, test/fabrica/fila/trabalho_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-01
---

## Objetivo
Fazer `Trabalho.julgar(:revisor, …)` enxergar os achados que o agente revisor escreve no
`registrar_resultado` (campo `resumo`), além dos que escreve no texto das mensagens. Hoje um
achado `[critico] arquivo:linha — problema` escrito SÓ no `resumo` nunca chega a
`Revisor.ler_achados/1`: o portão vê zero achados e aprova em silêncio.

## Contexto
Achado do executor da T-077, confirmado pelo revisor da mesma tarefa (Notas e Revisão de
`T-077-doutrina-formato-conformidade.md`), 2026-10-01:

- `priv/doutrina/revisor.md`, seção "O formato dos achados não é cosmético", manda listar os
  achados **em `resumo`** do `registrar_resultado`.
- `lib/fabrica/fila/trabalho.ex` (~l. 390): `achados = Revisor.ler_achados(relatorio_do_agente(resumo))`
  — lê só os blocos de TEXTO da conversa. A chamada de ferramenta é bloco `:uso_de_ferramenta`
  (`lib/fabrica/operario/claude_cli.ex` ~l. 497), que essa leitura não inclui.
- A CONFORMIDADE já é lida dos relatos (`resumo.relatos` → `RegistrarResultado.formatar_relatos/1`,
  ~l. 385-388, T-075). Os achados ficaram para trás.

Consequência: o caminho de reprovação por achado só funciona se o agente, por acaso, repetir os
achados no texto livre. É a família "sensor sem atuador" do CLAUDE.md da fábrica — a doutrina
manda escrever num lugar que o código não lê.

**O conserto é no LEITOR, não na doutrina.** A doutrina está certa em mandar tudo para o
`registrar_resultado` (é o canal estruturado, e é de onde a conformidade já vem). `ler_achados/1`
passa a ler o texto da conversa E os relatos — as duas fontes, para não quebrar quem hoje escreve
no texto. A doutrina está fora das `areas` desta tarefa: se, ao fim, ela precisar de ajuste para
continuar verdadeira, registre nas Notas — não edite.

Antes de mexer, leia como a conformidade foi ligada aos relatos na T-075 e siga o mesmo caminho
(GUIA, "já existe — não reinvente"): não escreva um segundo formatador de relatos.

## Critérios de aceite
- [ ] Um revisor que escreve um achado `[critico] …` (gravidade de `Revisor.gravidades/0`) SÓ no `resumo` do `registrar_resultado`
      (nada no texto) faz `julgar(:revisor, …)` reprovar, com o achado classificado como o mesmo
      achado escrito no texto seria. Teste novo em `trabalho_test.exs`.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] Achados escritos só no TEXTO das mensagens continuam sendo lidos como hoje (os testes
      existentes de `julgar(:revisor, …)` passam sem alteração de expectativa).
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] Achado repetido nas duas fontes (texto e `resumo`) não muda o veredito em relação a
      aparecer numa só — teste explícito.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] A leitura dos relatos reaproveita o que a T-075 já usa para a conformidade
      (`RegistrarResultado.formatar_relatos/1` ou equivalente existente), sem um segundo
      formatador. (inspecionável — o revisor confere no diff)

## Notas de execução

### Ciclo 1

**O que fiz.** `julgar(:revisor, …)` (`lib/fabrica/fila/trabalho.ex`) passou a ler os achados das
DUAS fontes: o texto de relatos — o MESMO `RegistrarResultado.formatar_relatos/1` que a T-075 já
usava para a conformidade, agora calculado uma vez e entregue a `ler_conformidade/1` e a
`ler_achados/1` — e o texto das mensagens (`relatorio_do_agente/1`), que segue lido como antes.
Concatena e aplica `Enum.uniq/1`: achado idêntico nas duas fontes conta uma vez (o veredito já não
mudaria, porque `Revisor.julgar/2` só pergunta `achados != []`; o `uniq` deixa também a lista
igual). Nenhum formatador novo; `relatorio_do_agente/1` intocado. `@moduledoc` (seção "O
julgamento por papel") e o comentário de `julgar(:revisor, …)` atualizados para dizer o que o
código faz agora.

**Testes (escritos antes, vistos vermelhos).** Três casos novos em
`test/fabrica/fila/trabalho_test.exs`, todos pelo caminho real `Trabalho.executar(id, :revisor)`
com o `OperarioDeTeste`/`Falso` (helper `revisar!/2` devolve `{status de destino, ciclo.desfecho}`):
1. achado só no `resumo` → `{:em_execucao, "defeitos"}`, igual ao mesmo achado só no texto; e a
   leitura campo a campo pelo caminho dos relatos dá `gravidade: :critico`, mesmo arquivo/linha
   que no texto (critério 1);
2. achado só no texto → `{:em_execucao, "defeitos"}`, com contraprova: sem achado em fonte
   nenhuma o mesmo roteiro dá `{:concluida, "aprovado"}` (critério 2; os testes T-075 existentes
   de `julgar(:revisor)` passaram sem alteração);
3. achado nas duas fontes → mesmo resultado que em uma só, comparado com as duas (critério 3).

Vermelho antes do conserto: casos 1 e 3 falharam com `left: {:concluida, "aprovado"}` — o
defeito exato (achado só no `resumo` = aprovação silenciosa); caso 2 já passava (é a guarda de
regressão). Depois: **22 testes, 0 falhas**.

Os blocos de texto vão na volta que PEDE ferramenta (não na resposta final), para entrarem em
`resumo.mensagens` independente da limitação de "turno único" do laço (T-070).

**Gravidade no critério 1.** O critério cita `[critica] …`, mas o parser
(`Revisor.ler_achados/1`, regex `critico|alto|medio|baixo`) e a doutrina (`revisor.md:31`) usam
`critico`. `[critica]` não é lido em fonte NENHUMA (nem no texto) — escrito literalmente, o teste
não reprovaria, nem antes nem depois. Usei `[critico]`, a gravidade máxima real, que é o que o
critério pede no espírito ("classificado como o mesmo achado escrito no texto seria"). Não mexi
no parser (fora das `areas` e do escopo).

**Doutrina.** Não precisa de ajuste para continuar verdadeira: "liste os achados em `resumo`"
(`priv/doutrina/revisor.md`, seção "`registrar_resultado` é o ÚNICO canal") agora é lido. A seção
da T-077 ("linha de conformidade escrita só no texto não chega ao portão") continua exata — a
conformidade segue lida só dos relatos. A assimetria que restou (achado no texto ainda é lido,
conformidade no texto não) é intencional pelo critério 2.

**Prova adicional:** `mix format --check-formatted` nos dois arquivos OK; `MIX_ENV=test mix compile
--warnings-as-errors --force` OK; `mix credo --strict` nos dois arquivos: sem issues. Não rodei a
suíte completa (papel do testador). `ler_achados` só tem este chamador em `lib/` (grep) — não há
outro portão com o mesmo buraco.

**Arquivos:** `lib/fabrica/fila/trabalho.ex`; `test/fabrica/fila/trabalho_test.exs`; este arquivo;
`_gestao/MAPA.md` (regenerado).

**Reproduzir:** `cd /home/user/Generic-Multi-Agents/projetos/fabrica-v2 && mix test test/fabrica/fila/trabalho_test.exs && mix format --check-formatted lib/fabrica/fila/trabalho.ex test/fabrica/fila/trabalho_test.exs && mix credo --strict lib/fabrica/fila/trabalho.ex test/fabrica/fila/trabalho_test.exs`

**Commit:** `d06e6e3`

**Sugestão (fora do escopo, não feita):** o planejador/orquestrador escreve gravidades com o
vocabulário da fábrica-mãe (`critica`/`importante`/`menor`), e o portão desta fábrica só lê
`critico`/`alto`/`medio`/`baixo`. Se um agente revisor real seguir o vocabulário da tarefa em vez
do da doutrina, o achado é ignorado em silêncio (mesma família "sensor sem atuador"). Candidatas:
critério de tarefa sempre com as gravidades de `Revisor.gravidades/0`, ou `ler_achados/1` aceitar
sinônimos — decisão do orquestrador.

### Critério corrigido pelo orquestrador (2026-10-01), antes da verificação

O critério 1 e o Objetivo diziam `[critica]` — vocabulário da fábrica-mãe, escrito de cabeça por
quem criou a tarefa. O parser desta fábrica (`Revisor.gravidades/0`) só lê
`critico|alto|medio|baixo`, como o executor apontou acima. Corrigido para `[critico]`; o teste
entregue já usava a gravidade certa. O resto do critério não mudou.

## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: Um revisor que escreve um achado `[critico]` SÓ no `resumo` do `registrar_resultado` faz `julgar(:revisor, …)` reprovar, com o achado classificado corretamente**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs`
  Saída: 22 tests, 0 failures
  Detalhe: O teste novo valida que achado só no `resumo` → `{:em_execucao, "defeitos"}` com `gravidade: :critico`

- **[PASSOU] [executado] Critério 2: Achados escritos só no TEXTO das mensagens continuam sendo lidos**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs`
  Saída: 22 tests, 0 failures (incluindo testes PRÉ-EXISTENTES de `julgar(:revisor)`; nenhum falhou)

- **[PASSOU] [executado] Critério 3: Achado repetido nas duas fontes não muda o veredito**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs`
  Saída: 22 tests, 0 failures (teste novo valida idempotência: mesmo resultado com achado em uma ou duas fontes)

- **[PASSOU] [inspecionado] Critério 4: Reutiliza `RegistrarResultado.formatar_relatos/1` sem formatador novo**
  Comando: `git show d06e6e3:lib/fabrica/fila/trabalho.ex | grep -A10 "defp julgar(:revisor"`
  Base: Linhas 391 e 395 usam `RegistrarResultado.formatar_relatos(...)` — mesmo que T-075 usa para conformidade (linha 392). Nenhum formatador novo criado. Seção "já existe — não reinvente" do GUIA mantida.

Suíte completa: 23 falhas (mesmas da linha de base de 2026-10-01; 1 falha extra pré-existente em BuscaTest não foi causada por esta tarefa) — `mix test` (1185 tests + 41 doctests)
Graus de prova: 3 executados, 1 inspecionado

## Conformidade

### Ciclo 1

Conformidade: cumpre

- [Critério 1 — achado `[critico]` SÓ no `resumo` reprova, classificado igual ao do texto] →
  `lib/fabrica/fila/trabalho.ex:391-395` (`ler_achados` passa a receber também o texto de
  `formatar_relatos/1`); teste `test/fabrica/fila/trabalho_test.exs:414`, pelo caminho real
  `Trabalho.executar(id, :revisor)`: `{:em_execucao, "defeitos"}`, igual ao mesmo achado no
  texto, e leitura campo a campo idêntica (`gravidade: :critico`, arquivo, linha). Conferi que
  `RegistrarResultado.formatar/1` põe o `resumo` em linha própria (`"## resumo\n<texto>"`), então o
  regex ancorado em `^` de `Revisor.ler_achados/1` casa a primeira linha do resumo também.
- [Critério 2 — achado só no TEXTO continua lido; testes existentes sem mudança de expectativa] →
  `relatorio_do_agente/1` intocado e ainda entra na concatenação (`trabalho.ex:395`); teste
  `trabalho_test.exs:433`, com contraprova (sem achado em fonte nenhuma → `{:concluida,
  "aprovado"}`). O diff só ACRESCENTA testes — nenhuma asserção pré-existente foi editada.
- [Critério 3 — achado nas duas fontes não muda o veredito, teste explícito] →
  `trabalho_test.exs:446`, compara com cada fonte isolada; `Enum.uniq/1` em `trabalho.ex:395`
  (o veredito já não mudaria, pois `Revisor.julgar/2` só pergunta `achados != []`).
- [Critério 4 — reaproveita o formatador da T-075, sem segundo formatador] →
  `trabalho.ex:391`: UMA chamada a `RegistrarResultado.formatar_relatos/1`, cujo resultado
  alimenta `ler_conformidade/1` (l. 392) e `ler_achados/1` (l. 395). Nenhum formatador novo no diff.

**Objetivo (espírito):** cumprido. O sintoma nomeado — achado escrito só no `resumo`, como manda
`priv/doutrina/revisor.md` ("liste os achados no formato acima" em `resumo`), virando zero achados
e aprovação silenciosa — está fechado, e o conserto foi no LEITOR, como o Contexto exigia; a
doutrina não foi tocada e continua verdadeira (conferi a seção "`registrar_resultado` é o ÚNICO
canal").

**Escopo/áreas:** o diff toca só as duas `areas` declaradas, mais o arquivo da tarefa e o
`MAPA.md` regenerado (gestão). Nada fora de escopo. Sem interface — prova visual não se aplica.

**Gravidade no critério 1:** julgado contra o texto atual (`[critico]`, corrigido pelo orquestrador
em `df3e300`); o teste entregue já usava `[critico]`. A sugestão do executor (vocabulário
`critica`/`importante` da fábrica-mãe ignorado em silêncio pelo parser desta) é real e fica para o
orquestrador decidir — não é pendência desta tarefa.

## Revisão

### Ciclo 1

Aprovado sem ressalvas de gravidade `critica`/`importante`.

O que verifiquei (diff de `d06e6e3`, hash gravado nas Notas — sem busca):
- **Correção:** `relatos` calculado uma vez e reutilizado; `Map.get(resumo, :relatos, [])` mantém o
  padrão `[]` da versão anterior; `formatar_relatos([])` devolve `""` → `ler_achados("")` = `[]`,
  sem regressão quando o agente não chama `registrar_resultado`. A conformidade segue idêntica
  (mesma entrada que antes).
- **`Enum.uniq/1`:** os mapas de achado (`gravidade/arquivo/linha/problema`) saem iguais das duas
  fontes — o regex absorve `-`/`*` iniciais e espaço final, e o teste `trabalho_test.exs:429`
  prova a igualdade. Colapsar duplicata idêntica dentro de uma mesma fonte também não muda o
  veredito (`julgar/2` só olha `achados != []`).
- **Integração:** `ler_achados/1` tem este único chamador em `lib/` (como o executor anotou);
  `julgar/2` e a doutrina tratam qualquer gravidade como reprovação — comportamento que já valia
  para o texto, agora estendido ao `resumo`, que é exatamente o que o critério 1 pede.
- **Falso positivo:** a linha `[conformidade] …` que também vive nos relatos não casa o regex de
  achado (exige `critico|alto|medio|baixo`); campos-lista viram `- item`, que o regex aceita sem
  confundir com achado.
- **Testes:** pelo caminho real (`Trabalho.executar/2` + `Operario.Falso`), blocos na volta que pede
  ferramenta para escapar da limitação de turno único (T-070) — escolha correta e documentada.

Arquivos abertos além do diff, e por quê: `lib/fabrica/portoes/revisor.ex` (regex de `ler_achados`
e `julgar/2`, para confirmar que a primeira linha do `resumo` casa e que o `uniq` não muda o
veredito), `lib/fabrica/ferramentas/registrar_resultado.ex` (`formatar/1`, para ver como o `resumo`
é emoldurado) e `priv/doutrina/revisor.md` (para confirmar que a doutrina continua verdadeira).

Notas `menor` (não reprovam):
- [menor] test/fabrica/fila/trabalho_test.exs:678 — os helpers novos (`revisar!/2`, `registrar/1`,
  `texto/1`) foram inseridos ENTRE o comentário de `contar_consumos/1` ("Conta as linhas de
  `consumos`…") e a função; o comentário agora fica pendurado em cima de `revisar!/2`, descrevendo a
  função errada.
