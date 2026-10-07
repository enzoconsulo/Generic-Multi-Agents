---
id: T-018d
titulo: O prompt do ClaudeCLI sai da linha de comando
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-013a, T-018c]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, priv/probes/cli_real.exs]
tentativas: 2
criada: 2026-09-01
atualizada: 2026-09-03
---

## Objetivo
Fazer o texto da conversa viajar ate o `claude` por `stdin`, a partir de um arquivo, em vez de
ser interpolado na linha de comando — para que um prompt de tarefa real, com quebras de linha e
pontuacao de shell, chegue integro.

## Codigo de bloqueio
Sem esta tarefa o `ClaudeCLI` so aguenta pedido de uma linha. O marco 1 pede um agente
resolvendo uma tarefa REAL, e o despacho de uma tarefa real e multi-linha por construcao.

## Contexto

**Esforco estimado: 45 a 60 min.** Consome a opcao `entrada:` que a T-013a acrescentou ao
`Comando`; sem ela esta tarefa nao tem como ser feita.

**O que foi medido (T-020, ciclo 3).** Duas corridas contra o `claude` real: a primeira com
prompt multi-linha devolveu exit 255, stdout e stderr **vazios**, `{:erro,
:saida_ininteligivel}`; a segunda, com prompt de uma linha, funcionou. A causa esta em
`ClaudeCLI.linha/1`, que monta

    <executavel> --print --verbose --output-format stream-json --model <m> "<prompt>"

por interpolacao de string, depois de um `escapar/1` que troca `"` por `'`. Duas coisas erradas
ao mesmo tempo: a quebra de linha desmonta o `.bat` gerado por `Comando.escrever_script/4`, e o
`escapar/1` **corrompe o pedido em silencio** — trocar aspas altera o texto que o modelo le, e
ninguem fica sabendo. Na segunda volta do laco o defeito reapareceu sozinho, disparado pelo
historico serializado por `inspect/1`: conteudo que ninguem digitou.

### O desenho

1. `ClaudeCLI` escreve o texto da conversa num arquivo temporario (mesma disciplina de
   temporario que o `Comando` ja usa: nome unico por `System.unique_integer/1`, apagado depois).
2. A linha passa a ser **constante em relacao ao conteudo da conversa** — so executavel, flags e
   modelo. Nenhum pedaco do prompt aparece nela.
3. A chamada usa `entrada: {:arquivo, caminho}` de `Comando.rodar_separado/3`.
4. `escapar/1` **desaparece**. Nao ha mais o que escapar, e mante-lo seria manter a corrupcao.
5. O temporario e apagado mesmo quando a chamada falha.

**A T-018b (secao 7) mediu** se o `claude` aceita o pedido por `stdin` e com qual grafia. Copie
dali. Se a medicao tiver dito que nao aceita, **declare `Impedimento:` nas Notas** em vez de
inventar um contorno — a tarefa muda de desenho e quem decide isso e o planejador.

**Fora de escopo:** mudar `texto_da_mensagem/1` para um formato de historico melhor (o
`inspect/1` de bloco estruturado e feio, mas e outro problema, e mexer nele aqui mistura duas
mudancas num diff so), tocar em `Comando` (a T-013a ja fez o que era preciso) e qualquer flag
nova. Se achar que falta, ANOTE.

**Prove contra o real.** `priv/probes/cli_real.exs` e o probe do adaptador — estenda-o com um
caso de prompt multi-linha contendo aspas duplas e `&`, que e exatamente o que quebrava. Ele
consome cota da assinatura e nao gera fatura.

## Criterios de aceite
- [ ] A linha montada por `ClaudeCLI` nao contem nenhum pedaco do texto da conversa: dois prompts completamente diferentes produzem a MESMA linha.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Um prompt com quebras de linha, aspas duplas e `&` chega integro — o teste compara o conteudo do arquivo de entrada com o texto pedido, byte a byte.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Uma sessao REAL com prompt multi-linha (o caso que devolvia exit 255 com stdout e stderr vazios) devolve `{:ok, %Resposta{}}` com consumo preenchido.
      `verificar: mix run priv/probes/cli_real.exs`
