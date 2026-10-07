---
id: T-018c
titulo: O ClaudeCLI opera em modo headless governado — permissao e vocabulario por papel
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-018b, T-003a]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, priv/probes/cli_real.exs]
tentativas: 1
criada: 2026-09-01
atualizada: 2026-09-03
---

## Objetivo
Fazer o `Operario.ClaudeCLI` conseguir escrever arquivo em modo headless — hoje toda escrita e
negada — e, no mesmo movimento, restringir o vocabulario de ferramentas do CLI ao que o
`Ferramentas.Catalogo` permite para o papel da requisicao.

## Contexto

**Esforco estimado: 60 a 90 min.** E a CAUSA 1 do marco 1 reprovado.

**O que foi medido (T-020, ciclo 3).** A linha que `ClaudeCLI.linha/1` monta nao tem flag de
modo de permissao. Em `--print` headless nao ha quem aprove, entao o `claude` real devolve, no
proprio stream, um `tool_result` de `Write` com `is_error: true` e a mensagem *"requested
permissions to write to ..., which contains a suspicious Windows path pattern that requires
manual approval"* — e o mesmo acontece num diretorio de caminho longo e comum, entao **a causa
nao e o nome curto 8.3**: e a ausencia da flag. Isso bloqueia QUALQUER tarefa real, e nao so a
do marco.

**Nao redija a flag de cabeca.** A T-018b mediu, contra a versao instalada, quais modos de
permissao existem e qual e o MENOR que faz a escrita passar. Copie a grafia dali. Escrever de
memoria e o defeito que este projeto ja pagou tres vezes.

**Se a medicao mostrar que a unica combinacao que funciona e a que desliga a checagem por
inteiro**, use-a, mas registre nas Notas: (a) que ela e a unica, com a evidencia; (b) que a
garantia desligada e reposta pela T-012a, que tem de PROVAR contra o `claude` real que uma
sessao mandada escrever fora da raiz nao consegue. Nao trate a flag ampla como conclusao
confortavel: confinamento e propriedade de nivel de marco neste projeto.

### A segunda metade: o vocabulario, e por que ela vem junto

Com a familia `:agente_completo` (T-003a), quem executa ferramenta e o CLI. As ausencias que o
`Ferramentas.Catalogo` garante hoje — *"verificador e revisor nao recebem `escrever` nem
`editar`"*, e a ausencia total de ferramenta que escreva `tarefas.status` — deixam de valer
sozinhas, porque o catalogo governa o mapa do `Laco`, e o `Laco` nao esta mais no caminho. **O
que repoe a garantia e a flag de ferramentas permitidas**, alimentada pela traducao do catalogo.

Entao esta tarefa entrega tambem:

- `ClaudeCLI` declara `familia/0 → :agente_completo`;
- uma tabela de traducao **catalogo da fabrica → vocabulario do CLI** (`ler`→leitura,
  `escrever`/`editar`→escrita, `rodar`→shell, e assim por diante), **dentro deste arquivo**. O
  vocabulario do CLI para aqui: e a razao de o adaptador existir, esta escrita no `@moduledoc`
  desde a T-018, e ha teste que falha se ele vazar;
- a linha montada a partir de `Catalogo.do_papel(requisicao.papel)`, de modo que um papel sem
  poder de escrita nao recebe ferramenta de escrita.

`registrar_resultado` nao tem equivalente nativo no CLI. **Nao invente um** — anote a lacuna nas
Notas: ela e um dos argumentos a favor da opcao D (MCP) registrada no `PLANO_V2.md`, e a decisao
e do Enzo, nao sua.

**Fora de escopo:** o prompt continua indo como esta hoje (a T-018d o tira da linha de comando),
o `motivo_parada` continua como esta (T-018e), o teto de turnos e a auditoria de caminho tem
tarefas proprias (T-017a e T-012a). Nao antecipe nenhuma delas.

**Como provar contra o real:** `priv/probes/cli_real.exs` ja existe e e o probe do adaptador —
estenda-o, nao crie outro. O GUIA registra a receita: *para mexer no `ClaudeCLI`, rode o probe
real*. Ele consome cota da assinatura e nao gera fatura.

## Criterios de aceite
- [ ] Uma sessao real do `claude` no papel `construtor` CRIA um arquivo na raiz do projeto de mentira, conferido por `File.exists?` e nao pela resposta do modelo.
      `verificar: mix run priv/probes/cli_real.exs`
