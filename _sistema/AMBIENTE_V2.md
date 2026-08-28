# Ambiente da v2 — o que está montado nesta máquina

**Montado e provado em 2026-08-28.** Este arquivo é o estado real do ambiente, não a
intenção. Quem retomar o projeto lê isto antes de instalar qualquer coisa.

Análise que motivou: `_sistema/MIGRACAO_V2.md`, seção 5.

---

## 1. Em uma tela

| peça | versão | onde | como se usa |
|---|---|---|---|
| Erlang/OTP | **29** (erts 17.0.1) | `C:\Program Files\Erlang OTP` | já estava |
| Elixir | **1.20.0, compilado com OTP 29** | `C:\elixir\1.20.0-otp-29` | no PATH de usuário |
| PostgreSQL | **18.4** | `C:\pgsql\18` | `_sistema/ferramentas/banco-v2.ps1` |
| dados do cluster | — | `C:\pgsql\dados` | 127.0.0.1:5432, auth `trust` |
| pgvector | **0.8.6** | dentro do PostgreSQL acima | `CREATE EXTENSION vector` |
| banco de trabalho | — | `fabrica_v2_dev` | `psql -h 127.0.0.1 -U postgres -d fabrica_v2_dev` |
| MSVC | 19.29 (VS 2019 Build Tools) | — | só para recompilar o pgvector |

```powershell
_sistema\ferramentas\banco-v2.ps1 subir      # sobe o banco
_sistema\ferramentas\banco-v2.ps1 conferir   # prova que o pgvector responde
_sistema\ferramentas\banco-v2.ps1 derrubar   # desliga
```

---

## 2. Elixir/OTP — o descasamento, resolvido

**Estava assim:** Elixir 1.20.0 instalado pelo chocolatey, **compilado contra OTP 28**,
rodando sobre **OTP 29**. Funciona, mas não é a combinação que a linguagem publica — os
artefatos precompilados do Elixir são por major do OTP exatamente porque isso importa.

**Ficou assim:** o build oficial `elixir-otp-29.zip` da v1.20.0, com SHA-256 conferido
contra o `.sha256sum` da release, extraído em `C:\elixir\1.20.0-otp-29`.

O PATH **de usuário** (não o de máquina) tinha duas entradas de Elixir, e uma delas
(`C:\Program Files\Elixir\bin`) apontava para um diretório que **não existe** — sobra de
instalação antiga. As duas foram substituídas por uma só.

**Se precisar reverter:** o PATH de usuário anterior tinha duas entradas de Elixir —
`C:\Program Files\Elixir\bin` (que **não existia**, sobra de instalação antiga) e
`C:\ProgramData\chocolatey\lib\Elixir\tools\bin`. Basta reinserir a segunda à frente.
O pacote do chocolatey **continua instalado** e só saiu do PATH; para removê-lo de vez:
`choco uninstall elixir`.

> Os arquivos de backup do PATH ficaram no diretório temporário da sessão que fez a
> mudança e **não sobrevivem** a ela — por isso o conteúdo relevante está escrito aqui,
> que é o lugar que dura.

**Provado por:** `mix new` + `mix compile` + `mix test` (2 passed), e
`System.otp_release() == "29"`.

---

## 3. PostgreSQL — por que há um segundo, e o primeiro não serve

Havia uma instalação em `C:\Program Files\PostgreSQL\18` que **está incompleta**:

