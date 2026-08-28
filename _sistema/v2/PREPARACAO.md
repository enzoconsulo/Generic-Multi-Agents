# Preparação para executar a v2 — auditoria desta máquina

**Escrita em 2026-08-28**, antes da T-001, a partir de `prompt_inicial.txt`.
Este arquivo é o estado REAL desta máquina e o que falta decidir. Ele existe porque o
loop de execução manda `/clear` entre tarefas: análise que fica só na conversa morre.

> ## ESTADO: ambiente MONTADO e provado — 2026-08-28
>
> `banco-v2.ps1 conferir` imprime **`pgvector operante`**. A T-001 está desbloqueada.
>
> O que ficou montado está registrado em **`_sistema/AMBIENTE_V2.md`, seção 0** — que é o
> lugar que dura. As seções 2 a 4 deste arquivo viraram histórico do que foi encontrado;
> a seção 5 (defeitos) e a 6 (ajustes de contexto) continuam VALENDO e ainda não foram
> executadas.
>
> | passo | estado |
> |---|---|
> | Elixir/OTP | **decidido ficar no OTP 28.1 / Elixir 1.19.4** (par casado; ver AMBIENTE_V2 §0) |
> | PostgreSQL 18.4 em `C:\pgsql\18` | ✅ árvore completa, `lib\postgres.lib` conferido |
> | cluster em `C:\pgsql\dados` | ✅ `initdb` + `listen_addresses='127.0.0.1'`, sem BOM |
> | pgvector 0.8.6 | ✅ compilado com MSVC 19.51, `CREATE EXTENSION vector` feito |
> | `banco-v2.ps1 conferir` | ✅ **`pgvector operante`** |
> | `phx_new` | ✅ 1.8.13 |
> | defeitos 5.1 e 5.2 | ✅ corrigidos no gerador, 5 tarefas regeradas |
> | defeito 5.3 (T-034) | ✅ decidido **(a)** — criterio mantido; **copiar `projetos/` da máquina 1 antes da v0.3** |

---

## 1. Em uma frase

Vamos construir, em Elixir/OTP, uma fábrica de software multi-agente que recebe um pedido
em linguagem natural e entrega o projeto inteiro sozinha — movendo para o compilador, para
a árvore de supervisão e para o esquema do banco toda a governança que hoje, na v1, é frase
imperativa dentro de um prompt.

---

## 2. Esta NÃO é a máquina do `AMBIENTE_V2.md`

