# Plano da v2 — versões incrementais e handoff de máquina

**Escrito em 2026-08-28.** Este é o documento de onde a implementação começa.

> **Isto é planejamento. Nenhuma linha da v2 foi escrita.** O que existe hoje é: a
> documentação do TCC (nos `.docx`), a análise que a confronta com a v1 real
> (`MIGRACAO_V2.md`), as decisões fechadas (`DECISOES_FECHADAS.md`) e um ambiente provado
> nesta máquina (`AMBIENTE_V2.md`). A v2 em si é um diretório vazio.

---

## 1. Onde cada coisa mora

Quatro documentos, quatro perguntas. Não os confunda:

| documento | responde | quando ler |
|---|---|---|
| `.docx` da raiz (`-7`, e `-3-completo` no histórico) | **o que a v2 é** — arquitetura, tese, justificativa de cada escolha | antes de discutir desenho |
| `_sistema/MIGRACAO_V2.md` | **o que a doc não sabe** — a v1 medida, os 19 mecanismos não documentados, a economia real | antes de planejar qualquer fase |
| `_sistema/DECISOES_FECHADAS.md` | **o que não se reabre** | antes de propor mudança |
| **este arquivo** | **em que ordem construir, e o que cada versão entrega** | ao começar a implementar |
| `_sistema/AMBIENTE_V2.md` | **o que instalar, e as armadilhas** | ao montar a máquina |

---

## 2. O requisito que você acabou de acrescentar

> *"gostaria que fosse leve e rodasse em qualquer computador médio"*

Isto não é preferência — é **restrição de arquitetura**, e ela resolve a última pergunta que
estava em aberto. Fica assim:

**Perfil alvo declarado:** roda em **8 GB de RAM e 4 núcleos**; confortável em 16 GB.
Desenvolver na máquina forte é ótimo; **depender dela, não.**

O que foi medido pesa pouco, e isso já está provado (`AMBIENTE_V2.md`):

| peça | custo em memória |
|---|---|
| BEAM (Elixir/OTP) | dezenas de MB; processos custam quilobytes |
| PostgreSQL 18 | ~100–200 MB de working set |
| pgvector + índice HNSW (20k × 384 dim) | **medido: praticamente zero** (1,45 → 1,43 GB livres) |
| **modelo de embedding local (Bumblebee/EXLA)** | **centenas de MB a GB — é a única peça pesada do desenho inteiro** |

### Decisão que segue disso: o embedding também vira adaptador

Mesmo padrão já aprovado para o operário. Um `behaviour` `Fabrica.Embedder`:

| adaptador | o que faz | quando |
|---|---|---|
| `Embedder.Falso` | vetores determinísticos por hash — sem rede, sem modelo, sem custo | **v0.1**, e é o que a suíte usa para sempre |
| `Embedder.Servico` | uma chamada HTTP devolve o vetor | **v0.5**, padrão em máquina modesta |
| `Embedder.Local` | Bumblebee + modelo pequeno (384 dim), rodando no nó | **v0.5** — o padrão, **se a medição da T-042 mostrar que cabe** |

E a consequência que garante o requisito: **nenhuma versão anterior à v0.5 carrega modelo
nenhum**, e a v0.5 escolhe o adaptador **por medição** (T-042: disco, memória residente e
tempo por 1.000 trechos, medidos antes de decidir). Assim a v1.0 roda num computador médio,
e a máquina forte serve para ir mais rápido, não para viabilizar.

> **A v0.5 está no escopo firme** da entrega (decisão de 28/08). Ela deixou de ser opcional;
> o que ficou aberto é só qual adaptador de embedding vira o padrão.

> Isto **preserva a tese do TCC**, não a enfraquece: a Parte VI argumenta que os dois índices
> respondem perguntas diferentes e que o semântico é o caro e aproximado. Torná-lo opcional
> e plugável é o argumento levado a sério.

---

## 3. As seis versões

