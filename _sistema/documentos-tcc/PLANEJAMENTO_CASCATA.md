# Planejamento do desenvolvimento em cascata — Fábrica de Software Multi-Agente (v2)

**Documento de apresentação ao orientador.** Escrito em 2026-09-07.

Descreve o desenvolvimento da v2 organizado no **modelo cascata (waterfall)**, em
**13 etapas de 15 dias** — 195 dias corridos, de **13/04/2026 a 24/10/2026**.

> **Leia junto:** `_sistema/PLANO_V2.md` (o plano técnico por versões, escrito antes da
> primeira linha de código), `_sistema/v2/ROTEIRO.md` (as 58 tarefas em ordem, com
> dependências) e `MAPEAMENTO_COMMITS.md` (ao lado — qual commit pertence a qual etapa).

---

## 1. O que o sistema é, em um parágrafo

Uma fábrica de software multi-agente: recebe a descrição de um projeto em linguagem natural
e o constrói de ponta a ponta — agentes que planejam, implementam, verificam, revisam e
documentam. A intervenção humana obrigatória acontece **uma vez só, no pedido**.

**A tese que o trabalho defende:** *um sistema multi-agente não falha por escrever mal —
falha por governar mal.* Governança escrita em prosa imperativa dentro de um prompt é
governança **opcional**, porque quem a lê é um modelo probabilístico. A v2 move para o
compilador, para a árvore de supervisão e para o esquema do banco tudo o que na versão
anterior era frase dirigida a um modelo. **A v2 não precisa ser mais esperta que a v1;
precisa ser mais difícil de operar errado.**

Implementação em **Elixir/OTP**, com Phoenix/LiveView (painel), PostgreSQL/Ecto (estado
transacional), Oban (fila durável) e pgvector (memória semântica).

---

## 2. Por que cascata, e por que isso é defensável aqui

O modelo cascata exige que cada fase termine e seja **congelada** antes da seguinte começar.
É um modelo criticado justamente onde os requisitos são voláteis. Neste trabalho ele se
sustenta, e por um motivo verificável no repositório:

| exigência do modelo | como o projeto a satisfaz | evidência |
|---|---|---|
| Requisitos congelados antes do projeto | requisitos funcionais e não funcionais fixados na Etapa 1 | documento de arquitetura, Partes I–II |
| Projeto congelado antes da codificação | arquitetura decidida e **decisões registradas com o motivo**, sem reabertura | `DECISOES_FECHADAS.md` |
| Codificação segue o projeto, sem improviso | **58 tarefas atômicas escritas antes da primeira linha de código**, com critérios de aceite executáveis | `_gestao/tarefas/`, geradas por script determinístico |
| Rastreabilidade requisito → código → teste | cada tarefa cita o requisito, o arquivo e o comando que a prova | campo `verificar:` de cada tarefa |
| Verificação formal por fase | cada versão termina num **marco** com enunciado escrito antes, aprovado ou reprovado | linhas `Marco:` do plano |

**O ponto honesto, e que deve ser apresentado como achado, não escondido:** houve **um
retorno documentado a uma fase anterior** (Etapa 8, § 4.8). O próprio Royce, ao formular a
cascata em 1970, previu realimentação entre fases adjacentes; o que o modelo proíbe é o
retorno *não controlado*. Aqui o retorno foi medido por instrumento, teve três causas raiz
nomeadas, quatro desenhos alternativos avaliados por custo, uma decisão registrada e dez
tarefas corretivas planejadas — antes de uma linha de correção ser escrita. É cascata com
realimentação controlada, e é isso que a Etapa 8 demonstra.

---

## 3. Visão geral das 13 etapas