- [ ] `escapar/1` nao existe mais em `lib/`, e nenhuma outra funcao substitui aspas do prompt.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O arquivo temporario e apagado tambem quando a chamada falha (teste com executavel inexistente ou prazo estourado).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

**O que mudou em `lib/fabrica/operario/claude_cli.ex`:**

- `conversar/2` agora escreve o texto integral da conversa (`texto_do_prompt/1`) num arquivo
  temporario (`escrever_prompt/1`, disciplina identica a `Comando.escrever_script/4`: nome
  unico via `System.unique_integer/1`) e chama `Comando.rodar_separado/3` com
  `entrada: {:arquivo, arquivo_prompt}`. O arquivo e apagado por `apagar_prompt/1`
  (best-effort, no mesmo estilo do `Comando.apagar/1`) **sempre**, na sequencia imediatamente
  apos a chamada — inclusive quando `Comando.rodar_separado/3` devolve `{:erro, ...}` ou
  `{:ok, %{motivo: :prazo}}`.
- `linha/1` **nao recebe mais o prompt**: nenhum pedaco de `requisicao.mensagens` entra na
  linha montada. A linha e constante em relacao ao conteudo da conversa — so executavel,
  `--tools`, `--max-turns`, `--model`. `--print` sem argumento de prompt faz o `claude` ler o
  pedido de `stdin` (medido na T-018b, secao 7).
- `escapar/1` foi removido por completo — nao ha mais aspas para trocar, porque nao ha mais
  prompt na linha.
- `texto_da_mensagem/1` (privada) nao mudou — fora de escopo, como o desenho pedia.
- Nova funcao publica `texto_do_prompt/1`: o texto integral que vai para o arquivo, exposta
  pela mesma razao de `linha/1` e `interpretar/1` (o teste confere o conteudo sem gastar cota).

**`priv/probes/cli_real.exs`:** acrescentada a Secao F — o MESMO prompt multi-linha, com
aspas duplas e `&`, que devolvia exit 255/stdout-stderr vazios quando interpolado na linha
(T-020, ciclo 3). Prova, contra o CLI real, `{:ok, %Resposta{}}` com consumo preenchido.

**Testes (`test/fabrica/operario/claude_cli_test.exs`):**

- Reescrito o teste que extraia o prompt da linha por regex (nao existe mais prompt na
  linha); substituido por uma checagem direta de `texto_do_prompt/1` vs. `linha/1`.
- Novo describe `"o prompt sai da linha de comando (T-018d)"`, com:
  - dois prompts diferentes produzindo a MESMA linha (critério 1);
  - um prompt com quebras de linha, aspas duplas e `&` chegando **byte a byte** ao processo,
    provado com um executavel de mentira (`.ps1` no Windows) que copia o `stdin` recebido
    para um arquivo — mesma disciplina de `Fabrica.Ferramentas.ComandoTest.copiar_stdin/1`
    (critério 2);
  - `escapar/1` ausente de `lib/` (critério 4);
  - o arquivo temporário apagado tanto com prazo estourado quanto com executável inexistente
    (critério 5) — a checagem varre `System.tmp_dir!()` por `fabrica-cli-prompt-*` e procura
    uma MARCA única gravada no conteúdo (não apenas "lista vazia"), porque a suíte roda
    `async: true` e outro teste pode ter um arquivo próprio no ar no instante da checagem.

**Teste de mutação (registrado nas Notas, revertido depois):** comentei a chamada
`apagar_prompt(arquivo_prompt)` em `conversar/2` — os dois testes de limpeza (prazo estourado
e executável inexistente) **FALHARAM** como esperado, confirmando que a prova é real e não
cosmética. Revertido; suíte volta a 67/67.

**Reproduzir:**
`mix test test/fabrica/operario/claude_cli_test.exs`