Cada versão é **usável** — não é "porcentagem de conclusão". A partir da **v0.3** você já tem
uma fábrica que produz software de verdade.

A coluna "da v1" é o que o `MIGRACAO_V2.md` (seção 3) achou no código e não está nos `.docx`.
Sem ela, a v2 nasce com arquitetura melhor e operação mais frágil que hoje.

---

### v0.1 — A fundação que se prova sozinha
**O que você consegue fazer:** nada de fábrica ainda. O que existe é um projeto que compila,
testa e sobe o banco — **sem tocar a rede e sem gastar cota**.

- projeto Phoenix + Ecto; migrações do esquema (projetos, tarefas, ciclos, despachos, custos)
- `behaviour Fabrica.Operario` + `Operario.Falso`
- `behaviour Fabrica.Embedder` + `Embedder.Falso`
- suíte ExUnit, Credo, Dialyzer, CI local
- **da v1:** contabilidade em **duas unidades** (cota consumida *e* dólar-equivalente) —
  a v1 só tem a segunda; **backup/dump do banco** — na v1 o git cobria isso de graça

> **Marco:** `mix test` roda a suíte inteira sem rede, sem cota e sem chave de API.
> ~8–10 tarefas. **É a fase que dá vontade de pular e a que sustenta as outras cinco.**

---

### v0.2 — Um agente faz uma tarefa
**O que você consegue fazer:** despachar **um** agente contra **uma** tarefa real e ver o
custo discriminado volta a volta.

- o laço de tool use como processo supervisionado
- as ferramentas com confinamento (ler, escrever, editar, rodar comando, buscar)
- `Operario.ClaudeCLI` (padrão de operação, roda na assinatura) e `Operario.MessagesAPI` (Req)
- montagem do prefixo: doutrina + índice denso + ferramentas, byte a byte estável
- **da v1:** `orcamentoDeFerramentas`/`limiarDeDebate` (teto de chamadas por papel, medido
  sobre 135 etapas reais) · `guarda-processos` e `guarda-ferramental` **como implementação
  da ferramenta**, não como validação de string · `semCabecalhoVolatil` no montador do prefixo

> **Marcos (dois):**
> 1. um agente resolve uma tarefa real de ponta a ponta, com custo por volta gravado;
> 2. **o prefixo do projeto é escrito UMA vez e lido pelos despachos seguintes**, provado por
>    `cache_read_input_tokens`.
>
> O segundo é o que decide se o `MessagesAPI` se justifica — é ~50% da conta de entrada
> (medido). ~10–12 tarefas.
>
> **Marco 1: REPROVADO em 2026-09-01** (T-020, ciclo 3). Três causas raiz independentes,
> medidas contra o `claude` real por `priv/probes/marco_v02_agente.exs`. A terceira afirmação
> do marco — contabilidade volta a volta — passou (95558 = 95558); o agente **não resolveu a
> tarefa**. A causa nº 2 não é defeito, é uma incompatibilidade de projeto: o `Laco` supõe um
> operário que devolve `tool_use` para a FÁBRICA executar, e `claude --print` é um agente
> completo, com laço, ferramentas e permissões próprios. Ver T-020 e o replanejamento.
>
> **Marco 2: BLOQUEADO** — não há `ANTHROPIC_API_KEY` nesta máquina.

#### O replanejamento de 01/09 — as três causas, e o pedido de escopo do mesmo dia

O marco 1 reprovou com **três causas independentes**, medidas contra o `claude` real. A nº 2
não é defeito de implementação: é **incompatibilidade de projeto**, e é ela que organiza tudo
o mais.

