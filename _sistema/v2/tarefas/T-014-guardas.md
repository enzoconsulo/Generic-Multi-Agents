---
id: T-014
titulo: Guarda de processos e guarda de ferramental
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-013]
areas: [lib/fabrica/ferramentas/guardas.ex, test/fabrica/ferramentas/guardas_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Duas guardas que avaliam um comando ANTES de ele rodar: o agente nao pode matar a propria
fabrica, e nao pode reinventar uma ferramenta que a fabrica ja tem.

## Contexto
Os dois mecanismos existem na v1 (`pipeline/guarda-processos.ts` e
`pipeline/guarda-ferramental.ts`) e nao aparecem em documento nenhum do TCC. Ver
`MIGRACAO_V2.md`, secao 3.

**Guarda de processos.** Recusa comando que mataria o proprio runtime: `taskkill` sem PID
alvo, `taskkill /IM beam.exe`, `Stop-Process -Name beam|erl`, `pkill beam`, e qualquer
morte que alcance o PID do no atual ou seus ancestrais. A regra e a mesma da coleta de
orfaos da v1: **exige prova de propriedade** — so pode matar o que a propria fabrica
lancou.

**Guarda de ferramental.** Avisa (nao recusa) quando o comando reinventa algo que a
fabrica ja tem — por exemplo escrever um parser de frontmatter em vez de usar o modulo
existente, ou `curl` para algo que o cliente HTTP ja faz. A saida e um aviso anexado ao
resultado da ferramenta, que o agente le na volta seguinte.

A diferenca entre RECUSAR e AVISAR e deliberada: matar a fabrica e irreversivel; reinventar
uma roda e caro mas recuperavel, e uma recusa errada aqui bloquearia trabalho legitimo.

Ambas sao funcoes PURAS sobre a string do comando — sem I/O. E por isso que sao
testaveis exaustivamente, e e la que mora todo o julgamento.

## Criterios de aceite
- [ ] A guarda de processos recusa cada forma conhecida de matar o runtime, uma por teste.
      `verificar: mix test test/fabrica/ferramentas/guardas_test.exs`
- [ ] A guarda de processos PERMITE matar um processo que a fabrica lancou (com prova de propriedade).
      `verificar: mix test test/fabrica/ferramentas/guardas_test.exs`
- [ ] A guarda de ferramental AVISA e nao recusa (o comando roda, com aviso anexado).
      `verificar: mix test test/fabrica/ferramentas/guardas_test.exs`
- [ ] Ambas as guardas sao puras: nenhuma chamada de I/O no caminho (inspecionavel).

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

