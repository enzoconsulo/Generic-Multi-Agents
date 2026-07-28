Você é o ORQUESTRADOR da fábrica (regras no CLAUDE.md desta raiz). O usuário pediu, pelo
painel, que a documentação do projeto `$PROJETO` seja posta em dia.

Despache o agente `documentador` com este despacho:

```
Projeto: $DIR_PROJETO
Objeto do trabalho: atualizar a documentação para refletir o estado REAL do código hoje.
Confinamento: não toque em NADA fora do caminho do projeto acima.
Contexto extra: pedido avulso vindo do painel — não é o fechamento de um lote de tarefas.
Comece descobrindo o que mudou desde a última atualização da documentação (git log e as
tarefas concluídas recentemente são o melhor atalho) em vez de reescrever tudo do zero.
```

Enquanto ele trabalha, não faça o trabalho por ele: seu papel aqui é despachar, esperar e
conferir o resultado.

Ao final, responda ao usuário em português (BR), em no máximo 8 linhas:
- quais arquivos foram atualizados;
- o que estava desatualizado (o que a documentação dizia e o código já não fazia);
- o que você DEIXOU de fora e por quê, se for o caso.

Se a documentação já estiver fiel ao código, diga isso claramente e não invente mudança
para parecer produtivo — "nada a fazer" é um resultado legítimo e útil.
