---
id: T-068
titulo: "Fabrica.Planejador: traduz um pedido em linguagem natural num grafo de tarefas"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-066]
areas: [priv/doutrina/planejador.md, lib/fabrica/planejador.ex, test/fabrica/planejador_test.exs]
tentativas: 1
criada: 2026-09-21
atualizada: 2026-09-22
---

## Objetivo
Dado um pedido em linguagem natural e um projeto (novo ou existente), despachar um agente real
no papel `planejador` que decide um grafo de 8 a 12 tarefas — com dependências, `areas` (sempre
arquivo, nunca pasta) e critérios de aceite — e gravar isso no banco (`Fabrica.Projetos.Projeto`
+ `Fabrica.Tarefas.Tarefa` + critérios), numa transação.

## Contexto
Extraída da T-058 no replanejamento de 21/09 (`_gestao/DECISOES.md`, D-006). O achado que reduz
o escopo desta tarefa: `Fabrica.Ferramentas.Catalogo` **já tem** o papel `"planejador"`
(`ler listar buscar registrar_resultado`) ao lado de construtor/verificador/revisor — a base já
foi antecipada, só nunca ligada a um módulo que a use.

**O que esta tarefa NÃO tem pronto, e precisa decidir:** `registrar_resultado` aceita
`resumo, arquivos, comandos, commit, impedimento` — campos pensados para um relatório de
CONSTRUÇÃO, sem forma óbvia para "uma lista de 8 a 12 tarefas com dependências". Duas rotas
razoáveis, e a primeira é mais simples e não mexe no contrato de `RegistrarResultado`:

  (a) o agente devolve o plano como um bloco de código JSON na ÚLTIMA mensagem da conversa (sem
      ferramenta nova); `Fabrica.Planejador` extrai e valida esse JSON depois que
      `Agente.Laco.rodar/1` termina, e só então grava no banco;
  (b) `Fabrica.Ferramentas.RegistrarResultado` ganha um campo novo para carregar o plano
      estruturado.

Prefira (a), a menos que a execução meça um motivo concreto para (b) — registre a escolha nas
Notas de execução de qualquer forma, com o motivo.

**A montagem da mensagem inicial vem de `Fabrica.Despacho` (T-066)**, com o `texto_do_papel`
vindo do arquivo novo `priv/doutrina/planejador.md` desta própria tarefa. A doutrina do
planejador é mais restrita que a do planejador que ESCREVEU este documento (você): o agente que
`Fabrica.Planejador` despacha só tem `ler`, `listar`, `buscar` e `registrar_resultado` — sem
`escrever`, então ele não grava `ESPECIFICACAO.md`/`PLANO.md`/arquivos de tarefa como esta sessão
faz. Ele decide o plano e REPORTA; quem grava no banco é código Elixir, depois.

**Escopo do plano gerado:** 8 a 12 tarefas, projeto pequeno — mesma régua que este documento já
segue (seção "Seu produto" deste próprio prompt, se você quiser o texto completo como
referência: `.claude/agents/planejador.md`, fora do confinamento, só leitura).

## Critérios de aceite
- [ ] `Fabrica.Planejador.planejar/2` (pedido, projeto) devolve `{:ok, %{projeto: ..., tarefas:
      [...]}}` com 8 a 12 tarefas, dependências sem ciclo, `areas` preenchidas com arquivos
      (nunca pastas).
      `verificar: mix test test/fabrica/planejador_test.exs`
- [ ] Resposta do agente que não fecha em JSON válido devolve `{:erro, motivo}`, nunca grava
      linha parcial no banco — tudo dentro de uma transação.
      `verificar: mix test test/fabrica/planejador_test.exs`
- [ ] A doutrina do planejador (`priv/doutrina/planejador.md`) cita o formato exato de resposta
      que `Fabrica.Planejador` espera parsear.
- [ ] `mix fabrica.ci` passa.
      `verificar: mix fabrica.ci`

## Notas de execução

