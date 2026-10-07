---
id: T-098
titulo: "classe_falha_test.exs:315 (prazo estourado reexecuta UMA vez) deixa de depender do relógio"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: media
dependencias: [T-099]
areas: [test/fabrica/criterios/classe_falha_test.exs, lib/fabrica/criterios.ex]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-07
---

## Objetivo
O teste "prazo estourado reexecuta UMA vez, e a reexecucao e contada" passa sempre que o
comportamento está certo e falha sempre que não está — sem depender da velocidade da máquina.

## Contexto
Na sessão de 02/10 esse teste caiu na 1ª bateria de praticamente TODO portão (T-082, T-083, T-090 nos
dois ciclos, T-091 e o executor da T-090 quatro vezes) — custa uma bateria extra por portão e confunde
o verificador. O teste (`classe_falha_test.exs:~315`) roda `git rev-parse --git-dir` com `prazo: 1`
(1 ms) e afirma `:inconclusivo`/`:ambiente`/`reexecutado`. Depende de o comando estourar 1 ms nas DUAS
execuções — corrida com o relógio e com a carga da suíte. Diagnostique qual asserção cai (rode o teste
isolado em laço e sob a suíte) antes de mexer.

Conserto provável no TESTE: um comando que estoura o prazo de forma garantida e portável (a suíte roda
no Windows e no Linux — veja como os testes de `Fabrica.Ferramentas.Comando` fazem prazo). Se o
diagnóstico mostrar defeito real em `Fabrica.Criterios` (ex.: a reexecução não é contada quando a 2ª
termina a tempo), o conserto vai em `lib/fabrica/criterios.ex` — registre qual dos dois foi.

## Critérios de aceite
- [ ] O teste passa em 20 execuções isoladas seguidas e falha (por mutação, registrada nas Notas) quando
      a reexecução deixa de ser contada.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`
- [ ] Não cai em 5 corridas seguidas da suíte inteira.
      `verificar: mix test` (5 corridas seguidas; conta-se a falha em `classe_falha_test.exs`)
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.


## Verificação


## Conformidade


## Revisão


