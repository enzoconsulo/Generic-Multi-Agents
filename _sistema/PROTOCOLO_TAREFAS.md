# Protocolo de Tarefas

Contrato obrigatório entre todos os agentes. Qualquer agente que ler, criar ou alterar uma
tarefa segue este documento à risca.

**Este documento vale igual nas DUAS trilhas da fábrica.** O que muda entre elas são os
agentes, não o contrato — onde se lê "executor / testador / revisor" (trilha de software),
leia "construtor / conferente / revisor-generico" quando o projeto declara um `dominio`
diferente de `software` em `_gestao/equipe.json`. O roteamento está no CLAUDE.md da raiz,
seção "As duas trilhas".

**Como ele é consumido:** os seis agentes de construção e portão carregam a fatia que lhes
cabe (o que gravam e para qual status vão) **dentro do próprio prompt de sistema** — eles
abrem este arquivo só quando aparece um caso que a fatia não cobre. Quem o lê sempre é o
planejador da trilha (`planejador` ou `planejador-generico`), porque ele ESCREVE tarefas e
precisa do formato inteiro. Isto é deliberado: a leitura por rotina custava ~2 mil tokens
em cada agente de cada tarefa, e todo token lido cedo é relido em cada ida seguinte ao
modelo. Este documento continua sendo a fonte de verdade — mudou algo aqui, propague para
a fatia nos prompts dos agentes afetados.

## Onde vivem as tarefas

`projetos/<nome>/_gestao/tarefas/T-NNN-slug-curto.md`

- `NNN` é sequencial por projeto, com 3 dígitos (T-001, T-002, ...). Quem cria tarefas
  (planejador) olha o maior ID existente e continua a sequência.
- Um arquivo = uma tarefa. Nunca apagar arquivo de tarefa; tarefa cancelada recebe
  status `cancelada` e o motivo.

## Formato do arquivo

```markdown
---
id: T-001
titulo: Título curto e imperativo
projeto: nome-do-projeto
status: backlog
prioridade: alta        # alta | media | baixa
dependencias: []        # ex.: [T-002, T-003] — IDs que precisam estar concluida
areas: []               # pastas/arquivos que a tarefa toca, ex.: [src/api/, src/db/schema.sql]
tentativas: 0           # incrementado pelo construtor a cada vez que pega a tarefa
agente: <id>            # OPCIONAL: especialista da equipe (_gestao/equipe.json) que executa; vazio = construtor genérico
verificacao: rubrica    # OPCIONAL (trilha genérica): ausente = critérios executáveis/inspecionáveis.
                        # `rubrica` EXIGE a seção `## Rubrica` abaixo — ver regra 13.
replanejada-de: T-NNN   # OPCIONAL: só em tarefas criadas por replanejamento automático
criada: AAAA-MM-DD
atualizada: AAAA-MM-DD  # atualizar em TODA mudança de status
---

## Objetivo
O que deve existir/funcionar quando a tarefa terminar. 1–3 frases.

## Contexto
O que o executor precisa saber: decisões já tomadas, arquivos relevantes, armadilhas.

## Critérios de aceite
- [ ] Verificáveis e objetivos. O verificador vai executar cada um literalmente.
- [ ] Ex.: "GET /api/usuarios retorna 200 com lista em JSON", não "API funciona".
- [ ] Trilha genérica: "`uv run python verificar.py` → OK: 12 slides, 0 problemas",
      não "o deck está pronto".