Criados os três arquivos das `areas`: `priv/doutrina/planejador.md`,
`lib/fabrica/planejador.ex` (`Fabrica.Planejador.planejar/3`, chamável como `/2` pelo
default) e `test/fabrica/planejador_test.exs` (13 casos, escritos ANTES da implementação —
vermelho confirmado com `UndefinedFunctionError`, depois verde).

**Rota escolhida, conforme o Contexto pedia para registrar: (a).** O plano não passa por
`registrar_resultado` — vem como um bloco ` ```json ` na ÚLTIMA mensagem de texto da
conversa, e `Fabrica.Planejador` extrai/valida esse bloco depois que o operário responde.
`registrar_resultado` fica reservado só para o canal `impedimento`, igual aos outros papéis.

**Decisão não antecipada pelo Contexto, e o motivo é um achado de leitura do código, não
palpite:** o módulo chama `Fabrica.Operario.conversar/2` diretamente, e não
`Fabrica.Agente.Laco.rodar/1`. Medido em `lib/fabrica/agente/laco.ex`:
`tratar_resposta(:agente_completo, estado, resposta)` contabiliza e para SEM chamar
`Estado.anexar_turno/3`, e `Estado.resumo/1` devolve `desfecho/voltas/gasto_usd/consumos/
mensagens` — nenhum campo carrega `resposta.blocos`. Ou seja, hoje **não há caminho, pela
API pública do `Laco`, para recuperar o texto onde o plano mora** — exatamente o texto que a
rota (a) depende de ler. Consertar isso mudaria `lib/fabrica/agente/laco.ex`, fora das
`areas` desta tarefa (violaria o mutex do paralelismo, mesma doutrina que reprovou os ciclos
2-3 da T-066). Planejar não precisa do laço de ferramentas da fábrica — a exploração roda
inteira dentro de UMA sessão do adaptador `:agente_completo`, e um adaptador
`:endpoint_de_modelo` como o `Falso` é exercitado com uma única resposta roteirizada — então
uma troca só com o operário basta e não perde nada. Registrado no `@moduledoc` do módulo.

**Outras decisões dentro do que o Contexto deixava em aberto:**

- `Fabrica.Despacho` (T-066) não é reaproveitado aqui: ele monta a faixa `:tarefa` a partir
  de uma `Fabrica.Tarefas.Tarefa` já existente, e o planejador ainda não tem tarefa nenhuma
  — está criando-as. `Fabrica.Planejador` monta o prefixo (ferramentas + doutrina + índice)
  do mesmo jeito, e o `pedido` (que muda a cada chamada, como a faixa `:tarefa` faria) entra
  como mensagem de usuário, não no prefixo — pela mesma razão de nunca marcar ponto de cache
  num conteúdo volátil.
- Conversão `Fabrica.Prompt.Bloco` → `Fabrica.Operario.Bloco`: `Requisicao.prefixo` espera o
  segundo (`texto` + `ponto_de_cache`, sem `especie`), e `Prefixo.montar/2` devolve o
  primeiro — confirmado lendo `Fabrica.Operario.MessagesAPI.montar/2`, que é quem consome
  esse campo de verdade.
- `id` no JSON do plano é um inteiro local à própria lista (1..N), usado só para expressar
  `dependencias` dentro do plano — nunca um código `T-NNN`. O código real é gerado por
  `Fabrica.Planejador` continuando a numeração já existente do projeto (maior `T-NNN` já
  usado + 1), igual à razão de `status`/`tentativas` nunca virem do agente.
- Validação de "área nunca é pasta": recusa qualquer área terminando em `/` ou `\`
  (`Fabrica.Tarefas.Area` documenta a regra em prosa; não havia checagem em código antes
  desta tarefa, e o critério de aceite pedia isso).
- Ciclo em dependências: DFS de três cores (branco/cinza/preto) sobre o grafo local ao plano;
  dependência apontando para `id` fora da lista também é recusada.
- Tudo entra num único `Ecto.Multi` (`Tarefa` + `Area` + `Criterio` + `Dependencia`);
  qualquer falha de changeset no meio desfaz a transação inteira — nenhuma tarefa parcial.

**Gap observado, fora do meu confinamento e não corrigido aqui:** ao ler
`lib/fabrica/operario/claude_cli.ex` para decidir a conversão de blocos, notei que
`ClaudeCLI.texto_do_prompt/1` só serializa `requisicao.mensagens` — `requisicao.prefixo`
nunca chega ao prompt enviado ao CLI sob esse adaptador (o `MessagesAPI` usa `prefixo`
corretamente; o `Falso`, usado pela suíte, nem olha para lá). Sob `Fabrica.Operario.Falso`
(o default e o que os testes usam) isso não afeta nada. Sob `Fabrica.Operario.ClaudeCLI` em
produção, a doutrina+índice montados por `Fabrica.Planejador.prefixo/2` não chegariam ao
agente real — sugestão de tarefa nova para quem for ligar o `ClaudeCLI` de fato (T-070 ou
sucessora): `texto_do_prompt/1` precisa também serializar `requisicao.prefixo`.

**Reproduzir:** `mix test test/fabrica/planejador_test.exs` (13 testes, 0 falhas).
`mix credo --strict lib/fabrica/planejador.ex test/fabrica/planejador_test.exs` (0 problemas).
`mix fabrica.ci` (bateria completa: formato/compilar/lint/testes/tipos, 5/5 ok, Postgres
conferido no ar antes com `pg_isready`).

**Commit:** `53b6822`

## Verificação

### Ciclo 1

- **[PASSOU] [executado] A suíte do projeto continua passando**
  Comando: `mix test` (passada mecânica anterior)
  Saída: Todos os testes passaram

- **[PASSOU] [executado] `Fabrica.Planejador.planejar/2` retorna tarefas válidas (8-12, sem ciclo, áreas são arquivos)**
  Comando: `mix test test/fabrica/planejador_test.exs` (passada mecânica anterior)
  Saída: 13 testes PASSED

- **[PASSOU] [executado] Resposta sem JSON válido retorna erro e não grava nada**
  Comando: `mix test test/fabrica/planejador_test.exs` (passada mecânica anterior)
  Saída: Suíte de validação passou (inclui testes para JSON inválido, áreas com `/`, ciclos, dependências desconhecidas)

- **[PASSOU] [julgado] A doutrina cita o formato exato de resposta que `Fabrica.Planejador` espera parsear**
  Inspeção: `priv/doutrina/planejador.md`
  Observação: A doutrina (linhas 14-58) cita explicitamente:
    - O plano vem como bloco JSON na ÚLTIMA mensagem (cercado por ` ```json ` e ` ``` `)
    - O formato exato com todos os campos: `id`, `titulo`, `objetivo`, `contexto`, `areas`, `criterios`, `dependencias`
    - As 5 regras que o código valida (8-12 tarefas, `id` numérico, `areas` arquivo, `criterios` com `texto`, `dependencias` sem ciclo)

- **[PASSOU] [executado] `mix fabrica.ci` passa**
  Comando: `mix fabrica.ci` (passada mecânica anterior)
  Saída: 5/5 estágios PASSED (formato/compilação/lint/testes/tipos)

Graus de prova: 4 executado(s), 1 julgado(s) (5/5 total)


## Conformidade

Conformidade: cumpre

- `Fabrica.Planejador.planejar/2` devolve `{:ok, %{projeto:, tarefas:}}` com 8-12 tarefas,
  dependências sem ciclo, áreas sempre arquivo → `lib/fabrica/planejador.ex:80` (`planejar/3`,
  chamável como `/2`), `validar_plano/1`, `validar_dependencias/1` (DFS de três cores) e
  `area_valida?/1`. Confirmado rodando `mix test test/fabrica/planejador_test.exs` eu mesmo:
  13 testes, 0 falhas.
- Resposta sem JSON válido devolve `{:erro, motivo}` sem gravar linha parcial, tudo numa
  transação → `extrair_json/1` + `ultimo_bloco_json/1` (recusa antes de tocar o banco) e
  `gravar/2` (um único `Ecto.Multi` com `Tarefa`+`Area`+`Criterio`+`Dependencia`). Os três
  testes de "resposta que não fecha em JSON válido" e os quatro de "plano inválido" cobrem o
  caminho — todos confirmam `contar_tarefas(projeto) == 0`.
- Doutrina cita o formato exato de resposta → `priv/doutrina/planejador.md:20-45` (bloco
  ` ```json ` com todos os campos do plano e as 5 regras que o código valida).
