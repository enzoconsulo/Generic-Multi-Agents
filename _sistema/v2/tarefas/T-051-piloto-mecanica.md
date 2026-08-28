---
id: T-051
titulo: Piloto automatico: a mecanica e a tela
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-050]
areas: [lib/fabrica/piloto/servidor.ex, lib/fabrica_web/live/componentes/piloto.ex, test/fabrica/piloto/servidor_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
O processo que escuta o fim de uma rodada, consulta a decisao e dispara a proxima — mais o
controle na tela.

## Contexto
A mecanica (escutar, persistir, agendar rearme) fica separada da decisao (T-056) de
proposito: uma e pura e exaustivamente testavel, a outra e I/O.

**A rodada NAO se monta aqui.** Ela chama o mesmo caminho do botao Trabalhar. Um segundo
caminho seria uma segunda fonte de verdade sobre teto e trava — e as duas divergiriam sem
ninguem ver.

Persista o estado do piloto (ligado, rodadas feitas, gasto acumulado, proximo rearme) para
ele sobreviver a um reinicio.

Na tela: o toggle, os dois tetos obrigatorios, o que ja foi consumido de cada um, e — quando
dormindo — a hora do rearme. O usuario precisa saber se esta dormindo ou travado.

## Criterios de aceite
- [ ] O fim de uma rodada consulta a decisao e dispara a proxima quando ela manda continuar.
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] A rodada e montada pelo MESMO caminho do botao (teste que compara os dois).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] O estado do piloto sobrevive a um reinicio da aplicacao.
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] A tela mostra os dois tetos, o consumido de cada um, e a hora do rearme quando dormindo.

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

