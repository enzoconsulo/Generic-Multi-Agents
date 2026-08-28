# Migração para a v2 (Elixir/OTP) — análise

**Escrito em 2026-08-28.** Este documento é a ponte entre três coisas que precisam coincidir
antes de existir um plano:

1. **a documentação do TCC** — o projeto da v2, nos `.docx` da raiz (`-7` completo; o
   `-3-completo` do histórico é onde mora o detalhe técnico). Handoff deles:
   `_sistema/documentos-tcc/CONTEXTO.md`;
2. **o código que a v1 realmente é** — não o que os documentos dizem que ela é. São coisas
   diferentes, e a diferença é o achado principal desta análise (seção 3);
3. **a máquina em que isso vai rodar**, medida (seção 5).

A documentação está certa e não se reabre. O que este documento faz é dizer **o que ela não
sabe** — porque foi escrita descrevendo o desenho da v1, e a v1 aprendeu mais coisas
operando do que estava no desenho.

---

## 1. A economia, medida — o que já está ganho e onde está o resto

Esta seção vem primeiro porque é a que corrige a impressão errada que a primeira versão
desta análise deixou. **A v1 não é ineficiente em custo. Ela já economiza cerca de 80%.**

Medido sobre `painel/dados/jobs/` — 139 jobs gravados, dos quais **27 têm contabilidade
completa de tokens** (os demais são jobs sem modelo — CI, importação — ou jobs cortados
antes do `result`, o problema que `precos.ts` documenta). Sem gastar um centavo:

| | tokens | % da entrada | preço |
|---|---:|---:|---|
| entrada a preço cheio | 251.940 | 0,20% | 1,0× |
| **leitura de cache** | **115.815.147** | **93,14%** | 0,1× |
| escrita de cache | 8.282.604 | 6,66% | 1,25×–2,0× |

- Razão leitura/escrita: **14 : 1**.
- Custo efetivo contra o mesmo trabalho sem cache nenhum: **0,18×–0,21×** — ou seja,
  **79% a 82% de economia, já realizada hoje**.

O cache de prompt **já está ligado e funcionando bem na v1** (registrado em
`DECISOES_FECHADAS.md`, e agora confirmado pelo volume). Isso reposiciona toda a discussão
sobre Req × SDK: o ganho em disputa **não é "cache × sem cache"** — é o resto.

### Onde está o resto, e ele não é pequeno

O número que decide:

> **A escrita de cache é 6,66% dos tokens e carrega ~50% da conta de entrada.**
> (47% calculando a escrita a 1,25×; 54% a 1,7×.)

Conferência do multiplicador real, contra os 12 jobs que têm custo REAL do SDK **e**
contabilidade por modelo: 1,25× subestima sistematicamente (−5% a −15%), 2,0× superestima
(+6% a +23%), e ~1,75× acerta dentro de ±10% na maioria. Isso é **compatível com uma
mistura de TTL de 5 minutos (1,25×) e de 1 hora (2,0×)** — ou seja, o CLI já usa o TTL longo
pelo menos em parte, e essa alavanca já está parcialmente colhida. (É a mesma faixa que
`precos.ts` mediu por outro caminho, o que dá duas derivações independentes concordando.)

**Por que se escreve tanto:** cada despacho de agente é uma sessão nova, e sessão nova é um
prefixo novo para ESCREVER. Uma rodada de pipeline tem ~21 despachos. O `CLAUDE.md` da raiz
já sabe disso — *"cada sessão nova é um prefixo novo para ESCREVER no cache, e escrita custa
muito mais que leitura"* — mas a v1 não tem como agir sobre isso: quem monta a requisição é
o SDK.

**É exatamente aqui que o `Operario.MessagesAPI` se paga**, e o prêmio é dimensionável:
transformar ~21 escritas de prefixo por rodada em 1 ou 2 (o resto lendo o que a primeira
escreveu) ataca metade da conta que sobrou. Não é ajuste fino — é a maior alavanca restante.

