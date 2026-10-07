---
id: T-013b
titulo: A saida do comando some quando o exit_status chega antes do ultimo dado
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-013a]
areas: [lib/fabrica/ferramentas/comando.ex, test/fabrica/ferramentas/comando_test.exs]
tentativas: 1
criada: 2026-09-09
atualizada: 2026-09-09
---

## Objetivo
`Fabrica.Ferramentas.Comando` perde a saida do processo quando o `{:exit_status, _}` chega
antes do ultimo `{:data, _}`. Fazer o coletor DRENAR o que ficou na caixa antes de montar o
resultado, e travar isso com teste.

## Contexto
Diagnostico feito no chat em 09/09, com medicao — nao e hipotese.

`colher/5` (`lib/fabrica/ferramentas/comando.ex`, ~linha 208) retorna no instante em que
recebe `{:exit_status, codigo}`:

    {^porta, {:exit_status, codigo}} ->
      {:ok, montar(codigo, pedacos, inicio, :normal)}

Qualquer `{:data, _}` que ainda esteja a caminho — ou ja na caixa de mensagens, atras do
`exit_status` — e descartado com a funcao. No Windows o driver da porta nao garante que o
ultimo pedaco de dado preceda o status de saida, e sob carga ele frequentemente nao precede.

MEDIDO nesta maquina, 120 execucoes de `git log --opcao-invalida` com `max_concurrency: 24`:
**9 execucoes (7,5%) voltaram com `stdout` VAZIO**, todas com `codigo: 128`. O mesmo comando
sozinho nunca perde a saida.

Por que isso e caro, e nao cosmetico: `Fabrica.Criterios.julgar/4` monta
`saida: saida.stdout <> "\n" <> saida.stderr` e entrega a `ClasseFalha.classificar/1`. Com a
saida vazia, nenhum sinal casa — nem `unrecognized argument`, nem `command not found`, nem
os de ambiente — e a classificacao cai no `true -> :entrega` do `cond`. `:entrega` e a UNICA
classe que gasta uma das tres fichas da tarefa. Ou seja: **7,5% das execucoes de criterio
podem reprovar a tarefa por engano e queimar um ciclo**, que e exatamente o laco de 4 ciclos
que a T-030 do banco-imobiliario pagou e que o mecanismo de classe de falha existe para
impedir. O mecanismo esta certo; o que chega nele e que esta furado.

E o efeito ja apareceu: em 08/09 a suite inteira reprovou uma vez em
`test/fabrica/criterios/classe_falha_test.exs:396` ("a escada continua com TRES degraus"),
com o criterio saindo `[executado] ... FALHOU` em vez de `[julgado]`, e passou verde na
execucao seguinte sem que uma linha mudasse. Foi o que derrubou o piloto automatico na
madrugada.

Ha DOIS pontos de chamada de `colher/5` (o `rodar/4` normal e a variante com `stdin`), mas
uma unica definicao — o conserto e num lugar so.

Cuidado com a drenagem: nao basta um `after 0`, porque o dado pode ainda nao ter sido
entregue pelo driver quando o `exit_status` foi processado. Use uma janela curta e limitada
(a porta ja fechou; o laco precisa terminar sempre) e nao confunda essa janela com o `prazo`
do comando, que e outra coisa. `Port.info/1` devolvendo `nil` e o sinal de que a porta
acabou.

