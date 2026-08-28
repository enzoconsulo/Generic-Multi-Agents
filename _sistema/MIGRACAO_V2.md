# Migração para a v2 (Elixir/OTP) — análise prévia ao planejamento

**Escrito em 2026-08-28.** Este documento NÃO é o plano da migração: é o inventário e a
lista de decisões que precisam estar fechadas ANTES de planejar, para que o plano não nasça
sobre premissa não conferida. O projeto da v2 já existe e está nos `.docx` da raiz
(`-7` completo, e o `-3-completo` do histórico, que é onde mora o detalhe técnico);
o handoff daqueles documentos é `_sistema/documentos-tcc/CONTEXTO.md`.

O que este arquivo acrescenta ao que já está lá: **a v1 vista como código a ser portado**
(e não como conceito a ser preservado), **o ambiente medido** e **os seis pontos em que o
projeto está bem definido no papel e indefinido na prática**.

---

## 1. O que o plano já decidiu (e não se reabre aqui)

Está fechado nos documentos, foi conferido e continua valendo. Repetido aqui só para que o
plano de migração não gaste tempo redecidindo:

- **Reimplementação, não refatoração.** A v1 é protótipo que validou o desenho.
- **A tese:** o gargalo é governança, e governança escrita em prosa dentro de um prompt é
  governança opcional. A v2 move para o compilador, a árvore de supervisão e o esquema do
  banco tudo o que hoje é frase imperativa dirigida a um modelo.
- **Stack:** Elixir/OTP · Phoenix+LiveView · PostgreSQL+Ecto · Oban · Req (HTTP direto) ·
  Bumblebee+Nx · pgvector · TextChunker · ExUnit+Mox+cliente falso.
- **Mecanismos preservados:** dois portões com duas perguntas · limite de 3 ciclos · escada
  de resposta ao fracasso (sobe modelo → troca especialista → replaneja → bloqueia) ·
  equipe sob demanda · índice denso · critérios executáveis · duas trilhas com escada de
  prova (executado > inspecionado > julgado).
- **Seis fases** (F1 Fundação · F2 Laço · F3 Máquina de estados · F4 Concorrência ·
  F5 Memória semântica · F6 Painel e trilha genérica), cada uma fechando em marco
  observável.
- **Fora de escopo:** deploy, multi-nó, fine-tuning, multiusuário, e cortar agente em voo
  por estouro de custo (o teto impede COMEÇAR, não interrompe).

---

## 2. A v1 vista como código a portar

Números reais deste repositório, hoje:

| o que | tamanho |
|---|---|
| `painel/servidor/src` + `painel/web/src` | **17.413 linhas** de TypeScript |
| arquivos de teste do painel | **100** |
| prompts de agente (`.claude/agents/*.md`) | **12 arquivos, 1.867 linhas** |
| comandos (`.claude/commands/`) | 6 |
| tarefas vivas em `projetos/*/_gestao/tarefas/` | **89** (72 banco-imobiliario · 11 shopee-rodizio · 6 ia-hibrida-limpa) |
| jobs gravados em `painel/dados/jobs/` | **139** — é a linha de base de medição, e é de graça |

O erro de planejamento a evitar é tratar as 17,4 mil linhas como "o que precisa ser
reescrito". Elas se dividem em quatro destinos muito diferentes, e essa divisão é a espinha
do plano de migração.

### (a) Migra como REGRA — tradução quase 1:1, e é o miolo do valor (~2,6 mil linhas)

Já são funções puras, já têm teste, e o teste traduz para ExUnit junto. Este bloco é o que
a F3 realmente é:

| arquivo v1 | linhas | vira |
|---|---|---|
| `pipeline/criterios.ts` | 728 | a passada mecânica antes do verificador |
| `pipeline/maquina.ts` | 418 | promover, ordenar, resolver agente, escalar modelo |
| `pipeline/diagnostico.ts` | 406 | por que a tarefa voltou → modelo, teto de voltas, escopo |
| `contexto/montador.ts` | 389 | contexto por papel (a 2ª alavanca de custo) |
| `jobs/piloto/decisao.ts` | 282 | quando o laço para, dorme ou continua |
| `pipeline/orcamento.ts` | 242 | teto com parada limpa |
| `pipeline/marco.ts` | 145 | fase completa → linha `Marco:` |

