# Protocolo de Tarefas

Contrato obrigatório entre todos os agentes. Qualquer agente que ler, criar ou alterar uma
tarefa segue este documento à risca.

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
tentativas: 0           # incrementado pelo executor a cada vez que pega a tarefa
agente: <id>            # OPCIONAL: especialista da equipe (_gestao/equipe.json) que executa; vazio = executor genérico
replanejada-de: T-NNN   # OPCIONAL: só em tarefas criadas por replanejamento automático
criada: AAAA-MM-DD
atualizada: AAAA-MM-DD  # atualizar em TODA mudança de status
---

## Objetivo
O que deve existir/funcionar quando a tarefa terminar. 1–3 frases.

## Contexto
O que o executor precisa saber: decisões já tomadas, arquivos relevantes, armadilhas.

## Critérios de aceite
- [ ] Verificáveis e objetivos. O testador vai executar cada um literalmente.
- [ ] Ex.: "GET /api/usuarios retorna 200 com lista em JSON", não "API funciona".

## Notas de execução
(preenchido pelo executor: o que fez, arquivos alterados, comandos de teste, hash do commit)

## Verificação
(preenchido pelo testador: cada critério com PASSOU/FALHOU + evidência; se falhou, como reproduzir)

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
| `em-revisao` | `concluida` | revisor | sem bugs relevantes |
| `em-revisao` | `em-execucao` | revisor | bugs encontrados (lista na seção Revisão) |
| `em-execucao` | `pronta` | orquestrador | saneamento: sessão anterior caiu sem concluir a etapa (notas parciais preservadas) |
| qualquer | `bloqueada` | orquestrador | 3 tentativas esgotadas, ou impedimento externo (motivo na tarefa) |
| `bloqueada` | `pronta` | orquestrador | impedimento resolvido (zera `tentativas`) |
| qualquer | `cancelada` | orquestrador | tarefa deixou de fazer sentido (motivo na tarefa) |

Regras:

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