### As três armadilhas de cache que a v1 não tem como ver

Conferidas contra a referência da API (skill `claude-api`, `shared/prompt-caching.md`) —
todas silenciosas, todas sem erro, todas visíveis só em `cache_read_input_tokens`:

1. **Janela de 20 blocos.** Cada ponto de cache caminha para trás **no máximo 20 blocos de
   conteúdo** procurando entrada anterior. Numa volta com muitos `tool_use`/`tool_result`
   — e a v1 tem rodada com **472 chamadas de ferramenta** — o ponto seguinte não encontra o
   anterior e **erra o cache em silêncio**. A correção é pontos intermediários a cada ~15
   blocos, e ela só existe para quem monta a requisição.
2. **Mínimo cacheável é por modelo, e não é monotônico:** 512 tokens no Opus 5, 1024 no
   Sonnet 5, **4096 no Haiku 4.5**. A fábrica roda o `testador` em Haiku de propósito — um
   prefixo de verificador abaixo de 4096 tokens **simplesmente não cacheia**, sem aviso.
3. **Requisições paralelas idênticas não compartilham cache** — nenhuma lê o que as outras
   ainda estão escrevendo. Os documentos já registram isso (Figura 7 do `-3-completo`), e o
   paralelismo de 3 construtores da fábrica cai exatamente nesse caso.

E uma alavanca nova que os documentos não conhecem, disponível **hoje** em Opus 5 / Opus 4.8
/ Fable 5, sem beta: **mensagem de sistema no meio da conversa** (`{"role": "system"}` dentro
de `messages[]`). Serve para injetar instrução por tarefa **sem invalidar o prefixo já
cacheado** — editar o `system` de topo invalida tudo o que vem depois. Para uma fábrica que
quer um prefixo estável por projeto e uma instrução variável por tarefa, é a peça que faltava.

### Uma correção à documentação

O `-3-completo` diz: *"Na versão 1 esse risco já era conhecido e nominal: o índice do projeto
trazia o hash do commit no cabeçalho, e isso bastaria para zerar o ganho."*

**A v1 já consertou isso.** `contexto/montador.ts` tem `semCabecalhoVolatil(mapa)`, que
remove do MAPA o comentário de geração com hash do HEAD e data, exatamente para não
envenenar o prefixo. O documento subestima a própria v1 nesse ponto e deve ser corrigido —
é um caso a favor da tese, não contra.

---

## 2. Sobre o git — ele fica, inteiro

Preocupação levantada e conferida contra os dois documentos. **O git está no plano da v2, de
forma explícita, e a decisão de "banco é a verdade" não o remove.** As citações:

- `-3-completo`, §3: *"Se tudo cair agora, a próxima execução reconstrói o mundo lendo o
  banco **e o git**."*
- `-7`, §3: *"...lendo o banco **e o histórico de versões** — nunca relendo um diálogo."*
- `-7`, Figura 1: *"Tarefa concluída vira **um commit próprio**."*
- `-7`, §11 e F5: *"A **indexação roda ao commitar**."*
- `-7`, §22: *"a fonte é **texto versionado**, e o binário sai de um comando."*

O que muda com a decisão 4.2 (seção 6) é **uma coisa só**: o markdown deixa de ser onde o
agente ESCREVE o estado. Continuam exatamente como estão:

| o que | continua |
|---|---|
| o código do projeto | no git, como sempre |
| uma tarefa concluída | um commit próprio |
| o markdown da tarefa | commitado — só que **gerado** a partir do banco, não editado à mão |
| recuperação | **duas fontes**: banco + árvore git (é o `trabalho-parcial.ts` da v1, que pergunta ao git se sobrou trabalho não commitado) |
| a fonte de artefato não-software | texto versionado; o binário é gerado |
| gatilho da indexação semântica | o commit |