### (b) DESAPARECE dentro do OTP — não se porta, se apaga (~1,8 mil linhas)

Este bloco é o argumento da migração em forma de número, e vale citar no TCC:

| arquivo v1 | linhas | substituído por |
|---|---|---|
| `jobs/fila.ts` | 621 | Oban (fila durável no próprio banco) |
| `pipeline/coleta-processos.ts` + `guarda-processos.ts` | ~380 | `Registry` + árvore de supervisão |
| `jobs/robustez/watchdog.ts` + `guardrails.ts` | 295 | timeout de processo + supervisor |
| `jobs/retomada.ts` | 258 | trabalho durável do Oban |
| `eventos/hub.ts` (SSE com replay) | ~120 | Phoenix PubSub + LiveView |

### (c) REESCRITA sem equivalente pronto (~3,5 mil linhas)

| arquivo v1 | linhas | observação |
|---|---|---|
| `jobs/claude/runner-claude.ts` | 1.276 | vira o laço de tool use + as ferramentas + a contabilidade por volta. **É a peça de maior risco** — ver 4.1 |
| `ci/` (5 arquivos) | ~700 | motor de CI: detectar ecossistema, rodar estágio, matar ÁRVORE de processo. A reescrita é direta, mas a parte de matar processo é específica de Windows e já custou caro uma vez |
| `fabrica/*` (leitores de markdown) | ~1.500 | invertem de sentido: hoje LEEM o markdown como verdade; na v2 GERAM markdown a partir do banco |

### (d) Não migra nesta rodada

`painel/web/` (React+Vite) inteiro — LiveView é reescrita de UI, e é a F6. Até lá o painel
da v1 continua sendo a tela de operação.

---

## 3. O ambiente, medido (não presumido)

| item | estado nesta máquina | consequência |
|---|---|---|
| Elixir | **1.20.0, compilado contra OTP 28** | instalado |
| Erlang | **OTP 29 (erts-17.0.1)** | **descasamento** — Elixir compilado para 28 rodando sobre 29. Alinhar as duas versões é item da F1, antes de qualquer código |
| PostgreSQL | **18 instalado** | serve |
| pgvector | **não verificado** | é extensão compilada; **sem Docker nesta máquina**, e no Windows a instalação não é trivial. Ameaça direta à F5 |
| Docker | **ausente** | não há saída fácil por container para o Postgres/pgvector |
| Memória | ~7,9 GB, com ~1,3 GB livres (medido em `DECISOES_FECHADAS.md`) | **aperta a F5**: BEAM + Postgres + modelo de embedding residente + a suíte do projeto sendo verificada, tudo junto. A suíte de projeto já tem histórico de deixar 8 `node.exe` órfãos por estouro de tempo |
| SO | Windows 11 | Elixir/OTP em Windows é suportado, mas é o caminho menos trilhado. Encerrar árvore de processo, prazos e `System.cmd` precisam de trabalho específico |

---

## 4. Os seis pontos indefinidos (é isto que precisa fechar antes do plano)

### 4.1 — O que é o "operário", e quem paga a conta ✅ FECHADA em 2026-08-28

**O fato que decidiu, e que não estava em nenhum documento:** a fábrica hoje **não paga por
token**. A autenticação é OAuth (`subscriptionType: pro`, `hasExtraUsageEnabled: false`),
não há `ANTHROPIC_API_KEY` no ambiente, e o `oauthAccount` tem `billingType:
stripe_subscription`. Todo valor em dólar que o sistema registra — `US$ 22,55` numa rodada,
os `R$ 550` de uma noite em Fable/xhigh — é **estimativa contábil de tokens, não fatura**.
O que se consome é cota. É por isso que `ehLimiteDeUso`, `horaDeReabertura` e o rearme do
piloto por cota são cidadãos de primeira classe no código da v1.