| # | causa | onde | tarefa |
|---|---|---|---|
| 1 | o `ClaudeCLI` nunca passa flag de modo de permissão. Em `--print` headless não há quem aprove, então **toda escrita de arquivo é negada** — bloqueia qualquer tarefa real, não só esta | `operario/claude_cli.ex` | **T-018c** |
| 2 | o modelo de ferramentas do `Laco` (dispatch por nome, num mapa que o CHAMADOR registra) é estruturalmente incompatível com o CLI, cujo vocabulário de `tool_use` vem de DENTRO (Write, Bash, Edit, Read…) | a fronteira `Operario` + `agente/laco.ex` | **T-003a** |
| 3 | `montar/1` calcula `motivo_parada` olhando TODOS os blocos do stream inteiro, e não só o último turno — um `tool_use` já resolvido pelo próprio CLI aparece ao `Laco` como ferramenta pendente | `operario/claude_cli.ex` | **T-018e** |

Consertar 1 e 3 antes de decidir 2 é jogar conserto fora: a 3 muda de forma conforme a
família (ver abaixo), e a 1 precisa saber qual vocabulário de ferramenta o CLI vai receber.

**O pedido de escopo do Enzo (01/09):** a camada de operário deve ser **opcional e trocável** —
Claude por assinatura (CLI), Claude por API, e mais adiante outras assinaturas e outros CLIs
cobrados por token, a critério do usuário. *"algo genérico ou o mais perto disso sem perder o
desempenho, abrangindo só pro claude assinatura por agora"*. Isto é a causa 2 vista do outro
lado, e por isso entra no mesmo replanejamento. As duas famílias:

| família | exemplo | quem roda o laço de ferramentas | governança por |
|---|---|---|---|
| **agente completo** | `claude --print`, outros CLIs | o próprio CLI | flags: permissão, ferramentas permitidas, diretório, teto de turnos |
| **endpoint de modelo** | Messages API, outras APIs por token | a fábrica (`Agente.Laco`) | as ferramentas da fábrica (T-012 a T-017) |

**O que fica FORA, por decisão:** registro de provedores, negociação de capacidades, plugins,
adaptadores para provedores que ninguém pediu. Só Claude-assinatura agora. **A régua:**
acrescentar um provedor depois é *escrever um adaptador e declará-lo* — nunca mexer no miolo. A
T-003a tem critério de aceite que PROVA isso, com um adaptador de cada família definido só no
teste, conduzido pelo `Laco` sem uma linha alterada em `lib/`.

#### Decisão em aberto (é do Enzo): como a fronteira acomoda as duas famílias

**A — uma fronteira, duas famílias declaradas.** `Fabrica.Operario` ganha `familia/0`
(`:agente_completo | :endpoint_de_modelo`), e o `Laco` ramifica **uma vez**, no despacho da
volta: família endpoint segue idêntica ao que existe hoje; família agente-completo faz uma
volta, não executa ferramenta nenhuma e lê o desfecho da resposta.
*Custa:* 1 tarefa de desenho, mais uma linha em cada adaptador que divergir do padrão.
**Nenhuma ida a mais ao modelo** — a ramificação é uma função pura em Elixir — e **nada de
prefixo novo**: ao contrário, a família agente-completo deixa de mandar a lista de ferramentas
da fábrica, que hoje viaja sem uso.
*Perde:* o `Laco` deixa de ter um caminho só; passam a existir dois, e os dois precisam de
teste. E a contabilidade "por volta" degenera para "por sessão" na família agente-completo
(ver os marcos, abaixo).

**B — dois contratos separados.** `Fabrica.Operario` fica sendo só endpoint; nasce um contrato
próprio para CLIs, e quem despacha escolhe o caminho.
*Custa:* 2–3 tarefas. O `ClaudeCLI` deixa de ser `Operario`, e `Operario.configurado/0`, o
`Falso`, o `Laco` e os testes do marco da v0.1 mudam junto.
*Ganha:* nenhuma ramificação dentro do laço; cada contrato com o vocabulário exato do que faz.
*Perde:* a fronteira COMUM onde as duas famílias são comparáveis — que é o miolo do marco 2 e
do argumento de custo do TCC. A Parte VI defende **uma** fronteira separando governança de
fornecedor; dois contratos enfraquecem exatamente essa tese.