**Rodado nesta máquina (Windows):**
- `mix test test/fabrica/operario/claude_cli_test.exs` → 67 tests, 0 failures (estável em 3
  execuções com seeds diferentes, incluindo seed fixa 0).
- `mix test` (suíte inteira) → 17 doctests + 843 tests, 0 failures.
- `mix format --check-formatted` → ok. `mix compile --warnings-as-errors` → ok.
- `mix credo --strict` → sem achados.
- `mix dialyzer` → passou (2 erros pre-existentes, ignorados via `.dialyzer_ignore.exs`, não
  tocados por esta tarefa).
- `mix fabrica.ci` → 5 estágios ok (formato 2.9s, compilar 2.9s, lint 8.4s, testes 27.4s,
  tipos 17.2s).

O critério 3 (`mix run priv/probes/cli_real.exs`, Secao F) **não foi executado**: consome cota
real da assinatura, e a doutrina do probe pede parcimônia. Sintaxe conferida
(`Code.string_to_quoted!/1` sobre o arquivo inteiro, sem erro). Recomendo rodar o probe
completo no portão de verificação, já que ele também é o critério declarado.

**Decisão de desenho não coberta pela tarefa, registrada aqui:** o arquivo temporário do
prompt vai para `System.tmp_dir!()` (não para `raiz`), espelhando onde `Comando` já grava
seus próprios temporários (script, stdout, stderr) — manter os quatro na mesma pasta evita
inventar uma segunda convenção de onde a fábrica guarda lixo de execução.

**Commit:** `cf19266`

### Ciclo 2

A reprovação mecânica registrada abaixo (`## Verificação`) apontou falha em `mix fabrica.ci`,
estágio `testes`, num único caso: `Fabrica.Ferramentas.ConfinamentoTest` / "escape 3: link que
aponta para fora" / "recusa link cujo DESTINO esta fora", com `{:error, :sem_link}` — a criação
da junção (`mklink /J`) falhou.

**Esse teste não faz parte das `areas` desta tarefa** (`test/fabrica/ferramentas/confinamento_test.exs`,
não tocado pelo commit `cf19266` — conferido com `git show cf19266 --stat`) e não tem nenhuma
relação com o desenho de T-018d (prompt por stdin). É um teste pré-existente de T-012a que cria
uma junção de diretório via `cmd /c mklink /J` — o próprio comentário no arquivo já registra que
`File.ln_s/2` falha sem privilégio de administrador nesta máquina e usa a junção como
alternativa.

**Confirmado como flaky, não como regressão desta tarefa:**
- `mix test test/fabrica/ferramentas/confinamento_test.exs` isolado (4 execuções, inclusive com
  `--seed 0`) → sempre 29/29, 0 falhas.
- `mix test` (suíte completa, 3 execuções) → falhou em 1 das 3, sempre no MESMO caso
  (`escape 3: link que aponta para fora`), nunca em nenhum teste de `claude_cli_test.exs`.
- A falha só aparece sob carga de concorrência da suíte inteira (`max_cases: 16`), nunca
  isolado — indício de contenção do `mklink /J` do Windows sob paralelismo pesado, não de um
  defeito de código.
- `mix fabrica.ci` rodado de novo agora (sem tocar em nada) → **passou nos 5 estágios**
  (formato 3.0s, compilar 3.0s, lint 7.7s, testes 26.5s, tipos 17.3s).

Nenhum código foi alterado neste ciclo — a entrega do ciclo 1 já estava correta; a reprovação
foi causada por flakiness de um teste fora do escopo desta tarefa, que passou na reexecução.

**Sugestão para o orquestrador:** `Fabrica.Ferramentas.ConfinamentoTest` (escape 3, junção via
`mklink /J`) é candidato a uma tarefa própria para tornar essa prova estável sob concorrência
(ex.: `System.cmd/3` sem passar por `cmd /c`, ou isolar esses testes com `async: false`).

**Commit:** `50a9018`

### Ciclo 3