Logo, "Req em vez do SDK" não é só uma decisão de controle técnico: é converter cota em
dinheiro real a preço de tabela, no exato período em que a v2 vai rodar suas rodadas mais
longas (testar máquina de estados é caro por natureza — reprova de propósito, retrabalha,
replaneja). E empilha três apostas numa fase só: laço novo + ~10 ferramentas com
confinamento novas + cobrança nova.

**DECISÃO — operário duplo, padrão CLI.** Um `behaviour` `Fabrica.Operario` com três
adaptadores:

| adaptador | papel | quando |
|---|---|---|
| `Operario.Falso` | dublê determinístico, sem rede e sem custo | **F1** — é o marco dela |
| `Operario.ClaudeCLI` | porta para o CLI; assinatura, ferramentas já batidas em uso real | **F2**, e é o **padrão de operação** |
| `Operario.MessagesAPI` | Req direto, controle byte a byte do prefixo e do `cache_control` | **F2**, exercitado num orçamento pequeno e declarado, para PROVAR o ganho de cache |

Consequências que o plano precisa carregar:

1. **O `behaviour` é da F1, não da F2.** O marco da F1 é a suíte rodando sem tocar a rede —
   isso exige o contrato já existindo, com o `Falso` implementando-o. Os dois adaptadores
   reais vêm na F2.
2. **O teste do prefixo sobrevive à escolha.** "Montar o prefixo duas vezes e comparar os
   bytes" é teste puro sobre o `MessagesAPI`, sem rede — continua sendo o guarda da
   armadilha silenciosa, independente de qual adaptador opera no dia a dia.
3. **A contabilidade passa a ter duas unidades:** cota consumida (o que a operação real
   gasta) e dólar-equivalente (o que a mesma rodada custaria por API). A v1 só tem a
   segunda. Ter as duas é o que torna a Parte V do TCC honesta.
4. **A Parte V precisa de uma frase de honestidade**, no mesmo espírito de "Elixir não
   barateia o modelo": o ganho de reaproveitamento é demonstrado em orçamento controlado, e
   em operação sob assinatura ele compra **folga de cota**, não dólares. Dizer isso é mais
   forte que omitir — e a existência de dois operários sob o mesmo contrato passa a ser a
   demonstração de que a governança não depende do fornecedor.

### 4.2 — Onde vive a verdade, e como o agente reporta ✅ FECHADA em 2026-08-28

**O precedente que decidiu:** o protocolo da v1 já tem, no frontmatter, o campo
`ultima-reprovacao: # NÃO ESCREVA. Campo do MOTOR`. A fábrica já descobriu, por estrago,
que certos campos pertencem à máquina e não ao agente. A v2 não inventa regra nova —
generaliza uma que já foi paga.

**DECISÃO — o banco é a verdade; o agente reporta por ferramenta.**

- Postgres é fonte única. Cada transição é uma transação: novo estado + relatório da etapa
  + custo do despacho entram juntos ou não entram.
- O agente **não escreve estado**. Ele chama `registrar_resultado` (o que fez, arquivos,
  comandos, commit) e o sistema grava. **A ferramenta de mudar status não existe para
  agente nenhum** — é impossibilidade, não regra pedida no prompt. É o mesmo princípio da
  ausência da ferramenta de escrever no revisor.
- O markdown vira **artefato gerado** a partir do banco, commitado junto com o trabalho.
  O git do projeto continua legível por humano e por `git log`; ele deixa de ser a fonte.

Consequências que o plano precisa carregar:

1. **Os 12 prompts (1.867 linhas) são reescritos** — e isso é oportunidade, não só custo:
   o `CLAUDE.md` da raiz já registra que os especialistas do banco-imobiliario gastavam ~70%
   do texto repetindo a disciplina do executor. Sai a disciplina (que vira estrutura), fica
   o domínio.
2. **Importador das 89 tarefas vivas é tarefa explícita da F3**, com critério executável
   (reimportar duas vezes dá o mesmo estado; nenhuma tarefa perde histórico de ciclo).
3. **Requisito operacional novo:** com o estado no banco, "não perder trabalho" passa a
   exigir dump/backup do Postgres. Na v1 o git do projeto cobria isso de graça. Precisa ser
   item da F1, junto com as migrações — é o tipo de coisa que só se descobre faltando
   depois de perder.