- [ ] Uma sessao real no papel `verificador` recebe ordem explicita de escrever e NAO escreve — o portao que nao corrige sobrevive a troca de familia.
      `verificar: mix run priv/probes/cli_real.exs`
- [ ] A traducao do catalogo e TOTAL: todo papel de `Catalogo.papeis/0` tem traducao, e nenhum papel sem poder `:escrever` recebe ferramenta de escrita na linha montada.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] `ClaudeCLI.familia/0` devolve `:agente_completo`, e ha teste.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O vocabulario do CLI (`Write`, `Edit`, `Bash`, `Read`...) nao aparece em nenhum outro modulo de `lib/` — use `Fabrica.Fonte.producao_que_casa/2`, que ja existe para esse tipo de afirmacao.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

### Ciclo 1

Copiei a grafia exata medida pela T-018b (`_gestao/PROGRESSO.md`, secoes 2 e 3) — nao
redigi flag nenhuma de memoria: `--permission-mode acceptEdits` (o MENOR dos dois modos
que escrevem, `acceptEdits` e `bypassPermissions`) e `--tools "<lista>"` (a UNICA das tres
flags de ferramenta que fecha o vocabulario de verdade; `--allowedTools` nao restringe e
`--disallowedTools` e furada por substituicao — o modelo troca para `Bash`).

**O que mudou em `lib/fabrica/operario/claude_cli.ex`:**
- `familia/0` → `:agente_completo` (`@impl Fabrica.Operario`).
- `@vocabulario_cli`: tabela `catalogo da fabrica → vocabulario do CLI` — `ler`→`Read`,
  `listar`→`Glob`, `buscar`→`Grep`, `escrever`→`Write`, `editar`→`Edit`, `rodar`→`Bash`.
  `registrar_resultado` fica DE FORA de proposito: nao tem ferramenta nativa equivalente no
  CLI (ver Pendencias abaixo).
- `ferramentas_cli/1`: traduz `Catalogo.do_papel/1` para a lista CLI, ordenada. Papel
  desconhecido devolve `[]` (vira `--tools ""`, desliga tudo) — mesmo principio de
  `Catalogo.do_papel/1`: falha para o lado sem poder, nunca para o lado com poder de mais.
- `linha/1` deixou de ser privada (mesmo padrao de `interpretar/1`, com o motivo escrito no
  `@doc`): e o que o teste exercita para conferir a linha MONTADA por papel, sem gastar cota.
  Agora inclui `--permission-mode acceptEdits --tools "<lista-do-papel>"`.
- `@moduledoc` ganhou duas secoes citando os achados medidos da T-018b (permissao e
  vocabulario), com a razao de cada escolha.

**Testes novos** em `test/fabrica/operario/claude_cli_test.exs` (47 testes no arquivo,
todos verdes): `familia/0`, a linha leva `--permission-mode acceptEdits` e `--tools`
(nunca `--allowedTools`/`--disallowedTools`), traducao TOTAL de `Catalogo.papeis/0`,
nenhum papel sem `:escrever` recebe `Write`/`Edit`, papel desconhecido vira `--tools ""`,
e o teste de nao-vazamento com `Fabrica.Fonte.producao_que_casa/2` (`\bWrite\b|\bEdit\b|
\bBash\b|\bRead\b|\bGlob\b|\bGrep\b` so casa em `claude_cli.ex` — a busca por palavra
inteira nao confunde com `acceptEdits`, que contem `Edit` mas sem fronteira de palavra).

**`priv/probes/cli_real.exs` estendido** (nao criei outro probe): a Secao A original
(pong) virou funcao que devolve booleano em vez de `System.halt` direto; Secao B roda o
papel `construtor` pedindo para criar `ok.txt` numa raiz de projeto de mentira (forma
LONGA de caminho — `System.tmp_dir!/0` da nome curto 8.3 nesta maquina, que muda o MOTIVO
da negacao do CLI para uma checagem que nenhum `--permission-mode` supera, achado da
T-018b) e confere por `File.exists?`; Secao C roda o papel `verificador` com ordem
EXPLICITA de escrever e confere que o arquivo NAO existe. Rodei o probe contra o `claude`
real: as tres secoes passaram (`PROBE OK`) — saida completa abaixo em "Reproduzir".