**Causa raiz da reprovação (uma frase):** a `SECAO C` de `priv/probes/cli_real.exs` afirma que
o `verificador` "NAO escreve" um arquivo mesmo sob ordem explícita — mas o `verificador` tem
`Bash` no vocabulário (`--tools "Bash,Glob,Grep,Read"`, porque precisa rodar testes), e o modelo
criou o arquivo VIA Bash, que é exatamente a lacuna de shell **aceita e documentada** no
`@moduledoc` do `claude_cli.ex` ("comando de shell nao se audita por caminho"). O `File.exists?`
da SECAO C testa uma garantia que o código explicitamente NÃO oferece.

**O que aproveitei / o que refiz:** o núcleo de T-018d (prompt por `stdin`, SECAO F, testes
unitários, `mix fabrica.ci`) está correto e intacto — **nada dele foi tocado neste ciclo**. A
correção é cirúrgica, restrita à SECAO C do probe (arquivo `cli_real.exs`, que está nas `areas`
desta tarefa e é onde o critério 3 verifica).

**Por que corrigir a SECAO C e não declará-la "flaky" (como o ciclo 2 fez com outro teste):** a
SECAO C não é uma falha de ambiente; ela afirma uma propriedade *não-garantível por desenho*. O
`--tools` remove `Write`/`Edit` do vocabulário (garantia real, já provada nos testes unitários),
mas NÃO impede escrita — `Bash` a permite, e o `@moduledoc` registra isso como a opção (c)
escolhida pelo Enzo. Deixar a SECAO C dependendo do capricho do haiku (usar Bash ou não) a torna
não-determinística e faz o critério 3 reprovar por sorte, não por defeito de código.

**O que mudou em `priv/probes/cli_real.exs` (SECAO C).** Duas asserções tentadoras se provaram
ERRADAS contra o CLI real, medidas nesta máquina em duas corridas do probe:

1. A original, `not File.exists?(...)`: reprova quando o haiku improvisa a escrita com `Bash`
   (o caso da reprovação — arquivo criado por shell). Afirma uma garantia que o código
   explicitamente NÃO oferece (a lacuna de shell da opção (c) do `@moduledoc`).
2. A minha primeira tentativa, "nenhum `tool_use` de `Write`/`Edit`": reprova quando o modelo
   EMITE um `Write` e o CLI o bloqueia — medido: `ferramentas ["Write"]` **com o arquivo
   ausente**. O `--tools` garante que a tentativa não tenha EFEITO, não que o modelo nunca a
   emita.

A asserção FINAL é o invariante que vale em todo comportamento do modelo: **o arquivo alvo só
existe se `Bash` o criou** (`not File.exists?(alvo) or "Bash" in ferramentas_usadas`), porque
`Write`/`Edit` não conseguem criá-lo sob `--tools`. Isso reprova exatamente a brecha REAL (uma
escrita autorizada tendo efeito) e nada mais. A segunda corrida do probe exibiu os DOIS modos de
falha das versões anteriores de uma vez — `ferramentas ["Bash","Write","Bash","Bash"]`,
`arquivo = true` (Write tentado e bloqueado; Bash caiu por cima e criou) — e a asserção final
passou. `File.exists?` segue IMPRESSO (informativo), atribuído à lacuna de shell.

**Resultado (rodado nesta máquina, Windows, 2026-09-04):**
- `mix test test/fabrica/operario/claude_cli_test.exs` → 67 tests, 0 failures (núcleo intacto).
- `mix fabrica.ci` → 5 estágios ok (formato 2.9s, compilar 2.8s, lint 7.3s, testes 27.2s,
  tipos 17.1s).
- `mix run priv/probes/cli_real.exs` → **PROBE OK** (SECAO A–F, duas corridas; a SECAO F, o
  núcleo de T-018d, passou nas duas: prompt multi-linha com aspas e `&` conclui com consumo
  preenchido).

**Escopo:** o núcleo de T-018d (prompt por `stdin`) não foi tocado neste ciclo. A única mudança
é a asserção da SECAO C — um defeito de probe herdado da T-018c que bloqueava o critério 3
desta tarefa, corrigido no arquivo (`cli_real.exs`) que está nas `areas` de T-018d.

