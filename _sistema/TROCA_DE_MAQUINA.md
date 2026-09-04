# Troca de máquina — 2026-09-04

Escrito ao mover o trabalho da **máquina 2** (`C:\Users\enzoconsulo`, onde a v2 foi
construída) para a **máquina 1** (`C:\Users\enzoc`, a mais fraca, onde o ambiente já está
montado desde 28/08).

Quem é quem está em `_sistema/AMBIENTE_V2.md` — seção 0 é a máquina 2, seções 1 a 4 são a
máquina 1. **Este arquivo não repete o que está lá**; ele diz o que a TROCA exige.

---

## 1. São DOIS repositórios, e um deles não viajava

| repositório | o quê | remote |
|---|---|---|
| a raiz (`Generic-Multi-Agents`) | o sistema: `_sistema/`, `.claude/`, `CLAUDE.md`, `README.md`, **e o `painel/`** | `github.com/enzoconsulo/Generic-Multi-Agents` |
| `projetos/fabrica-v2/` | **o projeto inteiro** — 92 commits, 227 arquivos, 42 tarefas concluídas | `github.com/enzoconsulo/fabrica-v2` *(privado — criar, ver abaixo)* |

A raiz **ignora `/projetos/`** de propósito: cada projeto é repositório próprio. Isso
significa que, até 04/09, **nada da v2 tinha para onde ir** — o `fabrica-v2` não tinha
remote nenhum. Era o único bloqueio real da troca.

### Criar o repositório do projeto (uma vez, na máquina 2)

**O `git remote add` já foi feito** em 04/09 — o repositório local já aponta para
`https://github.com/enzoconsulo/fabrica-v2.git`. Falta só o outro lado existir, e isso
exige a sua conta: não há `gh` CLI nesta máquina, e o push devolve `Repository not found`
até lá.

1. Em `github.com/new`: nome **`fabrica-v2`**, visibilidade **privada**, **sem** README,
   **sem** `.gitignore`, **sem** licença — o repositório local já tem tudo, e um commit
   inicial criado pelo GitHub obrigaria a um merge à toa.
2. Na máquina 2, um comando só:

   ```powershell
   cd C:\Users\enzoconsulo\Documents\Generic-Multi-Agents\projetos\fabrica-v2
   git push -u origin master
   ```

   São 92 commits, 227 arquivos, ~4,6 MB. A árvore local está limpa.

---

## 2. Na máquina 1, na ordem

```powershell
# 1. a raiz — já existe lá; basta atualizar
cd <onde-a-raiz-esta-clonada>
git pull

# 2. o projeto, que é novo lá
cd projetos                       # crie a pasta se ela não existir
git clone https://github.com/enzoconsulo/fabrica-v2.git

# 3. dependências do projeto (deps/ e _build/ NÃO viajam)
cd fabrica-v2
mix deps.get

# 4. o banco (não é serviço do Windows, de propósito — não sobe no boot)
cd ..\..
_sistema\ferramentas\banco-v2.ps1 subir
cd projetos\fabrica-v2
mix ecto.create        # se o fabrica_v2_dev de lá ainda não existir
mix ecto.migrate       # há migração NOVA de 04/09 (Oban)

# 5. o painel, se for usar o cockpit (node_modules/ e dist/ não viajam)
cd ..\..\painel
npm install
npm run build
```

E abra o Claude Code **na raiz da fábrica**, nunca dentro de `projetos/<nome>/`.

---

## 3. O que NÃO viaja pelo git — e o que fazer a respeito

| não viaja | por quê | consequência na máquina 1 |
|---|---|---|
| `projetos/` (na raiz) | `.gitignore` da raiz | resolvido pelo clone separado do §1 |
| `painel/dados/` | `painel/.gitignore` | **o piloto automático perde o estado e o teto.** Ver §5 |
| `painel/node_modules/`, `painel/dist/` | idem | `npm install && npm run build` |
| `deps/`, `_build/` do projeto | `.gitignore` do Elixir | `mix deps.get` |
| `.claude/settings.local.json` | pessoal, não versionado | os "always allow" recomeçam do zero; vá marcando |
| o banco `fabrica_v2_dev` | é dado local | `mix ecto.create` + `mix ecto.migrate` |
| os `*.log.jsonl` da v1 | nunca estiveram na raiz | **já estão na máquina 1** — é de lá que eles vêm |

