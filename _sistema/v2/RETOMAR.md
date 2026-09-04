# Prompt de retomada da v2

> **TROCA DE MÁQUINA (04/09):** o trabalho passou para a máquina 1. Antes de qualquer
> coisa, leia `_sistema/TROCA_DE_MAQUINA.md` — o `projetos/fabrica-v2/` é repositório
> próprio e precisa de um clone separado, e a árvore está VERMELHA por um parcial da T-037.
>
> **Não sabe o que rodar?** Veja `COMECE_AQUI.md`, ao lado — ele tem o passo a passo.
> Resposta curta: **cole o prompt abaixo no Claude Code**. O script `.ps1` só serve se a cota
> tiver acabado.


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
projetos/fabrica-v2/_gestao/tarefas/, como em todo projeto da fábrica.

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

## Onde o trabalho parou

> A versão anterior desta seção era de **02/09** e dizia "31 de 60 tarefas". Vencida.

**Em 2026-09-04: 42 de 71 tarefas concluídas** — 2 em execução, 7 prontas, 20 em backlog.

- **A árvore NÃO compila.** `lib/fabrica/fila/resgate.ex:80`, `undefined variable "j"` —
  parcial da T-037, cujo executor a parede de cota cortou no meio. Foi commitado quebrado
  de propósito, para viajar. **Todo `mix verificar` reprova por causa dele**, seja qual for
  a tarefa.
- **Por isso a T-037 roda primeiro e sozinha.** A T-050 já queimou 2 de 3 tentativas contra
  essa árvore, sem um único achado contra o código dela.
- **O piloto automático está desligado** e estourou o teto (US$ 61,20 contra US$ 60,00, em
  8 rodadas). O estado dele vive em `painel/dados/`, que não é versionado — o teto precisa
  ser redeclarado na outra máquina.
- **Bloqueio antigo, inalterado:** não existe `ANTHROPIC_API_KEY`, e ela **não pode** ser
  definida globalmente — a prova do marco da v0.1 afirma que ela não está definida durante
  a suíte. Ela entra só no processo do probe, quando existir.
- **O que a troca DESBLOQUEIA:** a T-034 exige o `projetos/` real da v1, que está na
  máquina 1. A pendência "copiar `projetos/`" deixa de existir indo para lá.

O detalhe completo está em `projetos/fabrica-v2/_gestao/PROGRESSO.md`, seção "Onde parar e
onde retomar", e nos rodapés das tarefas T-037 e T-050.