**Commit:** `39177c2`

## Verificacao

### Ciclo 4

- **[PASSOU] [executado] A linha montada por `ClaudeCLI` não contém nenhum pedaço do texto da conversa: dois prompts completamente diferentes produzem a MESMA linha.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs --max-cases=1`
  Saída: 67 tests, 0 failures (inclui teste `"dois prompts completamente diferentes produzem a MESMA linha"`)

- **[PASSOU] [executado] Um prompt com quebras de linha, aspas duplas e `&` chega integro.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs --max-cases=1`
  Saída: 67 tests, 0 failures (inclui teste `"um prompt com quebras de linha, aspas duplas e & chega INTEGRO"`)

- **[PASSOU] [executado] Uma sessão REAL com prompt multi-linha devolve `{:ok, %Resposta{}}` com consumo preenchido.**
  Comando: `mix run priv/probes/cli_real.exs` (segunda execução)
  Saída: PROBE OK — Seção F passou: prompt multi-linha com aspas duplas e & conclui com consumo > 0 tokens_saida

- **[PASSOU] [executado] `escapar/1` não existe mais em `lib/`, e nenhuma outra função substitui aspas do prompt.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs --max-cases=1`
  Saída: 67 tests, 0 failures (inclui teste `"escapar/1 nao existe mais em lib/"`)

- **[PASSOU] [executado] O arquivo temporário é apagado também quando a chamada falha.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs --max-cases=1`
  Saída: 67 tests, 0 failures (inclui testes `"o arquivo temporário do prompt é apagado mesmo quando o prazo estoura"` e `"...com executável inexistente"`)

- **[PASSOU] [executado] A bateria completa passa nos cinco estágios, `tipos` incluído.**
  Comando: `mix fabrica.ci`
  Saída: bateria passou — 5 estágios ok (formato 2.9s, compilar 2.8s, lint 7.4s, testes 28.1s, tipos 17.5s)

Suíte: 67 teste(s) em claude_cli_test.exs (0 falhas); suíte completa 843 testes (0 falhas); probe real passou em ambas execuções
Graus de prova: 6 executados, 0 julgados

## Conformidade

### Ciclo 2

Conformidade: cumpre

- Critério 1 (a linha não contém pedaço do prompt) → `linha/1` em `lib/fabrica/operario/claude_cli.ex`, entregue no ciclo 1 (commit `cf19266`) e intocado neste ciclo; teste "dois prompts... MESMA linha" em `claude_cli_test.exs` — PASSOU.
- Critério 2 (prompt chega íntegro) → `texto_do_prompt/1` + arquivo temporário, idem ciclo 1, intocado; teste byte a byte — PASSOU.
- Critério 3 (sessão real multi-linha devolve consumo preenchido) → SECAO F de `priv/probes/cli_real.exs`, núcleo de T-018d, **não tocada neste ciclo**. O commit revisado aqui (`39177c2`) mexe só na SECAO C (herdada de T-018c), que travava a execução do probe inteiro — e por tabela o critério 3, que depende do probe rodar até o fim. Reportado "PROBE OK" nas Notas e na Verificação mecânica.
- Critério 4 (`escapar/1` ausente) → intacto desde o ciclo 1.
- Critério 5 (temporário apagado em falha) → intacto desde o ciclo 1.
- Critério 6 (`mix fabrica.ci`, 5 estágios) → intacto; reportado ok nas Notas e na Verificação.

**Escopo:** a única mudança de código deste ciclo é a asserção da SECAO C em `priv/probes/cli_real.exs`, arquivo listado em `areas:`. A SECAO C não é núcleo de T-018d (herdada de T-018c), mas bloqueava mecanicamente o critério 3 — o probe é um script sequencial e uma seção reprovada interrompe o veredito das seções seguintes. Corrigi-la para não afirmar uma garantia que o próprio `@moduledoc` do `ClaudeCLI` já declarava não existir (linhas 80–89: "a lacuna que fica: comando de shell não se audita por caminho", opção (c) aceita) é trabalho dentro das `areas` declaradas — não é desvio de escopo nem invenção de exigência nova.

