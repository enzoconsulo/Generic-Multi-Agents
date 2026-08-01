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

   **Classifique o DOMÍNIO** (CLAUDE.md, seção "As duas trilhas"). A pergunta é uma só: *o
   entregável final é software que roda*, ou é outro tipo de artefato? Um app, uma API, um
   CLI, um jogo, uma biblioteca, um site → `software`. Uma apresentação, um documento, uma
   análise de números, um vídeo, um diagrama, qualquer outra coisa → trilha genérica, com o
   domínio do catálogo de `_sistema/DOMINIOS.md` (`apresentacao`, `documento`, `dados`,
   `midia`) ou um nome que você cunha para o pedido.

   Na dúvida genuína entre as duas (ex.: "um painel que mostra meus gastos" pode ser app ou
   planilha), pergunte ao usuário — é uma das poucas exceções da regra 5: o domínio decide
   o pipeline inteiro e errar custa o projeto todo. Ferramenta pontual **construída para
   produzir o artefato** (um script que gera o deck) não torna o projeto `software`: o
   entregável é o deck.
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
4. **Despache o planejador da trilha** — `planejador` (software) ou `planejador-generico`
   (qualquer outro domínio) — com: caminho absoluto do projeto, **o domínio que você
   classificou**, a descrição completa da ideia dada pelo usuário e a ordem de produzir
   ESPECIFICACAO.md, PLANO.md, `equipe.json` e as tarefas conforme o protocolo. Se a ideia
   envolver escolha genuinamente incerta, despache antes o `pesquisador` e repasse a
   recomendação ao planejador.
   **Despacho síncrono (regra 7 do CLAUDE.md): espere o planejador terminar nesta mesma
   resposta.** Nada de segundo plano, nada de encerrar o turno para aguardar notificação —
   a sessão fecharia e ele seria cortado no meio da escrita das tarefas.
5. **Valide o resultado:** confira que a especificação, o plano, o `equipe.json` e as
   tarefas existem e seguem o protocolo (frontmatter completo, dependências sem ciclo,
   critérios de aceite objetivos — comando + resultado esperado, não frase vaga).

   **A T-001 tem de ser a fundação.** Software: o scaffold pelo gerador oficial do
   ecossistema, entregando lint + format, runner de teste com um teste passando e commit
   inicial (`_sistema/BIBLIOTECAS.md`). Trilha genérica: estrutura, ferramenta de geração
   instalada pelo gerenciador oficial e **o verificador rodando** sobre um artefato mínimo
   (`_sistema/DOMINIOS.md`). Não é? Devolva ao planejador antes de qualquer outra
   validação: é dela que todas as outras dependem.

   **Trilha genérica, duas conferências a mais:** (a) o `equipe.json` traz o campo
   `dominio` com o valor que você classificou — sem ele a fábrica trata o projeto como
   software e despacha os agentes errados; (b) quantos critérios do backlog dependem de
   `verificacao: rubrica`. Se for a maioria, o projeto vai rodar com um portão e meio:
   devolva ao planejador para subir de degrau o que der, e o que sobrar diga ao usuário no
   relatório final, explicitamente.

   **Confira um a um que TODO id citado nas fases do PLANO.md tem arquivo em
   `_gestao/tarefas/`** — id sem arquivo é tarefa que não existe para a fábrica: ninguém a
   promove, ninguém a executa, e ela não aparece no quadro do painel. Faltou algum →
   despache o planejador de novo, com a lista exata dos ids que faltam, e só siga quando a
   contagem bater. Problemas de conteúdo → devolva ao planejador com o que corrigir.
6. **Promova** para `pronta` as tarefas sem dependências.
7. **Commite** os artefatos de gestão no repositório do projeto
   (`chore: especificação e backlog inicial`).
8. **Registre** a criação no log do dia (`_sistema/logs/AAAA-MM-DD.md`; crie se não existir).

Relatório final ao usuário: nome e caminho do projeto, stack escolhida (e por quê, em 1
linha), total de tarefas por fase, quais já estão `pronta`, e lembre que `/trabalhar
<nome>` começa a execução.
