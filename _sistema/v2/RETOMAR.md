# Prompt de retomada da v2

Cole o bloco abaixo numa sessão nova, depois do `/clear`. Ele é autossuficiente: aponta para os
arquivos de estado e diz onde o trabalho parou.

**Antes de colar, edite a linha `DECISÃO:`** — é a única coisa que a sessão nova não consegue
descobrir sozinha, porque é sua. Ela já vem com a recomendação preenchida.

---

## O prompt

```
Continue a v2 em projetos/fabrica-v2. Você é o orquestrador; leia o CLAUDE.md da raiz.

Leia, nesta ordem, antes de agir:
1. _sistema/logs/2026-09-02.md — a seção "Onde parar e onde retomar"
2. projetos/fabrica-v2/_gestao/PROGRESSO.md
3. _sistema/PLANO_V2.md, fase v0.2 — os quatro desenhos e a recomendação
4. projetos/fabrica-v2/_gestao/GUIA.md — as armadilhas desta máquina

DECISÃO (já tomada, não reabra): desenho A, SEM a opção D por enquanto, SEM a tarefa de
custo por volta interna, e SIM a partir o marco 2 em 2a (prefixo estável, roda sem chave)
e 2b (medição paga, bloqueada por falta de ANTHROPIC_API_KEY).

Com isso: despache a T-003a e siga o pipeline pelas oito tarefas restantes do
replanejamento, até o marco 1 da v0.2 (T-020) rodar de novo. As tarefas estão em
_sistema/v2/tarefas/ — NÃO em _gestao/tarefas/, este projeto é atípico nisso.

Regras que esta linhagem já pagou caro para aprender:
- Despache um agente por vez e ESPERE o resultado. Nunca encerre o turno com agente em voo.
- Saneie antes de redespachar: a cota já cortou três despachos: confira as duas árvores git
  e o que ficou em disco antes de supor que se perdeu trabalho.
- Instrumento (probe) é escrito e salvo em disco ANTES de ser rodado.
- Comando de `verificar:` se copia de _gestao/ci.json — nunca se redige de cabeça.
- Antes de concluir qualquer tarefa: `mix fabrica.ci` COMPLETO, cinco estágios.
- Cinco das oito tarefas consomem cota da assinatura (sem fatura). Se a cota apertar,
  mande o agente commitar o parcial e registrar onde parou.

Se algo divergir do que os arquivos dizem, acredite nos arquivos e me avise.
```

---

## Se você quiser mudar a decisão

Troque a linha `DECISÃO:` por uma destas, ou escreva a sua:

| se você quiser | escreva |
|---|---|
| fechar também o confinamento de shell | `desenho A COM a opção D (MCP)` — custa tarefas a mais, ainda não estimadas |
| poder citar custo por volta interna no TCC | acrescente `SIM à tarefa de custo por volta interna` (+1 tarefa, 45–60 min) |
| deixar o marco 2 inteiro para quando houver chave | troque o fim por `e NÃO partir o marco 2` |

O que cada uma muda no sistema **e nos documentos do TCC** está em
`_sistema/documentos-tcc/DOCUMENTO_x_SISTEMA.md`, seção 8.

---

## Se a cota tiver acabado

```powershell
_sistema\ferramentas\retomar-v2.ps1
```

Ele espera a cota voltar e então avisa (ou retoma sozinho, com `-Modo auto`). Detalhes no
cabeçalho do próprio script.

---

## Onde o trabalho parou, em quatro linhas

- **31 de 60 tarefas** concluídas. `mix fabrica.ci` verde nos cinco estágios. As duas árvores
  git limpas.
- O **marco 1 da v0.2 reprovou** com três causas raiz; o replanejamento gerou 10 tarefas, das
  quais a fundação (T-018b, a medição do CLI real) está **concluída**.
- **Restam 8 tarefas**, ~6,5 a 9,5 h de agente. A primeira é a T-003a, que é o desenho da
  fronteira de operários.
- **Bloqueio antigo:** não existe `ANTHROPIC_API_KEY` nesta máquina, e ela **não pode** ser
  definida globalmente — a prova do marco da v0.1 afirma que ela não está definida durante a
  suíte. Ela entra só no processo do probe, quando existir.