**E sobre "não usar o git implicaria em mais cota": é o contrário.** O custo de um despacho é
*número de voltas × contexto de cada volta*, e cada leitura ou escrita de arquivo é uma
volta. Hoje o agente gasta voltas **lendo o arquivo da tarefa e reescrevendo seções dele**.
Com `registrar_resultado`, o relatório inteiro é **uma chamada estruturada, numa volta**, e o
contexto da tarefa chega pronto no prefixo em vez de ser descoberto. A mudança **reduz**
voltas — que é o termo dominante da conta.

---

## 3. O achado principal: a v1 sabe mais do que a documentação descreve

Os documentos descrevem o **desenho** da v1. O código contém uma segunda camada de
mecanismos, todos nascidos de estrago real, que **não aparecem em documento nenhum**. Planejar
a v2 lendo só os `.docx` perderia todos eles em silêncio. Este é o inventário do que precisa
ser levado junto:

| mecanismo da v1 | onde | o que resolve — e que a doc não menciona |
|---|---|---|
| `avaliarComandoDeProcesso` | `pipeline/guarda-processos.ts` | o agente não pode matar o painel que o está executando |
| `avaliarReinvencao` | `pipeline/guarda-ferramental.ts` | o agente não pode reinventar ferramenta que a fábrica já tem |
| `ClasseFalha` + `classificarFalha` | `pipeline/criterios.ts` | distingue **"o comando está quebrado"** de **"a entrega falhou"**. Sem isso, um `verificar:` mal escrito queima ciclos — é o incidente T-030: 4 ciclos e US$ 12,90 com o deliverable certo desde o primeiro |
| `criterioDaSuite` | `pipeline/criterios.ts` | o critério IMPLÍCITO que não está escrito em tarefa nenhuma: a suíte do projeto continua passando |
| `avaliarComando` + `BINARIOS_PERMITIDOS` | `pipeline/criterios.ts` | allowlist de binários, nunca lista de proibições |
| `reexecucoesPorAmbiente` | `pipeline/criterios.ts` | falha de ambiente ≠ falha de entrega; mede e repete uma vez |
| **`diagnostico.ts` inteiro** | `pipeline/diagnostico.ts` | classifica **por que** a tarefa voltou e deriva **política**: modelo, teto de voltas (`VOLTAS_PONTUAL`/`VOLTAS_MEDIO`), escopo e `blocoDeFoco` com os achados nomeados em ordem de gravidade. A escada da doc é **mais grossa que isto** |
| `lerImpedimento` | `pipeline/diagnostico.ts` | o construtor pode declarar impedimento em vez de fingir entrega |
| `FRACAO_TETO_POR_TAREFA` | `pipeline/orcamento.ts` | teto **por tarefa**, nascido da queixa real: "gastar 70% do limite e não entregar UMA tarefa" |
| `estimativaProximaTarefa` | `pipeline/orcamento.ts` | autocalibragem: usa o custo medido NESTE job, não uma constante |
| `semCabecalhoVolatil` | `contexto/montador.ts` | **o anti-invalidador de cache, já implementado** (seção 1) |
| `orcamentoDeFerramentas` / `limiarDeDebate` | `pipeline/despachante.ts` | teto de chamadas de ferramenta por papel, medido sobre 135 etapas reais |
| `RastreadorDescendentes` | `pipeline/coleta-processos.ts` | **prova de propriedade** antes de matar órfão |
| `temTrabalhoParcial` | `pipeline/trabalho-parcial.ts` | pergunta à árvore git se sobrou trabalho — sensor de recuperação |
| `ehLimiteDeUso` / `horaDeReabertura` / `reabertura.ts` | `jobs/claude/`, `jobs/piloto/` | **a parede de cota**: reconhecer, dormir, rearmar. Estruturalmente necessário sob assinatura, e **ausente da documentação inteira** |
| `piloto/` | `jobs/piloto/` | encadeia rodadas sozinho até critério de parada, com teto de gasto e de rodadas |
| `ci/` | `ci/` | detecção de ecossistema + estágios + matar árvore de processo. A doc chama tudo isso de "a passada mecânica" |
| `varrerRepo` | `fabrica/seguranca.ts` | varre segredos antes de publicar |
| `precos.ts` | `jobs/claude/precos.ts` | estima custo de job cortado antes do `result` — que são justamente os mais caros |

