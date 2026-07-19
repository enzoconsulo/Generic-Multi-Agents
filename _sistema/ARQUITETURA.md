# Arquitetura do Sistema

## Visão geral

```
                         ┌─────────────────────────┐
        ideia do usuário │  ORQUESTRADOR           │  comandos: /novo-projeto /ideia
        ───────────────► │  (chat principal,       │  /trabalhar /status /encerrar-dia
                         │   regras no CLAUDE.md)  │  /manutencao
                         └─────┬───────────────────┘
                               │ despacha via Agent tool (1 tarefa = 1 pipeline)
        ┌──────────┬───────────┼───────────┬─────────────┬─────────────┐
        ▼          ▼           ▼           ▼             ▼             ▼
   planejador   executor   testador    revisor    documentador   pesquisador
   (spec+plano  (código+   (executa    (caça bugs (docs em dia)  (web research)
    +tarefas)    testes+     critérios   no diff)
                 commit)     de aceite)
        │          │           │           │             │             │
        └──────────┴───────────┴─────┬─────┴─────────────┴─────────────┘
                                     ▼
                     ESTADO EM ARQUIVOS (sobrevive à sessão)
         projetos/<nome>/_gestao/tarefas/*.md   ← status no frontmatter
         projetos/<nome>/_gestao/{ESPECIFICACAO,PLANO,DECISOES,PROGRESSO}.md
         _sistema/logs/AAAA-MM-DD.md            ← memória diária
         git (um repositório por projeto)       ← histórico do código
         git na raiz (projetos/ no .gitignore)  ← histórico da própria fábrica
```

## Princípios de projeto

1. **Estado em arquivo, não em contexto.** Sessões do Claude Code são comprimidas ou
   encerradas; arquivos não. Qualquer sessão nova reconstrói o estado inteiro lendo
   `_gestao/` e `_sistema/logs/`. Por isso todo agente é obrigado a registrar o que fez
   no arquivo da tarefa antes de terminar.
2. **Orquestrador magro, agentes especializados.** O chat principal decide e coordena;
   quem trabalha são os agentes. Isso mantém o contexto do orquestrador limpo para
   sessões longas de /trabalhar e permite paralelismo real.
3. **Pipeline com portões de qualidade.** Nada é `concluida` sem passar por teste
   (critérios de aceite executados de verdade) e revisão (caça a bugs no diff). Quem
   implementa nunca é quem aprova.
4. **Separação implementar/verificar.** Testador e revisor têm proibição explícita de
   corrigir código — eles reprovam e devolvem. Isso evita "aprovação por conveniência" e
   mantém o executor como único ponto de escrita de código.
5. **Falha limitada.** 3 tentativas por tarefa e segue o baile. Uma tarefa problemática
   nunca trava a fábrica; ela vira `bloqueada`, é reportada, e o resto continua.
6. **Confinamento por projeto.** Cada agente opera dentro de `projetos/<nome>/`. Projetos
   não se contaminam; paralelismo entre projetos é sempre seguro.
7. **Trabalho não duplicado, árvore respeitada.** A suíte completa roda UMA vez por ciclo
   (no testador, com o projeto quieto); o executor roda só os testes da própria tarefa.
   Reprovação falsa por interferência entre agentes queima um ciclo inteiro — é o
   desperdício mais caro, e as regras de paralelismo existem para zerá-lo.

## Limitações conhecidas da plataforma (e como o desenho lida com elas)

- **Subagentes não criam subagentes.** Todo encadeamento (executor → testador → revisor)
  é feito pelo orquestrador, uma etapa por vez. Os comandos já descrevem esse loop.
- **Agentes começam "frios"** (sem o contexto do chat). Por isso cada despacho inclui no
  prompt: caminho do projeto, ID da tarefa e ordem de ler o protocolo + arquivos de
  gestão. O custo disso é o motivo de tarefas terem escopo de 30–90 min — grandes demais
  desperdiçam recontextualização, pequenas demais desperdiçam overhead de despacho.
- **Mesma árvore de trabalho por projeto** (sem worktrees): agentes paralelos no mesmo
  projeto enxergam as edições não commitadas uns dos outros. Resposta do desenho:
  `areas` disjuntas entre executores, suíte completa só no testador, testador só com
  projeto quieto, revisor livre (lê o diff commitado).
- **Modelo: herdado da sessão** (frontmatter `model: inherit` em cada agente). O usuário
  troca o modelo com `/model` (Fable enquanto disponível; Opus depois) e todos os agentes
  acompanham. O desenho não depende de recurso exclusivo de nenhum modelo.

## Anatomia de um dia de trabalho

1. `/status` — orquestrador escaneia `projetos/*/_gestao/tarefas/*.md` e monta o painel.
2. `/trabalhar` — loop principal:
   a. Promove `backlog → pronta` (dependências satisfeitas).
   b. Seleciona até 3 tarefas `pronta` independentes (prioridade alta primeiro;
      `areas` disjuntas se mesmo projeto).
   c. Despacha executores (em paralelo quando seguro).
   d. Para cada tarefa que voltar: despacha testador (com o projeto quieto); depois
      revisor; trata reprovações devolvendo ao executor com o relatório.
   e. Fase completa → testador em modo marco; resultado vai para a linha `Marco:` do
      PLANO.md.
   f. Repete até não haver tarefa `pronta` nem pipeline em andamento.
   g. Documentador roda nos projetos com 3+ tarefas concluídas na sessão.
3. `/encerrar-dia` — log diário + PROGRESSO.md por projeto.

## Como estender o sistema

(Passo a passo detalhado, com exemplos prontos, na seção "Estendendo o sistema" do README.md.)

- **Novo agente:** criar `.claude/agents/<nome>.md` com frontmatter (`name`,
  `description`, `tools`, `model: inherit`) + prompt de sistema no corpo. Adicionar à tabela
  do `CLAUDE.md` raiz dizendo quando o orquestrador deve usá-lo.
- **Novo comando:** criar `.claude/commands/<nome>.md` (vira `/<nome>`). O corpo é a
  instrução que o orquestrador executa; `$ARGUMENTS` recebe o que o usuário digitar.
- **Novo campo de tarefa:** adicionar no template + PROTOCOLO_TAREFAS.md + instruir os
  agentes afetados. Nunca criar campo que duplique estado derivável dos existentes.
- **Ideias de evolução natural:** agente de deploy (gate manual do usuário por custo),
  agente de segurança (rodar antes de `concluida` em projetos com autenticação/pagamento),
  integração com GitHub (gh CLI) para publicar os repositórios.
