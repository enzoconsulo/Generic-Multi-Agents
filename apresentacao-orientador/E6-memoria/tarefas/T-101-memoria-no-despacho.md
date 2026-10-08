---
id: T-101
titulo: "O bloco de memória recuperado chega ao prompt do agente: Fabrica.Despacho anexa Fabrica.Memoria.Contexto"
projeto: fabrica-v2
versao: v0.5
status: em-revisao
prioridade: alta
dependencias: [T-099]
areas: [lib/fabrica/despacho.ex, test/fabrica/despacho_test.exs]
tentativas: 1
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

### Ciclo 1 (2026-10-07)

**O que foi feito.** `Fabrica.Despacho.montar/4` agora, depois de montar o `Fabrica.Prompt.Prefixo`,
chama `Fabrica.Memoria.Contexto.montar/2` com o termo de busca `"#{tarefa.titulo} #{tarefa.objetivo}"`
(função privada `termo_de_busca/1`) e `tarefa.projeto_id`, e substitui `prefixo.texto` pelo resultado
de `Contexto.anexar(prefixo, bloco)` — função privada `com_memoria/3`. `prefixo.blocos` (as 4 faixas e
seus pontos de cache) ficam **intocados**: o bloco de memória só entra concatenado ao final de
`.texto`, nunca como um bloco novo na lista — é isso que garante a faixa estável idêntica entre
despachos de tarefas diferentes (critério 2).

- **Termo de busca:** título + objetivo da tarefa, nessa ordem, separados por espaço (decisão
  registrada no Contexto da própria tarefa como "provável").
- **Onde entra:** depois do `texto` completo do prefixo (que já inclui a faixa `:tarefa`, sem ponto
  de cache) — não há necessidade de tocar `Fabrica.Prompt.Bloco`/`Prefixo` (ambos fora de `areas`).
- **Opção para desligar:** `opcoes[:memoria]: false` (padrão `true`) pula a chamada a `Contexto` por
  completo e devolve o prefixo intocado — não encontrei no código uma regra de linha de base (T-047)
  já ligada a isto; a opção existe pronta para quando essa regra existir.

**Achado para o orquestrador (fora de `areas` desta tarefa, não corrigido aqui):**
`Fabrica.Fila.Trabalho.mensagem_inicial/2` (lib/fabrica/fila/trabalho.ex:333-336) monta a mensagem
que de fato vai para o agente reconstruindo o texto a partir de `prefixo.blocos`
(`Enum.map_join(prefixo.blocos, "\n\n", & &1.texto)`), e **não lê `prefixo.texto`**. Como o bloco de
memória entra só em `.texto` (por desenho — `Fabrica.Memoria.Contexto.anexar/2` tem spec
`Prefixo.t() -> String.t()`, não devolve um `Prefixo.t()` novo), o bloco recuperado por esta tarefa
**não chega ao agente real enquanto `Fila.Trabalho` não for ajustado** para usar `prefixo.texto` em
vez de reconstruir a partir de `blocos`. O Contexto desta tarefa afirma "ligar no Despacho cobre todo
caminho de agente... sem tocar a fila" — pelo código lido, isso não se sustenta; registro aqui em vez
de silenciar, e sugiro ao orquestrador uma tarefa pontual (1 linha em `trabalho.ex`) para fechar o
R7 do marco de verdade.

**Testes:** 4 testes novos em `test/fabrica/despacho_test.exs`, describe `"o bloco de memoria
recuperado (T-101)"`: bloco com fonte citada quando há trecho ingerido; prompt byte a byte igual ao
despacho com `memoria: false` quando não há trecho; `memoria: false` desliga mesmo havendo trecho
relevante; faixa estável (`:ferramentas`, `:doutrina`, `:indice`) idêntica entre duas tarefas
diferentes do mesmo projeto, mesmo com blocos de memória diferentes. Helper `inserir_trecho!/3`
insere trecho real via SQL bruto (mesmo caminho de `Fabrica.Memoria.Ingestao.definir_embedding/2`),
com embedding de `Fabrica.Embedder.Falso.vetor/1` — como o projeto de teste só tem um trecho, a busca
híbrida sempre o encontra (CTE filtrada por `projeto_id`, T-097), sem precisar de proximidade
semântica real.

Nenhuma dependência nova.

**Reproduzir:** `mix test test/fabrica/despacho_test.exs` (exige Postgres no ar — `_sistema/ferramentas/banco-v2.ps1 subir`)

```
13 tests, 0 failures
```

Também rodei, sem alterar nada fora de `areas`: `mix test test/fabrica/memoria/contexto_test.exs
test/fabrica/memoria/busca_test.exs test/fabrica/fila/trabalho_test.exs` → 56 tests, 0 failures (a
mudança não quebra o que já existia, inclusive o caminho real de `Fila.Trabalho`). `mix format
--check-formatted`, `mix compile --warnings-as-errors` e `mix credo --strict` nos dois arquivos da
área: sem apontamentos.

**Commit:** `bb5c7fc`

## Verificação

### Ciclo 2 (2026-10-07 — Testador)

- **[PASSOU] [executado] Critério 1: Com trechos ingeridos no projeto da tarefa, o prompt montado contém o bloco recuperado com a fonte citada; sem trechos, o prompt é byte a byte o de antes.**
  Comando: `mix test test/fabrica/despacho_test.exs`
  Saída: `13 tests, 0 failures` — Os 4 testes novos de memória (`describe "o bloco de memoria recuperado (T-101)"`) passam juntamente com os testes existentes.

- **[PASSOU] [executado] Critério 2: O bloco fica fora da faixa estável do prefixo (teste: dois despachos de tarefas diferentes no mesmo projeto compartilham a mesma faixa estável).**
  Comando: `mix test test/fabrica/despacho_test.exs`
  Saída: Mesmo comando acima; teste `"o bloco fica fora da faixa estavel ... compartilham a mesma faixa estavel"` passa, confirmando que `prefixo.blocos` (as 4 faixas cacheadas) é idêntico entre duas tarefas diferentes.

- **[PASSOU] [executado] Critério 3: Bateria completa verde.**
  Comando: `mix fabrica.ci`
  Saída: `bateria passou: 6 estagio(s) ok, 0 pulado(s)` — formato, compilar, lint, testes, tipos, backup.

Mutação: comentei `Contexto.montar` em `com_memoria/3` → a prova falhou com `Assertion with =~ failed` buscando a fonte `_gestao/DECISOES.md#3` no texto do prefixo (esperado). A mutação prova que os testes realmente testam a integração de memória e não apenas passam por acaso.

Suíte completa: 56 testes relacionados (contexto, busca, trabalho), 0 falhas — `mix test test/fabrica/memoria/contexto_test.exs test/fabrica/memoria/busca_test.exs test/fabrica/fila/trabalho_test.exs`

Graus de prova: 3 executado(s), 0 para julgamento (de 3).




## Conformidade


## Revisão