**A leitura disso:** a documentação do TCC está certa sobre a arquitetura e incompleta sobre
a operação. A v2 herda as duas camadas ou nasce mais frágil que a v1 em produção, com uma
arquitetura melhor. Esse é o risco número um da migração, e ele não é técnico — é de
planejamento.

---

## 4. A v1 como código a portar

| o que | tamanho |
|---|---|
| `painel/servidor/src` + `painel/web/src` | **17.413 linhas** de TypeScript |
| arquivos de teste do painel | **100** |
| prompts de agente (`.claude/agents/*.md`) | **12 arquivos, 1.867 linhas** |
| tarefas vivas em `projetos/*/_gestao/tarefas/` | **89** (72 banco-imobiliario · 11 shopee-rodizio · 6 ia-hibrida-limpa) |
| jobs gravados | **139** (27 com contabilidade completa) |

O erro a evitar é tratar as 17,4 mil linhas como "o que precisa ser reescrito". Quatro
destinos:

**(a) Migra como REGRA — tradução quase 1:1 (~2,6 mil linhas).** Já são funções puras, já
têm teste, e o teste vira ExUnit junto. É o miolo do valor e é o que a F3 realmente é:
`criterios.ts` (728) · `maquina.ts` (418) · `diagnostico.ts` (406) · `montador.ts` (389) ·
`piloto/decisao.ts` (282) · `orcamento.ts` (242) · `marco.ts` (145).

**(b) DESAPARECE dentro do OTP (~1,8 mil linhas)** — o argumento da migração em forma de
número, e vale citar no TCC: `jobs/fila.ts` (621) → Oban · `coleta-processos` +
`guarda-processos` (~380) → `Registry` + supervisão · `robustez/` (295) → timeout de processo
· `retomada.ts` (258) → trabalho durável · `eventos/hub.ts` (~120) → Phoenix PubSub.

**(c) REESCRITA sem equivalente (~3,5 mil linhas):** `runner-claude.ts` (1.276) → o laço +
as ferramentas + a contabilidade por volta (peça de maior risco) · `ci/` (~700), com a parte
de matar árvore de processo específica de Windows · `fabrica/*` (~1.500), que **invertem de
sentido**: hoje LEEM markdown como verdade, na v2 GERAM markdown a partir do banco.

**(d) Não migra nesta rodada:** `painel/web/` (React+Vite). LiveView é reescrita de UI e é a
F6; até lá o painel da v1 continua sendo a tela.

---

## 5. O ambiente, medido

| item | estado | consequência |
|---|---|---|
| Elixir | 1.20.0, **compilado contra OTP 28** | |
| Erlang | **OTP 29** (erts-17.0.1) | **descasamento** — alinhar é item da F1, antes de qualquer código |
| PostgreSQL | 18 instalado | serve |
| pgvector | **não verificado**; **sem Docker** na máquina | extensão compilada; no Windows não é trivial. Ameaça direta à F5 |
| Memória | ~7,9 GB, ~1,3 GB livres | **aperta a F5**: BEAM + Postgres + modelo de embedding residente + suíte de projeto. Já há histórico de 8 `node.exe` órfãos por estouro |
| SO | Windows 11 | Elixir/OTP em Windows é o caminho menos trilhado: matar árvore de processo, prazos e `System.cmd` são trabalho específico |

---

## 6. Decisões fechadas (2026-08-28)

### 6.1 — O operário: DUPLO, padrão CLI, com o Req existindo para colher o prêmio medido

