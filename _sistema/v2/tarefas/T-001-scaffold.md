---
id: T-001
titulo: Scaffold Phoenix com qualidade, GUIA e commit inicial
projeto: fabrica-v2
versao: v0.1
status: backlog
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


## Verificacao


## Conformidade


## Revisao