## Rubrica
(SÓ quando `verificacao: rubrica` — trilha genérica, critério que nenhum programa consegue
 provar. Itens BINÁRIOS, nunca escala vaga: "cada seção abre com frase-tese", "nenhum slide
 passa de 6 linhas". O conferente avalia item a item e marca o critério como `[julgado]`.)

## Notas de execução
(preenchido pelo executor: o que fez, arquivos alterados, comandos de teste, hash do commit)

O hash vai em linha própria, nesta grafia exata — é o que o revisor procura para ir direto
ao diff, e um ciclo de retrabalho ACRESCENTA uma linha em vez de substituir:

```
**Commit:** `d5a3edc`
```

Ele só existe DEPOIS do commit, então é gravado num segundo commit (`T-NNN: hash da
revisão`). Escrever "a seguir" ou "ver mensagem do commit" no lugar do hash deixa o campo
inútil: sem ele o revisor precisa descobrir os commits por `git log`, e uma revisão de 2
chamadas de ferramenta vira uma de 70.

## Verificação
(preenchido pelo testador/conferente: cada critério com PASSOU/FALHOU + evidência; se falhou,
 como reproduzir. Entrega com forma visual: caminho da captura em _gestao/evidencias/.
 Trilha genérica: cada critério leva também o GRAU DE PROVA — [executado] | [inspecionado] |
 [julgado] — e a seção fecha com a linha `Graus de prova: N executados, M inspecionados,
 K julgados`. Ver regra 13.)

## Conformidade
(preenchido pelo revisor: `Conformidade: cumpre | cumpre-parcial | nao-cumpre` + cada critério
 mapeado ao artefato que o cumpre, e o julgamento do Objetivo)

## Revisão
(preenchido pelo revisor: achados com arquivo:linha e gravidade, ou "aprovado sem ressalvas")
```

## Estados e transições

| De | Para | Quem | Quando |
|---|---|---|---|
| — | `backlog` | planejador | ao criar a tarefa |
| `backlog` | `pronta` | orquestrador | todas as `dependencias` estão `concluida` |
| `pronta` | `em-execucao` | executor | ao iniciar (incrementa `tentativas`) |
| `em-execucao` | `em-teste` | executor | implementação terminada + commit feito |
| `em-execucao` | `em-revisao` | executor | despacho mandou pular teste (tarefa trivial; decisão do orquestrador anotada na tarefa) |
| `em-teste` | `em-revisao` | testador | todos os critérios PASSARAM |
| `em-teste` | `em-execucao` | testador | algum critério FALHOU (relatório na seção Verificação) |
| `em-revisao` | `concluida` | revisor | conformidade `cumpre` E sem bugs relevantes |
| `em-revisao` | `em-execucao` | revisor | bugs encontrados (seção Revisão) OU conformidade `nao-cumpre` (seção Conformidade) |
| `em-execucao` | `em-execucao` | construtor | **impedimento declarado**: escreve `Impedimento: <motivo>` nas Notas e NÃO move o status — a tarefa vai ao planejador (ver abaixo) |
| `em-execucao` | `pronta` | orquestrador | saneamento: sessão anterior caiu sem concluir a etapa (notas parciais preservadas) |
| qualquer | `bloqueada` | orquestrador | 3 tentativas esgotadas, ou impedimento externo (motivo na tarefa) |
| `bloqueada` | `pronta` | orquestrador | impedimento resolvido (zera `tentativas`) |
| qualquer | `cancelada` | orquestrador | tarefa deixou de fazer sentido (motivo na tarefa) |

Regras:

0. **`Impedimento: <motivo>` é o canal do construtor para dizer "a tarefa está travada pela
   ESPECIFICAÇÃO, não pela execução".** Uma linha, começando a linha, nas Notas de execução, e
   o `status` **não** se move. A fábrica lê a linha e roteia a tarefa ao **planejador** — que é
   quem tem autoridade sobre critério e escopo; o construtor nunca teve. Vale para impedimento
   **verificável por outra pessoa**: critério com comando impossível, critérios que se
   contradizem, dependência inexistente, contexto factualmente errado. Tarefa apenas difícil
   não é impedimento.
   Duas travas: **uma vez por linhagem** (tarefa que já nasceu de replanejamento e alega
   impedimento de novo vira `bloqueada` para o usuário) e **nada de punição embutida** — a
   `tentativa` já foi contada pelo próprio construtor ao começar, e é o planejador quem a zera
   ao reescrever a tarefa. Se o planejador discordar e devolver a tarefa como está, a tentativa
   gasta continua gasta: é esse o desincentivo contra usar o canal como rota de fuga.
   Nasceu da T-030 do banco-imobiliario, em que o executor diagnosticou a causa certa no ciclo
   2 e escreveu nas Notas — e a tarefa girou três ciclos e ~US$ 9 a mais porque ninguém lia
   prosa.
1. **O frontmatter é a fonte única de verdade.** Nenhum outro arquivo lista status de
   tarefas. Painéis (/status) são sempre gerados escaneando os arquivos na hora.
2. Quem muda `status` também atualiza `atualizada` e escreve na seção correspondente
   (Notas de execução / Verificação / Revisão). Mudança de status sem registro é violação
   do protocolo.
3. Executor que pega tarefa reprovada lê PRIMEIRO as seções Verificação e Revisão e
   corrige exatamente o que foi apontado antes de qualquer outra coisa.
4. `tentativas >= 3` e reprovou de novo → orquestrador marca `bloqueada` e segue o fluxo
   com as demais tarefas. Tarefas bloqueadas são reportadas ao usuário no /status e no
   log diário — nunca silenciosamente ignoradas.
5. Tarefa boa tem escopo de **30 a 90 minutos de trabalho de agente**. Maior que isso, o
   planejador quebra em partes com dependências.
6. `areas` existe para o orquestrador decidir paralelismo com segurança: duas tarefas do
   mesmo projeto só rodam em paralelo se as `areas` forem disjuntas.
7. **Retrabalho em ciclos:** a cada novo ciclo, quem escreve nas seções Notas de
   execução / Verificação / Revisão abre um subtítulo `### Ciclo N` — e quem lê foca no
   ciclo mais recente. N é o valor de `tentativas` fixado quando o executor assumiu o
   ciclo. Histórico completo preservado, leitura sempre enxuta.
8. **Replanejamento automático (uma vez por linhagem):** tarefa `bloqueada` por
   esgotamento de tentativas pode ser substituída UMA vez pelo planejador — a original
   vira `cancelada` com a nota "substituída por T-XXX, T-YYY" e as substitutas nascem
   com `replanejada-de` no frontmatter. Tarefa que já tem `replanejada-de` e bloqueia de
   novo fica bloqueada para o usuário: o sistema não replaneja replanejamento.
9. **Saneamento (sessão anterior caiu, nenhum agente rodando):** `em-teste` e
   `em-revisao` NÃO regridem — o trabalho da etapa anterior está commitado/registrado;
   o orquestrador apenas despacha a etapa correspondente. Só `em-execucao` volta para
   `pronta` (notas parciais preservadas; se elas mostrarem trabalho consistente, o
   executor é despachado para continuar de onde parou).
10. **Marco de fase:** o resultado da verificação de marco (aprovado/reprovado + data,
    com IDs das correções se houver) é registrado pelo orquestrador na linha `Marco:`
    da fase no PLANO.md do projeto — marco não vive em tarefa nenhuma.
11. **Dois portões, duas perguntas.** O testador responde "**funciona?**" executando os
    critérios de aceite. O revisor responde "**é o que foi pedido?**" (Conformidade) e
    "**está correto?**" (Revisão). São independentes: uma entrega pode passar em todos os
    critérios, não ter bug nenhum e ainda assim não ser a tarefa — critério frouxo ou mal
    escrito não vira licença para entregar outra coisa. Reprovar por conformidade NÃO
    exige bug. Tarefa que produz interface leva captura de tela em
    `_gestao/evidencias/T-NNN-*.png` (feita pelo testador com
    `_sistema/ferramentas/captura.mjs`), e é sobre ela que a conformidade visual é julgada.
12. **Escalonamento de modelo no retrabalho.** A 1ª execução vai no modelo do disparo. Da
    2ª em diante (`tentativas >= 1`, ou seja, a tarefa já voltou reprovada), o orquestrador
    despacha o construtor REFORÇADO da trilha — `executor-reforcado` ou
    `construtor-reforcado`, e o gêmeo `-reforcado` do especialista quando há equipe
    injetada (resolução em 3 passos no CLAUDE.md, seção "Equipe do projeto"). O gatilho é
    fato medido — a tarefa falhou —, não palpite sobre dificuldade. Insistir no mesmo
    modelo depois de uma reprovação gasta o ciclo inteiro de novo e queima uma das 3
    tentativas; subir a capacidade custa menos que um ciclo perdido. Se o disparo já for
    `opus`/`fable`, não há para onde escalar: siga com o construtor normal e registre isso.
    **Duas reprovações seguidas sob o MESMO especialista** (`tentativas >= 2`) trocam o
    construtor por prevenção: vá para o reforçado genérico da trilha e registre a troca —
    o `agente:` foi decidido no planejamento, antes de se saber onde a tarefa falharia.
13. **Grau de prova (trilha genérica).** Fora de software, "verificar" não é uma coisa só.
    Todo critério fica num de três degraus, e o `conferente` **registra em qual**:
    `[executado]` (um comando roda e a saída é o veredito), `[inspecionado]` (um script
    abre o artefato entregue e afirma fatos sobre ele) ou `[julgado]` (avaliação item a
    item contra a seção `## Rubrica`, que passa a ser obrigatória na tarefa junto com
    `verificacao: rubrica` no frontmatter).

    **PASSOU por julgamento nunca se escreve como PASSOU por execução.** O rótulo é o que
    impede a fábrica de parecer ter dois portões independentes quando tem um: sem ele,
    conferente e revisor viram dois julgamentos subjetivos sobre o mesmo artefato, e o
    portão do meio deixa de valer o que custa. Suba de degrau sempre que der; descer é
    decisão registrada, no Contexto da tarefa e em `DECISOES.md`. Critério escrito como
    comando que o projeto não tem como rodar é **reprovação por critério impossível**, não
    convite para o conferente julgar no lugar. A doutrina completa (escada de verificação,
    fundação que instala o verificador, regra do binário gerado) está em
    `_sistema/DOMINIOS.md`.