| Etapa | Fase da cascata | Entrega da etapa | Janela (15 dias) |
|---|---|---|---|
| **E01** | Requisitos | Levantamento de requisitos e viabilidade | 13/04 – 27/04 |
| **E02** | Requisitos | Análise do protótipo, estado da arte e linha de base | 28/04 – 12/05 |
| **E03** | Projeto | Projeto arquitetural | 13/05 – 27/05 |
| **E04** | Projeto | Projeto detalhado, ambiente e plano de construção | 28/05 – 11/06 |
| **E05** | Implementação | I — a fundação que se prova sozinha (v0.1) | 12/06 – 26/06 |
| **E06** | Implementação | II — o operário, as ferramentas e o prefixo (v0.2) | 27/06 – 11/07 |
| **E07** | Implementação | III — a linha de produção (v0.3) | 12/07 – 26/07 |
| **E08** | Verificação | Integração da v0.2, medição e replanejamento | 27/07 – 10/08 |
| **E09** | Implementação | IV — governança do agente completo | 11/08 – 25/08 |
| **E10** | Implementação | V — concorrência, orçamento e telemetria (v0.4) | 26/08 – 09/09 |
| **E11** | Implementação | VI — a fábrica que lembra (v0.5) | 10/09 – 24/09 |
| **E12** | Implementação | VII — a fábrica completa (v1.0) | 25/09 – 09/10 |
| **E13** | Testes e entrega | Teste de sistema, medição final e entrega | 10/10 – 24/10 |

**Situação em 07/09/2026:** as etapas **E01 a E10 estão executadas** (92 commits, 42 de 71
tarefas concluídas, ~20 mil linhas entre código e testes). E11, E12 e E13 são o que resta.

---

## 4. As etapas, uma a uma

Cada etapa traz: **objetivo**, **atividades**, **entregáveis** e **critério de saída** (o
*gate* — o que precisa estar verdadeiro para a etapa seguinte começar).

---

### E01 — Levantamento de requisitos e viabilidade
**Dias 1–15 · 13/04 a 27/04 · Fase: Requisitos**

**Objetivo.** Fixar o problema e o critério de sucesso antes de qualquer decisão técnica.

**Atividades.**
- Caracterização do problema: sistemas multi-agente existentes produzem código, mas não
  governam a própria execução — não há quem imponha limite de retrabalho, teto de custo,
  confinamento de escrita ou prova de que a entrega é a que foi pedida.
- Elicitação dos requisitos funcionais e não funcionais.
- Estudo de viabilidade técnica e de custo (o sistema consome cota de modelo de linguagem;
  o orçamento é um requisito, não um detalhe operacional).

**Requisitos que dirigem toda a arquitetura** (os demais estão no documento de requisitos):

| id | requisito | tipo |
|---|---|---|
| RF-01 | Um pedido em linguagem natural produz especificação, plano e tarefas decompostas | funcional |
| RF-02 | Cada tarefa percorre seis estados, com dois portões independentes: *funciona?* e *é o que foi pedido?* | funcional |
| RF-03 | Reprovação gera retrabalho com política derivada da causa, e o retrabalho tem limite | funcional |
| RNF-01 | Roda em **8 GB de RAM e 4 núcleos**; confortável em 16 GB | restrição de arquitetura |
| RNF-02 | Custo contabilizado em **duas unidades**: cota consumida e dólar-equivalente | mensurabilidade |
| RNF-03 | **Confinamento**: nenhum agente escreve fora da raiz do projeto — imposto, não pedido | segurança |
| RNF-04 | A suíte de testes roda **sem rede, sem cota e sem chave de API** | testabilidade |

> RNF-01 não é preferência: ela elimina do desenho qualquer dependência de máquina forte, e
> é ela que transforma o modelo de *embedding* em adaptador plugável (E11).

**Entregáveis.** Documento de requisitos; matriz RF/RNF; parecer de viabilidade.

**Gate.** Requisitos revisados com o orientador e **congelados** (linha de base de
requisitos). Nenhum requisito novo entra depois deste ponto sem controle de mudança.

---

### E02 — Análise do protótipo, estado da arte e linha de base
**Dias 16–30 · 28/04 a 12/05 · Fase: Requisitos / Análise**

**Objetivo.** Medir o que já existe antes de projetar o que virá.

Uma versão anterior do sistema (**v1**, em Node/TypeScript, governada por prompts) foi
construída e operada de verdade. Ela é tratada neste trabalho como **protótipo de
viabilidade**: valida que o desenho funciona e fornece os números contra os quais a v2 será
comparada.

**Atividades.**
- Auditoria de **139 execuções reais** da v1: custo por despacho, número de ciclos por
  tarefa, taxa de reprovação, onde o dinheiro efetivamente foi.
