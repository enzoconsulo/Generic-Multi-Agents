---
id: T-096
titulo: "Parede de cota não conta como rodada sem concluir, e o piloto religado respeita o sono salvo"
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-094]
areas: [lib/fabrica/piloto/servidor.ex, test/fabrica/piloto/servidor_test.exs]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-02
---

## Objetivo
Uma parede de cota não empurra o piloto para `{:parar, :estagnado}`, e um piloto que volta (reinício da
aplicação) enquanto dormia pela cota continua dormindo até a hora salva, em vez de despachar contra a
parede.

## Contexto
Achado do revisor da T-091 (Revisão dela), lido no código, não medido — confirme antes:

1. **A parede conta como "rodada sem concluir".** O contador `rodadas_seguidas_sem_concluir`
   (`servidor.ex:~299-312`) sobe em toda rodada que não conclui, inclusive a que bateu na parede, e
   sobrevive ao sono. Parede + uma rodada genuína sem concluir → `{:parar, :estagnado}`
   (`decisao.ex:~143`). Sem horário legível é pior: `rearmar_estado` zera a `tentativa` do recuo
   (`cota.ex:~324-330`), o recuo nunca cresce, a 2ª parede vem ~1 min depois e, no rearme seguinte, o
   piloto para por `:estagnado`. A regra 5 da `Decisao` foi escrita para "giro sem produção", não para
   cota (a regra 2 existe justamente para não classificar cota como estagnação).
2. **Religar ignora o sono salvo.** `handle_continue(:retomar)` (`servidor.ex:~217-219`) ignora o
   `dormindo_ate` persistido em disco e despacha direto — se a aplicação reiniciar durante a parede
   (o contêiner da nuvem reinicia sozinho: 22:41 UTC de 01/10), o piloto bate na parede de novo.

Depende da T-094 (mesmo arquivo, mesmo ciclo de sono/acordar).

## Critérios de aceite
- [ ] Rodada que termina por parede de cota não incrementa `rodadas_seguidas_sem_concluir`; parede +
      rodada sem concluir + parede não leva a `{:parar, :estagnado}` (teste que falha antes do conserto).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] Piloto religado com `dormindo_ate` no futuro salvo em disco continua dormindo até essa hora (não
      despacha); com `dormindo_ate` no passado, segue o caminho normal (teste).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução


## Verificação


## Conformidade


## Revisão