**C — fazer o CLI parecer um endpoint** (desligar as ferramentas dele e obter `tool_use` para a
fábrica executar).
*Custa:* alto, e provavelmente impossível: `claude --print` não oferece modo "proponha a
ferramenta e pare". Seria preciso combinar por convenção de prosa e reparsear — reimplementar
`tool use` por texto.
*Perde:* tudo que o CLI faz bem (o laço, o cache, o retry dele) em troca de um parser frágil.
**Não recomendada**; está listada porque é a única que preservaria o `Laco` intacto, e é bom
que esteja escrito por que isso não compensa.

**D — MCP: a fábrica serve as PRÓPRIAS ferramentas ao CLI.** É uma escolha *dentro* da A, e não
uma alternativa a ela. O CLI continua rodando o laço, mas as ferramentas que ele chama são as
da fábrica (`ler`, `escrever`, `editar`, `rodar`, `registrar_resultado`), servidas por um
servidor local, com as nativas desligadas.
*Custa:* 1–2 tarefas além da A, e uma peça a mais no caminho quente (um processo por sessão),
cujo desempenho precisa ser medido.
*Ganha, e é muito:* o confinamento da T-012 e o orçamento da T-017 continuam valendo
**literalmente**, porque quem executa a ferramenta volta a ser a fábrica — inclusive `rodar`,
que é o buraco que a auditoria por caminho não cobre (comando de shell não se audita por
parsing). E `registrar_resultado`, a única forma de o agente reportar, volta a existir sob o
CLI.
*Perde:* depende de o CLI instalado ter essa superfície — por isso D só é decidível **depois**
da medição da T-018b.

> **Recomendação: A agora; D se a T-018b disser que cabe.** A é o menor desenho que resolve a
> causa 2 e atende o pedido de escopo sem generalidade especulativa. Se D for viável, ela entra
> como tarefa a mais **sem tocar no desenho da A** — o que é, ele próprio, o teste da régua
> "acrescentar provedor não mexe no miolo". Se não for, a governança fica pela via da
> T-012a/T-017a (flags + auditoria do stream), que é mais fraca, e o que ela não cobre está
> escrito lá.

**Sobre `--dangerously-skip-permissions`:** ela não é aceita como resposta. A T-018b mede quais
modos de permissão existem na versão instalada e qual o mínimo que faz uma escrita passar. Se a
medição mostrar que a flag ampla é a única que funciona, ela só entra acompanhada da T-012a, que
tem de PROVAR contra o `claude` real que uma sessão mandada escrever fora da raiz não consegue —
e, onde a prevenção não alcançar, uma auditoria que reprova o despacho com o mesmo
`Confinamento.resolver/2` que já governa a família endpoint. Confinamento é propriedade de nível
de marco neste projeto: a v0.1 provou ausência de rede com esse rigor.

#### O que isso muda no enunciado dos marcos (proposta — os enunciados não foram alterados)

**Marco 1.** Hoje: *"um agente resolve uma tarefa real de ponta a ponta, com custo por volta
gravado"*. Sob a família agente-completo, **uma volta do laço é uma sessão inteira do CLI** —
"uma linha por volta" vira "uma linha por sessão", e a afirmação *"a soma bate com o total"* fica
verdadeira com N=1. Foi literalmente o que a medição de 01/09 mostrou: 1 volta, 95558 = 95558,
as duas afirmações PASSARAM. Duas saídas, e a escolha é do Enzo:
  1. **aceitar**, e o marco passa a dizer que a prova forte de custo volta a volta pertence à
     família endpoint (marco 2 e v0.3);
  2. **manter os dentes**: o `ClaudeCLI` emite uma linha de consumo por **turno interno** do CLI
     — o `usage` de cada evento `assistant` já vem no stream e hoje é descartado. Custa **1
     tarefa a mais (~45–60 min)** e um campo novo na `Resposta`.
  Recomendo (2) se o TCC for citar o número por volta; (1) se não for.