- Catalogação de **19 mecanismos implementados na v1 e ausentes da documentação** — entre
  eles o diagnóstico de reprovação, a parede de cota da assinatura e a recuperação de
  trabalho parcial pela árvore git. Sem esse levantamento, a v2 nasceria com arquitetura
  melhor e operação mais frágil que o protótipo.
- **Estado da arte:** comparação com AutoGPT, CrewAI, AutoGen, LangGraph e agentes de
  engenharia de software (SWE-agent, Devin), e delimitação explícita do que é original
  neste trabalho.
- Extração da **linha de base de medição**.

**Achado que orienta todo o projeto.** A v1 falha de forma sistemática, e não por escrever
código ruim: falha porque suas regras de governança são frases dentro de prompts, e um
modelo pode ignorá-las sem que nada acuse. Daí a tese enunciada em § 1.

**Entregáveis.** `MIGRACAO_V2.md` (análise do protótipo); `ESTADO_DA_ARTE.md`; conjunto de
dados da linha de base.

**Gate.** Linha de base extraída e congelada. **É o gate mais importante do trabalho
inteiro:** sem número anterior, a conclusão do TCC seria uma afirmação; com ele, é um
resultado comparável.

---

### E03 — Projeto arquitetural
**Dias 31–45 · 13/05 a 27/05 · Fase: Projeto**

**Objetivo.** Escolher a plataforma e desenhar a arquitetura que torna a governança
**estrutural** — isto é, imposta pelo compilador, pelo runtime e pelo banco.

**Decisão de plataforma.** O gargalo do sistema não é cálculo, é **espera**: dezenas de
trabalhos lentos e falíveis em voo ao mesmo tempo, que precisam ser cortados com segurança e
sobreviver a falhas. O mapeamento decisivo é **agente = processo supervisionado**: tem
identificador, tem dono, tem quem o mate e quem perceba que ele morreu.

| papel | escolha | justificativa |
|---|---|---|
| Linguagem / runtime | **Elixir sobre a BEAM (OTP)** | processos isolados, supervisão, concorrência de espera |
| Painel | Phoenix + LiveView | tela ao vivo sem uma segunda stack de frontend |
| Persistência | PostgreSQL + Ecto | transação real nas transições de estado |
| Fila | Oban | enfileirar e mudar estado **na mesma transação** |
| Memória semântica | pgvector | busca vetorial no mesmo banco do estado |

Alternativas descartadas (Python/Celery, Node, Go) foram registradas com o motivo.

**Honestidade metodológica registrada no documento**, e que deve ser dita à banca: Elixir
**não barateia o modelo** — o preço por token é do provedor; e o ecossistema de IA em Elixir
é menor que o de Python. Mitigação: a parte pesada é espera de rede, e a única etapa
numérica (*embeddings*) tem biblioteca madura ou pode ser delegada a um serviço.

**Desenho lógico produzido nesta etapa.**
- Fronteira `Fabrica.Operario` (*behaviour*) separando **governança** de **fornecedor de
  modelo** — é o que permite trocar de provedor sem tocar o miolo.
- `Fabrica.Embedder` como adaptador, pelo mesmo motivo e por causa do RNF-01.
- Máquina de **seis estados** por tarefa, com transição transacional.
- **Dois portões independentes**: o verificador responde *funciona?*, executando os
  critérios; o revisor responde *é o que foi pedido?* — e o revisor **não recebe a
  ferramenta de corrigir**, para que não possa aprovar o próprio conserto.
- **Escada de resposta ao fracasso**: sobe o modelo → troca o especialista → replaneja →
  bloqueia. Limite de 3 ciclos.

**Entregáveis.** Documento de arquitetura (8 partes, 21 figuras, versões em português e
inglês); `DECISOES_FECHADAS.md`.

**Gate.** Arquitetura revisada com o orientador e **congelada**. Decisões fechadas não se
reabrem sem fato novo — e "fato novo" tem definição escrita.

---

### E04 — Projeto detalhado, ambiente e plano de construção
**Dias 46–60 · 28/05 a 11/06 · Fase: Projeto**

**Objetivo.** Transformar a arquitetura em um plano executável tarefa a tarefa, **antes da
primeira linha de código**.

**Atividades.**
- **Decomposição em 6 versões incrementais**, cada uma *usável* — não "porcentagem de
  conclusão": v0.1 (fundação), v0.2 (um agente faz uma tarefa), v0.3 (a linha de produção),
  v0.4 (aguenta queda), v0.5 (memória), v1.0 (completa).
