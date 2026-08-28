---
id: T-048
titulo: MARCO da v0.5: o agente cita a decisao anterior
projeto: fabrica-v2
versao: v0.5
status: backlog
prioridade: alta
dependencias: [T-045, T-046, T-047]
areas: [_gestao/PROGRESSO.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

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


## Verificacao


## Conformidade


## Revisao