**Marco 2.** No mérito, **não muda**: ele é da família endpoint por construção, e o `ClaudeCLI`
nunca poderia prová-lo — o CLI gerencia o cache sozinho e não expõe controle ponto a ponto
(decisão já fechada). O que a reprovação do marco 1 esclarece é que **os dois marcos medem
famílias diferentes e não se substituem**. Proposta de redação, para a v0.2 poder fechar sem
ficar refém de uma chave que não existe nesta máquina:
  - **2a, provável sem chave e sem gastar:** o prefixo é byte a byte estável e o `MessagesAPI`
    posiciona os pontos de cache que o `Prefixo` marca (`mix test`);
  - **2b, a medição paga:** exige `ANTHROPIC_API_KEY`, continua bloqueada, teto de US$ 2 já
    autorizado. Fica declarada pendente em vez de reprovada.

#### As dez tarefas da correção

Vivem em `_sistema/v2/tarefas/`, com sufixo de letra na tarefa de origem do defeito — como as
T-018a, T-020a e T-022a, elas não entram no `ROTEIRO.md`, que indexa o plano original.

| tarefa | entrega | depende de | esforço |
|---|---|---|---|
| **T-018b** | mede a superfície de governança do `claude --print` real: flags que existem, o que faz uma escrita passar, se o vocabulário se restringe, se o diretório confina, o teto de turnos, a forma do stream e o prompt por `stdin`. **Fundação: instrui as outras nove** | T-018a | 60–90 min |
| **T-003a** | causa 2: a fronteira declara a **família** e o `Laco` para de executar ferramenta que não é dele | T-018b | 60–90 min |
| **T-018c** | causa 1: modo de permissão e tradução `Catalogo` → vocabulário do CLI, por papel | T-018b, T-003a | 60–90 min |
| **T-013a** | `Comando` sabe alimentar `stdin` a partir de arquivo, sem interpolar nada na linha | T-018b | 30–45 min |
| **T-018d** | o prompt sai da linha de comando do `ClaudeCLI` — sem isso, nenhuma tarefa real cabe | T-013a, T-018c | 45–60 min |
| **T-018e** | causa 3: `motivo_parada` sai do evento terminal, não do stream inteiro | T-003a, T-018b | 30–45 min |
| **T-012a** | o confinamento do CLI é **provado**, não presumido | T-018c | 60–90 min |
| **T-017a** | o teto de voltas é imposto pelo CLI, e não pedido no prompt | T-018c, T-018e | 45–60 min |
| **T-017b** | o orçamento de ferramentas conta as chamadas que o CLI fez | T-003a | 30–45 min |
| **T-020b** | o probe do marco roda verde de ponta a ponta, e o desenho novo vai para o `PROGRESSO.md` | as anteriores | 45–60 min |

**Total: ~7,5 a 11 horas de agente.** A conta cresceu, e vale dizer de onde: **quatro** tarefas
são o conserto do marco (as três causas mais o prompt), **uma** é a medição que instrui as
outras, **três** são a governança que a mudança de família obriga a reconstruir do lado do CLI
(confinamento, teto, orçamento) e **duas** são encaixe e fechamento. O pedido de escopo não
acrescentou tarefa própria — ele reaproveitou a T-003a, que a causa 2 exigia de qualquer jeito.

**Três armadilhas de cache que a v1 não consegue nem enxergar** (referência conferida):
janela de **20 blocos** para trás; mínimo cacheável **por modelo** (512 no Opus 5, **4096 no
Haiku 4.5**, e o verificador roda em Haiku); requisições paralelas idênticas não compartilham
cache. Some a alavanca nova: **mensagem de sistema no meio da conversa**, que injeta
instrução por tarefa sem invalidar o prefixo.

---

### v0.3 — A linha de produção (uma tarefa por vez)
**O que você consegue fazer:** dar um pedido e ver a tarefa percorrer os seis estados, ser
reprovada, retrabalhada e concluída — sozinha. **Aqui a v2 vira uma fábrica.**

