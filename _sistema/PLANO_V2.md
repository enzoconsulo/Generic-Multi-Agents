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
