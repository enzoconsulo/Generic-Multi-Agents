# Roteiro da v2 — as 58 tarefas, em ordem

**Gerado por `gerar-tarefas.py`. Nao edite a mao** — edite a especificacao no
gerador e rode de novo. Ele nunca sobrescreve tarefa que ja existe.

A ordem desta lista e a ordem de execucao. Cada tarefa e atomica: uma sessao do
Claude Code abre o arquivo dela, faz o trabalho, roda os criterios e commita.

Contexto do porque de cada coisa: `_sistema/PLANO_V2.md` (as versoes),
`_sistema/MIGRACAO_V2.md` (a analise) e `_sistema/DECISOES_FECHADAS.md`.

---

## v0.1 — A fundacao que se prova sozinha

**Entrega:** Um projeto que compila, testa e sobe o banco — sem tocar a rede e sem gastar cota.

| tarefa | o que faz | depende de |
|---|---|---|
| **T-001** | Scaffold Phoenix com qualidade, GUIA e commit inicial | — |
| **T-002** | Esquema do banco: projetos, tarefas, ciclos, despachos e custos | T-001 |
| **T-003** | behaviour Fabrica.Operario e o adaptador Falso | T-001 |
| **T-004** | behaviour Fabrica.Embedder e o adaptador Falso | T-001 |
| **T-005** | Contabilidade em duas unidades: cota consumida e dolar-equivalente | T-002, T-003 |
| **T-006** | Backup e restauracao do banco | T-002 |
| **T-007** | Verificacao continua local, com Dialyzer em estagio proprio | T-001 |
| **T-008** | Linha de base de medicao, extraida dos 139 jobs da v1 | T-001 |
| **T-009** | MARCO da v0.1: a suite roda sem rede e sem cota | T-002, T-003, T-004, T-005, T-006, T-007, T-008 |

> **Marco da v0.1:** `mix verificar` roda a suite inteira sem rede, sem cota e sem chave de API.

---

## v0.2 — Um agente faz uma tarefa

**Entrega:** Despachar um agente contra uma tarefa real e ver o custo discriminado volta a volta.

| tarefa | o que faz | depende de |
|---|---|---|
| **T-010** | Gerador do indice denso do projeto (mix fabrica.mapa) | T-001 |
| **T-011** | Montador do prefixo estavel, com pontos de cache | T-003, T-009, T-010 |
| **T-012** | Ferramentas de arquivo com confinamento | T-001 |
| **T-013** | Ferramenta de comando, com prazo e morte da ARVORE de processos | T-012 |
| **T-014** | Guarda de processos e guarda de ferramental | T-013 |
| **T-015** | O laco de tool use como processo supervisionado | T-003, T-011, T-012, T-013, T-014 |
| **T-016** | A ferramenta registrar_resultado, e a ausencia da de mudar estado | T-002, T-015 |
| **T-017** | Teto de chamadas de ferramenta por papel | T-015 |
| **T-018** | Operario.ClaudeCLI — o adaptador padrao de operacao | T-003, T-015 |
| **T-019** | Operario.MessagesAPI — Req, com controle de cache | T-003, T-011 |
| **T-020** | MARCO da v0.2: uma tarefa resolvida, e o prefixo escrito uma vez | T-016, T-017, T-018, T-019 |

> **Marco da v0.2:** Um agente resolve uma tarefa real de ponta a ponta; e o prefixo do projeto e escrito UMA vez e lido pelos despachos seguintes, provado por `cache_read_input_tokens`.

---

## v0.3 — A linha de producao

**Entrega:** Uma tarefa percorre os seis estados, reprova, e retrabalhada e conclui — sozinha.

| tarefa | o que faz | depende de |
|---|---|---|
| **T-021** | ABERTURA da v0.3: conferir o plano contra o codigo que existe | T-020 |
| **T-022** | Os seis estados e a transicao transacional | T-002, T-005 |
| **T-023** | Promocao por dependencias e ordenacao da fila | T-022 |
| **T-024** | Equipe sob demanda: especialistas versionados e resolucao do construtor | T-002, T-023 |
| **T-025** | Criterios executaveis: leitura, allowlist e passada mecanica | T-013, T-022 |
| **T-026** | Classe de falha: o comando quebrou, ou a entrega falhou? | T-025 |
| **T-027** | O criterio implicito da suite e a deteccao de ecossistema | T-025 |
| **T-028** | Os dois portoes, e a ausencia da ferramenta de corrigir | T-022, T-025, T-026 |
| **T-029** | Diagnostico de reprovacao: decidir COMO refazer, nao so que refazer | T-026, T-028 |
| **T-030** | A escada de resposta ao fracasso, e o limite de 3 ciclos | T-029 |
| **T-031** | Orcamento com parada limpa: teto por rodada e por tarefa | T-005, T-022 |
| **T-032** | Geracao do markdown a partir do banco, e o commit da tarefa | T-016, T-022 |
| **T-033** | Importador das 89 tarefas vivas da v1 | T-002, T-032 |
| **T-034** | MARCO da v0.3: uma tarefa percorre os seis estados e conclui | T-030, T-031, T-032, T-033 |

