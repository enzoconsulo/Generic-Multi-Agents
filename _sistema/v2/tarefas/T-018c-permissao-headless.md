---
id: T-018c
titulo: O ClaudeCLI opera em modo headless governado — permissao e vocabulario por papel
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-018b, T-003a]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, priv/probes/cli_real.exs]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
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


## Verificacao


## Conformidade


## Revisao