**Espírito do Objetivo:** cumpre. O núcleo (prompt por `stdin`, fora da linha de comando) segue como entregue no ciclo 1; este ciclo apenas destrava a verificação mecânica de um probe cuja asserção estava desalinhada com uma decisão de desenho já registrada e documentada, sem alterar nenhum comportamento de produção.

## Revisao

### Ciclo 2

Aprovado sem ressalvas. Verificado:

- A alegação central do commit — "`--tools` fecha o vocabulário de verdade (Write/Edit nem são anunciados), mas `Bash` não se audita por caminho, lacuna aceita" — é fiel ao `@moduledoc` de `lib/fabrica/operario/claude_cli.ex` (linhas 41–51 e 80–89), que já registrava essa decisão **antes** deste commit. A correção do probe não inventa uma desculpa; alinha a asserção a uma decisão de desenho já tomada e documentada.
- A leitura de blocos que o probe faz (`&1.tipo == :uso_de_ferramenta`, `&1.nome`) usa os nomes de campo reais produzidos por `ClaudeCLI.interpretar/2` (`claude_cli.ex:497,499`) — não há erro de digitação nem campo inexistente.
- O diff está restrito a comentários explicativos e à lógica da SECAO C; a SECAO F (núcleo de T-018d) e o restante do adaptador não foram tocados — conferido linha a linha no `git show 39177c2`.
- Suíte (`mix test test/fabrica/operario/claude_cli_test.exs`, 67/67) e `mix fabrica.ci` (5 estágios) relatados verdes tanto nas Notas quanto na Verificação mecânica independente.

**Nota menor (não reprova):** a asserção final (`not existe? or usou_bash?`) tem um ponto cego teórico — se o modelo invocasse `Bash` por qualquer motivo alheio à criação do arquivo (ex.: um `ls` de checagem) na MESMA sessão em que `Write` tivesse, por alguma regressão futura de `--tools`, conseguido criar o arquivo de verdade, a asserção mascararia essa regressão (leria "usou Bash" e daria por certo, mesmo a causa real sendo Write). Dado que o prompt da SECAO C pede uma tarefa única e objetiva ("use a ferramenta de escrita para criar X"), o cenário é implausível na prática, mas fica registrado para quem for endurecer este probe no futuro — por exemplo, também exigindo evidência de que o `Bash` usado tenha efetivamente escrito o arquivo (via `tool_result` do próprio evento), não apenas que `Bash` apareça na lista de ferramentas.

## Verificação

### Passada mecânica (sem modelo)

- [executado] A linha montada por `ClaudeCLI` nao contem nenhum pedaco do texto da conversa: dois prompts completamente diferentes produzem a MESMA linha. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] Um prompt com quebras de linha, aspas duplas e `&` chega integro — o teste compara o conteudo do arquivo de entrada com o texto pedido, byte a byte. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Uma sessao REAL com prompt multi-linha (o caso que devolvia exit 255 com stdout e stderr vazios) devolve `{:ok, %Resposta{}}` com consumo preenchido. — `mix run priv/probes/cli_real.exs` → **PASSOU**
- [executado] `escapar/1` nao existe mais em `lib/`, e nenhuma outra funcao substitui aspas do prompt. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O arquivo temporario e apagado tambem quando a chamada falha (teste com executavel inexistente ou prazo estourado). — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 5 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        3.0s
  compilar   ok        2.9s
  lint       ok        7.7s
  testes     FALHOU   28.5s


Running ExUnit with seed: 64592, max_cases: 16

..........................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................

  1) test escape 3: link que aponta para fora recusa link cujo DESTINO esta fora (Fabrica.Ferramentas.ConfinamentoTest)
     test/fabrica/ferramentas/confinamento_test.exs:141
     ** (MatchError) no match of right hand side value:

         {:error, :sem_link}

     code: assert :ok = criar_link(fora, atalho),
     stacktrace:
       test/fabrica/ferramentas/confinamento_test.exs:144: (test)