- **Decomposição em 58 tarefas atômicas**, cada uma com objetivo, contexto de execução,
  dependências declaradas e **critérios de aceite executáveis** (um comando que passa ou
  falha, não uma frase de opinião).
- As tarefas e o roteiro saem do **mesmo gerador determinístico**, de modo que não possam
  divergir; e o gerador **nunca sobrescreve tarefa já executada**, porque estado não se
  regenera.
- **Montagem e prova do ambiente**: Elixir 1.19/OTP 28, PostgreSQL 18, pgvector compilado
  com MSVC. Seis armadilhas de instalação documentadas com a solução, para que o ambiente
  seja reproduzível em outra máquina.

**Regra de projeto que nasce aqui, e que a banca deve ver.** Tarefa escrita com meses de
antecedência **envelhece**: as últimas serão executadas sobre um código que já tomou decisões
que o planejamento não podia prever. Por isso cada versão a partir da v0.3 abre com uma
**tarefa de abertura** que não escreve código de produção nenhum — ela reconfere o plano
contra o código que existe, e registra o que foi ajustado e por quê. *"Conferido, nada
divergiu"* também é registro válido. É o mecanismo de controle de mudança da cascata,
aplicado dentro da fase de implementação.

**Entregáveis.** `PLANO_V2.md`; `ROTEIRO.md` (58 tarefas em ordem, com o grafo de
dependências); 58 arquivos de tarefa; `AMBIENTE_V2.md`.

**Gate.** Ambiente provado (o verificador do banco responde *"pgvector operante"*) e as 58
tarefas revisadas. **Fim da fase de projeto** — a codificação começa.

---

### E05 — Implementação I: a fundação que se prova sozinha (v0.1)
**Dias 61–75 · 12/06 a 26/06 · Fase: Implementação** · 9 commits · T-001 a T-009

**Objetivo.** Um projeto que compila, testa e sobe o banco — **sem tocar a rede e sem gastar
cota**.

**Entregas.**
- *Scaffold* Phoenix com a barra de qualidade instalada desde o commit inicial: formatação
  verificada, `compile --warnings-as-errors`, Credo em modo estrito, ExUnit, e Dialyzer
  (checagem estática de tipos) em estágio próprio.
- **Esquema do banco**: projetos, tarefas, ciclos, despachos e custos — o estado do sistema
  passa a viver em tabelas, não em arquivos soltos.
- `behaviour Fabrica.Operario` + `Operario.Falso`; `behaviour Fabrica.Embedder` +
  `Embedder.Falso`. Os adaptadores falsos são determinísticos e é com eles que a suíte roda
  **para sempre**.
- **Contabilidade em duas unidades** (RNF-02): cota consumida *e* dólar-equivalente. O
  protótipo só tinha a segunda.
- Backup e restauração do banco.
- Importação da **linha de base** extraída na E02.

**Gate — Marco da v0.1.** `mix verificar` roda a suíte inteira **sem rede, sem cota e sem
chave de API**, provado por um teste que **falha** se `ANTHROPIC_API_KEY` estiver definida
durante a execução. **Aprovado.**

> É a etapa que dá vontade de pular, e é a que sustenta as outras cinco: sem ela, toda
> verificação posterior custaria dinheiro e seria não determinística.

---

### E06 — Implementação II: o operário, as ferramentas e o prefixo (v0.2)
**Dias 76–90 · 27/06 a 11/07 · Fase: Implementação** · 10 commits · T-010 a T-019

**Objetivo.** Despachar **um** agente contra **uma** tarefa real, com o custo discriminado.

**Entregas.**
- **Gerador do índice denso** (`mix fabrica.mapa`): árvore do projeto + assinatura e
  propósito de cada símbolo público, determinístico, sem modelo, ocupando ~5% do tamanho do
  fonte. É por ele que o agente se orienta em vez de varrer o código — a medida que mais
  reduz o contexto por despacho.
- **Montador do prefixo estável**, com pontos de cache marcados: doutrina + índice +
  ferramentas, byte a byte idêntico entre despachos, para que o provedor possa reaproveitá-lo.
- **Ferramentas com confinamento** (RNF-03): ler, escrever, editar, buscar — o confinamento
  é *implementação da ferramenta*, não validação de string no prompt.
