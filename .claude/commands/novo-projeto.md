---
description: Cria um projeto novo em projetos/<nome> com git, especificação, plano e backlog de tarefas
argument-hint: <nome-do-projeto> — <descrição da ideia>
---

Criar um projeto novo na fábrica. Entrada do usuário: $ARGUMENTS

Você é o orquestrador (regras no CLAUDE.md raiz). Execute de ponta a ponta, sem parar
para perguntar (exceto se a entrada não permitir nem inferir um nome ou uma descrição
mínima):

1. **Interprete a entrada:** extraia o nome (converta para kebab-case, ex.:
   `app-receitas`) e a descrição da ideia. Se `projetos/<nome>/` já existir, PARE e
   informe — nunca sobrescreva um projeto.
2. **Crie a estrutura** a partir dos templates de `_sistema/templates/`:
   ```
   projetos/<nome>/
   ├── CLAUDE.md            (template CLAUDE-projeto.md, preenchendo nome/descrição)
   ├── README.md            (mínimo: nome + descrição de 1 linha; o documentador evolui depois)
   └── _gestao/
       ├── DECISOES.md      (template)
       ├── PROGRESSO.md     (template, com entrada inicial datada "projeto criado")
       ├── pesquisas/
       └── tarefas/
   ```
3. **Inicialize o git** dentro de `projetos/<nome>/` (repositório próprio do projeto):
   `git init` + commit inicial `chore: estrutura inicial do projeto`.
4. **Despache o `planejador`** com: caminho absoluto do projeto, a descrição completa da
   ideia dada pelo usuário e a ordem de produzir ESPECIFICACAO.md, PLANO.md e as tarefas
   conforme o protocolo. Se a ideia envolver escolha técnica genuinamente incerta,
   despache antes o `pesquisador` e repasse a recomendação ao planejador.
5. **Valide o resultado:** confira que a especificação, o plano e as tarefas existem e
   seguem o protocolo (frontmatter completo, dependências sem ciclo, critérios de aceite
   objetivos). Problemas → devolva ao planejador com a lista do que corrigir.
6. **Promova** para `pronta` as tarefas sem dependências.
7. **Commite** os artefatos de gestão no repositório do projeto
   (`chore: especificação e backlog inicial`).
8. **Registre** a criação no log do dia (`_sistema/logs/AAAA-MM-DD.md`; crie se não existir).

Relatório final ao usuário: nome e caminho do projeto, stack escolhida (e por quê, em 1
linha), total de tarefas por fase, quais já estão `pronta`, e lembre que `/trabalhar
<nome>` começa a execução.
