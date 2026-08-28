---
id: T-052
titulo: A trilha generica e a escada de prova com rotulo obrigatorio
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-024, T-027]
areas: [lib/fabrica/trilhas.ex, lib/fabrica/criterios/grau.ex, test/fabrica/trilhas_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Rotear o pipeline inteiro pelo `dominio` do projeto, e obrigar o verificador a declarar em
que degrau cada criterio foi provado.

## Contexto
A fabrica constroi qualquer artefato; software e o mais calibrado, nao o unico. O eixo que
separa os dois casos nao e "e codigo?", e sim **como se prova que ficou pronto**. Em software
a prova vem de graca; fora dele nao vem — e e ai que o desenho poderia degenerar, com o
verificador virando um segundo revisor e dois julgamentos subjetivos custando em dobro.

`dominio` ausente ou `software` -> trilha de software, SEMPRE. Qualquer outro valor ->
trilha generica. Nenhum agente de software le a doutrina generica: a generalizacao nao passa
pelo caminho quente.

Escada de prova, e o rotulo e OBRIGATORIO:
  - `executado` — um comando roda e o resultado e o veredito
  - `inspecionado` — um script abre o artefato entregue e afirma fatos sobre ele
  - `julgado` — so quando os dois primeiros sao genuinamente impossiveis, e ai contra rubrica
    de itens BINARIOS declarada na tarefa

Duas pecas completam o desenho, e as duas sao regra do planejador:
  - **a primeira tarefa instala o verificador**, antes de qualquer parte do artefato;
  - **a fonte e texto versionado; o binario e gerado por comando.** Commitar o binario como
    fonte apagaria o portao da revisao, porque ninguem revisa diff de arquivo binario.

## Criterios de aceite
- [ ] `dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a generica.
      `verificar: mix test test/fabrica/trilhas_test.exs`
- [ ] O verificador nao consegue fechar sem rotular TODOS os criterios (rotulo ausente e erro).
      `verificar: mix test test/fabrica/trilhas_test.exs`
- [ ] Criterio marcado `julgado` exige a secao de rubrica com itens binarios na tarefa.
      `verificar: mix test test/fabrica/trilhas_test.exs`
- [ ] A proporcao de criterios `julgados` por projeto e consultavel.
      `verificar: mix test test/fabrica/trilhas_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