- **Ferramenta de comando** com prazo e morte da **árvore** de processos (matar o pai não
  basta; o neto sobrevive e segura o terminal).
- **Guarda de processos e guarda de ferramental.**
- **O laço de *tool use* como processo supervisionado** — o agente ganha endereço e dono.
- **`registrar_resultado` como a única forma de o agente reportar**, e a ausência
  deliberada de uma ferramenta de mudar estado: o contador de tentativas é do sistema, não
  do agente. É a tese aplicada a um detalhe.
- **Teto de chamadas de ferramenta por papel**, calibrado sobre 135 etapas reais do protótipo.
- Dois adaptadores de operário: `Operario.ClaudeCLI` e `Operario.MessagesAPI`.

**Gate previsto.** Um agente resolve uma tarefa real de ponta a ponta, com custo por volta
gravado. **Este gate não foi atingido nesta etapa** — o que aconteceu está na E08, e é o
episódio central do trabalho.

---

### E07 — Implementação III: a linha de produção (v0.3)
**Dias 91–105 · 12/07 a 26/07 · Fase: Implementação** · 11 commits · T-022 a T-030

**Objetivo.** Uma tarefa percorre os seis estados, é reprovada, retrabalhada e concluída —
sozinha. **É aqui que o sistema vira uma fábrica.**

**Entregas.**
- **Os seis estados, com transição transacional**: estado + relatório + custo mudam juntos
  ou não mudam. É o requisito que justificou PostgreSQL na E03.
- Promoção por dependências e ordenação da fila.
- **Equipe sob demanda**: especialistas sintetizados do pedido, versionados no banco, e a
  resolução determinística de qual agente executa qual tarefa.
- **Critérios executáveis**: leitura do critério, *allowlist* de binários e a passada
  mecânica que roda o critério antes de qualquer modelo ser chamado.
- **Classe de falha** — a distinção entre *"o comando está quebrado"* e *"a entrega
  falhou"*. Sem ela, um comando mal escrito consome as três tentativas da tarefa.
- O **critério implícito da suíte** e a detecção automática de ecossistema.
- **Os dois portões**, e a ausência da ferramenta de corrigir para o revisor.
- **Diagnóstico de reprovação**: classifica *por que* voltou e deriva a política de
  retrabalho — modelo, teto de voltas, escopo, e um bloco de foco com os achados nomeados.
- **A escada de resposta ao fracasso** e o limite de 3 ciclos.

**Gate — Marco da v0.3.** Uma tarefa percorre os seis estados, reprova **de propósito**, é
retrabalhada e conclui, com tudo registrado em transação.

---

### E08 — Verificação de integração e replanejamento
**Dias 106–120 · 27/07 a 10/08 · Fase: Verificação (com retorno controlado ao Projeto)** ·
20 commits

**Objetivo.** Exercitar o operário contra a ferramenta real, e fechar o marco da v0.2.

**Esta é a etapa mais importante do trabalho do ponto de vista metodológico**, e deve ser
apresentada como resultado, não como atraso.

**O que foi feito.** Um **instrumento de medição** (*probe*) foi escrito, versionado e
commitado **antes de ser executado** — regra de método adotada para que o resultado não
pudesse ser ajustado depois do fato. Ele mediu a superfície real de governança da ferramenta
de linha de comando: quais modos de permissão existem, o que faz uma escrita passar, se o
vocabulário de ferramentas se restringe, se o diretório confina, o teto de turnos e o formato
do fluxo de eventos.

**Resultado: o marco 1 da v0.2 REPROVOU**, com **três causas raiz independentes**:

| # | causa | natureza |
|---|---|---|
| 1 | O adaptador nunca passava a flag de modo de permissão. Em modo *headless* não há quem aprove, então **toda escrita de arquivo era negada** | defeito de implementação |
| 2 | O laço supõe um operário que **devolve** a intenção de usar a ferramenta para a fábrica executar; a ferramenta de linha de comando é um **agente completo**, com laço, ferramentas e permissões próprios | **incompatibilidade de projeto** |
| 3 | O motivo de parada era calculado sobre o fluxo inteiro, e não sobre o último turno | defeito de implementação |

