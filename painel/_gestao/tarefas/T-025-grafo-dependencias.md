---
id: T-025
titulo: Grafo de dependências no mapa — ordem de execução e paralelismo real
projeto: painel-fabrica
status: em-teste
prioridade: media
dependencias: [T-023]
areas: [web/src/lib/atividade.ts, web/src/paginas/projeto/MapaPlano.tsx]
tentativas: 0
criada: 2026-07-27
atualizada: 2026-07-27
---

## Objetivo
Mostrar no painel a ordem de execução das tarefas e, principalmente, **o que pode rodar ao
mesmo tempo** — a informação que decide a velocidade real da fábrica.

## Contexto
O usuário perguntou no chat se a alocação de agentes era eficiente e por que só existiam 2
especialistas no `ia-hibrida-limpa`. **Ele só perguntou porque o painel não mostrava.** A
resposta estava nas `dependencias` e `areas` das tarefas: o plano bifurca depois da T-002
(T-003→T-004 em `app.py`, T-005 em `tests/`), então o paralelismo máximo daquela feature é
2 — exatamente o número de especialistas. Um terceiro ficaria ocioso.

Ou seja: a informação existia no disco e era invisível na tela. Nem o usuário nem o
orquestrador conseguiam ver o gargalo sem abrir os arquivos um por um.

Decisão de desenho: **níveis (degraus), não emaranhado de setas.** Um DAG desenhado exige
layout topológico e roteamento de arestas, e ainda assim não responde direto "o que roda
junto". Degraus respondem.

## Critérios de aceite
- [x] Seção "Ordem de execução e paralelismo" no mapa do plano, recolhível.
- [x] Tarefas agrupadas por DEGRAU de dependência (1º pode começar já; 2º só depois…).
- [x] Dentro do degrau, marcar quais de fato rodam SIMULTANEAMENTE — não basta ausência de
      dependência: `areas` disjuntas e teto de 3.
- [x] Selo com o paralelismo máximo do plano (o teto real de velocidade).
- [x] CICLO de dependência detectado e denunciado (tarefas que nunca executariam).
- [x] Dependência para tarefa inexistente reportada, sem travar o cálculo.
- [x] Tooltip de cada bloco mostra de quem depende e em quais arquivos mexe.
- [x] Lógica pura e testada.

## Notas de execução
- `montarGrafoExecucao` em `lib/atividade.ts` (puro, 7 testes). Nivelamento iterativo: uma
  tarefa ganha nível quando TODAS as dependências existentes já têm nível.
  - **Ciclo não trava**: o laço para quando não há mais progresso; quem sobrou sem nível
    está em ciclo e é reportado. Sem essa guarda, um plano com A↔B congelaria a página.
  - **Dependência para id inexistente** é ignorada no cálculo (senão a tarefa nunca
    nivelaria) mas REPORTADA — plano desatualizado fica visível.
  - `loteParalelo`: varredura gulosa que monta um lote REAL e alcançável (áreas disjuntas,
    pula concluída/cancelada, teto 3). Guloso de propósito: o objetivo é mostrar um lote
    que a fábrica de fato roda, não resolver conjunto independente máximo.
- UI em `MapaPlano.tsx`: degraus recolhíveis, blocos com contorno tracejado nos que rodam
  juntos, selo "até N em paralelo", avisos de ciclo/dependência quebrada.
- Um dos testes espelha exatamente o grafo real do `ia-hibrida-limpa` — é o caso que
  originou a tarefa, então serve de regressão viva.

## Verificação
`npm test`: **web 48/48** (+7) **+ servidor 209/209**; build e `tsc --noEmit` limpos.

**NÃO VERIFICADO NO NAVEGADOR** — mesma razão da T-024: o orquestrador não tem navegador.
Quem fecha é o usuário: abrir o projeto `ia-hibrida-limpa`, expandir "Ordem de execução e
paralelismo" e conferir se aparecem 5 degraus, com T-003 e T-005 marcadas como paralelas
no 3º.

## Revisão
Pendente da verificação acima.