- `mix fabrica.ci` passa → confirmado rodando eu mesmo: 5/5 estágios ok (formato, compilar,
  lint, testes, tipos).
- Escopo: a decisão da rota (a) e a decisão de chamar `Operario.conversar/2` direto em vez de
  `Agente.Laco.rodar/1` estão registradas e justificadas nas Notas, com o motivo de cada
  desvio do que o Contexto antecipava — nenhuma delas extrapola as `areas` declaradas
  (`priv/doutrina/planejador.md`, `lib/fabrica/planejador.ex`,
  `test/fabrica/planejador_test.exs`; `_gestao/MAPA.md` foi regenerado pelo próprio processo
  de commit, não é área da tarefa mas é o índice, tratamento padrão). O gap encontrado sobre
  `ClaudeCLI.texto_do_prompt/1` não ignorar `requisicao.prefixo` foi corretamente deixado de
  fora (mudaria arquivo fora das `areas`) e sinalizado como tarefa futura — postura correta.

## Revisão

Aprovado sem ressalvas de correção. Verifiquei especificamente:

- O contrato entre `Prefixo.montar/2` (devolve `Fabrica.Prompt.Bloco`) e
  `Requisicao.prefixo` (espera `Fabrica.Operario.Bloco`) — a conversão em `operario_bloco/1`
  (`lib/fabrica/planejador.ex`) preserva `texto` e `ponto_de_cache` corretamente.