**A causa 2 não é um bug — é uma premissa de projeto que a realidade refutou.** E é ela que
justifica o retorno controlado à fase de projeto: quatro desenhos alternativos foram
escritos, cada um com o que **custa**, o que **ganha** e o que **perde**; o desenho A foi
escolhido — a fronteira `Operario` passa a declarar a **família** do fornecedor
(`:agente_completo` × `:endpoint_de_modelo`) e o laço ramifica **uma única vez**, sem ida
adicional ao modelo.

Uma terceira afirmação do marco **passou**: a contabilidade bate exatamente
(95.558 = 95.558). E um segundo marco ficou **declaradamente pendente**, não reprovado, por
falta de chave de API na máquina — a distinção entre *reprovado* e *bloqueado* é registrada.

**Replanejamento:** 10 tarefas corretivas, com dependências e esforço estimado (7,5 a 11 h),
escritas antes de qualquer correção começar.

**Entregas técnicas do período** (o trabalho não parou): geração do markdown de gestão a
partir do banco; árvore de supervisão de agentes (`DynamicSupervisor` + `Registry`).

**Gate.** Causas raiz identificadas, **medidas contra a ferramenta real**, e replanejadas
com decisão de projeto registrada. O marco reabre com escopo explícito.

---

### E09 — Implementação IV: governança do agente completo
**Dias 121–135 · 11/08 a 25/08 · Fase: Implementação** · 32 commits

**Objetivo.** Executar as 10 tarefas corretivas da E08 e reconstruir, do lado do agente
completo, a governança que o desenho original impunha do lado do endpoint.

**Entregas.**
- **A fronteira declara a família**, e o laço para de executar ferramenta que não é dele.
  O critério de aceite prova a **régua de extensibilidade**: dois adaptadores, um de cada
  família, definidos **apenas no teste**, são conduzidos pelo laço **sem uma única linha
  alterada em `lib/`**. Acrescentar um provedor é escrever um adaptador e declará-lo — nunca
  mexer no miolo.
- Permissão *headless* governada e **vocabulário de ferramentas por papel** (o revisor não
  recebe a ferramenta de escrever — imposto por flag, não por pedido no prompt).
- Motivo de parada extraído do evento terminal.
- **Confinamento provado, e não presumido**: prevenção medida contra a ferramenta real (uma
  sessão mandada escrever fora da raiz não consegue) **mais** auditoria pelo mesmo resolvedor
  de caminho que já governa a outra família. Confinamento é propriedade de nível de marco
  neste projeto.
- O prompt sai da linha de comando e viaja por entrada padrão — sem isso, nenhuma tarefa
  real cabe.
- **Teto de voltas imposto pela ferramenta**, e não pedido no prompt.

**Gate.** As dez tarefas corretivas concluídas, cada uma com verificação e revisão
independentes registradas; a régua de extensibilidade provada por teste.

---

### E10 — Implementação V: concorrência, orçamento e telemetria (v0.4)
**Dias 136–150 · 26/08 a 09/09 · Fase: Implementação** · 10 commits

**Objetivo.** Rodar várias tarefas ao mesmo tempo, sobreviver à morte de uma delas e nunca
começar o que não cabe no orçamento.

**Entregas.**
- **Orçamento com parada limpa**, teto por rodada e por tarefa. A doutrina é explícita:
  **impedir de *começar*, nunca cortar no meio** — despacho interrompido custa igual e não
  entrega nada.
- **Barramento de eventos e telemetria por despacho** — a base sobre a qual o painel da E12
  será construído, no mesmo banco e no mesmo barramento do motor.
- **Fila durável com Oban**: enfileirar e mudar o estado da tarefa **na mesma transação**.

**Gate previsto — Marco da v0.4.** Três tarefas em paralelo; matar o processo de uma não
afeta as outras duas, e ela volta à fila.

**Situação real declarada em 07/09/2026.** **42 de 71 tarefas concluídas.** A tarefa da fila
durável foi cortada no meio pelo limite de cota da assinatura e **commitada parcial, de
propósito e com a mensagem dizendo que não compila**, para viajar entre máquinas de trabalho.
O marco da v0.4 está aberto. *Registrar o parcial como parcial é a alternativa honesta a
descartar trabalho ou fingir que ele está pronto.*

---

