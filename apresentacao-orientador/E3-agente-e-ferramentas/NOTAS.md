# E3 — O agente e as ferramentas

**Plano:** 04/10 – 18/10/2026 · fase Desenvolvimento · no repositório: versão `v0.2`
**Entrega combinada no plano:** Um agente resolve uma tarefa real com o custo gravado, e trocar de fornecedor não mexe no núcleo.
**Situação hoje (07/10/2026 11:22):** Concluída — entrega aprovada (etapa atual do calendário)

> Arquivo gerado por `_gerador/gerar.py` a partir do repositório real. Não edite à mão:
> edite `_gerador/conteudo.py` (texto) e rode o gerador de novo.

## O que tem nesta pasta

| item | o que é |
|---|---|
| `slides.html` | a apresentação desta etapa (abra no navegador; ← → navega) |
| `NOTAS.md` | este arquivo: o que está feito, o que falta e a próxima rodada |
| `dados.json` | os números desta etapa, extraídos do repositório |
| `tarefas/` | cópia dos arquivos de tarefa desta etapa (objetivo, critérios, verificação, revisão) |
| `arquivos/` | os 36 arquivos de código/teste desta etapa, no estado do commit `172e15f` |
| `evidencia-marco.txt` | saída real do teste do marco, rodado nesta máquina na geração |

## O combinado × o feito

| pacote | o que é | tarefas | situação |
|---|---|---|---|
| 3.1 Ferramentas | arquivo e comando (com prazo e morte da árvore de processos), resumo do projeto, registrar resultado | T-010, T-011, T-012, T-013, T-013a, T-013b, T-016 | T-010 concluída; T-011 concluída; T-012 concluída; T-013 concluída; T-013a concluída; T-013b concluída; T-016 concluída |
| 3.2 Confinamento | a ferramenta recusa caminho fora do projeto; o shell do agente roda em sandbox | T-012a, T-014, T-079, T-080, T-081, T-082, T-083, T-090, T-099 | T-012a concluída; T-014 concluída; T-079 concluída; T-080 concluída; T-081 concluída; T-082 concluída; T-083 concluída; T-090 concluída; T-099 concluída |
| 3.3 Agente supervisionado | o agente como processo supervisionado, com teto de chamadas por papel | T-015, T-017, T-017a, T-017b, T-020a | T-015 concluída; T-017 concluída; T-017a concluída; T-017b concluída; T-020a concluída |
| 3.4 Adaptadores | dois fornecedores atrás da mesma fronteira, com o controle de cada um MEDIDO antes | T-003a, T-018, T-018a, T-018b, T-018c, T-018d, T-018e, T-019 | T-003a concluída; T-018 concluída; T-018a concluída; T-018b concluída; T-018c concluída; T-018d concluída; T-018e concluída; T-019 concluída |
| Entrega Marco da etapa | agente real resolve tarefa real, custo por volta gravado | T-020, T-020b, T-100 | T-020 concluída; T-020b concluída; T-100 pronta |
| Adiado Marco 2 (cache) | medir o cache com a API por token — depende de chave de acesso | T-020c | T-020c backlog |

## Números (do repositório)

- tarefas: **31/33 concluídas**; aprovadas de primeira: 25; execuções por tarefa (média): 1.19
- commits das tarefas: 82 · testes nos arquivos da etapa: 413 · linhas em `lib/`: 4149
- custo medido nas rodadas do painel: US$ 72,31 em 46 despachos (dólar-equivalente de cota; tarefas feitas no chat não entram)

## Tarefas

