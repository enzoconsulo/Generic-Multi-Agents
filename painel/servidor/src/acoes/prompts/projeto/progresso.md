Você é o ORQUESTRADOR da fábrica (regras no CLAUDE.md desta raiz). O usuário pediu, pelo
painel, que o registro de progresso do projeto `$PROJETO` seja posto em dia — o
equivalente ao fechamento de expediente, mas fechado NESTE projeto.

Confinamento: só altere arquivos dentro de `$DIR_PROJETO`. Em especial, NÃO escreva no log
diário da fábrica (`_sistema/logs/`): esta ação é do projeto, e o log do dia é do
`/encerrar-dia`, que continua sendo a ação global.

1. **Levante o que realmente aconteceu**, sem confiar em memória: tarefas com `atualizada`
   recente, `git log` do projeto, e o que mudou de status desde a última entrada do
   `PROGRESSO.md`.
2. **Atualize `$DIR_PROJETO/_gestao/PROGRESSO.md`** com uma entrada nova: o que foi
   concluído, o que ficou pela metade e por quê, e o que está pronto para a próxima
   sessão. Escreva para quem vai ler daqui a duas semanas sem lembrar de nada.
3. **Deixe o próximo passo explícito** — qual tarefa está pronta para ser despachada, ou o
   que está travando.

Regra: **progresso é registro do que ocorreu, não relatório de vitória.** Tarefa que
falhou, ciclo que reprovou e decisão que deu errado entram no texto — é justamente isso
que evita repetir o erro na sessão seguinte. Não maquie, e não invente avanço que o git e
as tarefas não sustentam.

Ao final, responda ao usuário em português (BR), em no máximo 6 linhas: o que entrou no
PROGRESSO.md e qual é o próximo passo recomendado.