### E11 — Implementação VI: a fábrica que lembra (v0.5) · **a executar**
**Dias 151–165 · 10/09 a 24/09 · Fase: Implementação** · T-042 a T-048

**Objetivo.** O agente começa a tarefa já sabendo *"isto foi decidido assim, por este
motivo"* — em vez de decidir de novo, às vezes ao contrário.

**Planejado.**
- **Tarefa de abertura que decide por medição, não por palpite**: disco, memória residente e
  tempo por 1.000 trechos do modelo de *embedding* local, medidos **antes** de escolher entre
  rodar o modelo no próprio nó ou delegar a um serviço. É aqui que o RNF-01 (8 GB) cobra sua
  dívida — o modelo de *embedding* é a única peça pesada do desenho inteiro.
- Ingestão da história do projeto ao commitar, **fora do caminho quente**.
- **Busca híbrida**: vetorial + termo exato, fundidos por posto recíproco (RRF, k=60). Os
  dois índices respondem perguntas diferentes; o semântico é o caro e o aproximado.
- Bloco de contexto recuperado **com a fonte citada**.
- Avaliação quantitativa da qualidade da recuperação.

**Gate — Marco da v0.5.** Num projeto com histórico, o agente **cita a decisão anterior** em
vez de decidir de novo.

---

### E12 — Implementação VII: a fábrica completa (v1.0) · **a executar**
**Dias 166–180 · 25/09 a 09/10 · Fase: Implementação** · T-049 a T-057

**Objetivo.** Acompanhar na tela um projeto inteiro sendo planejado, construído, verificado,
revisado e entregue.

**Planejado.**
- Tarefa de abertura: conferir o que o banco **realmente grava** contra o que as telas
  assumem, e reextrair a linha de base se o protótipo continuou rodando.
- **Painel em LiveView** sobre o mesmo banco e o mesmo barramento de eventos do motor —
  não uma segunda cópia do estado. Quadro de tarefas por estado, ao vivo.
- Console ao vivo do agente e custo da rodada.
- Parar e retomar: um botão que encerra um processo supervisionado.
- **Piloto automático**: a decisão isolada como **função pura** (portanto testável) e, à
  parte, a mecânica e a tela. Encadeia rodadas até um critério de parada, com teto de gasto e
  de rodadas obrigatórios.
- **Trilha genérica** (artefatos não-software) com a escada de prova e o **rótulo obrigatório
  de grau de verificação** — cada critério marcado como *executado*, *inspecionado* ou
  *julgado*, com a proporção de "julgados" visível por projeto. É a resposta explícita à
  pergunta *"como você verifica o que não se compila?"*.
- Varredura de segredos antes de publicar.

**Gate.** Interface completa e operável; trilha genérica com rótulo de prova funcionando.

---

### E13 — Teste de sistema, medição final e entrega · **a executar**
**Dias 181–195 · 10/10 a 24/10 · Fase: Testes e implantação** · T-058

**Objetivo.** Provar a tese com número, não com afirmação.

**Planejado.**
- **Teste de sistema de ponta a ponta:** um projeto inteiro é planejado, construído,
  verificado, revisado e entregue **sem intervenção humana** depois do pedido — o enunciado
  do RF-01, executado.
- **Medição final contra a linha de base da E02.** Comparação da v2 com o protótipo nas
  mesmas dimensões medidas: custo por tarefa concluída, ciclos por tarefa, taxa de
  reprovação, tarefas bloqueadas por esgotamento, tempo até a conclusão.
- Teste do RNF-01 na máquina alvo (8 GB / 4 núcleos).
- `ENTREGA.md` — o resultado contra a linha de base.
- Documentação final, revisão do texto do TCC e preparação da defesa.

**Gate — Marco da v1.0 e encerramento.** Marco aprovado, medição publicada, documento de
entrega escrito.

---

## 5. Rastreabilidade: do requisito ao teste

Amostra da matriz completa (a íntegra está no cabeçalho de cada tarefa):

