---
id: T-001
titulo: Scaffold Phoenix com qualidade, GUIA e commit inicial
projeto: fabrica-v2
versao: v0.1
status: concluida
prioridade: alta
dependencias: []
areas: [mix.exs, config/config.exs, config/test.exs, README.md, _gestao/GUIA.md, .formatter.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Criar o projeto Elixir/Phoenix `fabrica`, com formatador, Credo, Dialyzer e ExUnit
configurados e rodando, um alias `mix verificar` que roda tudo de uma vez, README com os
comandos reais, `_gestao/GUIA.md` preenchido e um commit contendo tudo isso. Esta e a
fundacao: toda tarefa seguinte depende dela.

## Contexto
O REPOSITORIO DA v2 E `projetos/fabrica-v2/` (decisao de 28/08, em
`DECISOES_FECHADAS.md`): git proprio, ao lado, ja fora do `.gitignore` da raiz da fabrica.
A v1 fica INTOCADA. Crie o diretorio, rode `git init` nele, e trabalhe la dentro — nada
desta tarefa toca a arvore da v1.

Rode `mix phx.new fabrica --database postgres --no-mailer --no-gettext` dentro dele.
LiveView fica LIGADO (e a tela da v1.0) mas nenhuma pagina propria e
criada agora — o scaffold do Phoenix ja vem com a pagina inicial e ela basta.

Configure em `mix.exs` as dependencias de qualidade: `credo` e `dialyxir` (ambas
`only: [:dev, :test], runtime: false`). Acrescente o alias que vira o comando unico da
fabrica:

    verificar: ["format --check-formatted", "compile --warnings-as-errors", "credo --strict", "test"]

`mix dialyzer` fica FORA do alias de proposito: a primeira execucao constroi a PLT e
demora minutos, o que tornaria o comando de verificacao inutilizavel no dia a dia. Ele
entra na verificacao continua (T-007) como estagio separado.

Configure `config/test.exs` para o banco de teste apontar para o Postgres local
(127.0.0.1:5432, usuario `postgres`, auth trust — ver `_sistema/AMBIENTE_V2.md`).

Preencha `_gestao/GUIA.md` a partir de `_sistema/templates/GUIA.md`: secao 1 com a stack e
os comandos reais, secao 2 com os modulos que o PLANO ja preve (`Fabrica.Operario`,
`Fabrica.Embedder`, `Fabrica.Tarefa`, `Fabrica.Portao`), secoes 3 e 4 enxutas — elas
crescem a cada tarefa. NAO deixe o texto de instrucao do template no arquivo final.

NOMENCLATURA: tudo em portugues (modulo, funcao, variavel, mensagem de erro), como no
resto da fabrica. `Fabrica.Tarefa`, nao `Fabrica.Task`. Esta decisao esta em
`DECISOES_FECHADAS.md` e nao se reabre.

## Criterios de aceite
- [ ] `mix verificar` roda e passa (formato, compilacao sem warning, Credo estrito, testes).
      `verificar: mix verificar`
- [ ] O projeto compila sem nenhum warning.
      `verificar: mix compile --warnings-as-errors`
- [ ] `_gestao/GUIA.md` existe, esta preenchido e nao contem o texto de instrucao do template (inspecionavel).
- [ ] README.md tem 'Como rodar' e 'Como testar' com os comandos reais (inspecionavel).

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `1ab87fa` (repositorio proprio em
`projetos/fabrica-v2/`, criado com `git init` nesta tarefa). 43 arquivos, 3.035 linhas.

**O que foi feito**
- `mix phx.new fabrica-v2 --app fabrica --module Fabrica --database postgres --no-mailer
  --no-gettext --install`. LiveView LIGADO, nenhuma pagina propria criada.
- `mix.exs`: `credo ~> 1.7` e `dialyxir ~> 1.4`, ambos `only: [:dev, :test], runtime: false`;
  alias `verificar` com os quatro estagios, `dialyzer` FORA dele.
- `config/test.exs`: banco em `127.0.0.1:5432`, usuario `postgres`, auth `trust`.
- `config/config.exs`: `disable_symlink_warning` do LiveView (ver DESVIOS).
- `_gestao/GUIA.md` preenchido a partir do template, sem nenhum texto de instrucao.
- `README.md` reescrito com "Como rodar" e "Como testar".

**DECISAO DE LAYOUT.** A tarefa diz "rode `mix phx.new fabrica` dentro de
`projetos/fabrica-v2/`", o que literalmente daria `projetos/fabrica-v2/fabrica/`. Mas o
`areas:` desta tarefa lista `mix.exs` e `_gestao/GUIA.md` NO MESMO NIVEL, e o mesmo vale
para o `areas:` da T-007 (`lib/mix/tasks/fabrica.ci.ex` e `_gestao/ci.json`). Logo o projeto
mix e a PROPRIA `fabrica-v2/`, com `_gestao/` ao lado de `mix.exs` — que e tambem a
convencao dos projetos da v1. Feito com `--app fabrica --module Fabrica`: diretorio
`fabrica-v2`, aplicacao `:fabrica`, modulos `Fabrica.*`.

**DOIS DESVIOS, ambos dentro do `areas:` da tarefa, ambos necessarios para o criterio 1**

1. `credo --strict` reprovou 4 apontamentos, TODOS em codigo gerado pelo Phoenix
   (`core_components.ex`, `fabrica_web.ex`, `test/support/data_case.ex`): tres "nested
   modules could be aliased" e uma ordem alfabetica de alias. **Corrigidos no codigo, nao
   excluidos por `.credo.exs`** — afrouxar o lint no dia 1 para o portao ficar verde e o
   mesmo defeito que corrigir o teste ate passar. O `--strict` segue inteiro, sem exclusao.
2. `def cli` ganhou `preferred_envs: [verificar: :test]`. Sem isso o alias percorre formato,
   compilacao e Credo e so entao falha, porque o Mix recusa `mix test` a partir de um comando
   no ambiente `dev`.

Alem desses, `config/config.exs` (que esta no `areas:`) silencia o aviso de symlink dos
colocated assets do LiveView: no Windows sem admin ele imprime STACK TRACE a cada
compilacao. Nao quebra nada (`--warnings-as-errors` sai com 0), mas saida que parece erro e
nao e treina quem le a ignorar, e esta bateria roda em mais 57 tarefas. O projeto nao usa
colocated hooks; a linha sai no dia em que usar.

**UMA CORRECAO MINHA, registrada porque documentacao que mente e pior que ausente.** Escrevi
primeiro, no `config/test.exs` e no GUIA, que `localhost` no Windows resolve para `::1` e
DA RECUSA DE CONEXAO. Testei: `localhost` de fato resolve `::1` antes de `127.0.0.1`, mas a
conexao FUNCIONA — o cliente cai para o IPv4 sozinho. Prova, no ambiente `dev`, que continua
com `"localhost"`:

    dev conectou: [["fabrica_dev", "127.0.0.1/32", "127.0.0.1/32"]]

Os dois textos foram reescritos: fixar `127.0.0.1` no `test.exs` e escolha de ser explicito
e evitar a tentativa IPv6, **nao conserto de uma falha**. `config/dev.exs` segue com
`localhost` e funciona.

**ACHADO QUE NAO VIROU TRABALHO** (tarefa nova e decisao do Enzo): `config/dev.exs` fica fora
do `areas:` desta tarefa e continua como o scaffold gerou. Conferido que a T-002 nao sofre
com isso — `mix ecto.create` no ambiente dev sai com 0.

**Ambiente usado:** Elixir 1.19.4 / OTP 28.1, PostgreSQL 18.4 com pgvector 0.8.6
(`_sistema/AMBIENTE_V2.md`, secao 0). Bancos criados: `fabrica_dev`, `fabrica_test`.

## Verificacao

**Criterio 1 — `mix verificar` roda e passa.** `verificar: mix verificar` → **exit 0**

    Checking 19 source files ...
    Analysis took 0.5 seconds (0.04s to load, 0.4s running 69 checks on 19 files)
    59 mods/funs, found no issues.
    Running ExUnit with seed: 355672, max_cases: 8
    .....
    Finished in 0.5 seconds (0.3s async, 0.2s sync)
    5 tests, 0 failures

Os quatro estagios rodaram: `format --check-formatted`, `compile --warnings-as-errors`,
`credo --strict` (sem nenhum apontamento) e `test`.

**Criterio 2 — o projeto compila sem nenhum warning.**
`verificar: mix compile --warnings-as-errors` → **exit 0** (rodado com `--force`, para nao
aproveitar build anterior)

    Compiling 13 files (.ex)
    Generated fabrica app

**Criterio 3 — `_gestao/GUIA.md` existe, preenchido, sem o texto de instrucao do template.**
INSPECIONADO. 87 linhas. As quatro secoes presentes e preenchidas
(`## 1. Em uma tela`, `## 2. Onde fica o que`, `## 3. Receitas`,
`## 4. Ja existe - nao reinvente`), mais `## Armadilhas conhecidas`. Busca por todo texto de
instrucao e todo marcador do template (`Preencha as quatro secoes`, `Secao vazia e pior`,
`<nome do projeto>`, `<uma frase>`, `<comando>`, `<pasta/>`, `<arquivo>`, `<caminho>`,
`<funcao()>`, entre outros): **zero ocorrencias**.

**Criterio 4 — README.md tem "Como rodar" e "Como testar" com os comandos reais.**
INSPECIONADO. `## Como rodar` (linha 32) e `## Como testar` (linha 45). Comandos citados, e
todos conferidos nesta maquina: `mix setup`, `mix phx.server`, `iex -S mix phx.server`,
`mix verificar`, `mix test`, `mix test test/caminho_test.exs`, e os tres do
`banco-v2.ps1` (`subir` / `conferir` / `derrubar`).

## Conformidade

## Revisao