**O fato:** a fábrica **não paga por token — consome cota**. OAuth, `subscriptionType: pro`,
`hasExtraUsageEnabled: false`, sem `ANTHROPIC_API_KEY`. Todo valor em dólar que o sistema
registra é **estimativa contábil, não fatura**. É por isso que a parede de cota é cidadã de
primeira classe no código e ausente da documentação.

**A decisão:** `behaviour Fabrica.Operario` com três adaptadores.

| adaptador | papel | fase |
|---|---|---|
| `Operario.Falso` | dublê determinístico, sem rede e sem custo | **F1** — é o marco dela |
| `Operario.ClaudeCLI` | porta para o CLI; assinatura, ferramentas já batidas | **F2**, **padrão de operação** |
| `Operario.MessagesAPI` | Req direto; controle de `cache_control`, TTL e pontos de corte | **F2** |

**Por que isto não é abrir mão de eficiência** (a questão que motivou a revisão): 80% da
economia de cache **já está colhida** e vem junto com o CLI. O que o `MessagesAPI` persegue é
a metade da conta que sobrou — as ~21 escritas de prefixo por rodada — e isso é um alvo
medido, não uma esperança. A decisão não adia a eficiência: **ela a torna verificável**, e
por isso o marco da F2 muda (ver 7).

Consequências para o plano:

1. **O `behaviour` é da F1, não da F2** — o marco da F1 (suíte sem rede) exige o contrato já
   existindo, com o `Falso` implementando-o.
2. **O teste do prefixo sobrevive à escolha:** montar o prefixo duas vezes e comparar bytes é
   teste puro sobre o `MessagesAPI`, sem rede.
3. **Duas unidades de contabilidade:** cota consumida (o que a operação real gasta) e
   dólar-equivalente (o que a mesma rodada custaria por API). A v1 só tem a segunda.
4. **A Parte V do TCC ganha uma frase de honestidade**, no espírito de "Elixir não barateia o
   modelo": sob assinatura o reaproveitamento compra **folga de cota**, não dólares. E ganha
   um número que ela não tinha: *o cache já entrega ~80%; o desenho da v2 mira a metade do
   que resta, que é escrita de prefixo.*

### 6.2 — A verdade no banco; o agente reporta por ferramenta

**O precedente:** o protocolo da v1 já tem `ultima-reprovacao: # NÃO ESCREVA. Campo do
MOTOR`. A fábrica já descobriu, por estrago, que certos campos pertencem à máquina. A v2
generaliza uma regra já paga.

- Postgres é fonte única; cada transição é uma transação (estado + relatório + custo).
- O agente **não escreve estado**: chama `registrar_resultado` e o sistema grava. **A
  ferramenta de mudar status não existe para agente nenhum** — impossibilidade, não regra
  pedida no prompt. Mesmo princípio da ausência da ferramenta de escrever no revisor.
- O markdown vira **artefato gerado**, commitado junto com o trabalho (seção 2).

Consequências: os 12 prompts são reescritos (oportunidade — os especialistas hoje gastam ~70%
do texto repetindo o executor); o **importador das 89 tarefas** é tarefa explícita da F3 com
critério executável; e **backup do Postgres vira requisito da F1**, porque na v1 o git do
projeto cobria isso de graça.

---

## 7. As seis fases, com o que a v1 acrescenta a cada uma

A ordem e os marcos da documentação ficam. O que muda é o **conteúdo** de cada fase, agora
que o inventário da seção 3 existe.

