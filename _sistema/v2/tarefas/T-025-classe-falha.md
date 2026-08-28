---
id: T-025
titulo: Classe de falha: o comando quebrou, ou a entrega falhou?
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-024]
areas: [lib/fabrica/criterios/classe_falha.ex, test/fabrica/criterios/classe_falha_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Distinguir, quando um criterio nao passa, se o problema e o COMANDO (mal escrito,
dependencia ausente, ambiente) ou a ENTREGA. Sao consequencias opostas.

## Contexto
E o mecanismo mais caro que a v1 aprendeu, e ele nao esta em documento nenhum do TCC.
Sem ele, um `verificar:` mal escrito manda a tarefa de volta ao construtor repetidamente:
a T-030 do banco-imobiliario gastou 4 ciclos e US$ 12,90 com o deliverable CORRETO desde o
primeiro, porque o criterio tinha um `node --test tests` impossivel naquela maquina.

Classes, e o que cada uma dispara:

- `:ferramenta_quebrada` — binario ausente, comando nao encontrado, erro de sintaxe do
  proprio comando. **NAO conta ciclo.** Vai para o orquestrador corrigir o criterio.
- `:ambiente` — porta ocupada, arquivo travado, prazo estourado por lentidao. **Reexecuta
  UMA vez** antes de concluir; conta quantas reexecucoes houve.
- `:entrega` — o comando rodou e o resultado esta errado. **Conta ciclo**, volta ao
  construtor.

A classificacao usa: codigo de saida, stderr (separado do stdout — por isso a T-013 os
separa), e o motivo de encerramento (`:prazo` nao e `:normal`).

Funcao pura sobre o resultado do comando. Todo julgamento mora aqui, e por isso e aqui que
os testes precisam ser exaustivos.

## Criterios de aceite
- [ ] Binario ausente e classificado como `:ferramenta_quebrada` e NAO conta ciclo.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`
- [ ] Falha de ambiente reexecuta uma vez e registra quantas reexecucoes houve.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`
- [ ] Comando que roda e devolve resultado errado e `:entrega` e conta ciclo.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`
- [ ] Prazo estourado nao e confundido com reprovacao de entrega.
      `verificar: mix test test/fabrica/criterios/classe_falha_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