- **falta o diretório `lib/` inteiro** — sem `lib\postgres.lib` não há como linkar
  extensão nenhuma, e sem `lib\` o servidor não carrega nem `plpgsql`;
- **nunca houve `initdb`** — não existe diretório de dados nem serviço registrado.

Ou seja: os binários de cliente respondem (`psql --version` funciona), o que faz a
instalação **parecer** boa numa checagem superficial. Foi o que a primeira versão da
análise registrou como "PostgreSQL 18 instalado". Não estava.

**O que foi feito:** baixado o zip oficial de binários `postgresql-18.4-1-windows-x64`
(EDB) e extraído para `C:\pgsql\18` — **só `bin`, `include`, `lib` e `share`**, deixando
`pgAdmin 4` e `StackBuilder` de fora (são a maior parte do arquivo e não servem aqui).

A instalação velha em `Program Files` **não foi tocada**. Ela é inofensiva enquanto não
houver serviço registrado nela. Se um dia atrapalhar, desinstale pelo Painel de Controle.

### O cluster

```
initdb -D C:\pgsql\dados -U postgres -A trust -E UTF8 --locale=C
listen_addresses = '127.0.0.1'     # só localhost — mesma postura do painel
port = 5432
```

**`trust` é decisão de desenvolvimento, e é local:** o banco só aceita conexão de
127.0.0.1, e não há segredo guardado em lugar nenhum do repositório. **A F1 precisa decidir
a credencial de verdade** (usuário próprio da aplicação + `scram-sha-256`), junto com o
backup — ver `MIGRACAO_V2.md`, 6.2.

### Não é um serviço do Windows, de propósito

Esta máquina tem 7,9 GB com ~1,4 GB livres. Um serviço que sobe no boot cobra memória todo
dia por um banco usado só quando se trabalha na v2 — e **memória é a escassez real desta
máquina**, não conveniência. Quando a v2 estiver operando, registrar é uma linha (está no
cabeçalho do `banco-v2.ps1`), com a ressalva de que **o postgres recusa rodar sob conta
administrativa no Windows**: a conta de serviço tem de ser explícita.

---

## 4. pgvector — o que foi medido, e o que a medição desarmou

Compilado da tag **v0.8.6** com MSVC, pelo script
`_sistema/ferramentas/instalar-pgvector.ps1` (que é reproduzível e documenta as armadilhas).

**Não há binário oficial de pgvector para Windows** — compilar é o único caminho nativo,
e sem Docker nesta máquina não havia alternativa fácil.

### A medição que importava

O risco declarado na análise era *"pgvector + embedding local sob 1,3 GB livres"*. A medição
**separa os dois**, e só um sobrou:

| teste | resultado |
|---|---|
| 20.000 vetores de **384 dimensões** (tamanho de embedding de sentence-transformer) | tabela 32 MB |
| construir índice **HNSW** (`m=16, ef_construction=64`) | **4,1 s**, índice de 38 MB |
| o planejador usa o índice? | **sim** — `Index Scan using escala_hnsw` |
| consulta dos 10 vizinhos mais próximos | **1,3 ms** |
| com filtro por projeto (como a fábrica sempre consulta) | usa o índice, com `Filter` |
| memória livre antes → depois | **1,45 GB → 1,43 GB** |

**Conclusão: pgvector nesta máquina não é risco.** Ele é confortável, e 20 mil trechos é
mais história do que os três projetos vivos juntos produziriam num ano.

**O risco que sobra da F5 é outro, e continua aberto:** o modelo de *embedding* rodando
local via Bumblebee/Nx (EXLA). Isso não foi testado, é ordens de grandeza mais pesado que o
pgvector, e é onde 1,4 GB livres realmente aperta. A alternativa por serviço já está
admitida na tabela de riscos dos documentos.

### Provado por

`CREATE EXTENSION vector` (0.8.6), distância por cosseno com ordenação correta, os tipos
`halfvec`/`sparsevec`, e **a consulta de busca híbrida com fusão recíproca de postos
(RRF, k=60) da seção 9 do `-3-completo`, rodando de verdade** — com o trecho que contém
`--exigir` chegando em primeiro justamente por ser achado pelas duas buscas, que é o
argumento do documento.

> Nota de toolchain: o `postgres.exe` do EDB é compilado com msvc 19.44 e o pgvector foi
> compilado com 19.29. A mistura **funciona** (mesma UCRT), e isso está registrado porque
> era um risco real e foi conferido, não presumido.

---

## 5. Armadilhas encontradas no caminho (todas custaram tempo)

- **`set VAR=valor && comando` no cmd captura o espaço antes do `&&`.** Produz caminhos como
  `C:\pgsql\18 \include\server` e um `C1083: postgres.h não encontrado` que parece falta de
  header. Use `set "VAR=valor"`.
- **PowerShell 5.1 transforma stderr de executável nativo em erro terminante** quando a
  saída é redirecionada e `$ErrorActionPreference='Stop'`. O `git clone` escreve o aviso de
  *detached HEAD* em stderr — ou seja, **um clone bem-sucedido matava o script**. O veredito
  tem de ser o `$LASTEXITCODE`. Está resolvido no `Invoke-Nativo` do
  `instalar-pgvector.ps1`.
- **`Expand-Archive` é lentíssimo:** 5.794 arquivos em ~8 minutos. O mesmo conteúdo útil
  (2.954 arquivos) saiu em **7,4 s** com `zipfile` do Python, extraindo só os prefixos que
  interessam. Para zip grande no Windows, não use `Expand-Archive`.
- **`Set-Content -Encoding utf8` no PS 5.1 grava BOM**, e o Elixir **rejeita** arquivo `.exs`
  com BOM (`unexpected token: "\uFEFF"`). Use `[IO.File]::WriteAllText` ou a ferramenta de
  escrita do agente.
- **`pg_ctl start` segura o console herdado** e a chamada não retorna, mesmo com o servidor
  já aceitando conexão. Suba com `Start-Process` e espere por `pg_isready`.
- **Instalação de PostgreSQL pode estar quebrada e parecer boa:** `psql --version`
  respondia normalmente numa árvore sem `lib/` e sem cluster. Confira `lib\postgres.lib` e
  a existência do diretório de dados, não o cliente.

---

## 6. O que ainda não está montado

- **Bumblebee/Nx (EXLA)** — o embedding local da F5. Único risco de ambiente que sobra.
- **Credencial de verdade e backup do banco** — decisão da F1 (`MIGRACAO_V2.md`, 6.2).
- **Nada de Elixir do projeto v2 ainda existe.** Isto é ambiente; o projeto começa quando o
  plano das seis fases for decomposto em tarefas.