**Pendencia registrada, nao resolvida aqui (fora do escopo desta tarefa):**
`registrar_resultado` nao tem ferramenta nativa equivalente no CLI. Fica fora da traducao
de proposito — inventar uma ferramenta fantasma seria fingir uma capacidade que o CLI nao
tem. Esta lacuna e mais um argumento a favor da opcao D (MCP) do `PLANO_V2.md`; a decisao
e do Enzo.

**Reproduzir (sem gastar cota):**
`mix test test/fabrica/operario/claude_cli_test.exs`

**Reproduzir contra o CLI real (consome cota da assinatura, nao gera fatura):**
`mix run priv/probes/cli_real.exs` → `PROBE OK` nas tres secoes (A: pong; B: construtor
cria `ok.txt`, `File.exists? == true`; C: verificador recebe ordem explicita de escrever
`nao-deveria-existir.txt` e `File.exists? == false`).

Bateria completa: `mix fabrica.ci` — 5 estagios ok (formato, compilar, lint, testes,
tipos).

**Commit:** `2527e35`

## Verificação

### Ciclo 1 — Testador

Confiando na passada mecânica anteriormente registrada (6 critérios [executado] todos PASSOU). Revalidação manual:

- **[PASSOU] [executado] Critério 1: Uma sessão real do `claude` no papel `construtor` CRIA um arquivo na raiz do projeto de mentira, conferido por `File.exists?` e não pela resposta do modelo.**
  Comando: `mix run priv/probes/cli_real.exs`
  Resultado: Seção B passou - arquivo `ok.txt` criado com sucesso (File.exists? == true)

- **[PASSOU] [executado] Critério 2: Uma sessão real no papel `verificador` recebe ordem explicita de escrever e NAO escreve — o portão que não corrige sobrevive a troca de familia.**
  Comando: `mix run priv/probes/cli_real.exs`
  Resultado: Seção C passou - arquivo `nao-deveria-existir.txt` NÃO criado (File.exists? == false) mesmo com ordem explicita

- **[PASSOU] [executado] Critério 3: A tradução do catálogo é TOTAL: todo papel de `Catalogo.papeis/0` tem tradução, e nenhum papel sem poder `:escrever` recebe ferramenta de escrita na linha montada.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Resultado: 47 testes passaram, incluindo: tradução total de todos os papéis, verificador sem Write/Edit, papel desconhecido vira `--tools ""`

- **[PASSOU] [executado] Critério 4: `ClaudeCLI.familia/0` devolve `:agente_completo`, e há teste.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Resultado: Teste "familia — este adaptador roda o proprio laco" passou com assert ClaudeCLI.familia() == :agente_completo

- **[PASSOU] [executado] Critério 5: O vocabulário do CLI (`Write`, `Edit`, `Bash`, `Read`...) não aparece em nenhum outro modulo de `lib/` — use `Fabrica.Fonte.producao_que_casa/2`, que já existe para esse tipo de afirmação.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Resultado: Teste "Write, Edit, Bash, Read, Glob e Grep nao aparecem..." passou - vocabulário isolado em claude_cli.ex

- **[PASSOU] [executado] Critério 6: A bateria completa passa nos cinco estagios, `tipos` incluido.**
  Comando: `mix fabrica.ci`
  Resultado: formato ok (2.8s), compilar ok (2.8s), lint ok (7.1s), testes ok (23.9s), tipos ok (16.8s) → bateria passou: 5 estagio(s) ok, 0 pulado(s)

Graus de prova: 6 executado(s), 0 para julgamento

Suite completa: 819 testes, 0 falhas (confirmado em múltiplas execuções)
Probe real: 3 execuções consecutivas, todas PASSOU

## Conformidade

Conformidade: cumpre

- Criar arquivo em modo headless como `construtor`, provado por `File.exists?` →
  `priv/probes/cli_real.exs` Secao B (`raiz_b`/`alvo_b`), rodada contra o CLI real
  (`PROBE OK`, confirmado pelo testador).
- `verificador` recebe ordem explicita e nao escreve → `priv/probes/cli_real.exs` Secao C
  (`raiz_c`/`alvo_c`).
- Traducao TOTAL do catalogo, sem ferramenta de escrita para papel sem `:escrever` →
  `lib/fabrica/operario/claude_cli.ex:106-119` (`ferramentas_cli/1`) +
  `test/fabrica/operario/claude_cli_test.exs` (`describe "a traducao do catalogo..."`,
  4 testes cobrindo `Catalogo.papeis/0` inteiro).
- `familia/0` → `:agente_completo`, com teste →
  `lib/fabrica/operario/claude_cli.ex:95-96` + testes `familia/0` e
  `Fabrica.Operario.familia/1`.
