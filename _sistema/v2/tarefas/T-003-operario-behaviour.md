---
id: T-003
titulo: behaviour Fabrica.Operario e o adaptador Falso
projeto: fabrica-v2
versao: v0.1
status: backlog
prioridade: alta
dependencias: [T-001]
areas: [lib/fabrica/operario.ex, lib/fabrica/operario/falso.ex, test/fabrica/operario/falso_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Definir o contrato `Fabrica.Operario` — a fronteira que separa a governanca do fornecedor
do modelo — e implementar `Operario.Falso`, o duble deterministico que a suite usa para
sempre.

## Contexto
Esta e a decisao 6.1 de `MIGRACAO_V2.md`, e ela e a razao de o contrato existir na v0.1 e
nao na v0.2: o marco desta versao e a suite rodando sem rede, e isso exige o contrato ja
existindo com o `Falso` implementando-o.

O contrato precisa de exatamente uma funcao, e ela e sincrona:

    @callback conversar(requisicao :: Requisicao.t(), opcoes :: keyword()) ::
                {:ok, Resposta.t()} | {:erro, termo :: term()}

`Requisicao` carrega: modelo, blocos do prefixo (com o ponto de cache de cada um), o
historico de mensagens, as ferramentas disponiveis, e o teto de voltas. `Resposta`
carrega: os blocos de conteudo devolvidos, o `motivo_parada`
(`:fim_do_turno` | `:uso_de_ferramenta` | `:teto_de_tokens` | `:recusa`), e o `Consumo`
daquela volta (os seis numeros da tabela `consumos`).

`Operario.Falso` responde a partir de um roteiro declarado no teste — uma lista de
respostas na ordem em que devem sair. Ele NAO chama rede, NAO le variavel de ambiente e
NAO tem caminho que possa acidentalmente gastar cota. E ele DEVE devolver `Consumo`
plausivel, com numeros de cache, senao os testes de contabilidade da T-005 nao teriam o
que exercitar.

Escreva tambem um teste que falha se `Operario.Falso` referenciar qualquer modulo de
HTTP. E paranoia barata e protege o marco desta versao.

## Criterios de aceite
- [ ] O comportamento esta definido com o callback `conversar/2` e os tipos `Requisicao`, `Resposta` e `Consumo`.
- [ ] `Operario.Falso` devolve as respostas do roteiro, na ordem, e um `Consumo` por volta.
      `verificar: mix test test/fabrica/operario/falso_test.exs`
- [ ] Um roteiro esgotado devolve `{:erro, :roteiro_esgotado}` em vez de travar ou inventar resposta.
      `verificar: mix test test/fabrica/operario/falso_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

