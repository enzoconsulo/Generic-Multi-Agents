---
id: T-027
titulo: Refino da interface verificado por captura de tela (7 defeitos que só se viam olhando)
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-026]
areas: [web/src/paginas/jobs/, web/src/lib/atividade.ts, web/src/App.tsx, web/src/estilos.css]
tentativas: 0
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Usar a capacidade de captura (T-026) para revisar TODAS as páginas de verdade e provar que
o cronômetro anda — coisas que até aqui só se afirmava.

## Contexto
Pedido do usuário: *"faça essa verificação do cronômetro também e refine toda a interface,
deixando impecável (…) tire vários screenshots seguidos para ver a fundo"*.

## Cronômetro — PROVADO
Um job Claude custaria dinheiro, então a prova usou o **motor de CI**, que é gratuito
(roda processo local). Projeto temporário `projetos/_cronometro` com um `ci.json` cujo
estágio roda um script de 30s, e duas capturas com 9s de intervalo:
- captura 1: **"Rodando há 11s"**
- captura 2: **"Durou 30s"** — avançou E o rótulo mudou sozinho ao terminar.
Projeto de teste apagado ao final.

## Os 7 defeitos que a captura revelou
Nenhum seria pego por teste: em todos, o código "funcionava" e a tela mentia ou sufocava.

1. **Lista de jobs sem teto de altura** — 25 execuções empilhadas levavam a página a mais
   de 2000px, com o detalhe perdido ao lado de uma coluna gigante. Ganhou rolagem própria
   e `position: sticky`.
2. **Título do `/ideia` é o PROMPT INTEIRO** — um item ocupava dez linhas e engolia a
   lista. `line-clamp: 2` + texto completo no `title`.
3. **Trilha "Construir → Testar → Revisar" aparecia em job de CI**, que não tem esse
   pipeline — três bolinhas cinzas sem sentido. Agora só para job Claude.
4. **Avatar com `??`** quando não havia agente identificado.
5. **"Sem texto produzido neste trecho" num job de CI que estava despejando saída.** O
   runner de CI emite log com nível `log`, e o filtro só aceitava `assistente`/`subagente`.
   **Informação errada na tela com todos os testes verdes.**
6. **Job de CI rotulado "orquestrador"** — CI não tem orquestrador. Criado
   `segmentarPorEstagio`: agrupa por `instalar`/`lint`/`testes`/`build`, o análogo honesto
   (job Claude segue por agente).
7. **404 era beco sem saída** — sem layout de página e sem link de volta.

Mais o **Panorama**, que quebrava em duas faixas por causa de um `.espaco-sm` entre o total
de projetos e a contagem por status, sendo que são a mesma informação de topo.

## Verificação
`npm test`: **servidor 209/209 + web 69/69** (+3 de `segmentarPorEstagio`); build e
`tsc --noEmit` limpos.

**Verificado por captura**, página a página: início, projeto, jobs (com execução ao vivo),
como funciona e 404. Cada correção foi re-capturada e conferida — não só afirmada.

## Revisão
Auto-revisão com evidência visual em cada etapa. A lição da T-024/T-026 se confirmou de
novo: **teste verde não diz que a tela está certa.** Os defeitos 5 e 6 eram informação
FALSA exibida ao usuário, com a suíte inteira passando.
