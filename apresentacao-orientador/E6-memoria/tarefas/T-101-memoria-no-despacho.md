---
id: T-101
titulo: "O bloco de memória recuperado chega ao prompt do agente: Fabrica.Despacho anexa Fabrica.Memoria.Contexto"
projeto: fabrica-v2
versao: v0.5
status: pronta
prioridade: alta
dependencias: [T-099]
areas: [lib/fabrica/despacho.ex, test/fabrica/despacho_test.exs]
tentativas: 0
criada: 2026-10-07
atualizada: 2026-10-07
---

## Objetivo
Todo despacho de agente montado por `Fabrica.Despacho.montar/4` leva, quando existir, o bloco de
contexto recuperado do histórico do projeto (`Fabrica.Memoria.Contexto`), com as fontes citadas — e
nada muda quando não há o que recuperar. É a peça que falta para o marco da v0.5 (T-048, requisito
R7: "consultar o histórico do projeto antes de decidir, citando a fonte").

## Contexto
O diagnóstico do marco T-048 (PROGRESSO.md, "MARCO da v0.5 … BLOQUEADO", e reconferido em 01/10)
deixou um único pré-requisito em aberto: **nem `Fabrica.Despacho` nem `Fila.Trabalho` chamam
`Fabrica.Memoria.Contexto`**, então o bloco recuperado (T-046) nunca chega a um agente. Os outros dois
pré-requisitos (corpus importado — T-034b; a fila subir o agente real — T-070) já fecharam.

As peças existem e estão testadas: `Memoria.Contexto.montar(projeto_id, termo, opts)` devolve o bloco
(ou `nil`), e `Memoria.Contexto.anexar(prefixo, bloco)` devolve o texto do prefixo com o bloco — e
`anexar(prefixo, nil)` devolve o prefixo intocado. `Fila.Trabalho` (linha ~305) chama
`Despacho.montar(tarefa, papel, doutrina, modelo: ...)`; ligar no `Despacho` cobre todo caminho de
agente de uma vez, sem tocar a fila.

Decisões que ficam com quem implementar, registradas nas Notas: o TERMO de busca (provável: título +
objetivo da tarefa); ONDE o bloco entra no prefixo sem quebrar a faixa estável que é cacheada (veja o
`@moduledoc` de `Prompt.Prefixo` e de `Memoria.Contexto` — conteúdo variável fica depois do ponto de
cache); e uma opção para desligar a recuperação no despacho (ex.: `memoria: false`), útil em teste e
para a regra da T-047 (recuperação abaixo da linha de base desliga o bloco), se ela já existir no
código.

## Critérios de aceite
- [ ] Com trechos ingeridos no projeto da tarefa, o prompt montado contém o bloco recuperado com a
      fonte citada; sem trechos, o prompt é byte a byte o de antes (teste para os dois casos).
      `verificar: mix test test/fabrica/despacho_test.exs`
- [ ] O bloco fica fora da faixa estável do prefixo (teste: dois despachos de tarefas diferentes no
      mesmo projeto compartilham a mesma faixa estável).
      `verificar: mix test test/fabrica/despacho_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): depende da T-099 pelo mesmo motivo das demais — no Windows a suíte
  cai em 2 testes de link do confinamento até ela fechar.

## Verificação


## Conformidade


## Revisão