### Uma coisa que joga a FAVOR da troca

A **T-034 (marco da v0.3)** exige o `projetos/` REAL da v1, com as 89 tarefas vivas — e
esse diretório está **na máquina 1**. O `PROGRESSO.md` listava "copiar `projetos/` da
máquina 1" como pendência do Enzo desde 31/08. Indo para lá, a pendência deixa de existir.
(A T-033, o importador, roda sobre fixtures e não precisa dele.)

---

## 4. Duas diferenças entre as máquinas que vão aparecer

**Elixir/OTP.** Máquina 2 é **OTP 28.1 / Elixir 1.19.4**; máquina 1 é **OTP 29 / Elixir
1.20.0**. As duas são pares casados, o que é o que importa (`AMBIENTE_V2.md`, §2 e §0).
Mas o `_gestao/GUIA.md` do projeto diz "Elixir 1.19.4 (OTP 28.1)" na seção 1 — **isso
descreve a máquina 2**, e vai ficar errado lá. Não é defeito do projeto; é uma linha para
o documentador corrigir quando a poeira baixar.

**Fim de linha.** Nos dois repositórios daqui, `core.autocrlf` está **`true` por
repositório** (não no global). O repositório guarda LF e a árvore de trabalho fica CRLF —
é exatamente por isso que o `credo --strict` acusa *"File is using windows line endings"*
em arquivo recém-editado, armadilha já documentada no `GUIA.md`. Na máquina 1, decida uma
vez e anote:

```powershell
git config core.autocrlf true    # reproduz o comportamento (e a armadilha) da máquina 2
```

Sem isso, a árvore vem LF e aquela armadilha do GUIA simplesmente não aparece — o que é
melhor, só não é o que o GUIA descreve.

---

## 5. O estado do trabalho, em quatro fatos

Leia isto antes de disparar qualquer coisa. O detalhe está em
`projetos/fabrica-v2/_gestao/PROGRESSO.md`, seção **"Onde parar e onde retomar"**, e nos
rodapés das tarefas T-037 e T-050.

1. **42 de 71 tarefas concluídas.** 2 em execução, 7 prontas, 20 em backlog.

2. **A árvore está VERMELHA.** `mix compile --warnings-as-errors` falha em
   `lib/fabrica/fila/resgate.ex:80` (`undefined variable "j"` — falta `import Ecto.Query`),
   e por consequência **todo `mix verificar` reprova**, seja qual for a tarefa. É o parcial
   da **T-037**, cujo executor a parede de cota cortou no meio em 04/09 07:49 UTC. O
   parcial foi **commitado quebrado de propósito**, para existir na outra máquina.

3. **Portanto a T-037 roda PRIMEIRO e SOZINHA.** Nada em paralelo até a bateria completa
   (`mix fabrica.ci`, cinco estágios) voltar a passar. Isso não é zelo: a **T-050** já
   queimou 2 de 3 tentativas contra essa árvore quebrada, sem um único achado contra o
   código dela — 3 dos 4 critérios dela passaram executados.

4. **O piloto automático está DESLIGADO e estourou o teto:** 8 rodadas, **US$ 61,20 com
   teto de US$ 60,00**, desligado à mão em 04/09 10:11 UTC. O estado dele vive em
   `painel/dados/piloto.json`, que **não é versionado** — na máquina 1 ele nasce zerado e
   **o teto precisa ser redeclarado** antes de religar.

> **A cota da assinatura é a MESMA nas duas máquinas.** Ela bateu quatro vezes em 03 e
> 04/09. Trocar de máquina não dá cota nova.

---

## 6. Para trazer o trabalho de volta

Nada de especial: nas duas máquinas, os dois repositórios têm remote, então é `git push` de
um lado e `git pull` do outro. **O que se esquece é o segundo repositório** — commitar a
raiz e deixar `projetos/fabrica-v2/` para trás é o erro natural aqui, porque ele não
aparece no `git status` da raiz.