| tarefa | título | status | execuções | concluída em | custo medido |
|---|---|---|---|---|---|
| T-010 | Gerador do indice denso do projeto (mix fabrica.mapa) | concluída | 1 | 2026-08-28 | — |
| T-011 | Montador do prefixo estavel, com pontos de cache | concluída | 1 | 2026-08-28 | — |
| T-012 | Ferramentas de arquivo com confinamento | concluída | 1 | 2026-08-28 | — |
| T-013 | Ferramenta de comando, com prazo e morte da ARVORE de processos | concluída | 1 | 2026-08-28 | — |
| T-013a | O Comando sabe alimentar stdin a partir de um arquivo, sem interpolar nada | concluída | 1 | 2026-09-03 | US$ 5,67 |
| T-013b | A saida do comando some quando o exit_status chega antes do ultimo dado | concluída | 1 | 2026-09-09 | US$ 4,39 |
| T-016 | A ferramenta registrar_resultado, e a ausencia da de mudar estado | concluída | 1 | 2026-08-28 | — |
| T-012a | O confinamento do agente completo e PROVADO, e nao presumido | concluída | 1 | 2026-09-03 | US$ 6,75 |
| T-014 | Guarda de processos e guarda de ferramental | concluída | 1 | 2026-08-28 | — |
| T-079 | Portabilidade Linux (A): `Comando` roda o script temporário sem depender do bit de execução | concluída | 1 | 2026-10-01 | — |
| T-080 | Portabilidade Linux (B): `Confinamento.real/1` preserva a raiz `/` — arquivo novo em diretório novo deixa de ser julgado fora | concluída | 1 | 2026-10-01 | — |
| T-081 | Portabilidade Linux (C): barra invertida é separador em toda plataforma; caixa segue o SO — e os testes dizem isso | concluída | 1 | 2026-10-01 | — |
| T-082 | Confinamento: destino RELATIVO de link é resolvido contra o diretório REAL, não contra o texto | concluída | 1 | 2026-10-02 | — |
| T-083 | Confinamento: UNC com barras MISTAS (`\\/servidor`, `/\\servidor`) é recusado antes de qualquer acesso ao disco | concluída | 1 | 2026-10-02 | — |
| T-090 | O Bash do agente real roda CONFINADO — sandbox do próprio `claude` no despacho, e sem sandbox o agente não sobe | concluída | 2 | 2026-10-02 | — |
| T-099 | Windows: os dois testes de link do confinamento caem na máquina de origem — diagnosticar (fuga real ou teste frágil) e consertar | concluída | 2 | 2026-10-07 | US$ 5,24 |
| T-015 | O laco de tool use como processo supervisionado | concluída | 1 | 2026-08-28 | — |
| T-017 | Teto de chamadas de ferramenta por papel | concluída | 1 | 2026-08-28 | — |
| T-017a | O teto de voltas do agente completo e imposto pelo CLI, e nao pedido no prompt | concluída | 1 | 2026-09-03 | US$ 4,96 |
| T-017b | O orcamento de ferramentas conta as chamadas que o agente completo fez | concluída | 1 | 2026-09-25 | US$ 3,77 |
| T-020a | O Laco nao repassa a raiz do projeto ao operario | concluída | 1 | 2026-08-31 | — |
| T-003a | A fronteira do operario declara a FAMILIA, e o laco para de executar ferramenta que nao e dele | concluída | 1 | 2026-09-03 | US$ 4,13 |
| T-018 | Operario.ClaudeCLI — o adaptador padrao de operacao | concluída | 1 | 2026-08-28 | — |
| T-018a | O ClaudeCLI nunca foi exercitado contra o CLI real | concluída | 1 | 2026-08-31 | — |
| T-018b | Medir a superficie de governanca do `claude --print` real | concluída | 2 | 2026-09-02 | — |
| T-018c | O ClaudeCLI opera em modo headless governado — permissao e vocabulario por papel | concluída | 1 | 2026-09-03 | US$ 5,77 |
| T-018d | O prompt do ClaudeCLI sai da linha de comando | concluída | 2 | 2026-09-03 | US$ 11,45 |
| T-018e | O motivo de parada do ClaudeCLI sai do evento terminal, e nao do stream inteiro | concluída | 2 | 2026-09-03 | US$ 6,46 |
| T-019 | Operario.MessagesAPI — Req, com controle de cache | concluída | 1 | 2026-08-28 | — |
| T-020 | MARCO da v0.2: uma tarefa resolvida, e o prefixo escrito uma vez | concluída | 1 | 2026-09-26 | US$ 3,67 |
| T-020b | O probe do marco 1 roda verde de ponta a ponta, com prompt de tarefa real | concluída | 2 | 2026-09-26 | US$ 10,05 |
| T-100 | O probe do marco da v0.2 volta a rodar no Windows: a tarefa do probe não precisa de shell, então o agente sobe sem Bash | pronta | 1 | — | — |
| T-020c | MARCO 2 da v0.2, adiado para o fim: o prefixo escrito uma vez, medido com a Messages API | backlog | 1 | — | — |

## Requisitos desta etapa

| req | requisito | situação | como se prova |
|---|---|---|---|
| R11 | Nenhum agente escreve fora da pasta do projeto | ok | Confinamento recusa absoluto, `..`, link, UNC e dispositivo; fuzz de 7.500 consultas no Linux: 0 fugas. No Windows: fuga por ciclo de junções achada e fechada em 07/10 (T-099) |
| R15 | Trocar o fornecedor do modelo sem mexer no núcleo | ok | dois adaptadores (`ClaudeCLI`, `MessagesAPI`) atrás de `Fabrica.Operario`; núcleo intocado |

## Destaques (o que vale contar)

- Agente real resolveu tarefa real: o probe rodou 2× seguidas com PROBE OK — 27.149 e 27.183 tokens, e a soma no banco bate com a soma do laço.
- Trocar de fornecedor não mexe no núcleo: dois adaptadores atrás da mesma fronteira.
- Medido antes de decidir (risco previsto no plano): o CLI do fornecedor é um agente completo, não só um modelo — virou um desenho novo, a 'família do operário'.
- O marco reprovou 3 vezes antes de aprovar, cada vez por um defeito real — um deles com 26 testes verdes: o processo de verificação funcionou.
- Confinamento endurecido depois da portabilidade para Linux: link relativo, UNC com barras mistas e o shell do agente em sandbox.
- 07/10: a primeira bateria no Windows achou uma fuga REAL — um ciclo de junções era aceito como pasta dentro do projeto. A fábrica diagnosticou, corrigiu e provou com mutação no mesmo dia (T-099).

## O que está feito / o que falta

**Pendente nesta etapa:**

- A demonstração do marco NÃO roda hoje nesta máquina: rodada em 07/10, o agente recusou subir porque o shell exige sandbox e o Windows não o oferece (fail-closed, nada gasto — a governança funcionando). Corretiva T-100 na fila: o agente do probe sobe sem shell, que a tarefa dele não precisa.
- Marco 2 (cache medido com a API por token) adiado por decisão: não há chave de acesso nesta máquina (fica para depois do marco final).

**Próxima rodada:**

- Fechar a T-100 antes de 18/10, para a demonstração rodar ao vivo no Windows.
- Apresentação do fim da E3 (18/10): demonstrar o agente resolvendo uma tarefa real, com o custo gravado.
- Marco 2 só quando houver chave de acesso à API por token.

## Como demonstrar ao vivo

Na pasta `projetos/fabrica-v2`, com o Postgres de pé:

```
mix run priv/probes/marco_v02_agente.exs   # consome ~27 mil tokens da cota
```