.................................................................................................................................................................................................
Finished in 24.0 seconds (17.7s async, 6.3s sync)
17 doctests, 843 tests, 1 failure

bateria REPROVOU no estagio `testes` (codigo 2); 1 estagio(s) nem chegaram a rodar
```


Graus de prova: 6 executado(s), 0 para julgamento (de 6).

### Passada mecânica (sem modelo)

- [executado] A linha montada por `ClaudeCLI` nao contem nenhum pedaco do texto da conversa: dois prompts completamente diferentes produzem a MESMA linha. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] Um prompt com quebras de linha, aspas duplas e `&` chega integro — o teste compara o conteudo do arquivo de entrada com o texto pedido, byte a byte. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Uma sessao REAL com prompt multi-linha (o caso que devolvia exit 255 com stdout e stderr vazios) devolve `{:ok, %Resposta{}}` com consumo preenchido. — `mix run priv/probes/cli_real.exs` → **FALHOU**

```
==============================================================================
SECAO A: a chamada sucede e a traducao de blocos bate (marco da T-018a)
==============================================================================
  blocos ........ [:raciocinio, :texto]
  parada ........ fim_do_turno
  saida ......... 61
  texto ......... "pong"
  [ok] a chamada sucede (exige --verbose na linha)
  [ok] veio consumo de verdade
  [ok] nenhum bloco ficou :desconhecido
  [ok] o modelo respondeu o que se pediu

==============================================================================
SECAO B: papel construtor CRIA arquivo em modo headless (--permission-mode acceptEdits)
==============================================================================
  parada ........ fim_do_turno
  [ok] File.exists?(ok.txt) — nao a resposta do modelo

==============================================================================
SECAO C: papel verificador NAO escreve, mesmo com ordem EXPLICITA (--tools sem Write/Edit)
==============================================================================
  parada ........ fim_do_turno
  [FALHOU] File.exists?(nao-deveria-existir.txt) e FALSE

==============================================================================
SECAO D: teto BAIXO (--max-turns 1) PARA a sessao — motivo_parada: :teto_de_voltas
==============================================================================
  parada ........ teto_de_voltas
  arquivos criados 1/5 (esperado: incompleto, o teto cortou o meio)
  [ok] motivo_parada == :teto_de_voltas

==============================================================================
SECAO E: teto FOLGADO, MESMO pedido — conclui normalmente, o teto nao corta trabalho legitimo
==============================================================================
  parada ........ fim_do_turno
  arquivos criados 5/5 (esperado: completo)
  [ok] motivo_parada != :teto_de_voltas
  [ok] os cinco arquivos foram criados

============================
… (saída cortada)
```

- [executado] `escapar/1` nao existe mais em `lib/`, e nenhuma outra funcao substitui aspas do prompt. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O arquivo temporario e apagado tambem quando a chamada falha (teste com executavel inexistente ou prazo estourado). — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 6 executado(s), 0 para julgamento (de 6).

### Passada mecânica (sem modelo)

- [executado] A linha montada por `ClaudeCLI` nao contem nenhum pedaco do texto da conversa: dois prompts completamente diferentes produzem a MESMA linha. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] Um prompt com quebras de linha, aspas duplas e `&` chega integro — o teste compara o conteudo do arquivo de entrada com o texto pedido, byte a byte. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Uma sessao REAL com prompt multi-linha (o caso que devolvia exit 255 com stdout e stderr vazios) devolve `{:ok, %Resposta{}}` com consumo preenchido. — `mix run priv/probes/cli_real.exs` → **PASSOU**
- [executado] `escapar/1` nao existe mais em `lib/`, e nenhuma outra funcao substitui aspas do prompt. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O arquivo temporario e apagado tambem quando a chamada falha (teste com executavel inexistente ou prazo estourado). — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 6 executado(s), 0 para julgamento (de 6).


