# Estado da arte e delimitação de originalidade

**Escrito em 2026-08-28**, depois de o orientador apontar projetos semelhantes.

Este documento existe para responder, com evidência, três perguntas:

1. O que já existe que se parece com este trabalho?
2. Onde há sobreposição **real** — e ela é grave?
3. O que, especificamente, este trabalho tem que os outros não têm?

**A tese deste documento:** o trabalho **não é plágio**, mas **vários de seus componentes
não são originais** — e a diferença entre honestidade acadêmica e problema é *citar*, não
*ser inédito*. Um TCC não precisa inventar; precisa dizer com precisão o que herdou e o que
acrescentou. É isso que a seção 6 estabelece.

---

## 1. Declaração sobre o processo de elaboração

Registro necessário porque parte do material foi produzido em sessões assistidas por IA:

- O planejamento da v2 (`MIGRACAO_V2.md`, `PLANO_V2.md`, as 58 tarefas) foi derivado de
  **três fontes, todas do próprio repositório**: os documentos `.docx` do autor (escritos
  em 21/08/2026), o código da v1, e os 139 registros de execução em
  `_sistema/v2/linha-de-base/jobs-v1/`.
- **Nenhum dos projetos listados na seção 2 foi consultado** durante a elaboração daquele
  material. A pesquisa que produziu este documento foi feita **depois**, em 28/08, e é a
  primeira consulta externa do projeto.
- O que **não** se pode afirmar: que nenhuma ideia tenha chegado indiretamente. Modelos de
  linguagem são treinados sobre a literatura pública, e várias das ideias abaixo circulam
  desde 2023. Convergência sob as mesmas restrições — Claude Code como substrato, git,
  custo por token — produz formas parecidas. Isso não é plágio; é o estado do campo.

---

## 2. O que existe

### 2.1 O projeto mais próximo: Agentic Software Factory (softwarefabrik.io)

Produto **comercial**, autor **Martin Janda**, versão v0.30.0, copyright 2026.
Ver <https://softwarefabrik.io/en/>.

O que ele é, pelos termos do próprio site:

| aspecto | como funciona |
|---|---|
| posicionamento | "local control plane" para desenvolvimento assistido por IA |
| fluxo | três fases: **assistente (wizard)** → **execução** → **sign-off** |
| entrada | assistente de 6 passos, **18 templates** (6 backends, 11 frontends); gera `PROJECT.md`, `AGENTS.md` e um prompt inicial |
| isolamento | **container Docker efêmero** por execução, com `--read-only`, `--network=none`, 2 CPUs, 4 GB |
| git | toda mudança vira commit |
| portão | **6 papéis revisores** (Segurança, Arquitetura, Alucinação + 2 de fornecedor) |
| decisão | **diff inline antes de CADA aprovação — quem decide é o humano** |
| modelo por papel | modelo de fronteira para o arquiteto, modelo enxuto para o revisor |
| custo | estimativa local em tokens e EUR (biblioteca JTokkit, ecossistema Java) |
| substrato | escreve `.claude/settings.local.json` e `.claude/agents/<papel>.md` |
| qualidade | metas de cobertura 81% / 85% |

**Este é, de longe, o projeto mais parecido**, e a semelhança de vocabulário é real:
"linha de produção estruturada", "portão de qualidade", "disciplina de git", "modelo por
papel". Provavelmente é também o projeto que o orientador citou com os dois nomes
("agentic software factory" é a tagline; "software fabrik" é o domínio).

**A divergência estrutural, e ela é grande:** o produto **rejeita explicitamente a
autonomia** — há sign-off humano com diff inline antes de cada aprovação. Este trabalho vai
na direção oposta: **uma única intervenção humana, no pedido inicial**, e os portões são
operados por agentes. São respostas opostas à mesma pergunta, e a autonomia é o problema
mais difícil dos dois.

### 2.2 A literatura acadêmica (2023)

- **ChatDev** — <https://arxiv.org/html/2307.07924v5>. Agentes com papéis de empresa de
  software (CEO, CTO, programador, testador, revisor), ciclo em cascata (projeto → código →
  teste → documentação), cada fase decomposta em subtarefas conduzidas por **duplas de
  agentes em diálogo**.
- **MetaGPT** — mesma metáfora de empresa de software, com **SOPs** (procedimentos
  operacionais padrão) codificados para orquestrar os papéis.