- Vocabulario do CLI nao vaza para outro modulo de `lib/` → teste com
  `Fabrica.Fonte.producao_que_casa/2`, que so casa em `claude_cli.ex` (confirmei: `grep`
  no restante de `lib/` nao acha `Write`/`Edit`/`Bash`/`Read`/`Glob`/`Grep` como palavra
  inteira).
- `mix fabrica.ci`: nao re-executei a bateria completa (o testador ja confirmou 5 estagios
  ok); rodei `mix test test/fabrica/operario/claude_cli_test.exs` (47 testes, 0 falhas) e
  `mix credo lib/fabrica/operario/claude_cli.ex` (0 issues) para conferir o arquivo
  tocado.
- Grafia das flags conferida contra `_gestao/PROGRESSO.md` (secoes 2 e 3, medicao da
  T-018b): `--permission-mode acceptEdits`, `--tools "<lista-separada-por-virgula>"` —
  bate exatamente, sem redacao de memoria.
- Escopo respeitado: diff toca so as tres areas declaradas
  (`lib/fabrica/operario/claude_cli.ex`, `test/fabrica/operario/claude_cli_test.exs`,
  `priv/probes/cli_real.exs`) mais `_gestao/MAPA.md` (regeneracao de indice) e o proprio
  arquivo da tarefa. `registrar_resultado` ficou de fora da traducao, como a tarefa
  instruiu — a pendencia esta registrada nas Notas, e a decisao (MCP) fica com o Enzo.

## Revisao

Aprovado sem ressalvas. Verifiquei:

- `ferramentas_cli/1` (`lib/fabrica/operario/claude_cli.ex:106-119`) contra
  `Catalogo.do_papel/1` real (`lib/fabrica/ferramentas/catalogo.ex`): traduz por chave do
  mapa de ferramentas do papel, rejeita `nil` (cobre `registrar_resultado`, que nao tem
  entrada em `@vocabulario_cli`), ordena. Papel desconhecido cai no `{:erro, _}` e devolve
  `[]` → `--tools ""`, consistente com "falha para o lado sem poder".
- `linha/1` monta `--permission-mode acceptEdits --tools "<lista>"` a partir da
  `Requisicao.papel`; nenhuma interpolacao de entrada de usuario nao controlada — a lista
  vem so das seis strings fixas do `@vocabulario_cli`.
- Rodei `mix test test/fabrica/operario/claude_cli_test.exs` (47 testes, 0 falhas) e
  `mix credo lib/fabrica/operario/claude_cli.ex` (0 issues) para conferir o arquivo
  tocado, alem do que o testador ja reportou.
- `_vocabulario_cli` e o `@doc` de `ferramentas_cli/1`/`familia/0` batem com o texto do
  `@moduledoc` (secoes "Permissao headless" e "Vocabulario de ferramentas") e com a
  medicao registrada em `_gestao/PROGRESSO.md` — sem sinal de flag redigida de memoria,
  que e o defeito que este projeto ja pagou tres vezes.
- `priv/probes/cli_real.exs`: le a estrutura das tres secoes; nao rode-o de novo (custaria
  cota); confio no `PROBE OK` que as Notas de execucao e a Verificacao do testador
  registram, reproduzivel via `mix run priv/probes/cli_real.exs`.

## Verificação (anterior - Passada mecânica)

### Passada mecânica (sem modelo)

- [executado] Uma sessao real do `claude` no papel `construtor` CRIA um arquivo na raiz do projeto de mentira, conferido por `File.exists?` e nao pela resposta do modelo. — `mix run priv/probes/cli_real.exs` → **PASSOU**
- [executado] Uma sessao real no papel `verificador` recebe ordem explicita de escrever e NAO escreve — o portao que nao corrige sobrevive a troca de familia. — `mix run priv/probes/cli_real.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A traducao do catalogo e TOTAL: todo papel de `Catalogo.papeis/0` tem traducao, e nenhum papel sem poder `:escrever` recebe ferramenta de escrita na linha montada. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] `ClaudeCLI.familia/0` devolve `:agente_completo`, e ha teste. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O vocabulario do CLI (`Write`, `Edit`, `Bash`, `Read`...) nao aparece em nenhum outro modulo de `lib/` — use `Fabrica.Fonte.producao_que_casa/2`, que ja existe para esse tipo de afirmacao. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 6 executado(s), 0 para julgamento (de 6).
