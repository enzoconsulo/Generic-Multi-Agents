---
id: T-048
titulo: "MARCO da v0.5: o agente cita a decisao anterior"
projeto: fabrica-v2
versao: v0.5
status: bloqueada
prioridade: alta
dependencias: [T-045, T-046, T-047]
areas: [_gestao/PROGRESSO.md]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-25
---

Impedimento: o marco pressupoe um caminho de ponta a ponta que ainda nao existe — corpus v1
importado (T-034b, `pronta`, 0 trechos), o bloco recuperado (T-046) INJETADO na mensagem do
agente (`Fabrica.Despacho` nao o compoe), e o despacho de agente real (T-070, `pronta`;
`Fila.Trabalho.perform/1` so loga). Nenhum esta nas dependencias declaradas. Ausencia de
arquitetura + dado, nao defeito de execucao (regra 0). Ver Notas de execucao abaixo.

## Objetivo
Verificar o marco: num projeto com historico, o agente cita a decisao anterior em vez de
decidir de novo.

## Contexto
Tarefa de verificacao. O teste tem de ser honesto: escolha uma decisao que EXISTE na
historia importada da v1 e formule a tarefa com vocabulario DIFERENTE do que a decisao usa.
Se o vocabulario for o mesmo, a busca textual sozinha resolveria e o marco nao provaria nada.

Confira, no relatorio do agente, que ele CITA a decisao e a fonte. E confira, na
contabilidade, que o prefixo continuou sendo lido do cache — se o bloco recuperado tiver
invalidado o prefixo, a fase piorou o sistema em vez de melhorar, e isso e reprovacao.

Registre em `_gestao/PROGRESSO.md` a pergunta usada, o trecho recuperado e os numeros de
cache antes e depois.

## Criterios de aceite
- [ ] O agente cita a decisao anterior e a fonte, com vocabulario diferente do da pergunta.
- [ ] O prefixo continua sendo LIDO do cache com o bloco recuperado presente (numeros registrados).
- [ ] A avaliacao de recuperacao esta acima da linha de base.
- [ ] `_gestao/PROGRESSO.md` registra pergunta, trecho recuperado e numeros de cache.

## Notas de execucao

### Ciclo 2 (executor reforcado, 2026-09-25) — diagnostico, sem codigo

**Causa raiz, em uma frase:** o marco pede OBSERVAR um agente real, num projeto com historico
importado, CITANDO uma decisao anterior que ele recebeu pelo bloco de contexto recuperado, e
medir o cache antes/depois — mas os tres pre-requisitos desse fluxo de ponta a ponta NAO
existem, e nenhum esta nas `dependencias` declaradas (`[T-045, T-046, T-047]`, que entregaram
as PECAS, nao a linha de montagem).

**Nota sobre o ciclo anterior:** as secoes Verificacao/Conformidade/Revisao estavam VAZIAS e
`tentativas: 1` — nao ha conteudo de reprovacao real para diagnosticar. O diagnostico abaixo e
do estado do repositorio, nao de um veredito escrito antes.

**Os tres pre-requisitos ausentes, medidos neste ciclo:**

1. **Corpus v1 nao importado.** T-034b esta `pronta` (nao `concluida`);
   `Repo.aggregate(Fabrica.Memoria.Trecho, :count)` = 0 (D-001). A D-007 (22/09) removeu o
   bloqueio conceitual (o corpus e ESTA maquina), mas a importacao nunca rodou. Sem corpus,
   nao ha decisao anterior a recuperar nem a citar.

2. **O bloco recuperado (T-046) nao esta ligado ao despacho.** `Fabrica.Despacho.montar/4` — o
   UNICO modulo que monta a mensagem inicial de um agente — compoe exatamente quatro faixas:
   `ferramentas`, `doutrina`, `indice`, `tarefa`. Ele NAO chama `Fabrica.Memoria.Contexto`.
   `grep` em `lib/` confirma: `Fabrica.Memoria.Contexto` so e referenciado por `Busca` e por si
   mesmo — nenhum caminho de agente injeta o bloco recuperado num prompt. Logo, mesmo com
   corpus, um agente despachado NAO receberia o bloco e nao teria como cita-lo.

3. **Nao ha despacho de agente real.** `Fila.Trabalho.perform/1` (T-070, `pronta`) so escreve
   no log (`Logger.info "fila: tarefa ... pronta"`) — nao sobe `Agente.Supervisor`. T-020 ("um
   agente resolve uma tarefa real") segue em `backlog`. E exatamente o impedimento da D-006
   (marco da v1.0, T-058): T-066–T-069 estao `concluida`, mas a COLA (T-070) que faz o
   `perform/1` levantar o agente ainda nao foi executada.

**Aproveitamento do trabalho anterior:** nenhum codigo reaproveitado nem refeito — este ciclo
nao escreveu codigo (nao ha o que escrever: e tarefa de verificacao, area unica
`_gestao/PROGRESSO.md`). Custo do ciclo: leitura dirigida (tarefa + DECISOES + `trabalho.ex` +
`despacho.ex` + grep), coerente com o teto reduzido de retrabalho.

**Recomendacao ao planejador (regra 0):** T-048 nao e cumprivel como escrita. Ela deve GANHAR
dependencias — `T-034b` (importar o corpus), `T-070` (a cola do agente real), `T-020` (um
agente resolve uma tarefa real) e uma peca que LIGUE `Fabrica.Memoria.Contexto` a
`Fabrica.Despacho` (hoje inexistente; candidata a tarefa propria ou a extensao da T-066/T-046)
— e voltar a `backlog` ate elas fecharem. Mesmo tratamento ja dado a T-058 (D-006), T-034
(D-007) e T-047 (D-008). `tentativas` foi mantida em 1: zera-la por causa fora do controle do
executor e decisao do planejador, nao deste ciclo.

## Verificacao

Nao aplicavel neste ciclo: nenhum criterio do marco pode ser exercitado.

- Criterio 1 (agente cita a decisao anterior): impossivel — nao ha despacho de agente real
  (T-070 `pronta`, `perform/1` so loga) e o bloco recuperado nem chega ao prompt
  (`Fabrica.Despacho` nao compoe `Memoria.Contexto`).
- Criterio 2 (prefixo lido do cache com o bloco presente): impossivel — nao ha bloco no
  prefixo montado, e nao ha rodada real para medir cache.
- Criterio 3 (avaliacao acima da linha de base): a instrumentacao existe (T-047, `concluida`),
  mas o marco exige a citacao por um agente REAL, nao a metrica isolada da suite.
- Criterio 4 (registro em PROGRESSO.md): sem pergunta/trecho/numeros reais para registrar; o
  que ha para registrar e o impedimento, feito.

## Conformidade

O entregue e um DIAGNOSTICO de impedimento, nao o marco. Isso e o correto para o estado atual:
empilhar um "resultado" de marco sobre um fluxo que nao roda produziria evidencia verde que
nao prova nada — exatamente o modo de falha que o `CLAUDE.md`/`DECISOES.md` desta fabrica
registram repetidamente. Conforme com o brief do executor reforcado: quando a tarefa nao tem
como ser cumprida como escrita, parar e dizer isso tem mais valor que gastar a tentativa.

## Revisao

Autorrevisao: a conclusao ("bloquear e acrescentar dependencias") reproduz o precedente ja
aceito tres vezes nesta fabrica (T-034/D-007, T-058/D-006, T-047/D-008) para marco/verificacao
travado por arquitetura ou dado ausente. A decisao final de reabrir dependencias e zerar
`tentativas` cabe ao planejador.