- os seis estados, cada transição numa transação (estado + relatório + custo, juntos ou nada)
- os dois portões, com quem verifica e quem revisa **sem a ferramenta de corrigir**
- limite de 3 ciclos; a escada: sobe modelo → troca especialista → replaneja → bloqueia
- `registrar_resultado` como **a única** forma de o agente reportar; o contador é do sistema
- equipe sob demanda (`equipe.json` vira dado versionado no banco)
- geração do markdown a partir do banco, commitado
- **da v1, e é aqui que ela é mais rica que a doc:**
  - **`diagnostico.ts` inteiro** — classifica *por que* voltou e deriva política (modelo, teto
    de voltas, escopo, bloco de foco com os achados nomeados). A escada da doc é mais grossa
  - `criterios.ts` — `ClasseFalha` (distingue "o comando está quebrado" de "a entrega falhou"),
    `criterioDaSuite` (o critério implícito que não está escrito em tarefa nenhuma), allowlist
    de binários, `reexecucoesPorAmbiente`
  - `orcamento.ts` — teto **por tarefa** e autocalibragem pelo custo medido no próprio job
  - `lerImpedimento` — o construtor pode declarar impedimento em vez de fingir entrega
  - **importador das 89 tarefas vivas**, com critério executável (reimportar duas vezes dá o
    mesmo estado)

> **Marco:** uma tarefa percorre os seis estados, reprova **de propósito**, é retrabalhada e
> conclui — com tudo registrado. ~12–15 tarefas. **É a maior das seis.**

---

### v0.4 — A fábrica que aguenta queda
**O que você consegue fazer:** rodar três tarefas ao mesmo tempo, matar uma no meio e ver as
outras seguirem — e a morta voltar para a fila.

- árvore de supervisão; cada tarefa em voo é um processo com endereço e dono
- Oban: enfileirar e mudar estado **na mesma transação**
- teto de orçamento com parada limpa (impede *começar*, nunca corta no meio)
- `areas` como exclusão mútua **verificada pelo motor**, não confiada ao texto do despacho
- **da v1:** **a parede de cota** (`ehLimiteDeUso`, `horaDeReabertura`, rearme) — ausente da
  documentação inteira e **estrutural sob assinatura** · recuperação pela árvore git
  (`temTrabalhoParcial`) · a regra de que requisições paralelas idênticas não compartilham cache

> **Marco:** três tarefas em paralelo; matar o processo de uma não afeta as outras duas, e ela
> volta à fila. ~8–10 tarefas.

---

### v0.5 — A fábrica que lembra
**O que você consegue fazer:** o agente começa a tarefa já sabendo "isto foi decidido assim,
por este motivo" — em vez de decidir de novo, às vezes ao contrário.

- indexação ao commitar, fora do caminho quente
- busca **híbrida**: vetor + termo exato, fundidos por posto recíproco (RRF, k=60)
- o bloco de contexto com a fonte citada
- `Embedder.Servico` e `Embedder.Local` (seção 2)
- **da v1:** porte do gerador do índice denso (determinístico, sem modelo, ~5% do tamanho
  do fonte)

> **Marco:** num projeto com histórico, o agente cita a decisão anterior em vez de decidir de
> novo. T-042 … T-048.
>
> **A consulta SQL desta fase já foi provada rodando** nesta máquina, com dado de verdade
> (`AMBIENTE_V2.md`, seção 4).

---

### v1.0 — A fábrica completa
**O que você consegue fazer:** dar um pedido e acompanhar na tela um projeto inteiro sendo
planejado, construído, verificado, revisado e entregue — sem intervenção.

- painel em LiveView sobre o **mesmo** banco e o mesmo barramento de eventos do motor
- telemetria por despacho; o que está em voo é consulta ao registro de processos
- a trilha genérica (não-software) com a escada de prova e o **rótulo obrigatório** de grau
- proporção de critérios `julgados` visível por projeto
- **da v1:** **o piloto automático** (encadeia rodadas até um critério de parada, com teto de
  gasto e de rodadas) · o motor de CI com detecção de ecossistema · `varrerRepo` (segredos
  antes de publicar)

