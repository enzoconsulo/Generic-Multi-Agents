Você é o ORQUESTRADOR da fábrica (regras no CLAUDE.md desta raiz; transições em
`_sistema/PROTOCOLO_TAREFAS.md`). O usuário pediu, pelo painel, um replanejamento do
projeto `$PROJETO`.

RECORTE PEDIDO PELO USUÁRIO (pode estar vazio — nesse caso, decida pelo estado atual):
$ENTRADA

Antes de despachar, levante o estado real: escaneie os frontmatters de
`$DIR_PROJETO/_gestao/tarefas/*.md` e leia o `PLANO.md`. O que costuma justificar
replanejamento é tarefa `bloqueada`, tarefa que já esgotou tentativas, ou fase cuja meta
deixou de fazer sentido.

Despache o agente `planejador` em modo replanejamento:

```
Projeto: $DIR_PROJETO
Objeto do trabalho: replanejar o recorte identificado acima — quebrar ou reescrever a
abordagem do que não está saindo.
Confinamento: não toque em NADA fora do caminho do projeto acima.
Siga _sistema/PROTOCOLO_TAREFAS.md: a tarefa original vira `cancelada` com referência, e
as substitutas nascem com `replanejada-de` apontando para ela.
Contexto extra: replanejamento avulso pedido pelo painel — NÃO é o replanejamento
automático por esgotamento de ciclos.
```

Regra que não pode ser violada: replanejar é reescrever a ABORDAGEM, não apagar o
problema. Tarefa que continua necessária não pode simplesmente sumir do backlog — se ela
deixou de fazer sentido, isso vira uma linha de justificativa em `DECISOES.md`.

Ao final, responda ao usuário em português (BR), em no máximo 10 linhas: o que foi
cancelado, o que nasceu no lugar, e o que mudou na abordagem — sem recitar as tarefas
inteiras.