- Os changesets de `Tarefa`/`Area`/`Criterio`/`Dependencia` contra o que `montar_multi/3`
  monta: `codigo/1` gera `T-NNN` que casa com `~r/^T-\d{3,}[a-z]*$/i`; `Multi.insert` usa
  chaves `{:tarefa, tarefa.id}` e resolve `depende_de_id` via `Map.fetch!` na MESMA passada —
  uma dependência para um `id` fora da lista já foi recusada antes em `validar_dependencias/1`,
  então o `fetch!` nunca explode em uso normal.
- O DFS de três cores em `grafo_com_ciclo?/1` está correto (branco/cinza/preto padrão) e roda
  ANTES da transação, como o critério exige.

- [menor] `lib/fabrica/planejador.ex:normalizar_criterio/1` — se o agente escrever
  `"grau": "executado"` no JSON SEM `"comando"` (a doutrina pede para não fazer isso, mas
  `criterio_valido?/1`/`grau_valido?/1` não recusam essa combinação antes da transação), o
  `Criterio.changeset/2` rejeita no `Multi` (`{:executado, nil} -> add_error`) e o
  `Ecto.Multi` desfaz tudo — não há corrupção de dado, só um `{:erro, {:falha_ao_gravar, ...}}`
  menos informativo do que uma validação prévia daria. Não reprova: a transação já protege a
  integridade: nenhuma tarefa parcial é gravada mesmo nesse caso.
- [menor] `lib/fabrica/planejador.ex:proximo_numero/1` — dois `planejar/3` concorrentes para o
  MESMO projeto poderiam calcular o mesmo `T-NNN` (leitura fora de transação, sem lock) e um
  dos dois falharia no `unique_constraint([:projeto_id, :codigo])` do `Multi`, sem corromper
  dado. Fora do escopo desta tarefa (não há despacho concorrente de planejador hoje) — registro
  como nota, não como defeito a corrigir aqui.
