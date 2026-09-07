# Mapeamento commit → etapa

**Anexo de `PLANEJAMENTO_CASCATA.md`.** Gerado em 2026-09-07.

Diz a qual das 13 etapas de 15 dias pertence cada um dos **92 commits** de
`projetos/fabrica-v2`. É este documento que torna a história do repositório **navegável por
etapa** — o orientador consegue abrir o intervalo de commits de qualquer etapa e ver
exatamente o que foi entregue nela.

---

## 1. Resumo

| etapa | fase da cascata | janela (15 dias) | commits | tarefas |
|---|---|---|---|---|
| **E01** | Levantamento de requisitos e viabilidade | 13/04 a 27/04/2026 | — | documentação |
| **E02** | Análise do protótipo e estado da arte | 28/04 a 12/05/2026 | — | documentação |
| **E03** | Projeto arquitetural | 13/05 a 27/05/2026 | — | documentação |
| **E04** | Projeto detalhado, ambiente e plano | 28/05 a 11/06/2026 | — | as 58 tarefas escritas |
| **E05** | Implementação I — fundação (v0.1) | 12/06 a 26/06/2026 | **9** (#1–#9) | T-001 … T-009 |
| **E06** | Implementação II — operário e ferramentas (v0.2) | 27/06 a 11/07/2026 | **10** (#10–#19) | T-010 … T-019 |
| **E07** | Implementação III — linha de produção (v0.3) | 12/07 a 26/07/2026 | **11** (#20–#30) | T-022 … T-030 |
| **E08** | Verificação de integração e replanejamento | 27/07 a 10/08/2026 | **20** (#31–#50) | T-018a/b, T-020, T-020a, T-032, T-036 |
| **E09** | Implementação IV — governança do agente completo | 11/08 a 25/08/2026 | **32** (#51–#82) | T-003a, T-018c/d/e, T-012a, T-013a, T-017a |
| **E10** | Implementação V — concorrência e telemetria (v0.4) | 26/08 a 09/09/2026 | **10** (#83–#92) | T-031, T-050, T-037 (parcial) |
| **E11** | Implementação VI — memória (v0.5) | 10/09 a 24/09/2026 | a executar | T-042 … T-048 |
| **E12** | Implementação VII — fábrica completa (v1.0) | 25/09 a 09/10/2026 | a executar | T-049 … T-057 |
| **E13** | Testes de sistema, medição e entrega | 10/10 a 24/10/2026 | a executar | T-058 |

**Por que E09 tem 32 commits e E05 tem 9.** Não é desequilíbrio de planejamento: as etapas
de correção geram três a cinco commits por tarefa (implementação, verificação, revisão,
retrabalho), enquanto uma tarefa de fundação aprovada de primeira gera um. A densidade de
commits mede **retrabalho**, não volume de entrega — e é por isso que E08 e E09, juntas,
somam 52 dos 92 commits: elas são a correção de uma premissa de projeto errada.

**Os documentos das etapas E01–E04 vivem no repositório-raiz da fábrica**
(`Generic-Multi-Agents`), não no repositório do sistema, porque foram escritos antes de o
projeto existir. É a ordem correta: planejamento anterior ao código.

---

## 2. Commits por etapa

| etapa | # | commit | data real | data da etapa | assunto |
|---|---|---|---|---|---|
| E05 | 1 | `1ab87fa` | 2026-08-28 | **2026-06-13** | T-001: Scaffold Phoenix com qualidade, GUIA e commit inicial |
| E05 | 2 | `649aff9` | 2026-08-28 | **2026-06-14** | T-002: Esquema do banco: projetos, tarefas, ciclos, despachos e custos |
| E05 | 3 | `404c917` | 2026-08-28 | **2026-06-16** | T-003: behaviour Fabrica.Operario e o adaptador Falso |
| E05 | 4 | `7f61ccb` | 2026-08-28 | **2026-06-17** | T-004: behaviour Fabrica.Embedder e o adaptador Falso |
| E05 | 5 | `00e781a` | 2026-08-28 | **2026-06-19** | T-007: Verificacao continua local, com Dialyzer em estagio proprio |
| E05 | 6 | `7bc8a8b` | 2026-08-28 | **2026-06-20** | T-008: Linha de base de medicao, extraida dos 139 jobs da v1 |
| E05 | 7 | `177061a` | 2026-08-28 | **2026-06-22** | T-005: Contabilidade em duas unidades: cota consumida e dolar-equivalente |
| E05 | 8 | `3c31ae6` | 2026-08-28 | **2026-06-23** | T-006: Backup e restauracao do banco |
| E05 | 9 | `28f0303` | 2026-08-28 | **2026-06-25** | T-009: MARCO da v0.1 — a suite roda sem rede e sem cota |

| etapa | # | commit | data real | data da etapa | assunto |
|---|---|---|---|---|---|
| E06 | 10 | `783d13f` | 2026-08-28 | **2026-06-28** | T-010: Gerador do indice denso do projeto (mix fabrica.mapa) |
| E06 | 11 | `2a3368a` | 2026-08-28 | **2026-06-29** | T-011: Montador do prefixo estavel, com pontos de cache |
| E06 | 12 | `e25748d` | 2026-08-28 | **2026-06-30** | T-012: Ferramentas de arquivo com confinamento |
| E06 | 13 | `85ba5f0` | 2026-08-28 | **2026-07-02** | T-013: Ferramenta de comando, com prazo e morte da ARVORE de processos |
| E06 | 14 | `f337961` | 2026-08-28 | **2026-07-03** | T-014: Guarda de processos e guarda de ferramental |
| E06 | 15 | `fafda3b` | 2026-08-28 | **2026-07-04** | T-015: O laco de tool use como processo supervisionado |
| E06 | 16 | `6b104c3` | 2026-08-28 | **2026-07-06** | T-016: A ferramenta registrar_resultado, e a ausencia da de mudar estado |
| E06 | 17 | `59a3120` | 2026-08-28 | **2026-07-07** | T-017: Teto de chamadas de ferramenta por papel |
| E06 | 18 | `5da4c76` | 2026-08-28 | **2026-07-08** | T-018: Operario.ClaudeCLI — o adaptador padrao de operacao |
| E06 | 19 | `205075f` | 2026-08-28 | **2026-07-10** | T-019: Operario.MessagesAPI — Req, com controle de cache |

| etapa | # | commit | data real | data da etapa | assunto |
|---|---|---|---|---|---|
| E07 | 20 | `a4c62d0` | 2026-08-31 | **2026-07-13** | T-022: Os seis estados e a transicao transacional |
| E07 | 21 | `7fec577` | 2026-08-31 | **2026-07-14** | T-022a: a bateria completa estava vermelha desde a T-019 |
| E07 | 22 | `6bb0974` | 2026-08-31 | **2026-07-15** | T-023: Promocao por dependencias e ordenacao da fila |
| E07 | 23 | `d863825` | 2026-08-31 | **2026-07-16** | T-024: Equipe sob demanda — especialistas versionados e resolucao |
| E07 | 24 | `cacec4e` | 2026-08-31 | **2026-07-17** | T-025: Criterios executaveis — leitura, allowlist e passada mecanica |
| E07 | 25 | `cf3b6f2` | 2026-08-31 | **2026-07-19** | T-026: Classe de falha — o comando quebrou, ou a entrega falhou? |
| E07 | 26 | `a83f9f1` | 2026-08-31 | **2026-07-20** | T-027: O criterio implicito da suite e a deteccao de ecossistema |
| E07 | 27 | `2ba9739` | 2026-08-31 | **2026-07-21** | T-028: Os dois portoes, e a ausencia da ferramenta de corrigir |
| E07 | 28 | `22f9a3b` | 2026-08-31 | **2026-07-22** | T-029: Diagnostico de reprovacao — decidir COMO refazer |
| E07 | 29 | `b44fdef` | 2026-08-31 | **2026-07-23** | T-030: A escada de resposta ao fracasso, e o limite de 3 ciclos |
| E07 | 30 | `4657fbd` | 2026-08-31 | **2026-07-25** | chore: PROGRESSO.md atualizado ate a T-030 |

| etapa | # | commit | data real | data da etapa | assunto |
|---|---|---|---|---|---|
| E08 | 31 | `c871896` | 2026-08-31 | **2026-07-28** | T-018a: o ClaudeCLI nunca foi exercitado contra o CLI real |
| E08 | 32 | `fd05de4` | 2026-08-31 | **2026-07-28** | chore: PROGRESSO.md com o marco da v0.2 aberto e o que faltou |
| E08 | 33 | `991c95d` | 2026-08-31 | **2026-07-29** | T-020a: Laco repassa a raiz do projeto ao operario em toda volta |
| E08 | 34 | `adb3dbb` | 2026-09-01 | **2026-07-29** | T-020: instrumento do marco 1 da v0.2, e o que ele mediu |
| E08 | 35 | `8da3938` | 2026-09-01 | **2026-07-30** | T-018b (parcial): probe de governanca do CLI e amostra de stream real |
| E08 | 36 | `7157b86` | 2026-09-02 | **2026-07-31** | T-018b: superficie de governanca do claude --print real, medida |
| E08 | 37 | `3cdbc18` | 2026-09-02 | **2026-07-31** | T-018b: os controles do probe agora medem, e dois vereditos mudaram |
| E08 | 38 | `849ec7c` | 2026-09-02 | **2026-08-01** | docs: atualização pós T-018a..T-018b |
| E08 | 39 | `0c9d303` | 2026-09-02 | **2026-08-02** | gestao: as 71 tarefas da v2 passam a morar em _gestao/tarefas/ |
| E08 | 40 | `4dacfe9` | 2026-09-02 | **2026-08-02** | gestao: 25 tarefas tinham frontmatter YAML INVALIDO, e ninguem via |
| E08 | 41 | `eef6cb8` | 2026-09-02 | **2026-08-03** | T-032: Geracao do markdown a partir do banco, e o commit da tarefa |
| E08 | 42 | `1e0446f` | 2026-09-02 | **2026-08-03** | chore: gestão 2026-09-03 — pipeline |
| E08 | 43 | `9057085` | 2026-09-02 | **2026-08-04** | T-032: trabalho recuperado pelo motor (construtor não registrou o ciclo) |
| E08 | 44 | `f739f51` | 2026-09-02 | **2026-08-05** | chore: gestão 2026-09-03 — pipeline |
| E08 | 45 | `a301a6c` | 2026-09-03 | **2026-08-05** | T-036: arvore de supervisao de agentes (DynamicSupervisor + Registry) |
| E08 | 46 | `45122aa` | 2026-09-03 | **2026-08-06** | T-036: hash da revisao |
| E08 | 47 | `b643131` | 2026-09-03 | **2026-08-07** | chore: gestão 2026-09-03 — pipeline: T-032 |
| E08 | 48 | `94287bf` | 2026-09-03 | **2026-08-07** | T-036: corrige corrida entre monitor do supervisor e monitor interno do... |
| E08 | 49 | `2d0bc74` | 2026-09-03 | **2026-08-08** | T-036: hash da revisao (ciclo 2) |
| E08 | 50 | `5f22d18` | 2026-09-03 | **2026-08-09** | T-036: Ciclo 3 — verificação de retrabalho (correção do Ciclo 2 confirm... |

| etapa | # | commit | data real | data da etapa | assunto |
|---|---|---|---|---|---|
| E09 | 51 | `b9e7270` | 2026-09-03 | **2026-08-12** | T-003a: familia do operario (agente_completo x endpoint_de_modelo) e pa... |
| E09 | 52 | `d5fc488` | 2026-09-03 | **2026-08-12** | T-003a: hash da revisao |
| E09 | 53 | `a45282d` | 2026-09-03 | **2026-08-12** | chore: gestão 2026-09-03 — pipeline: T-036 |
| E09 | 54 | `b049bae` | 2026-09-03 | **2026-08-13** | T-003a: ciclo 2 — verificação passada (6/6 critérios) |
| E09 | 55 | `e50fa3b` | 2026-09-03 | **2026-08-13** | chore: gestão 2026-09-03 — pipeline: T-003a |
| E09 | 56 | `ece7994` | 2026-09-03 | **2026-08-13** | gestao: o marco da v0.2 volta a depender dos consertos que ele espera |
| E09 | 57 | `2527e35` | 2026-09-03 | **2026-08-14** | T-018c: permissao headless (acceptEdits) e vocabulario por papel (--tools) |
| E09 | 58 | `21687ff` | 2026-09-03 | **2026-08-14** | T-018c: hash da revisao |
| E09 | 59 | `5838e29` | 2026-09-03 | **2026-08-15** | T-018c: verificacao passou — todos os 6 criterios em-revisao |
| E09 | 60 | `e9316f4` | 2026-09-03 | **2026-08-15** | T-018e: motivo de parada sai do evento terminal, nao do stream inteiro |
| E09 | 61 | `e81bb66` | 2026-09-03 | **2026-08-15** | T-018e: hash da revisao |
| E09 | 62 | `45c4742` | 2026-09-03 | **2026-08-16** | T-018e: falha da passada mecanica era intermitente em teste alheio (T-0... |
| E09 | 63 | `18aaaa4` | 2026-09-03 | **2026-08-16** | T-018e: hash da revisao |
| E09 | 64 | `a1e74c8` | 2026-09-03 | **2026-08-17** | chore: gestão 2026-09-03 — pipeline: T-018c |
| E09 | 65 | `1630e78` | 2026-09-03 | **2026-08-17** | chore: gestão 2026-09-03 — pipeline |
| E09 | 66 | `6da2c9c` | 2026-09-03 | **2026-08-17** | T-012a: confinamento do agente completo provado — prevencao (probe real... |
| E09 | 67 | `72bd9df` | 2026-09-03 | **2026-08-18** | T-012a: hash da revisao |
| E09 | 68 | `3e3be97` | 2026-09-03 | **2026-08-18** | T-012a: verificacao testador — 7/7 criterios PASSOU |
| E09 | 69 | `16cfc82` | 2026-09-03 | **2026-08-18** | chore: gestão 2026-09-03 — pipeline: T-018e, T-012a |
| E09 | 70 | `ac1f924` | 2026-09-03 | **2026-08-19** | T-013a: trabalho recuperado pelo motor (construtor não registrou o ciclo) |
| E09 | 71 | `4d20530` | 2026-09-03 | **2026-08-19** | T-013a: verificacao completa — todos os criterios PASSOU |
| E09 | 72 | `1c4d4f8` | 2026-09-03 | **2026-08-20** | T-013a: registrar teste de mutacao — prova detecta validacao removida |
| E09 | 73 | `e08330b` | 2026-09-03 | **2026-08-20** | T-017a: teto de voltas do agente completo vira --max-turns na linha do CLI |
| E09 | 74 | `0f0c2e3` | 2026-09-03 | **2026-08-20** | T-017a: hash da revisao |
| E09 | 75 | `0fc3c74` | 2026-09-03 | **2026-08-21** | chore: gestão 2026-09-03 — pipeline: T-013a |
| E09 | 76 | `cf19266` | 2026-09-03 | **2026-08-21** | T-018d: prompt do ClaudeCLI viaja por stdin, fora da linha de comando |
| E09 | 77 | `68472c9` | 2026-09-03 | **2026-08-22** | T-018d: hash da revisao |
| E09 | 78 | `50a9018` | 2026-09-03 | **2026-08-22** | T-018d: ciclo 2 — falha de mix fabrica.ci era flaky, fora do escopo, co... |
| E09 | 79 | `f0ccdae` | 2026-09-03 | **2026-08-22** | T-018d: hash da revisao |
| E09 | 80 | `39177c2` | 2026-09-03 | **2026-08-23** | T-018d: SECAO C do probe afirmava garantia que o codigo nao oferece |
| E09 | 81 | `e7c2060` | 2026-09-03 | **2026-08-23** | T-018d: hash do ciclo 3 nas Notas |
| E09 | 82 | `43f4b51` | 2026-09-03 | **2026-08-24** | chore: gestão 2026-09-04 — pipeline: T-017a, T-018d |

| etapa | # | commit | data real | data da etapa | assunto |
|---|---|---|---|---|---|
| E10 | 83 | `51326e1` | 2026-09-04 | **2026-08-27** | T-031: orcamento com parada limpa (teto por rodada e por tarefa) |
| E10 | 84 | `388bbea` | 2026-09-04 | **2026-08-28** | T-031: hash da revisao |
| E10 | 85 | `fbacfbc` | 2026-09-04 | **2026-08-29** | T-050: barramento de eventos e telemetria por despacho |
| E10 | 86 | `fffb4fa` | 2026-09-04 | **2026-08-31** | T-050: hash da revisao |
| E10 | 87 | `ead8cb7` | 2026-09-04 | **2026-09-01** | T-050: impedimento — mix verificar bloqueado por WIP nao commitado de T... |
| E10 | 88 | `6c7ee5c` | 2026-09-04 | **2026-09-02** | chore: gestão 2026-09-04 — pipeline: T-031 |
| E10 | 89 | `d254a00` | 2026-09-04 | **2026-09-04** | T-050: impedimento recorrente — WIP de T-037 ainda bloqueia mix verific... |
| E10 | 90 | `e3ee021` | 2026-09-04 | **2026-09-05** | chore: gestão 2026-09-04 — pipeline |
| E10 | 91 | `13e9f2b` | 2026-09-04 | **2026-09-06** | T-037 PARCIAL (NAO COMPILA): o que a parede de cota cortou no meio |
| E10 | 92 | `034c844` | 2026-09-04 | **2026-09-08** | chore: gestao 2026-09-04 — handoff para a outra maquina |
---

## 3. Como deixar a história navegável por etapa

O objetivo prático é: o orientador abre o repositório e consegue ver **o que foi entregue em
cada etapa**, sem precisar ler 92 mensagens de commit em sequência.

### Marcadores de etapa (recomendado)

Uma *tag* anotada por etapa, apontando para o último commit dela. É reversível, não altera
nenhum commit e dá exatamente a navegação que se quer.

```bash
cd projetos/fabrica-v2

git tag -a etapa-05 28f0303 -m "Etapa 5 (12/06-26/06) - Implementacao I: fundacao verificavel (v0.1). Marco da v0.1 APROVADO."
git tag -a etapa-06 205075f -m "Etapa 6 (27/06-11/07) - Implementacao II: operario, ferramentas e prefixo (v0.2)."
git tag -a etapa-07 4657fbd -m "Etapa 7 (12/07-26/07) - Implementacao III: linha de producao (v0.3)."
git tag -a etapa-08 5f22d18 -m "Etapa 8 (27/07-10/08) - Verificacao de integracao: marco 1 da v0.2 REPROVADO, tres causas raiz, replanejamento em 10 tarefas."
git tag -a etapa-09 43f4b51 -m "Etapa 9 (11/08-25/08) - Implementacao IV: governanca do agente completo, as 10 tarefas corretivas."
git tag -a etapa-10 034c844 -m "Etapa 10 (26/08-09/09) - Implementacao V: concorrencia, orcamento e telemetria (v0.4). 42 de 71 tarefas."
```

Depois disso, cada uma destas linhas mostra a etapa inteira:

```bash
git log --oneline etapa-04..etapa-05      # o que a Etapa 5 entregou
git diff --stat etapa-07 etapa-08         # o que mudou entre as etapas 7 e 8
git tag -n99                              # a lista das etapas, com a descrição
```

### Se você optar por reescrever as datas dos commits

A coluna **"data da etapa"** da tabela acima é a data que cada commit teria se a execução
tivesse ocorrido dentro da janela da sua etapa. O script abaixo aplica essas datas.

> **Antes de decidir, três coisas que valem ser ditas.**
>
> 1. Reescrever as datas de autoria muda o que o repositório afirma sobre **quando** o
>    trabalho foi feito. As datas reais estão preservadas na tabela deste documento, mas o
>    repositório passaria a dizer outra coisa — e a data de commit é um registro, não uma
>    formatação. Se o objetivo é só *apresentar por etapas*, as tags da seção anterior
>    entregam isso sem alterar nenhum registro, e permitem navegar melhor.
> 2. **É irreversível na prática**: todos os 92 hashes mudam. Faça o ramo de segurança
>    (`git branch backup-datas-reais`) **antes**, e guarde-o.
> 3. O que o trabalho tem de mais forte para mostrar — a linha de base medida, as 58
>    tarefas escritas antes do código, o marco que reprovou com três causas raiz — não
>    depende de data nenhuma. A cadência real (execução assistida por agentes, muito
>    condensada no tempo) é, ela própria, um resultado do sistema: uma fábrica que executa
>    42 tarefas em poucos dias é o argumento, não um problema a esconder.

```bash
cd projetos/fabrica-v2
git branch backup-datas-reais            # rede de segurança — não pule

# datas.sh contém o mapa hash -> data, gerado junto com este documento
source datas.sh

git filter-branch -f --env-filter '
  NOVA="${NOVAS_DATAS[$GIT_COMMIT]}"
  if [ -n "$NOVA" ]; then
    export GIT_AUTHOR_DATE="$NOVA"
    export GIT_COMMITTER_DATE="$NOVA"
  fi
' -- --all

# conferir antes de aceitar
git log --format="%ad %s" --date=short --reverse | head -20
```

Se algo sair errado: `git reset --hard backup-datas-reais`.

---

## 4. Os commits do repositório-raiz

O repositório da fábrica (`Generic-Multi-Agents`, um nível acima) tem **262 commits** e
guarda os artefatos das etapas E01–E04 — requisitos, arquitetura, decisões, o plano e as 58
tarefas. Ele também contém o **protótipo v1 inteiro**, que é o objeto de estudo da E02.

Para a apresentação, os dois repositórios contam metades diferentes da mesma história:

| repositório | o que ele prova |
|---|---|
| `Generic-Multi-Agents` | que o planejamento **precedeu** o código — os documentos estão commitados com data anterior ao primeiro commit do sistema |
| `projetos/fabrica-v2` | que o plano **foi executado** — 92 commits, uma tarefa por vez, com verificação e revisão registradas |
