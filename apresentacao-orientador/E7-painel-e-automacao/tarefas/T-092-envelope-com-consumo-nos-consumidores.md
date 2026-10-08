---
id: T-092
titulo: "O envelope `{:com_consumo, ...}` da T-089 chega ao contrato do Operario e à sonda do confinamento"
projeto: fabrica-v2
versao: v1.0
status: em-execucao
prioridade: media
dependencias: [T-089, T-090, T-099, T-103]
areas: [lib/fabrica/operario.ex, priv/probes/confinamento_cli.exs]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-07
ultima-reprovacao: mecanica
---

## Objetivo
Quem lê o contrato de `Fabrica.Operario` sabe que um erro pode vir embrulhado com o consumo já medido,
e a sonda `priv/probes/confinamento_cli.exs` classifica certo as saídas que o `ClaudeCLI` de hoje
devolve — em vez de reprovar um caso correto.

## Contexto
Uma causa raiz só: a T-089 criou o envelope `{:erro, {:com_consumo, motivo, %Consumo{}}}` (casos
`fora_do_confinamento` e `prazo`; tupla de 2 de propósito, para não quebrar quem casa
`{:erro, motivo}`; parede de cota NÃO usa envelope — D-015, adendo 6) e o propagou ao `Laco`, mas não a
dois consumidores, ambos registrados como pendência pelo revisor da T-089:

1. `@callback conversar/2` de `lib/fabrica/operario.ex` (~l. 31) diz só
   `{:ok, Resposta.t()} | {:erro, term()}` — o tipo cobre, mas nada diz que o envelope existe, quando
   aparece, nem que o `Laco` contabiliza o consumo dele.
2. `priv/probes/confinamento_cli.exs`, closure `avaliar` (~l. 66-87): casa
   `{:erro, {:fora_do_confinamento, caminhos}}` cru — hoje esse caso chega como
   `{:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, consumo}}` e cai no ramo genérico
   `{:erro, motivo}` → "FALHOU" num cenário em que o confinamento funcionou. E desde a T-090 o papel
   `construtor` sobe com sandbox: sem `bwrap`, a sonda recebe `{:erro, :sandbox_indisponivel}`, que
   também merece mensagem própria (não é falha do confinamento — é a falta dele, e o CLI não subiu).

A sonda CONSOME COTA (chama o `claude` real); esta tarefa NÃO a roda.

## Critérios de aceite
- [ ] A documentação do callback `conversar/2` (ou do módulo, junto dele) descreve o envelope
      `{:erro, {:com_consumo, motivo, %Consumo{}}}`: quando aparece, que o consumo é o já medido, que o
      `Laco` o contabiliza e que a parede de cota não o usa. (inspecionável — o revisor confere no diff)
- [ ] A closure `avaliar` da sonda trata `{:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, _}}`
      como o ramo da auditoria de hoje (mesma checagem `File.exists?`), mostra o consumo quando houver, e
      dá mensagem própria a `{:erro, :sandbox_indisponivel}`; o arquivo continua sintaticamente válido.
      `verificar: mix fabrica.sintaxe priv/probes/confinamento_cli.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.
- 2026-10-07 (planejador, replanejamento pós-Ciclo 2): **impedimento aceito como real** (protocolo,
  regra 0) — o construtor confirmou a causa com `mix.exs` no lugar do arquivo original (mesmo erro
  255), então não é defeito de `confinamento_cli.exs` nem de `operario.ex`: é o comando do critério
  2 que é inexecutável nesta fábrica. Causa raiz: `Fabrica.Criterios.Allowlist.avaliar/1` quebra o
  comando por `String.split(bruto, ~r/\s+/)` sem respeitar aspas antes de `Comando.rodar/4`, que
  nunca passa por shell — um `-e '<expressão com espaço>'` chega em pedaços e as aspas simples
  chegam como caracteres literais, travando o `cmd.exe` que roda o `mix.bat`. Não há edição possível
  em `operario.ex` ou `confinamento_cli.exs` que resolva isso (como o próprio Ciclo 2 já apontava).
  **Correção:** nasce a T-103 (`mix fabrica.sintaxe <arquivo>`), a task mix dedicada que o próprio
  `lib/fabrica/criterios/allowlist.ex` já recomendava no comentário acima de `@perigoso` ("quem
  precisa de script escreve um alias e chama o alias"); o critério 2 passa a usar
  `verificar: mix fabrica.sintaxe priv/probes/confinamento_cli.exs` — dois argumentos simples, sem
  aspas e sem `-e`. `dependencias` ganha T-103 (fundação declarada na tarefa que ela serve, não o
  contrário). `tentativas` zerada: as duas tentativas foram gastas no trabalho do Ciclo 1 (entrega
  intacta e correta, commit `8e48aca`) e na confirmação do impedimento no Ciclo 2, nunca em defeito
  do código desta tarefa. `status` não é movido por este planejador — o entregável do Ciclo 1 segue
  commitado e intacto; cabe ao fluxo normal de verificação reavaliar o critério 2 **depois** que a
  T-103 concluir (sem ela, o comando novo também não existe ainda). Decisão registrada em D-022.

### Ciclo 1
- `lib/fabrica/operario.ex`: acrescentei ao `@doc` do callback `conversar/2` a seção "O
  envelope `{:erro, {:com_consumo, motivo, %Consumo{}}}`" — quando aparece (sessão que já
  gastou antes do erro), que o consumo é o já medido, que o `Laco` o contabiliza antes de
  encerrar, e que a parede de cota NÃO usa o envelope (D-015, adendo 6). O `@callback`
  ganhou a cláusula correspondente no tipo de retorno, ao lado de `{:erro, term()}` — não a
  substitui, para não quebrar quem casa `{:erro, motivo}` cru.
- `priv/probes/confinamento_cli.exs`: a closure `avaliar` ganhou dois ramos novos ANTES do
  `{:erro, motivo}` genérico:
  - `{:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, consumo}}` — mesma checagem
    `File.exists?` do ramo de auditoria de hoje, mostrando o consumo medido;
  - `{:erro, :sandbox_indisponivel}` — mensagem própria, não reprova o probe (é falta do
    CLI subir, não falha do confinamento).
- Não toquei em `lib/fabrica/operario/claude_cli.ex` nem em `lib/fabrica/agente/laco.ex`:
  o envelope e sua contabilização já existiam (T-089/T-091); esta tarefa só fechava os dois
  consumidores pendentes.
- Testes: não precisei de teste novo — a tarefa é documentação de contrato (não altera
  comportamento) e correção de uma closure de probe que só roda com cota real (a própria
  tarefa diz para não rodar a sonda). Validei com `mix compile --warnings-as-errors` e com
  o `verificar:` do critério 2 (sintaxe do probe), ambos verdes, e com a bateria completa.
- **Reproduzir:** `mix run --no-start -e 'Code.string_to_quoted!(File.read!("priv/probes/confinamento_cli.exs"))'` (critério 2) e `mix fabrica.ci` (critério 3).
- **Commit:** `8e48aca`

### Ciclo 2
- A reprovação mecânica do critério 2 (`)' foi inesperado neste momento.`, código 255) **não é
  defeito do probe nem de `operario.ex`** — reproduzi o caminho REAL da passada mecânica (não
  um shell isolado) chamando `Fabrica.Criterios.Allowlist.avaliar/1` seguido de
  `Fabrica.Ferramentas.Comando.rodar/4` com o comando exato do critério, e o mesmo erro aparece
  **com qualquer arquivo** — troquei `confinamento_cli.exs` por `mix.exs` (sintaticamente
  trivial e nada a ver com esta tarefa) e a saída foi idêntica.