São a origem acadêmica da ideia de "papéis especializados de agentes para produzir
software". **Qualquer banca que conheça a área vai cobrar a citação destes dois.**

### 2.3 Frameworks de agentes em Elixir/OTP

Isto é o achado mais desconfortável, e precisa ser dito:
**"agente = processo supervisionado" não é uma ideia original deste trabalho.**
É prática estabelecida na comunidade Elixir, com implementações públicas:

- **Cortex** — <https://github.com/itsHabib/cortex> — orquestração multi-agente em
  Elixir/OTP com workflows em DAG e painéis LiveView em tempo real.
- **Sagents** — <https://github.com/sagents-ai/sagents> — agentes com supervisão OTP,
  aprovações com humano no laço, delegação a subagentes e LiveView.
- **SwarmEx**, **Synapse** (com persistência em Postgres), e a receita pública
  `otp-agent-orchestration` (DynamicSupervisor + GenServer por agente + limitador de taxa
  por modelo + registro em ETS + telemetria de custo).

Ou seja: o argumento da Parte IV — BEAM, isolamento, supervisão, LiveView sem segunda pilha
de frontend — **é correto, mas não é inédito**. Apresentá-lo como descoberta seria um erro,
e um erro que um avaliador da área percebe.

### 2.4 O campo em 2026, que está lotado

**Factory.ai** (<https://factory.ai/news/software-factory>) — comercial, "de agentes de
código a fábricas de software". E, no GitHub, entre outros: **The Dark Factory** (pipeline
de agentes nomeados, portões de decisão obrigatórios, revisão adversarial, GitHub como fonte
única), **Galley** (executores e supervisores configurados independentemente, portões
definidos pelo repositório, evidência inspecionável por tentativa), **Prestige**, **Lorg**.

### 2.5 O termo em si