> **Marco da v0.3:** Uma tarefa percorre os seis estados, reprova DE PROPOSITO, e retrabalhada e conclui, com tudo registrado em transacao.

---

## v0.4 — A fabrica que aguenta queda

**Entrega:** Tres tarefas ao mesmo tempo; matar uma no meio nao afeta as outras.

| tarefa | o que faz | depende de |
|---|---|---|
| **T-035** | ABERTURA da v0.4: conferir concorrencia e numeros medidos | T-034 |
| **T-036** | Arvore de supervisao e registro de processos | T-015, T-022 |
| **T-037** | Fila duravel: enfileirar e mudar estado na mesma transacao | T-022, T-036 |
| **T-038** | Paralelismo com `areas` como exclusao mutua verificada | T-023, T-037 |
| **T-039** | A parede de cota: reconhecer, dormir e rearmar | T-018, T-037 |
| **T-040** | Recuperacao apos queda: sobras na arvore git e trabalho parcial | T-032, T-036 |
| **T-041** | MARCO da v0.4: tres tarefas em paralelo, e matar uma nao derruba as outras | T-038, T-039, T-040 |

> **Marco da v0.4:** Tres tarefas rodam em paralelo; matar o processo de uma nao afeta as outras duas, e ela volta a fila.

---

## v0.5 — A fabrica que lembra

**Entrega:** O agente comeca a tarefa sabendo o que ja foi decidido, e por que.

| tarefa | o que faz | depende de |
|---|---|---|
| **T-042** | ABERTURA da v0.5: decidir o embedding com medicao, nao com palpite | T-041 |
| **T-043** | Ingestao da historia do projeto ao commitar | T-004, T-032 |
| **T-044** | Busca hibrida com fusao reciproca de postos | T-043 |
| **T-045** | Embedder.Servico e Embedder.Local | T-004 |
| **T-046** | O bloco de contexto recuperado, com a fonte citada | T-044, T-011 |
| **T-047** | Avaliacao da qualidade da recuperacao | T-044 |
| **T-048** | MARCO da v0.5: o agente cita a decisao anterior | T-045, T-046, T-047 |

> **Marco da v0.5:** Num projeto com historico, o agente cita a decisao anterior em vez de decidir de novo.

---

## v1.0 — A fabrica completa

**Entrega:** Um projeto inteiro planejado, construido e entregue sem intervencao, acompanhado na tela.

| tarefa | o que faz | depende de |
|---|---|---|
| **T-049** | ABERTURA da v1.0: o que a tela precisa mostrar, e a medicao final | T-048 |
| **T-050** | Barramento de eventos e telemetria por despacho | T-015, T-036 |
| **T-051** | Painel: quadro de tarefas por estado, ao vivo | T-050 |
| **T-052** | Painel: console ao vivo do agente e custo da rodada | T-050, T-051 |
| **T-053** | Parar e retomar: um botao que encerra um processo supervisionado | T-036, T-051 |
| **T-054** | Piloto automatico: a decisao (funcao pura) | T-031, T-039 |
| **T-055** | Piloto automatico: a mecanica e a tela | T-054 |
| **T-056** | A trilha generica e a escada de prova com rotulo obrigatorio | T-025, T-028 |
| **T-057** | Varredura de segredos antes de publicar | T-032 |
| **T-058** | MARCO da v1.0: um projeto inteiro, sem intervencao | T-052, T-053, T-055, T-056, T-057 |

> **Marco da v1.0:** Um projeto inteiro e planejado, construido e entregue sem intervencao, com o custo acompanhado na tela.

---

## Como rodar uma tarefa

No Claude Code, uma sessao por tarefa (e `/clear` entre elas):

```
Leia _gestao/tarefas/T-0NN-*.md e execute a tarefa inteira,
do codigo ao commit. Rode os criterios de aceite antes de dar por pronta.
```

Uma sessao por tarefa nao e cerimonia: o custo de uma sessao cresce ao quadrado,
porque cada volta rele tudo que veio antes. Duas tarefas na mesma sessao custam
mais que duas sessoes.

