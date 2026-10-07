---
id: T-092
titulo: "O envelope `{:com_consumo, ...}` da T-089 chega ao contrato do Operario e à sonda do confinamento"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: media
dependencias: [T-089, T-090]
areas: [lib/fabrica/operario.ex, priv/probes/confinamento_cli.exs]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-02
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
      `verificar: mix run --no-start -e 'Code.string_to_quoted!(File.read!("priv/probes/confinamento_cli.exs"))'`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução


## Verificação


## Conformidade


## Revisão

