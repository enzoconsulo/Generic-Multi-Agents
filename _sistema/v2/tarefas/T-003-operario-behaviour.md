---
id: T-003
titulo: behaviour Fabrica.Operario e o adaptador Falso
projeto: fabrica-v2
versao: v0.1
status: concluida
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
Feito em 2026-08-28. Commit do projeto: `404c917`. 3 arquivos novos.

**O que foi feito.** `lib/fabrica/operario.ex` com o `@callback conversar/2` e os quatro
tipos (`Bloco`, `Requisicao`, `Resposta`, `Consumo`); `lib/fabrica/operario/falso.ex` com o
duble; 16 testes em `test/fabrica/operario/falso_test.exs`.

**Decisoes de desenho, todas com motivo:**

- **Erro volta como `{:erro, termo}`, nunca excecao.** Erro de operario e informacao de
  governanca: o laco (T-015) precisa distinguir cota de recusa de falha de rede, e excecao
  perderia a distincao no caminho.
- **`Requisicao` separa `prefixo` (blocos, com `ponto_de_cache`) de `mensagens`.** E essa
  separacao que torna o cache possivel — editar o prefixo invalida tudo o que vem depois.
  A marca de ponto de cache vive na REQUISICAO, e nao dentro do adaptador, para o teste de
  bytes do prefixo (T-011) poder existir sem rede.
- **`Consumo` carrega a reparticao, nao um total.** Um total esconderia exatamente o numero
  que decide o desenho da v2. Guarda tambem o `ttl_cache`, sem o qual nao ha como saber
  depois qual multiplicador de escrita aplicar (1,25x ou 2,0x) — e a T-005 depende disso.
- **Uma agulha (`Agent`) por teste**, em vez de estado global no modulo: assim os testes do
  duble rodam `async: true` sem disputar roteiro.
- **`conversar/2` no `Falso` NAO tem argumento default**, embora o atalho publico
  `Fabrica.Operario.conversar/2` tenha. Um default no adaptador geraria tambem
  `conversar/1`, que nao e callback nenhum, e o `@impl` acusaria — o que reprovaria o
  `--warnings-as-errors`.

**UM TESTE ACUSOU O INOCENTE, e o conserto foi no teste.** A primeira versao da checagem de
"sem rede" usava `String.contains?(fonte, "Req")` e reprovou o `falso.ex` por causa de
`%Requisicao{}` — "Req" e substring de "Requisicao". A checagem passou a exigir palavra
inteira, com regex de limite. E, para o sensor nao virar decoracao, entrou um teste a mais
que prova que o detector AINDA reconhece uma referencia de verdade (`Req.get!(url)` casa;
`%Requisicao{}` e `alias ...Requisicao` nao). Sensor que nunca dispara e indistinguivel de
sensor quebrado — e este e o sensor de que o marco da v0.1 depende.

## Verificacao

**Criterio 1 — o comportamento esta definido com `conversar/2` e os tipos `Requisicao`,
`Resposta` e `Consumo`.** INSPECIONADO e travado por teste: `Fabrica.Operario` declara
`@callback conversar(Requisicao.t(), keyword()) :: {:ok, Resposta.t()} | {:erro, term()}`,
e os modulos `Bloco`, `Requisicao`, `Resposta` e `Consumo` existem com `@type t`. O teste
`o behaviour declara conversar/2` afirma
`{:conversar, 2} in Fabrica.Operario.behaviour_info(:callbacks)`, e
`Falso implementa o behaviour` confere o atributo `:behaviour` do modulo.

**Criterio 2 — `Operario.Falso` devolve as respostas do roteiro, na ordem, e um `Consumo`
por volta.** `verificar: mix test test/fabrica/operario/falso_test.exs` → **exit 0**

    16 tests, 0 failures

Cobertos: ordem do roteiro, duas agulhas independentes, o registro das requisicoes vistas,
`Consumo` com a reparticao preenchida, os numeros de cache ajustaveis e o `motivo_parada`.

**Criterio 3 — roteiro esgotado devolve `{:erro, :roteiro_esgotado}` em vez de travar ou
inventar resposta.** Mesmo arquivo, teste
`roteiro esgotado devolve {:erro, :roteiro_esgotado}, sem travar nem inventar`: consome a
unica resposta, e as DUAS chamadas seguintes devolvem o mesmo erro — o que tambem prova que
ele nao degrada de outra forma na segunda vez. Ha ainda `roteiro vazio ja comeca esgotado` e
`sem agulha nenhuma, devolve erro em vez de adivinhar` (`{:erro, :sem_roteiro}`).

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    101 mods/funs, found no issues.
    48 tests, 0 failures

## Conformidade


## Revisao
