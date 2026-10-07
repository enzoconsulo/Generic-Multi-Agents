# fabrica-v2

A v2 da fábrica de software multi-agente, em Elixir/OTP.

Um sistema que recebe a descrição de um projeto em linguagem natural e o constrói de ponta a
ponta — agentes que planejam, implementam, verificam, revisam e documentam. A intervenção
humana obrigatória acontece uma vez só, no pedido.

A tese que ela defende: *um sistema multi-agente não falha por escrever mal — falha por
governar mal.* A v2 move para o compilador, para a árvore de supervisão e para o esquema do
banco tudo o que na v1 era frase imperativa dentro de um prompt. **Não precisa ser mais
esperta que a v1; precisa ser mais difícil de operar errado.**

O planejamento, as decisões e as 58 tarefas estão no repositório da fábrica, um nível acima:
`_sistema/PLANO_V2.md`, `_sistema/DECISOES_FECHADAS.md` e `_sistema/v2/`.
Como o projeto se organiza por dentro: [`_gestao/GUIA.md`](_gestao/GUIA.md).

## Pré-requisitos

- Elixir 1.19.4 sobre Erlang/OTP 28.1
- PostgreSQL 18 com a extensão pgvector, escutando em `127.0.0.1:5432`

O ambiente e como montá-lo numa máquina nova estão em `_sistema/AMBIENTE_V2.md` (raiz da
fábrica). O banco **não** é serviço do Windows, de propósito — sobe quando se trabalha:

```
_sistema\ferramentas\banco-v2.ps1 subir      # sobe
_sistema\ferramentas\banco-v2.ps1 conferir   # prova que o pgvector responde
_sistema\ferramentas\banco-v2.ps1 derrubar   # desliga
```

## Como rodar

```
mix setup          # dependências, banco, e os ativos de front
mix phx.server     # sobe em http://localhost:4000
```

Dentro do IEx, para inspecionar enquanto roda:

```
iex -S mix phx.server
```

## Como testar

```
mix verificar
```

É este o comando que a fábrica roda em toda verificação. Ele executa quatro estágios, nesta
ordem, e o primeiro que falhar interrompe os seguintes:

| estágio | comando |
|---|---|
| formato | `mix format --check-formatted` |
| compilação | `mix compile --warnings-as-errors` |
| lint | `mix credo --strict` |
| testes | `mix test` |

Para rodar só os testes: `mix test`. Para um arquivo: `mix test test/caminho_test.exs`.

`mix dialyzer` fica **fora** do `verificar` de propósito — a primeira execução constrói a PLT
e demora minutos, o que tornaria o comando inutilizável no dia a dia. Ele é estágio próprio
da verificação contínua, e não é opcional: checagem de tipos é uma das formas de mover a
regra para o compilador.

## Idioma

Tudo em português — módulo, função, variável, mensagem de erro e commit. `Fabrica.Tarefa`,
nunca `Fabrica.Task`.