O `AMBIENTE_V2.md` foi montado e provado em outro notebook (7,9 GB de RAM, `C:\Users\enzoc\`).
Esta é `C:\Users\enzoconsulo\`, com 16 GB. É exatamente o caso previsto na seção 4 do
`prompt_inicial.txt`: *"se esta é uma máquina nova, o ambiente não veio junto"*.

| peça | `AMBIENTE_V2.md` diz | esta máquina tem | |
|---|---|---|---|
| Erlang/OTP | **29** (erts 17.0.1), `C:\Program Files\Erlang OTP` | **28.1** (erts 16.1), `~\.elixir-install\installs\otp\28.1` | ⚠️ |
| Elixir | **1.20.0**, build do OTP 29, `C:\elixir\1.20.0-otp-29` | **1.19.4**, build do OTP 28, `~\.elixir-install\...\1.19.4-otp-28` | ⚠️ |
| PostgreSQL | 18.4 em `C:\pgsql\18` | **ausente** — `C:\pgsql` não existe, nada em `Program Files`, nada na 5432 | ❌ |
| cluster | `C:\pgsql\dados` | **ausente** | ❌ |
| pgvector | 0.8.6 compilado | **ausente** | ❌ |
| MSVC / workload C++ | VS 2019 BT (19.29) | **VS 2026 Build Tools 18.7.3**, com `VC.Tools.x86.x64` | ✅ |
| `phx_new` | — | **ausente** (só `hex-2.3.1-otp-28` em `~/.mix/archives`) | ❌ |
| git · node · python · Claude CLI | — | 2.52.0 · v24.18.0 · 3.14 · autenticado | ✅ |
| RAM / núcleos / disco | 7,9 GB · — · — | **15,98 GB (9,6 livres)** · 4 núcleos · 45,4 GB livres | ✅ |
| `painel/dados/` | existe na máquina da v1 | **ausente** (é gitignored — esperado) | ⚠️ T-008 |
| `projetos/` | — | **ausente** (gitignored — esperado; a T-001 cria) | ✅ |
| git da raiz | — | limpo, `master`, `8d095a5` | ✅ |

**Correção importante ao ler a armadilha do `AMBIENTE_V2.md` §2:** o problema de lá era
**descasamento** (Elixir compilado para OTP 28 rodando sobre OTP 29). Aqui **não há
descasamento** — 1.19.4-otp-28 sobre OTP 28.1 é o par casado. O que há é um par mais VELHO
que o documentado. São problemas diferentes e a gravidade é outra.

---

## 3. Bloqueios até a T-001, em ordem

Nada de v2 roda antes disto. Estimativa: 1h–1h30, quase tudo download e compilação.

| # | passo | por quê | risco |
|---|---|---|---|
| 1 | (decisão A) Erlang/OTP 29 + Elixir 1.20.0-otp-29 | alinhar com o documento | baixo |
| 2 | PostgreSQL 18 → **`C:\pgsql\18`**, cluster → **`C:\pgsql\dados`** | `banco-v2.ps1` tem esses caminhos FIXOS no corpo (linhas 31-32). Instalar em outro lugar obriga a editar o script | baixo |
| 3 | `initdb -D C:\pgsql\dados -U postgres -A trust -E UTF8 --locale=C`, `listen_addresses='127.0.0.1'` | é o que o `config/test.exs` da T-001 assume | baixo |
| 4 | `instalar-pgvector.ps1 -PgRoot 'C:\pgsql\18' -Versao v0.8.6` | não há binário oficial para Windows | **médio** — ver §4 |
| 5 | `banco-v2.ps1 conferir` → tem de imprimir `pgvector operante` | é o portão do ambiente | — |
| 6 | `mix archive.install hex phx_new` | a T-001 roda `mix phx.new`; o archive não está instalado | baixo |

**Não pule o passo 5.** A armadilha nº 6 do `AMBIENTE_V2.md` é exatamente esta: uma
instalação de Postgres quebrada responde normalmente a `psql --version`. Confira
`lib\postgres.lib` e a existência do diretório de dados, não o cliente.

**Por que o Postgres bloqueia já a T-001** (e não só a T-002): o alias `mix verificar` roda
`mix test`, e a suíte de um projeto Phoenix recém-criado executa `ecto.create` +
`ecto.migrate` no setup. Sem banco, o primeiro critério de aceite da T-001 não passa.

---

## 4. O único risco novo do passo 4: a versão do MSVC

O `AMBIENTE_V2.md` registra que o pgvector foi compilado com **MSVC 19.29** (VS 2019) contra
um `postgres.exe` da EDB compilado com **19.44** — mistura que **funciona**, mesma UCRT, e
isso está escrito lá porque *era risco real e foi conferido, não presumido*.

Aqui o compilador é **VS 2026 Build Tools (18.7.3)**, portanto ~19.5x. A distância é maior
que a registrada, mas na mesma direção e com a mesma UCRT. Precedente favorável, não prova.
Se o `CREATE EXTENSION vector` falhar por símbolo do runtime, a saída conhecida é instalar o
conjunto de ferramentas v14x (VS 2022) lado a lado — não há por que decidir isso antes de falhar.

---

## 5. Dois defeitos no plano, achados na conferência

O `prompt_inicial.txt` §5 é explícito: **critério errado não se reescreve sozinho, diz-se ao
Enzo.** Os dois são de redação, não de desenho, e os dois custariam ciclo depois.

### 5.1 — `prioridade/` deveria ser `priv/` (4 tarefas, todas `backlog`)

`priv/` é o diretório convencional do Elixir. `prioridade/` não é nada. O padrão é de uma
substituição acidental `priv` → `prioridade`, e a prova é que `priv/` sobreviveu certo em
T-002 (`priv/repo/migrations`) e T-037 — só as ocorrências fora de `priv/repo/` foram
atingidas. Não aparece em documento nenhum do sistema: só no gerador e nas tarefas que ele emitiu.

| onde | o que está escrito | deveria ser |
|---|---|---|
| T-006, texto e **critério de aceite** | `prioridade/backups/` | `priv/backups/` |
| T-008, **`areas:`** | `prioridade/linha-de-base/{extrair.exs,LINHA_DE_BASE.md}` | `priv/linha-de-base/...` |
| T-047, **`areas:`** | `prioridade/avaliacao/perguntas.exs` | `priv/avaliacao/perguntas.exs` |
| T-049, texto | `prioridade/linha-de-base/LINHA_DE_BASE.md` | `priv/linha-de-base/...` |

Origem: `_sistema/v2/gerar-tarefas.py`, linhas 331, 348, 391, 1875, 1949.
Conserto: editar o gerador e regerar as 4 tarefas — todas ainda `backlog`, então a regra
"o gerador nunca sobrescreve tarefa já executada" não atrapalha. Custo: minutos, hoje.

### 5.2 — T-042 cita a tarefa errada do importador

T-042 diz *"A T-032 importou as 89 tarefas da v1"*. O importador é a **T-033**; a T-032 é a
geração do markdown a partir do banco. Uma linha no gerador.

**5.1 e 5.2: CORRIGIDOS em 28/08.** Editado `gerar-tarefas.py` e regeradas T-006, T-008,
T-042, T-047 e T-049 (todas `backlog`, seções de execução vazias — nenhum estado perdido).
Diff conferido: **12 linhas ao todo, nada além do pretendido**; o `ROTEIRO.md` regerou
idêntico. Os arquivos saem do gerador com LF e o repositório usa CRLF — o `autocrlf` do git
normaliza, e por isso o `diff` cru mostra o arquivo inteiro enquanto o `git diff` mostra só
as linhas reais.

### 5.3 — DECIDIDO (a): a T-034 exige as 89 tarefas reais, e elas não vêm no clone

> ## AÇÃO PENDENTE, PARA ANTES DA v0.3
>
> **Copiar `projetos/` da máquina 1 para esta máquina antes de executar a T-033/T-034.**
>
> Decidido pelo Enzo em 28/08, saída **(a)**: o critério da T-034 fica **como está** — não
> foi reescrito. O que muda é operação, não plano. A **T-021** (abertura da v0.3) é o
> checkpoint natural para conferir se a cópia já foi feita; se não foi, a v0.3 não começa.

O critério NÃO foi corrigido, de propósito: é critério, e critério é a única coisa que o
construtor não pode consertar.

O 4º critério de aceite da **T-034 (MARCO da v0.3)** é:

> *"O importador traz as 89 tarefas reais da v1; o numero esta registrado em
> `_gestao/PROGRESSO.md`."*

E ele contradiz o `prompt_inicial.txt` §0, que diz: *"`projetos/` — os projetos da v1 são
repositórios próprios e estão no `.gitignore`. **Você não precisa deles.**"*

Nesta máquina `projetos/` não existe. O critério é **insatisfazível em qualquer máquina que
tenha só o clone** — que é exatamente a máquina que o prompt descreve como suficiente.

**A T-033 não tem esse problema:** os quatro critérios dela rodam contra *fixtures* montadas
no próprio teste, e são satisfazíveis aqui. O problema é só o critério de MARCO da T-034.

Três saídas, e a escolha é sua:

| saída | o que custa |
|---|---|
| **(a)** copiar `projetos/` da máquina 1 para cá antes da v0.3 | nada agora; é só lembrar. Mantém o critério como está |
| **(b)** reescrever o critério para *"o importador traz as tarefas dos projetos da v1 se eles estiverem presentes; senão, registrar que rodou só contra fixtures"* | uma linha no gerador; enfraquece um pouco o marco |
| **(c)** congelar uma cópia das 89 tarefas no repositório, como já foi feito com os jobs | resolve de vez e vale para qualquer clone — mas publica o conteúdo das tarefas dos 3 projetos num repositório **público** |

Não é urgente: a T-034 é a 34ª de 58. Mas decidir agora custa uma linha, e decidir no dia
custa um ciclo — foi assim que a T-030 do banco-imobiliario custou 4 ciclos e US$ 12,90.

---

## 6. Ajustes de contexto que a troca de máquina provoca

Nenhum é bloqueio. São coisas para não descobrir tarde.

- **T-008 roda só com os `.json` congelados.** `painel/dados/` não existe aqui, então os
  `*.log.jsonl` — que têm o detalhe por ETAPA — não estão disponíveis. A própria tarefa
  prevê isso e manda **declarar a fonte de cada número**. Consequência concreta: os números
  1 (despacho desperdiçado) e 3 (contexto por despacho) saem em granularidade de JOB, não de
  etapa; o número 3 provavelmente será **citado** de `CUSTO_DE_CONTEXTO.md` §8 em vez de
  recalculado. Isso precisa estar escrito no `LINHA_DE_BASE.md`, não presumido.

- **T-042 vai medir numa máquina folgada.** O perfil alvo é 8 GB; esta tem 16 GB com 9,6
  livres. A medição do `Embedder.Local` tem de ser julgada **contra os 8 GB declarados**, não
  contra a memória livre daqui — senão "coube" vira conclusão que não vale no perfil alvo.
  A T-042 já está escrita em cima do perfil de 8 GB; isto é só o cuidado de não deixar a
  folga desta máquina contaminar a leitura.

- **As medições de pgvector do `AMBIENTE_V2.md` §4 continuam valendo, com folga.** Foram
  feitas sob condição mais dura (1,4 GB livres) e passaram. Ainda assim, refazer o
  `conferir` é obrigatório: é outra instalação.

- **A justificativa de "não é serviço do Windows"** (`banco-v2.ps1`) apoia-se em "7,9 GB com
  1,4 GB livres". Aqui isso é mais fraco — mas a decisão continua boa e mexer nela não
  entrega nada. Deixar como está.

---

## 7. Sanidade do plano — conferida, e está boa

Checagem automática sobre as 58 tarefas:

- 58 tarefas, **todas `backlog`** — nada foi executado ainda;
- **toda `dependencias:` aponta para tarefa existente e anterior** — o grafo é acíclico e a
  ordem do ROTEIRO é executável de cima para baixo;
- **ROTEIRO × arquivos de tarefa: as dependências batem nas 58** (saem do mesmo gerador, e a
  prova confirma que não divergiram);
- **toda referência `T-NNN` no corpo das tarefas aponta para tarefa que existe**;
- 8 tarefas sem nenhum critério executável: T-020, T-034, T-035, T-041, T-042, T-048, T-049,
  T-058 — são **exatamente** os marcos e as aberturas, onde inspeção é a forma certa. Não é
  defeito. (T-009 e T-021, que também são marco/abertura, têm critério executável.)

---

## 8. Como esta fábrica NÃO participa da construção da v2

Registro para não haver dúvida em sessão futura:

- O `CLAUDE.md` da raiz é a constituição da **v1**. Ele vale para OPERAR a v1, não para
  construir a v2 (`prompt_inicial.txt` §3, item 7).
- **Não há orquestrador, nem subagentes, nem pipeline `executor→testador→revisor` aqui.**
  Quem constrói a v2 é o Claude Code direto, uma sessão por tarefa — decisão fechada em
  28/08 (`DECISOES_FECHADAS.md`). Despachar agente da v1 contra a v2 gasta cota e contraria
  decisão fechada.
- A v1 fica **intocada** operando os 3 projetos dela. Nada fora de `projetos/fabrica-v2/` é
  tocado, com uma exceção declarada: os arquivos de tarefa em `_sistema/v2/tarefas/`, que é
  onde o estado da execução mora, e o `_sistema/v2/gerar-tarefas.py` se um defeito de
  redação for corrigido.
- O loop é o da §5 do `prompt_inicial.txt`: uma tarefa, os critérios rodados de verdade,
  Notas + Verificação preenchidas, `status: concluida`, commit `T-NNN: <título>`, `/clear`.

---

## 9. Caminho crítico

```
ambiente (§3)  →  T-001 scaffold
                    ├─ T-003 operário/Falso ─┐
                    ├─ T-004 embedder/Falso  │
                    ├─ T-007 CI              ├─→ T-009 MARCO v0.1
                    ├─ T-008 linha de base   │
                    └─ T-002 esquema ─┬──────┘
                                      ├─ T-005 contabilidade
                                      └─ T-006 backup
```

Depois da T-001, cinco tarefas ficam despacháveis (T-002, T-003, T-004, T-007, T-008) e
nenhuma depende das outras — mas o loop é **uma por sessão**, por custo, não por dependência.

Fases: v0.1 = 9 tarefas · v0.2 = 11 · v0.3 = 14 (a maior) · v0.4 = 7 · v0.5 = 7 · v1.0 = 10.