"Software factory" **não é um termo novo nem da era da IA**: vem da literatura de engenharia
de software dos anos 1960–90 (notadamente Cusumano, *Japan's Software Factories*, 1991),
descrevendo linhas de produção de software com processo padronizado e reuso. O trabalho deve
reconhecer a origem do termo em vez de usá-lo como se fosse cunhagem própria.

---

## 3. Onde há sobreposição real

Sem eufemismo. Cada linha abaixo é algo que **este trabalho tem e outros também têm**:

| mecanismo | quem já tem | veredito |
|---|---|---|
| Metáfora da linha de produção; termo "fábrica de software" | Cusumano (1991); softwarefabrik; Factory.ai; Dark Factory | **Não é original.** Citar. |
| Agentes com papéis especializados produzindo software | ChatDev, MetaGPT (2023) | **Não é original.** Citar. |
| Portão de qualidade antes de integrar | softwarefabrik, Galley, Dark Factory | **Não é original.** |
| Modelo mais forte para uns papéis, mais barato para outros | softwarefabrik faz exatamente isso | **Não é original.** |
| Um commit por unidade de trabalho | softwarefabrik, Dark Factory | **Não é original.** |
| Estimativa de custo por execução | softwarefabrik (JTokkit, EUR) | **Não é original.** |
| Agente = processo supervisionado (OTP) | Cortex, Sagents, SwarmEx, Synapse | **Não é original.** Citar. |
| Painel LiveView acompanhando agentes | Cortex, Sagents | **Não é original.** |
| Dirigir o Claude Code por `.claude/agents/<papel>.md` | softwarefabrik | **Não é original.** Convergência de substrato. |
| Fila durável com persistência em Postgres | Synapse | **Não é original.** |

**São dez itens.** Um trabalho que apresentasse os dez como contribuição própria estaria em
apuros — não por plágio, mas por falta de revisão da literatura.

---

## 4. O que efetivamente distingue este trabalho

Também sem eufemismo: a lista é mais curta do que a de cima, e é o que importa.

### 4.1 A postura de autonomia é a oposta do concorrente mais próximo

softwarefabrik coloca o humano no portão, com diff inline antes de cada aprovação, e
**rejeita explicitamente** a geração autônoma. Aqui, a intervenção humana obrigatória é
**uma só — o pedido inicial** — e os portões são agentes. É a resposta oposta à mesma
pergunta, e é o problema mais difícil dos dois. Toda a maquinaria de limite de ciclos,
escada de fracasso e replanejamento existe **porque** não há humano no laço.

### 4.2 Dois portões que fazem perguntas DIFERENTES

Não são dois níveis de zelo. O verificador pergunta *"funciona?"* e executa os critérios;
o revisor pergunta *"é o que foi pedido?"* (conformidade) e *"está correto?"* (defeitos).

O ponto não-óbvio, e que não encontrei articulado em nenhum dos projetos pesquisados:
**uma entrega pode passar em todos os critérios, não ter defeito nenhum, e ainda assim não
ser a tarefa** — quando o critério foi mal escrito. Reprovar por não-conformidade não exige
achar bug nenhum.

### 4.3 Autoridade como ausência de ferramenta, não como instrução

"Quem revisa não corrige" é regra em vários projetos. Aqui **o revisor não recebe a
ferramenta de escrever** — a regra deixa de ser interpretável e vira impossibilidade. É a
tese do trabalho aplicada a si mesma, e é verificável por um teste negativo que varre o
catálogo de ferramentas de cada papel.

### 4.4 A escada de resposta ao fracasso, com gatilho medido

Quatro degraus, cada um disparado por **fato registrado**, não por palpite:
1ª reprovação → sobe de modelo; 2ª sob o mesmo especialista → **troca de especialista**;
3 ciclos → **replanejamento** (o planejador quebra a tarefa em 2–3 menores, a original é
cancelada com referência); de novo → bloqueia.

O terceiro degrau é o incomum: reconhecer que o problema pode ser de **dimensionamento da
tarefa**, não de execução — e agir sobre isso automaticamente.

### 4.5 Equipe sintetizada por projeto

ChatDev/MetaGPT têm elenco fixo (CEO, CTO, programador…). softwarefabrik tem 18 templates.
Aqui o planejador **sintetiza 2 a 5 especialistas a partir do próprio pedido**, e cada
tarefa nasce apontando para o da área que toca. E há a renúncia deliberada: duas reprovações
sob o mesmo especialista **abandonam a especialização**, porque ela foi escolhida antes de
se saber onde a tarefa iria falhar.

### 4.6 A trilha não-software com escada de prova

**É a parte mais original do trabalho, e não encontrei nada equivalente.** O eixo não é
"é código?", e sim **como se prova que ficou pronto**. Todo critério fica em um de três
degraus — `executado` > `inspecionado` > `julgado` — e o verificador é **obrigado a rotular**
qual usou. A proporção de `julgados` fica visível por projeto: quando ela sobe, o sistema
está rodando com um portão e meio, e isso vira sinal de replanejamento.

Mais duas peças que sustentam isso: **a primeira tarefa instala o verificador**, antes de
qualquer parte do artefato; e **a fonte é texto versionado, o binário é gerado** — commitar
o binário como fonte apagaria o portão da revisão.

### 4.7 A metodologia: medir a própria produção e reprojetar a partir disso

**Esta é a contribuição de pesquisa de fato, e é a que nenhum outro projeto pode ter,
porque depende de dados que só existem aqui.** A v1 rodou seis semanas em uso real, e a v2
é reprojetada a partir do que foi medido:

- 139 execuções gravadas, com contabilidade por volta;
- decomposição de custo: **93,14% dos tokens de entrada são leitura de cache**, e a
  **escrita, com 6,66% dos tokens, carrega ~50% da conta** — número que redirecionou o
  desenho inteiro;
- a constatação de que **78% da fatura** estava em sessões do orquestrador fazendo trabalho
  de máquina de estados — o que motivou substituí-lo por código;
- e a lição metodológica: *o alvo bem instrumentado tende a ser o que já se conhece, não o
  que mais custa.*

Nenhum dos projetos pesquisados publica esse tipo de medição da própria operação.

### 4.8 `areas` como exclusão mútua verificada, em UMA árvore de trabalho

softwarefabrik isola por container Docker. Aqui o paralelismo acontece na mesma árvore, e a
exclusão é por **arquivos declarados na tarefa**, verificada pelo motor antes de despachar —
mais barata, e com um achado honesto registrado: a regra **foi furada** quando existia
apenas como declaração, o que motivou verificá-la também na ferramenta de escrita.

---

## 5. A evidência documental

É isto que separa convergência de cópia, e é verificável por qualquer um:

| fato | verificação |
|---|---|
| **205 commits** entre **18/07/2026** e **28/08/2026** | `git log` |
| Conceitos aparecem **em sequência**, não prontos: `tentativas` e `replanejamento` no 1º dia (18/07); `portao` em 29/07; `dois portões` e `conformidade` em 31/07; `trilha genérica` em 01/08; `escada de prova` em 21/08 | `git log -S"<termo>"` |
| **139 execuções reais gravadas**, com tokens, custo, modelo e desfecho | `_sistema/v2/linha-de-base/jobs-v1/` |
| Incidentes datados com valor: 4 ciclos e US$ 12,90 na T-030; 41 despachos e US$ 22,55 numa rodada; US$ 2,13 de trabalho perdido | `DECISOES_FECHADAS.md`, `CLAUDE.md`, logs diários |
| Decisões com o motivo e o que as provocou | `_sistema/DECISOES_FECHADAS.md` |

**Um projeto copiado não tem essa forma.** Um design transcrito aparece pronto; este aparece
por acúmulo, com os conceitos surgindo *depois* dos incidentes que os motivaram — a
`escada de prova` surge em 21/08, seis semanas depois do início, quando a trilha não-software
já existia e o problema do "portão e meio" tinha aparecido na prática.

---

## 6. O que fazer — e é isto que resolve o risco

**Plágio é sobre atribuição, não sobre ineditismo.** O risco não é que esses projetos
existam; é apresentar as ideias deles como se fossem invenção própria. Três ações:

1. **Escrever a seção "Trabalhos Relacionados"**, citando no mínimo: ChatDev e MetaGPT
   (papéis especializados), softwarefabrik.io e Factory.ai (fábrica agêntica comercial),
   os frameworks Elixir/OTP (Cortex, Sagents, SwarmEx, Synapse) para "agente = processo
   supervisionado", e Cusumano (1991) para o termo. **Cite antes de ser perguntado.**

2. **Reescrever as afirmações de contribuição** para o escopo real. Não é
   *"construí uma fábrica de software multi-agente"* — isso existe. É:
   *"operei uma por seis semanas, medi onde ela falha e quanto custa, e reprojetei a partir
   dessa medição, movendo a governança do prompt para a estrutura"*, mais os mecanismos
   específicos da seção 4.

3. **Comparar explicitamente com o vizinho mais próximo.** Uma tabela contra
   softwarefabrik.io — autonomia vs. sign-off humano, `areas` vs. container, equipe
   sintetizada vs. 18 templates, escada de prova vs. inexistente — é a melhor defesa que
   existe, porque demonstra que o trabalho **conhece** o vizinho e escolheu diferente,
   com motivo.

> **Um alerta de redação.** O vocabulário do trabalho ("linha de produção", "portão de
> qualidade", "disciplina de git", "modelo por papel") é quase o mesmo do material de
> divulgação da softwarefabrik. Isso é convergência natural — mas revise o texto para que
> nenhum trecho *pareça* transcrito. Onde a frase for parecida, cite; onde a ideia for sua,
> mostre o mecanismo que o outro não tem.

---

## 7. Veredito

**Não é plágio, e a evidência documental sustenta isso.** O trabalho tem seis semanas de
histórico incremental, telemetria própria e decisões datadas com o motivo — nada disso é
fabricável a posteriori.

**Mas o trabalho não é inédito no gênero, e não deve se apresentar como se fosse.** Dez dos
seus mecanismos existem em outros projetos, e um deles (agente = processo supervisionado em
OTP) é prática corrente na comunidade Elixir.

**A contribuição real e defensável** é a da seção 4.7 — medir a própria operação e reprojetar
a partir disso — sustentada pelos mecanismos 4.1 a 4.6 e 4.8, dos quais **a trilha
não-software com escada de prova (4.6) é o mais provavelmente original**.

Um TCC que declara isso com precisão é mais forte que um que reivindica ineditismo total —
e é imune à pergunta que o orientador acabou de fazer.

---

## Fontes consultadas em 2026-08-28

- <https://softwarefabrik.io/en/> — Agentic Software Factory (Martin Janda), v0.30.0
- <https://arxiv.org/html/2307.07924v5> — ChatDev: Communicative Agents for Software Development
- <https://factory.ai/news/software-factory> — Factory 2.0: from coding agents to software factories
- <https://github.com/itsHabib/cortex> — Cortex, orquestração multi-agente em Elixir/OTP
- <https://github.com/sagents-ai/sagents> — Sagents, agentes com supervisão OTP e LiveView
- <https://www.truefoundry.com/blog/software-factory-agentic-enterprise-guide> — panorama do termo
- <https://github.com/topics/software-factory> — projetos correlatos no GitHub