> **Marco:** um projeto inteiro é planejado, construído e entregue sem intervenção, com o
> custo acompanhado na tela. ~12–15 tarefas.

---

**Total: 58 tarefas**, decompostas e escritas — não estimadas. Estão em
`_sistema/v2/tarefas/`, uma por arquivo, no formato do protocolo da fábrica, com objetivo,
contexto (o "como fazer", com as armadilhas já mapeadas) e critérios de aceite executáveis.

O índice linear, com as dependências, é `_sistema/v2/ROTEIRO.md`. Ele e as tarefas saem do
mesmo gerador (`_sistema/v2/gerar-tarefas.py`), então não podem divergir — e o gerador
**nunca sobrescreve tarefa já executada**, porque estado não se regenera.

**Para começar numa máquina nova**, cole `prompt_inicial.txt` (na raiz) numa sessão nova do
Claude Code: ele explica o projeto, a ordem de leitura, o loop de execução e as regras que
não se negociam.

---

## 4. Trocar de máquina

### O que NÃO transfere
Tudo em `AMBIENTE_V2.md` foi montado **neste notebook**. Instalação não se copia: o novo PC
precisa da sua.

### O que transfere, e é o que vale
O **conhecimento e os scripts**, todos versionados neste repositório:

| | |
|---|---|
| `_sistema/ferramentas/instalar-pgvector.ps1` | compila e instala pgvector com MSVC, reproduzível |
| `_sistema/ferramentas/banco-v2.ps1` | `subir` / `derrubar` / `estado` / `conferir` |
| `AMBIENTE_V2.md` §5 | **seis armadilhas** que já custaram tempo — leia antes, não depois |

### Ordem no PC novo

1. **Erlang/OTP 29** — instalador oficial.
2. **Elixir 1.20.x, o build do OTP 29.** Baixe `elixir-otp-29.zip` da release, confira o
   `.sha256sum`, extraia e ponha no PATH. **Não pegue o build de outro OTP** — foi exatamente
   o descasamento encontrado aqui.
3. **PostgreSQL 18** — instalador oficial. Depois **confirme que existe `lib\postgres.lib` e
   que o cluster foi inicializado**: a instalação deste notebook respondia a `psql --version`
   com a árvore quebrada e sem cluster nenhum.
4. **Visual Studio Build Tools, workload C++** — só para compilar o pgvector.
5. `instalar-pgvector.ps1 -PgRoot <sua raiz> -Versao v0.8.6`
6. `banco-v2.ps1 conferir` — se imprimir `pgvector operante`, o ambiente está pronto.
7. **Claude Code CLI** autenticado — é o `Operario.ClaudeCLI`, o padrão de operação.

Com mais RAM, duas coisas mudam: `shared_buffers` e `maintenance_work_mem` do Postgres podem
subir, e o `Embedder.Local` passa a ser viável. **Nada disso é requisito** — é conforto.

---

## 5. As decisões, fechadas

Todas em `DECISOES_FECHADAS.md` com o motivo. Não se reabrem sem fato novo.

| decisão | fechada em 28/08 |
|---|---|
| **Quem constrói** | O **Claude Code direto**, uma sessão por tarefa — é para isso que as 58 tarefas foram escritas. Não pela v1: amarraria o cronograma à estabilidade de um sistema com 89 tarefas vivas, e os agentes dela são calibrados para a doutrina dela, não para Elixir. |
| **Onde nasce** | **`projetos/fabrica-v2/`** — repositório git próprio, como todo projeto da fábrica, já fora do `.gitignore` da raiz. A v1 fica **intocada** operando os 3 projetos atuais. |
| **v0.5** | **Escopo firme.** Deixou de ser opcional. O que continua aberto é só qual adaptador de embedding vira o padrão — e isso se decide **com medição**, na T-042. |
| **Linha de base** | Extraída dos 139 jobs da v1 na **T-008**, antes de qualquer código, e de graça. Sem ela o TCC fecha numa afirmação em vez de num resultado. |