- Causa raiz: `Comando.rodar/4` nunca passa por um shell que processe aspas — o argv vai direto
  para `Port.open({:spawn_executable, ...})` (ver `lib/fabrica/ferramentas/comando.ex`). As
  aspas simples `-e '...'` do critério são sintaxe de shell POSIX; aqui elas chegam como
  caracteres LITERAIS dentro de um único argumento (confirmado via
  `Fabrica.Criterios.Allowlist.avaliar/1`, que faz `String.split(bruto, ~r/\s+/)` sem respeitar
  aspas), e o `cmd.exe` que o Windows invoca para `mix.bat` trava no parêntese desencontrado
  quando tenta reinterpretar essa string. O comando do critério, como está escrito, é
  inexecutável nesta fábrica — em qualquer tarefa, não só nesta.
- Não toquei em `confinamento_cli.exs` nem em `operario.ex` nesta volta: a entrega do Ciclo 1
  (as duas branches novas em `avaliar` e a documentação do envelope) está correta e intacta; o
  que falhou é só a forma como o critério foi redigido, e isso o executor não pode alterar.
- **Reproduzir o diagnóstico:**
  ```
  mix run --no-start -e 'comando = ~S[mix run --no-start -e (quote)Code.string_to_quoted!(File.read!("mix.exs"))(quote)]; {:ok, [p|a]} = Fabrica.Criterios.Allowlist.avaliar(comando); IO.inspect(Fabrica.Ferramentas.Comando.rodar(File.cwd!(), p, a, prazo: 30_000))'
  ```
  (troque `(quote)` pelo caractere `'` — a demonstração real usou um arquivo `.exs` temporário
  para não lutar com aspas aninhadas na linha de comando; o ponto fica provado comparando a
  saída com a do critério 2, ambas `)' foi inesperado neste momento.`, código 255.)

Impedimento: o `verificar:` do critério 2 (`mix run --no-start -e '...'`) usa aspas simples ao
estilo shell POSIX, mas `Fabrica.Ferramentas.Comando.rodar/4` nunca invoca um shell que as
processe — o argv vai direto a `Port.open(:spawn_executable, ...)`. No Windows, isso faz
`cmd.exe` (invocado para rodar `mix.bat`) travar no parêntese desencontrado, para QUALQUER
conteúdo de arquivo, não só para `confinamento_cli.exs`. Não há edição possível em
`operario.ex` ou `confinamento_cli.exs` que corrija isso — o defeito está no comando do
critério. Sugestão para o planejador: reescrever o `verificar:` sem `-e` com aspas simples
aninhadas (ex.: um script `.exs` fixo versionado que o comando apenas invoca, ou uma task mix
dedicada), já que esse padrão de comando tende a quebrar em qualquer tarefa que o repita neste
ambiente.


## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [julgado] A documentação do callback `conversar/2` (ou do módulo, junto dele) descreve o envelope `{:erro, {:com_consumo, motivo, %Consumo{}}}`: quando aparece, que o consumo é o já medido, que o `Laco` o contabiliza e que a parede de cota não o usa. (inspecionável — o revisor confere no diff) — sem comando declarado; fica para o verificador.
- [executado] A closure `avaliar` da sonda trata `{:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, _}}` como o ramo da auditoria de hoje (mesma checagem `File.exists?`), mostra o consumo quando houver, e dá mensagem própria a `{:erro, :sandbox_indisponivel}`; o arquivo continua sintaticamente válido. — `mix run --no-start -e 'Code.string_to_quoted!(File.read!("priv/probes/confinamento_cli.exs"))'` → **FALHOU**

```
)' foi inesperado neste momento.
```

- [executado] Bateria completa verde. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 3 executado(s), 1 para julgamento (de 4).



## Conformidade


## Revisão