| requisito | onde foi projetado | onde foi implementado | o que o prova |
|---|---|---|---|
| RF-02 (seis estados, dois portões) | E03 | E07 — T-022, T-028 | transição transacional testada; revisor sem ferramenta de corrigir |
| RF-03 (retrabalho com limite) | E03 | E07 — T-029, T-030 | escada de 4 degraus; limite de 3 ciclos com teste |
| RNF-01 (8 GB) | E03 | E11 — T-042 | medição de disco/memória antes de escolher o adaptador |
| RNF-02 (duas unidades) | E01 | E05 — T-005 | contabilidade conferida no marco da v0.2 (95.558 = 95.558) |
| RNF-03 (confinamento) | E03 | E06 — T-012; E09 — T-012a | prevenção medida contra a ferramenta real + auditoria |
| RNF-04 (suíte sem rede) | E01 | E05 — T-009 | teste que falha se a chave de API estiver definida |

---

## 6. Riscos identificados e como foram tratados

| risco | etapa | tratamento | resultado |
|---|---|---|---|
| Premissa de projeto sobre a interface do fornecedor não se confirmar | E06→E08 | instrumento de medição escrito **antes** de ser rodado | materializou-se; retorno controlado ao projeto, 10 tarefas corretivas |
| Tarefa planejada com meses de antecedência envelhecer | E04 | **tarefa de abertura** obrigatória em cada versão | mecanismo ativo desde a v0.3 |
| Custo de execução estourar o orçamento | E01, E10 | contabilidade em duas unidades + teto por rodada e por tarefa, com parada limpa | teto ativo; um estouro registrado e contido |
| Limite de cota da assinatura cortar trabalho no meio | E10 | commit do parcial com a mensagem declarando o estado | ocorreu; nenhum trabalho perdido |
| Dependência de máquina forte | E01 | RNF-01 como restrição de arquitetura; *embedding* plugável | nenhuma versão anterior à v0.5 carrega modelo |
| Chave de API indisponível bloquear um marco | E08 | marco **partido** em parte provável sem chave e parte paga | parte pendente declarada, não reprovada |

---

## 7. Números do projeto em 07/09/2026

| | |
|---|---|
| Etapas concluídas | **10 de 13** |
| Tarefas concluídas | **42 de 71** (58 planejadas + 13 corretivas) |
| Commits no repositório do sistema | **92** |
| Código de produção | ~10.100 linhas (Elixir) |
| Código de teste | ~10.200 linhas — **proporção ≈ 1:1** |
| Módulos | 74 |
| Marcos aprovados | v0.1 |
| Marcos reprovados, com causa raiz medida | v0.2 (marco 1) |
| Marcos abertos | v0.2 (marco 2, parte paga), v0.3, v0.4 |

> A proporção de 1:1 entre código e teste não é ornamento: é a forma operacional da tese —
> o que não é verificável por execução volta a ser prosa.

---

## 8. O que apresentar, e em que ordem

Sugestão de roteiro para a conversa com o orientador:

1. **A tese em uma frase** (§ 1) — falha por governar mal, não por escrever mal.
2. **A linha de base** (E02) — havia um protótipo, ele foi medido, e há número anterior.
3. **A cascata e o congelamento** (§ 2) — as 58 tarefas escritas antes da primeira linha.
4. **A E08** — o marco que reprovou, as três causas, os quatro desenhos, a decisão
   registrada. É o que separa um trabalho de engenharia de uma demonstração.
5. **A E13** — o que ainda falta, e qual número vai fechar a conclusão.

---

## 9. Anexo — onde cada coisa está no repositório

| o quê | onde |
|---|---|
| Arquitetura completa (8 partes, 21 figuras) | `fabrica-multi-agente-arquitetura-7.docx` |
| Análise do protótipo | `_sistema/MIGRACAO_V2.md` |
| Estado da arte e originalidade | `_sistema/ESTADO_DA_ARTE.md` |
| Decisões com o motivo | `_sistema/DECISOES_FECHADAS.md` |
| Plano por versões | `_sistema/PLANO_V2.md` |
| As 58 tarefas em ordem | `_sistema/v2/ROTEIRO.md` |
| Estado de cada tarefa | `projetos/fabrica-v2/_gestao/tarefas/` |
| Ambiente reproduzível | `_sistema/AMBIENTE_V2.md` |
| Progresso e o que foi ajustado | `projetos/fabrica-v2/_gestao/PROGRESSO.md` |
| Código | `projetos/fabrica-v2/lib/` e `test/` |
| **Commit → etapa** | `MAPEAMENTO_COMMITS.md`, ao lado deste arquivo |