**Uma possibilidade que ficou registrada e não escolhida:** a partir da v0.3 a v2 já é uma
fábrica funcionando, e poderia construir as próprias funcionalidades restantes. É a narrativa
mais forte possível para a banca — o sistema provando a tese sobre si mesmo. Não foi escolhida
agora porque a v2 na v0.3 é nova e não provada. **Reabrir depois do marco da v0.3**, como
experimento declarado e com volta atrás fácil.

---

## 6. O planejamento não para na primeira tarefa

As 58 tarefas foram escritas de uma vez, em 28/08/2026, antes de existir uma linha de código.
As da v0.1 e v0.2 envelhecem pouco porque são executadas logo. **As demais serão executadas
semanas ou meses depois, sobre um código que já tomou decisões que o planejamento não podia
prever** — e tarefa escrita com meses de antecedência envelhece.

O jeito errado de lidar com isso é descobrir na hora da implementação, tarefa a tarefa,
improvisando. Por isso cada versão a partir da v0.3 abre com uma **tarefa de abertura**, que
não escreve código de produção nenhum:

| tarefa | o que ela confere antes de a versão começar |
|---|---|
| **T-021** abertura da v0.3 | o esquema real do banco contra o que as tarefas assumem · a forma do estado do laço · o veredito do marco da v0.2 sobre o `MessagesAPI` · **abrir o código da v1 que vai ser portado, antes de portar** · se os números medidos da v1 ainda valem |
| **T-035** abertura da v0.4 | os custos que a v0.3 mediu de verdade contra os defaults do plano · **se o paralelismo acontece de fato** (na v1, o 3-wide não ocorreu uma vez em 43 rodadas) · a API atual do Oban · o formato da mensagem de cota · o **pico real de memória**, que decide o limite de concorrência |
| **T-042** abertura da v0.5 | o pgvector ainda de pé · **medir o modelo local** (disco, memória residente, tempo por 1.000 trechos) antes de escolher local vs. serviço · se há corpus suficiente para indexar |
| **T-049** abertura da v1.0 | o que o banco **realmente grava** contra o que as telas assumem · a API atual do LiveView · escolher o projeto da trilha genérica · **reextrair a linha de base** se a v1 continuou rodando |

Cada uma termina registrando em `_gestao/PROGRESSO.md` **o que foi ajustado e por quê** — e
"conferido, nada divergiu" também é registro. Um ajuste sem justificativa é indistinguível de
um desvio do plano, e é exatamente isso que a banca vai perguntar.

---

## 7. Onde o planejamento fica visível, do começo ao fim

Para quem for auditar o trabalho — inclusive o professor:

| o quê | onde |
|---|---|
| A arquitetura, como apresentada | os `.docx` da raiz (`-7` completo, 8 partes, 21 figuras) |
| A análise que confronta a doc com a v1 real | `_sistema/MIGRACAO_V2.md` |
| As decisões, com o motivo e o que as provocou | `_sistema/DECISOES_FECHADAS.md` |
| O plano em versões incrementais | este arquivo |
| O ambiente, com as armadilhas medidas | `_sistema/AMBIENTE_V2.md` |
| As 58 tarefas, e o estado de cada uma | `_sistema/v2/tarefas/` e `_sistema/v2/ROTEIRO.md` |
| O que foi ajustado no meio do caminho | as tarefas de abertura + `_gestao/PROGRESSO.md` |
| O progresso | o `status:` de cada tarefa e o histórico de commits (`T-NNN: título`) |
| O resultado, contra a linha de base | `_gestao/ENTREGA.md` (T-058) |

**Tudo isso é anterior à primeira linha de código e está versionado em git com data.** É essa
sequência — planejar, medir, decidir com o motivo registrado, executar, e reconferir o plano
a cada versão — que torna o desenvolvimento defensável, e não só o resultado final.