| fase | marco da documentação | **o que a v1 acrescenta** |
|---|---|---|
| **F1** Fundação | a suíte inteira roda sem tocar a rede e sem gastar um centavo | `behaviour Fabrica.Operario` + `Falso` · **backup/dump do Postgres** · alinhar Elixir/OTP · tabela de preços E de cota (duas unidades) |
| **F2** Laço de agente | um agente resolve uma tarefa real, com custo por volta | **marco adicional: o prefixo do projeto é escrito UMA vez e lido pelos despachos seguintes, provado por `cache_read_input_tokens`** · teste de bytes do prefixo · pontos intermediários pela janela de 20 blocos · `orcamentoDeFerramentas` por papel · `guarda-processos` e `guarda-ferramental` **como implementação da ferramenta**, não como validação de string · `semCabecalhoVolatil` no montador do prefixo |
| **F3** Máquina de estados | uma tarefa percorre os seis estados, reprova, é retrabalhada e conclui | **`diagnostico.ts` inteiro** (política, não só escada) · `criterios.ts` com `ClasseFalha`, `criterioDaSuite`, allowlist e `reexecucoesPorAmbiente` · `orcamento.ts` com teto por tarefa e autocalibragem · **importador das 89 tarefas** · `lerImpedimento` |
| **F4** Concorrência | três tarefas em paralelo; matar uma não afeta as outras | **a parede de cota** (`ehLimiteDeUso`, `horaDeReabertura`, rearme) — ausente da doc e estrutural sob assinatura · recuperação por árvore git (`temTrabalhoParcial`) · `areas` como exclusão mútua **verificada pelo motor** · a regra de que requisições paralelas idênticas não compartilham cache |
| **F5** Memória semântica | o agente cita a decisão anterior em vez de decidir de novo | **decidir antes: pgvector nesta máquina ou noutra; embedding local ou por serviço** (seção 5) · porte do gerador do MAPA (determinístico, sem modelo) |
| **F6** Painel e trilha genérica | um projeto inteiro entregue sem intervenção | **o piloto automático** (encadeia rodadas, tetos, paradas) · o motor de CI com detecção de ecossistema · `varrerRepo` · a proporção de critérios `julgados` visível por projeto |

---

## 8. O que continua aberto

- **Coexistência.** Não há linha sobre isso nos documentos. Recomendação: a v2 nasce em
  repositório próprio, ao lado; a v1 fica **intocada** operando os 3 projetos vivos. Virada
  só no marco da F6, sobre um projeto **novo e pequeno**. Nunca migrar projeto em voo.
- **A prova de que valeu.** A tese é "mais difícil de operar errado", e os documentos não
  declaram a medida. A linha de base já existe e é de graça: **proporção de despacho
  desperdiçado** (agente cortado, reprovação falsa, tarefa girando), custo por tarefa
  concluída, contexto por despacho (53,5k → 11–14k já medido), e o que se perde ao matar um
  agente em voo. Declarar isso antes da F1.
- **pgvector e embedding sob 1,3 GB livres** (seção 5) — o único risco de ambiente, e o único
  que dá para desarmar sem escrever código.
- **Nomenclatura PT-BR** (`Fabrica.Tarefa`, `Fabrica.Portao`, `Fabrica.Operario`) — registrar
  para não ser reaberto na primeira tarefa.
- **Correção nos `.docx`:** o `-3-completo` afirma que a v1 tinha o hash de commit no prefixo;
  ela já corrige isso (seção 1). E vale uma frase separando **parada manual pelo operador**
  de **corte automático por orçamento**, que hoje parecem contradição entre a seção do painel
  e a de escopo.

---

## 9. Sequência

1. ~~Fechar as decisões do operário e da fonte de verdade~~ — **feito**, seção 6.
2. Desarmar o risco de ambiente: alinhar Elixir/OTP e provar pgvector nesta máquina.
3. Declarar a linha de base de medição a partir dos 139 jobs já gravados — de graça.
4. Planejar: as 6 fases da documentação, com o conteúdo da seção 7, decompostas em tarefas do
   protocolo com critério executável.

**Nota:** a v2 é candidata natural a ser construída PELA v1 — o teste mais duro que a fábrica
pode receber, e material de TCC por si só. Decisão à parte, e depende da coexistência.