### 4.3 — Coexistência: a v1 não pode parar

Não há uma linha sobre isso nos documentos, e é a decisão mais prática de todas. Há trabalho
vivo: 89 tarefas em 3 projetos, um deles (banco-imobiliario, 72 tarefas) com meses de
histórico. E o TCC depende de a v1 ter rodado de verdade.

**Recomendação:** a v2 nasce em repositório próprio, ao lado; a v1 fica **intocada** e
continua operando os projetos atuais. O critério de virada é o marco da F6 rodando um
projeto **novo e pequeno** de ponta a ponta. Nunca migrar um projeto em voo.

### 4.4 — A prova de que valeu

A tese é "a v2 não precisa ser mais esperta, precisa ser mais difícil de operar errado".
Os documentos listam riscos, mas **não declaram a medida** que confirmaria a tese — e a
lição da própria v1 (`CUSTO_DE_CONTEXTO.md`, seção 8) foi que o alvo bem instrumentado tende
a ser o que já se conhece, não o que mais custa.

Os 139 jobs em `painel/dados/jobs/` são linha de base pronta e gratuita. **Declarar antes da
F1** quais 3 ou 4 números serão comparados:

- custo por tarefa concluída;
- **proporção de despacho desperdiçado** (agente cortado, reprovação falsa por interferência,
  tarefa girando por contador não incrementado) — é a métrica que casa com a tese;
- contexto por despacho (a v1 já mediu: 53,5k → 11–14k);
- recuperação: matar um agente em voo e medir o que se perde.

Sem isso o trabalho termina numa afirmação em vez de num resultado.

### 4.5 — pgvector e embedding local sob 1,3 GB livres

A F5 assume Bumblebee/EXLA rodando o modelo de embedding no próprio nó, e pgvector no
Postgres local. Nesta máquina as duas premissas são frágeis (seção 3). Decidir agora,
enquanto é barato, a alternativa declarada: pgvector por instalador/compilação vs. adiar a
F5 para outra máquina; embedding local vs. serviço por chamada (o próprio documento já
admite a alternativa por serviço na tabela de riscos). **A F5 é a única fase cujo risco é de
ambiente, não de projeto** — e é a que dá para blindar antes de escrever qualquer código.

### 4.6 — Idioma e nomenclatura

A fábrica inteira é PT-BR (arquivo, símbolo, texto de UI, mensagem de erro). A v2 herda
isso: `Fabrica.Tarefa`, `Fabrica.Portao`, `Fabrica.Operario`. Não é preferência estética —
é o que mantém o vocabulário do TCC e o do código sendo o mesmo vocabulário. Registrar como
decisão para não ser reaberto na primeira tarefa.

---

## 5. Uma coerência conferida, e uma a esclarecer

Os documentos **não contradizem** `DECISOES_FECHADAS.md` — conferido item a item. Em
particular, "cortar agente em voo por custo" está fora de escopo nos dois, pelo mesmo
motivo (interromper no meio paga igual e não entrega nada).

Um ponto que parece contradição e não é, mas precisa ficar explícito no texto: a seção do
painel promete "parar custa um botão", e o escopo exclui corte por estouro. São coisas
diferentes — **parada manual pelo operador** contra **corte automático por orçamento**. Vale
uma frase no documento, porque um leitor de banca vai cruzar as duas.

---

## 6. Sequência sugerida a partir daqui

1. ~~Fechar as decisões 4.1 e 4.2~~ — **feito em 2026-08-28**; ver as duas seções.
2. Alinhar Elixir/OTP e provar pgvector nesta máquina (4.5). É trabalho de ambiente, custa
   pouco e desarma o maior risco não-técnico.
3. Declarar a linha de base de medição (4.4) a partir dos 139 jobs já gravados — de graça.
4. Só então planejar: as 6 fases já existem no documento e são boas; o que o planejamento
   acrescenta é a decomposição em tarefas do protocolo, com critério executável, dentro do
   próprio formato da fábrica.

**Nota sobre o item 4:** a v2 é candidata natural a ser construída PELA v1 — é o teste mais
duro que a fábrica pode receber, e é material de TCC por si só. Mas é decisão à parte, e
depende de 4.3.