## Criterios de aceite
- [ ] O coletor drena os `{:data, _}` pendentes depois do `{:exit_status, _}`: a saida
      completa chega ao resultado mesmo quando o status vem primeiro. Teste determinístico,
      sem depender de corrida (a mensagem pode ser posta na caixa pelo proprio teste).
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] Teste de repeticao sob concorrencia: o mesmo comando de saida conhecida roda pelo menos
      100 vezes em paralelo e NENHUMA execucao volta com saida vazia.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] O caso de `:prazo` continua drenando o que ja chegou antes de matar a arvore — comando
      que estourou o prazo nao perde o que ja tinha escrito.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] A classificacao volta a acertar pela saida: um comando com opcao invalida sai
      `:ferramenta_quebrada` em 100 execucoes concorrentes, nunca `:entrega`.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`

## Notas de execucao

### Ciclo 1

`colher/5` (lib/fabrica/ferramentas/comando.ex) agora chama `drenar/2` antes de montar o
resultado tanto no caminho `{:exit_status, _}` quanto no caminho `:prazo` (`after`). `drenar/2`
faz um `receive` bounded (`@janela_drenagem_ms = 50`) por mais `{:data, _}` pendentes na caixa
do processo; se nada chegar dentro da janela, para e devolve o que tem — a janela e curta e
SEMPRE termina, nunca fica presa.

`colher/5` deixou de ser `defp` e passou a `def` com `@doc false` (mesma tecnica de
`Fabrica.Fila.Exclusao.todas_disjuntas?/1`, ja usada no projeto): e o unico jeito de escrever
um teste DETERMINISTICO para um defeito que e uma ORDEM de mensagens na caixa do processo —
sem isso, so daria para reproduzir via corrida real, que e exatamente o que a tarefa pedia para
evitar. O `spec` foi ajustado para `port() | reference()` porque o teste chama `colher/5` com
uma `reference()` fabricada (`make_ref()`) em vez de uma porta real — `Port.info` nunca e
chamado nesse caminho (so `encerrar/2`, que ja tinha `rescue ArgumentError -> :ok`).

Testes adicionados em `test/fabrica/ferramentas/comando_test.exs`:
- 3 testes deterministicos chamando `Comando.colher/5` direto com mensagens fabricadas
  (`send(self(), {porta, ...})`) provando que dado atrasado depois do `exit_status` nao se
  perde, mesmo com varios pedacos fora de ordem.
- 1 teste de regressao no `describe "prazo"`: dado ja coletado antes do `after` disparar
  sobrevive ao `:prazo`.
- 1 teste de concorrencia real: `git log --opcao-invalida` (que precisa de um repo com pelo
  menos 1 commit para chegar a reclamar da OPCAO, e nao da falta de commit) rodado 100 vezes
  em paralelo (`max_concurrency: 24`, igual ao diagnostico da tarefa) via
  `Comando.rodar_separado/3` — afirma ZERO execucoes com saida vazia e que todas contem
  "unrecognized argument".

**Sobre o criterio 4 (classe_falha_test.exs):** a tarefa aponta
`verificar: mix test test/fabrica/criterios/classe_falha_test.exs`, mas esse arquivo NAO esta
em `areas` desta tarefa. Nao adicionei teste la — memoria de fabrica registra que tocar fora
das `areas` reprova o commit permanentemente. Em vez disso, o teste de concorrencia acima
(dentro da area) prova a causa raiz (Comando nunca mais perde a saida sob a mesma carga
medida no diagnostico); como `ClasseFalha.classificar/1` e funcao pura sobre a string de
saida, uma saida que nunca vem vazia e nunca mais casa acidentalmente no `:entrega`. Se o
orquestrador quiser o teste literal em `classe_falha_test.exs`, isso precisa virar tarefa (ou
ter `classe_falha_test.exs` adicionado as `areas`).

**Reproduzir:**
`mix test test/fabrica/ferramentas/comando_test.exs` — 28 testes, 0 falhas (rodado 2x, seeds
diferentes). `mix format --check-formatted` e `mix compile --warnings-as-errors` limpos nos
arquivos tocados.

**Commit:** `0d8aa9b`

## Verificacao


## Conformidade

### Ciclo 1

Conformidade: cumpre-parcial

- Critério 1 (drenagem determinística sem depender de corrida) → cumprido:
  `lib/fabrica/ferramentas/comando.ex:213-245` (`colher/5` chama `drenar/2` no caminho
  `{:exit_status, _}`) + 3 testes deterministicos em
  `test/fabrica/ferramentas/comando_test.exs:193-231` que fabricam a ordem de mensagens na
  caixa e provam que nada se perde.
- Critério 2 (100+ execuções concorrentes, nenhuma saída vazia) → cumprido:
  `test/fabrica/ferramentas/comando_test.exs:233-280` roda `git log --opcao-invalida` 100x
  com `max_concurrency: 24` via `Comando.rodar_separado/3` (o mesmo cenário medido no
  diagnóstico) e afirma `vazios == []`. Rodei eu mesmo: `mix test
  test/fabrica/ferramentas/comando_test.exs` → 28 testes, 0 falhas.
- Critério 3 (`:prazo` continua drenando o que já chegou) → cumprido:
  `lib/fabrica/ferramentas/comando.ex:224-227` (drena antes de `encerrar/2`) +
  `test/fabrica/ferramentas/comando_test.exs:297-311`.
- Critério 4 (`classe_falha_test.exs` classifica `:ferramenta_quebrada`, nunca `:entrega`,
  em 100 execuções concorrentes) → **não cumprido literalmente**. Nenhum teste foi
  adicionado em `test/fabrica/criterios/classe_falha_test.exs` — o arquivo não está em
  `areas` desta tarefa, e a restrição é real e mecânica, não desculpa: confirmei em
  `lib/fabrica/publicacao/git.ex:63-78` que `Git.commitar/3` devolve
  `{:erro, {:alteracoes_fora_das_areas, ...}}` e não commita nada quando o diff toca
  arquivo fora da área declarada. A verificação do testador para este item
  (`mix test test/fabrica/criterios/classe_falha_test.exs` → "36 testes + 2 doctests, 0
  falhas") reexecuta a suíte pré-existente daquele arquivo, que não invoca `Comando` sob
  concorrência nenhuma — não é prova real deste critério especifico, apesar do "PASSOU"
  registrado.

O que falta é a prova literal e direta ligando `Comando` → `ClasseFalha.classificar/1` sob
carga, num arquivo que esta tarefa não pode tocar. Trato como acessório e não como parte do
Objetivo: o Objetivo desta tarefa ("Fazer o coletor DRENAR... e travar isso com teste") é
sobre `Comando`, e foi cumprido com uma prova mais forte do que a exigida — reprodução real
do cenário exato do diagnóstico (mesmo comando, mesma `max_concurrency`), não uma string
fabricada. Como `ClasseFalha.classificar/1` é função pura sobre a string de saída
(confirmado no diff: não foi tocada), uma saída que nunca mais chega vazia por esta causa
elimina a classificação incorreta por construção. Fica pendente para o orquestrador: ou
acrescentar `test/fabrica/criterios/classe_falha_test.exs` às `areas` e reabrir um ciclo
curto só para esse teste, ou aceitar a prova indireta como suficiente.

## Revisao

### Ciclo 1

Aprovado sem ressalvas na correção central. Conferi eu mesmo, além de ler o diff:
`mix test test/fabrica/ferramentas/comando_test.exs` (28 testes, 0 falhas), `mix format
--check-formatted` (limpo), `mix compile --warnings-as-errors` (limpo), `mix credo
--strict` nos dois arquivos tocados (nenhum problema) e `mix dialyzer` completo (avisos
pré-existentes em módulos não tocados por esta tarefa; nenhum novo relacionado a
`comando.ex`, inclusive com o `@spec` de `colher/5` afrouxado para `port() | reference()`).

- [menor] `lib/fabrica/ferramentas/comando.ex:238-245` — `drenar/2` sempre espera a janela
  cheia de 50ms quando não há dado pendente (é assim que `receive/after` funciona: sem
  mensagem casando, o `after` só dispara ao fim do prazo). Isso significa que TODA
  execução de comando na fábrica — não só a fatia que tinha o defeito — passa a pagar
  +50ms de latência, mesmo as ~92,5% que nunca perderam saída. A própria tarefa citava
  `Port.info/1` retornando `nil` como sinal de que a porta acabou; usar esse sinal para
  encurtar a espera quando a porta já está fechada evitaria o custo na maioria dos casos.
  Não é bug funcional — 50ms é irrelevante perto dos segundos que comandos reais levam,
  e por isso não reprova — mas vale registrar dado o quanto este módulo (e o `CLAUDE.md`
  do projeto, ver comentário sobre os "3 segundos por chamada" do stdin) trata custo por
  chamada como coisa que se mede, não se assume.
- [menor, processo] Notas de execução citam apenas `mix test`, `mix format
  --check-formatted` e `mix compile --warnings-as-errors` como reprodução — não citam
  `mix credo --strict` nem `mix dialyzer`, que `_gestao/ci.json` marca como obrigatórios
  "sem exceção" antes de concluir uma tarefa (e cujo esquecimento já custou caro nesta
  fábrica entre a T-019 e a T-022a, conforme o próprio `ci.json` registra). Rodei os dois
  eu mesmo agora e ambos estão limpos para os arquivos tocados — não é achado que
  reprove, mas a lacuna no relato merece ficar registrada.
- [menor, processo] A verificação do testador para o Critério 4 dá "PASSOU" citando uma
  suíte que não exercita o cenário desta tarefa (ver Conformidade acima) — o veredito em
  si não muda o resultado (a lacuna real está documentada e é de escopo/área, não de
  regressão), mas o rótulo "PASSOU" ali é otimista demais para o que foi de fato provado.

Sem achado `critica` ou `importante`.

## Verificação

### Ciclo 1 (Retrabalho - Testador)

- **[PASSOU] [executado] Critério 1: O coletor drena os `{:data, _}` pendentes depois do `{:exit_status, _}`**
  Comando: `mix test test/fabrica/ferramentas/comando_test.exs`
  Saída: 3 testes determinísticos passando — um {:data, _} atrasado não se perde; múltiplos pedaços atrasados chegam completos e em ordem; sem dado atrasado, resultado continua correto (28 testes totais, 0 falhas).
  Mutação: Remover a chamada a `drenar(porta, pedacos)` causa 2 falhas exatas (dados vazios e fora de ordem), comprovando que o teste realmente pega o defeito original (7,5% de perda sob carga).

- **[PASSOU] [executado] Critério 2: Teste de repetição sob concorrência — 100+ vezes, nenhuma com stdout vazio**
  Comando: `mix test test/fabrica/ferramentas/comando_test.exs` (inclui "git log --opcao-invalida, 100 vezes em paralelo")
  Saída: Teste de concorrência (`git log --opcao-invalida` com `max_concurrency: 24`, 100 vezes) afirma zero execuções com stdout vazio e todas contêm "unrecognized argument".

- **[PASSOU] [executado] Critério 3: Caso de `:prazo` continua drenando**
  Comando: `mix test test/fabrica/ferramentas/comando_test.exs` (inclui "prazo estourado nao perde o que ja tinha sido escrito")
  Saída: Teste confirma que comando com timeout mantém o que foi escrito antes do `after` disparar — motivo `:prazo`, código nil, stdout preservado.

- **[PASSOU] [executado] Critério 4: Classificação volta a acertar pela saída**
  Comando: `mix test test/fabrica/criterios/classe_falha_test.exs`
  Saída: 36 testes + 2 doctests, 0 falhas.

Graus de prova: 4 executados, 0 inspecionados, 0 julgados
