---
id: T-044
titulo: Busca hibrida com fusao reciproca de postos
projeto: fabrica-v2
versao: v0.5
status: backlog
prioridade: alta
dependencias: [T-043]
areas: [lib/fabrica/memoria/busca.ex, test/fabrica/memoria/busca_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Responder "isto ja foi resolvido aqui, e o que foi decidido na epoca?" com duas buscas ao
mesmo tempo — vetor e termo exato — fundidas por posto reciproco.

## Contexto
POR QUE DUAS BUSCAS: o vetor perde nome proprio (se a pergunta menciona uma opcao chamada
`--exigir`, ele nao tem como saber o que e aquilo) e a busca textual perde sinonimo. Uma
cobre o buraco da outra.

A consulta ja esta escrita na secao 9 do `-3-completo` e **ja foi provada rodando** nesta
maquina (ver `_sistema/AMBIENTE_V2.md`, secao 4) — copie de la, nao reescreva:

    WITH semantico AS (
      SELECT id, RANK() OVER (ORDER BY embedding <=> $1) AS pos
        FROM trechos WHERE projeto_id = $2 ORDER BY embedding <=> $1 LIMIT 40),
         textual AS (
      SELECT id, RANK() OVER (ORDER BY ts_rank_cd(busca, $3) DESC) AS pos
        FROM trechos WHERE projeto_id = $2 AND busca @@ $3 LIMIT 40)
    SELECT id FROM semantico FULL OUTER JOIN textual USING (id)
     ORDER BY COALESCE(1.0/(60 + semantico.pos), 0)
             + COALESCE(1.0/(60 + textual.pos), 0) DESC
     LIMIT 8;

A fusao por posto reciproco (k=60) dispensa calibrar pesos entre duas escalas que nao sao
comparaveis — e a razao de nao inventar uma media ponderada aqui.

SEMPRE filtre por `projeto_id`. Trecho de um projeto vazando para outro e defeito grave, e
o teste precisa travar isso explicitamente.

## Criterios de aceite
- [ ] A busca hibrida devolve, em primeiro, o trecho achado pelas DUAS buscas.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] Um termo exato que o vetor nao acha (nome de flag) e recuperado pela metade textual.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] Trecho de outro projeto NUNCA aparece no resultado.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] A consulta roda numa transacao so, no mesmo banco das tarefas.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

