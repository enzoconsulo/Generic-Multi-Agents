---
id: T-042
titulo: Embedder.Servico e Embedder.Local
projeto: fabrica-v2
versao: v0.5
status: backlog
prioridade: alta
dependencias: [T-004]
areas: [lib/fabrica/embedder/servico.ex, lib/fabrica/embedder/local.ex, test/fabrica/embedder/servico_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Os dois adaptadores reais de embedding: um por chamada HTTP (padrao em maquina modesta) e
um local com Bumblebee (opcional, para a maquina forte).

## Contexto
Decisao registrada em `DECISOES_FECHADAS.md`: o perfil alvo da v2 e 8 GB de RAM, e o modelo
de embedding local e a UNICA peca pesada do desenho inteiro. Por isso sao dois adaptadores,
e por isso esta versao e opcional.

`Embedder.Servico` — chamada HTTP em lote, com `Req`. Configuravel: URL, modelo, chave.
Precisa devolver exatamente `dimensoes()` valores; se o servico devolver outra dimensao,
falhe com erro nomeado em vez de gravar vetor de tamanho errado (que so quebraria depois,
no indice).

`Embedder.Local` — Bumblebee + Nx com EXLA, modelo de 384 dimensoes. Carregue o modelo UMA
vez, num processo proprio supervisionado, e sirva as requisicoes por chamada — carregar por
chamada seria proibitivo. Declare no cabecalho quanto o modelo ocupa residente, medido, nao
estimado.

`Embedder.Local` fica atras de uma dependencia OPCIONAL no `mix.exs`: quem nao vai usar nao
baixa Bumblebee nem EXLA. E isso que mantem a promessa de rodar em maquina media.

Nenhum dos dois entra na suite: os testes seguem com `Embedder.Falso`. O teste do `Servico`
usa stub de HTTP; o do `Local` e marcado para pular por padrao.

## Criterios de aceite
- [ ] `Embedder.Servico` vetoriza em lote e falha com erro nomeado se a dimensao vier errada.
      `verificar: mix test test/fabrica/embedder/servico_test.exs`
- [ ] `Embedder.Local` esta atras de dependencia opcional; o projeto compila sem Bumblebee instalado.
      `verificar: mix compile --warnings-as-errors`
- [ ] O cabecalho de `Embedder.Local` registra o consumo residente MEDIDO do modelo (inspecionavel).
- [ ] A suite continua usando `Embedder.Falso`; nenhum teste padrao carrega modelo ou chama rede.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

