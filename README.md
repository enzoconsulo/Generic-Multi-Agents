# Gerador de Projetos — Manual completo de operação

Fábrica de software autônoma sobre Claude Code: você dá a ideia, os agentes planejam,
programam, testam, revisam, documentam e commitam sozinhos. Este manual diz **exatamente**
o que digitar, o que esperar, onde mexer e como ajustar.

**Índice:** 1. Como funciona · 2. Primeira vez · 3. Rotina diária · 4. Receitas passo a
passo · 5. Intervenções manuais · 6. Estendendo o sistema · 7. Ajustes finos de
desempenho · 8. Solução de problemas · 9. Mapa de arquivos

---

## 1. Como funciona em um minuto

Você abre o Claude Code **nesta pasta**. O chat principal vira o **Orquestrador** (regras
no `CLAUDE.md`): ele não escreve código — decide e despacha 6 agentes especializados
(planejador, executor, testador, revisor, documentador, pesquisador), cada tarefa
passando pelo pipeline `executor → testador → revisor` antes de contar como concluída.

Todo o estado vive em **arquivos** (tarefas com status no frontmatter, decisões, logs
diários) e cada projeto é um repositório git próprio. Consequência prática: você pode
fechar tudo a qualquer momento e retomar amanhã sem perder nada — a sessão nova
reconstrói o estado lendo os arquivos.

## 2. Primeira vez (preparação, ~3 minutos)

**Pré-requisitos na máquina nova:** [Claude Code](https://claude.com/claude-code) instalado
e logado (assinatura Claude — não precisa de `ANTHROPIC_API_KEY`), git e Node.js 22+ (só o
Node é necessário se você for usar o `painel/`, o cockpit web opcional).

0. Clone o repositório:
   ```
   git clone <url-do-repositorio> Gerador_de_projetos
   ```

> **Atalho:** se você só quer abrir o painel web (o cockpit), dê **duplo-clique em
> `INICIAR.bat`** na raiz — ele confere os pré-requisitos, prepara a estrutura, instala,
> compila e abre o navegador sozinho. Equivale a `.\iniciar.ps1` (use `-Dev` para modo
> desenvolvimento, `-SemBuild` para subir mais rápido). O resto desta seção é para usar a
> fábrica pelo terminal, com o Claude Code.
1. Abra o terminal e entre na pasta onde clonou a fábrica:
   ```
   cd <caminho-onde-voce-clonou>\Gerador_de_projetos
   claude
   ```
2. Confirme o modelo com `/model`. Os agentes **herdam o modelo da sessão** — Fable
   enquanto você tiver acesso; quando ficar só o Opus, troque aqui e tudo acompanha.
3. Permissões: `.claude/settings.json` já pré-aprova os comandos comuns (git, npm,
   python, pytest...). Quando um agente precisar de algo fora da lista, o Claude Code vai
   perguntar — escolha **"Always allow"** para comandos recorrentes (isso grava em
   `.claude/settings.local.json` automaticamente). Cada "always allow" torna a fábrica
   mais autônoma.
4. Teste: digite `/status`. Deve responder que ainda não há projetos.

> Sempre abra o Claude Code NESTA pasta (a raiz da fábrica), nunca dentro de
> `projetos/<nome>/` — fora da raiz os comandos e agentes não carregam.

## 3. Rotina diária recomendada

| Momento | Digite | O que acontece |
|---|---|---|
| Início do dia | `/status` | Painel: fila, bloqueios, o que precisa de você |
| Em seguida | `/trabalhar` | A fábrica roda sozinha até esgotar a fila (não pergunta nada) |
| Ideia no meio do dia | `/ideia <texto>` | Registra e roteia sem interromper o resto |
| Fim do dia | `/encerrar-dia` | Log do dia + preparação do amanhã |
| 1× por semana | `/manutencao` | Autodiagnóstico: valida tarefas, git e estrutura |

Seu tempo obrigatório: os ~5 minutos de `/status` + decisões sobre bloqueios. O resto é
da fábrica.

## 4. Receitas passo a passo

### 4.1 Criar um projeto novo

**Digite** (formato: nome em kebab-case, travessão, descrição rica):

```
/novo-projeto controle-financeiro — App web para eu controlar gastos pessoais.
Usuário: só eu. Precisa ter na v1: cadastro de gastos com categoria e data, painel
mensal com total por categoria, exportação CSV. Fora de escopo: login, multiusuário,
app mobile. Stack: prefiro Python no backend; o resto decida você.
```

A **qualidade da descrição é a alavanca nº 1 de desempenho** de todo o resto. Inclua
sempre estas 4 coisas: o que é · para quem · o que precisa ter na v1 · **o que NÃO entra**.
Descrição ruim (`/novo-projeto app — faz um app de finanças legal`) gera plano genérico
e retrabalho em cascata.

**O que acontece:** pasta criada com git próprio → planejador escreve especificação,
plano em fases e 8–20 tarefas → tarefas sem dependência ficam `pronta`. Ao final, o
orquestrador reporta a stack escolhida e a fila.

**Antes de mandar trabalhar**, vale 2 minutos: abra
`projetos/<nome>/_gestao/ESPECIFICACAO.md` e confira o rumo. Corrigir plano é barato;
corrigir código é caro. Quer mudar algo? Diga no chat: *"ajuste a especificação: X"*.

### 4.2 Botar a fábrica para trabalhar

```
/trabalhar                      ← todos os projetos
/trabalhar controle-financeiro  ← só um projeto
```

O que esperar: o orquestrador promove tarefas, despacha até 3 executores em paralelo e
roda o pipeline completo, **sem parar para perguntar**. Tarefa que reprova 3 vezes vira
`bloqueada` (com o motivo escrito nela) e a fábrica segue com as demais. Ele para quando
a fila esvazia ou tudo depende de você — e entrega um placar final.

### 4.3 Acompanhar

- `/status` a qualquer momento (só leitura, não atrapalha nada).
- Detalhe de uma tarefa: abra `projetos/<nome>/_gestao/tarefas/T-NNN-*.md` — as seções
  Notas de execução / Verificação / Revisão contam a história completa.
- Histórico do código: `git log` dentro da pasta do projeto (1 commit por tarefa).

### 4.4 Registrar ideias

```
/ideia no controle-financeiro, adicionar gráfico de pizza por categoria no painel
```
→ vira tarefas no projeto automaticamente.

```
/ideia um bot de Telegram que me avisa quando uma ação da bolsa cai 5%
```
→ é projeto novo: o orquestrador devolve um `/novo-projeto ...` pronto para você copiar,
ajustar e enviar (criar projeto é decisão sua).

Toda ideia fica gravada em `_sistema/ideias/` — nada se perde, mesmo se você não decidir
na hora.

### 4.5 Encerrar o dia

`/encerrar-dia` — consolida o log em `_sistema/logs/AAAA-MM-DD.md` (feito, bloqueado,
decisões, plano do amanhã) e atualiza o progresso dos projetos tocados. O log é o que a
sessão de amanhã lê primeiro; encerrar o dia direito = começar o dia seguinte sem custo.

### 4.6 Manutenção semanal

`/manutencao` — valida integridade (frontmatters, dependências, git limpo, docs
condizentes), corrige sozinho o que é mecânico e lista o que precisa de você.

## 5. Intervenções manuais

Regra geral: **você quase nunca precisa editar arquivo — basta pedir no chat.** O
orquestrador sabe operar o protocolo. Mas quando quiser fazer na mão:

### 5.1 Destravar uma tarefa bloqueada
1. `/status` mostra o motivo resumido.
2. Abra `projetos/<nome>/_gestao/tarefas/T-NNN-*.md` e leia Verificação/Revisão/Notas.
3. A causa quase sempre é uma decisão pendente sua. Resolva pelo chat:
   *"desbloqueie a T-007 do controle-financeiro; decisão: use SQLite mesmo, sem Postgres"*
   — ou edite você: frontmatter `status: pronta`, `tentativas: 0`, e escreva a decisão na
   seção Contexto.

### 5.2 Mudar prioridade
Edite `prioridade:` no frontmatter (`alta` | `media` | `baixa`) — ou peça no chat.

### 5.3 Cancelar uma tarefa
Peça no chat, ou edite `status: cancelada` + motivo na tarefa. **Nunca apague o
arquivo** (histórico é parte do sistema).

### 5.4 Pausar um projeto
Rode `/trabalhar <outro-projeto>` para focar onde quer. Para pausa longa, diga:
*"não trabalhe no projeto X até eu mandar; registre no log e no PROGRESSO dele"*.

### 5.5 Apagar um projeto
Decisão manual sua, sempre: feche as sessões e delete a pasta `projetos/<nome>/`.
O sistema nunca apaga projetos sozinho.

## 6. Estendendo o sistema

### 6.1 Adicionar um agente novo

1. Crie o arquivo `.claude/agents/<nome>.md` (nome curto, minúsculas, sem espaço).
2. Estrutura obrigatória:
   ```markdown
   ---
   name: seguranca                  # igual ao nome do arquivo
   description: Audita um projeto procurando vulnerabilidades (injecao, segredos
     expostos, validacao de entrada). Usar antes de concluir projetos com login,
     pagamento ou dados sensiveis. Nao corrige codigo.
   tools: Read, Glob, Grep, Edit, Bash, PowerShell   # omita a linha = todas as ferramentas
   model: inherit                   # regra: inherit (só o testador foge — ver §6.4)
   ---

   Você é o AGENTE DE SEGURANÇA da fábrica... (papel, sequência obrigatória,
   regras duras, formato do relatório final)
   ```
   A `description` é o que o orquestrador lê para decidir **quando** usar o agente —
   comece sempre por "quando usar". Copie a estrutura de um agente existente
   (`testador.md` é o melhor modelo de agente restrito).
3. **Registre na tabela "Agentes disponíveis" do `CLAUDE.md` raiz** — sem isso o
   orquestrador não sabe que ele existe.
4. Reinicie a sessão do Claude Code (agentes carregam na inicialização).

### 6.2 Adicionar um comando novo

1. Crie `.claude/commands/<nome>.md` → vira `/<nome>` no chat.
2. Frontmatter: `description:` (aparece na lista de comandos) e `argument-hint:`
   (dica de uso). Corpo: as instruções que o orquestrador executa; use `$ARGUMENTS`
   onde entra o que o usuário digitar após o comando.
3. Atualize a linha de comandos no mapa do `CLAUDE.md` e a tabela da seção 3 deste
   README. Reinicie a sessão.

### 6.3 Ajustar permissões (menos interrupções)

- Pelo chat: `/permissions` (interface do Claude Code para ver/editar regras).
- Ou edite `.claude/settings.json` → `permissions.allow`. Formato: `"Bash(comando:*)"`
  libera qualquer chamada começando por esse comando. Exemplo — liberar docker:
  ```json
  "Bash(docker:*)", "PowerShell(docker:*)"
  ```
- Os "Always allow" que você aprova durante o uso vão para
  `.claude/settings.local.json` (suas aprovações pessoais; pode limpar quando quiser).

### 6.4 Trocar o modelo

`/model` na sessão principal — e nada mais. Os agentes usam `model: inherit`.

**Uma exceção deliberada (2026-07-28): o `testador` roda em `haiku`.** Verificar é
mecânico — rodar os comandos dos critérios de aceite e comparar a saída. Testador e
revisor somam boa parte dos turnos de cada tarefa, então é aí que o custo escala sem
ganho. É seguro porque o **revisor continua no modelo do disparo** e lê o diff depois:
uma aprovação frouxa do testador ainda esbarra nele. O inverso (revisor barato) NÃO é
seguro — bug que passa custa mais depois do que se economiza agora. Para reverter,
troque `model:` para `inherit` em `.claude/agents/testador.md`.

**Onde o dinheiro realmente vaza** (medido em execuções reais):
- **Retrabalho**, não o modelo. Cada ciclo reprovado repete executor + testador + revisor
  (~$1–2). Modelo barato demais CONSTRUINDO gera mais ciclos e sai mais caro no total.
- **Análise/status em modelo caro.** Analisar um projeto no Opus custou US$3,86; a mesma
  classe de tarefa em Haiku ficou abaixo de US$0,15. São tarefas de ler e resumir —
  escolha Haiku no disparo.
- O custo que o painel mostra durante a execução é **cumulativo** da sessão: a última
  linha é o total, não some as anteriores.

## 7. Ajustes finos de desempenho

| Parâmetro | Onde mudar | Padrão | Quando mexer |
|---|---|---|---|
| Executores em paralelo | `CLAUDE.md` seção "Paralelismo" + `.claude/commands/trabalhar.md` | 3 | Suba para 4–5 se rodar vários projetos independentes e seu plano de uso aguentar; desça para 1–2 se notar conflitos de arquivo ou estouro de limite de uso |
| Tamanho de tarefa | `_sistema/PROTOCOLO_TAREFAS.md` regra 5 | 30–90 min | Tarefas grandes = agente se perde; pequenas demais = overhead de despacho domina |
| Ciclos antes de bloquear | `CLAUDE.md` (pipeline) + protocolo | 3 | Suba só se as reprovações estiverem convergindo (cada ciclo melhora); loops repetitivos = o problema é o plano, não o limite |
| Tarefas por projeto novo | `.claude/agents/planejador.md` | 8–20 | Projetos maiores pedem mais fases, não tarefas maiores |

Princípios que mantêm a fábrica rápida (já embutidos, não os desfaça):

- **Contexto limpo do orquestrador**: ele escaneia tarefas por busca nos frontmatters e
  nunca lê código de projeto — quem lê código são os agentes. É isso que permite sessões
  longas de `/trabalhar` sem degradar.
- **Uma suíte por ciclo**: o executor roda os testes da própria tarefa; a suíte completa
  roda uma única vez, no testador, com o projeto quieto (nenhum outro agente mexendo na
  árvore). Menos trabalho duplicado, zero reprovação falsa por interferência.
- **`CLAUDE.md` de projeto enxuto**: ele entra no contexto de TODO agente que trabalha no
  projeto. Se passar de ~100 linhas, peça: *"enxugue o CLAUDE.md do projeto X"*.
- **Sessão nova por dia** de trabalho: o estado está nos arquivos; começar limpo é grátis
  e evita arrastar contexto velho.
- **Permissões pré-aprovadas** (§6.3): cada prompt de permissão evitado é um trecho do
  dia em que a fábrica não fica parada esperando você.

## 8. Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `/novo-projeto` (ou um agente) "não existe" | Sessão aberta antes dos arquivos existirem, ou aberta fora da raiz | Reinicie o Claude Code **nesta pasta** |
| Fábrica parada esperando aprovação | Comando fora da allowlist | Aprove com "Always allow"; se recorrente, adicione a regra (§6.3) |
| Sessão caiu no meio do `/trabalhar` | — | Abra sessão nova e rode `/trabalhar` de novo: o saneamento detecta tarefas presas e retoma do ponto certo |
| Tarefa presa em `em-execucao` sem ninguém trabalhando | Sobra de sessão encerrada | `/trabalhar` ou `/manutencao` saneiam sozinhos |
| Tarefa reprovando em loop | Critério ambíguo/impossível ou decisão pendente | Leia Verificação/Revisão na tarefa; decida você e destrave (§5.1) |
| Suíte falha em teste que a tarefa nem tocou | Falha pré-existente do projeto | O testador registra como nota (não reprova); peça uma tarefa corretiva para a falha antiga |
| Painel inconsistente, dependência para tarefa inexistente | Edição manual quebrou frontmatter | `/manutencao` |
| Quero mudar o rumo de um projeto | — | *"replaneje o projeto X considerando Y"* — o orquestrador chama o planejador, que integra sem recomeçar |

## 9. Mapa de arquivos (quem escreve o quê)

A raiz da fábrica é um repositório git que versiona só o sistema — `projetos/` está no
`.gitignore` (cada projeto tem repositório próprio).

```
CLAUDE.md                          regras do orquestrador          edita: você/orquestrador
README.md                          este manual                     edita: você/orquestrador
INICIAR.bat / iniciar.ps1          sobe o painel web (duplo-clique) edita: você
.gitignore                         raiz ignora projetos/ e afins   edita: você
.claude/settings.json              permissões pré-aprovadas        edita: você (§6.3)
.claude/agents/*.md                definição dos 6 agentes         edita: você (§6.1)
.claude/commands/*.md              os 6 comandos /                 edita: você (§6.2)
_sistema/PROTOCOLO_TAREFAS.md      contrato de tarefas             raramente muda
_sistema/ARQUITETURA.md            desenho e racional do sistema   raramente muda
_sistema/templates/                modelos de documentos           raramente muda
_sistema/ideias/                   caixa de entrada                escreve: /ideia
_sistema/logs/AAAA-MM-DD.md        memória diária da fábrica       escreve: orquestrador
painel/                            cockpit web (opcional, Node 22+) edita: você/orquestrador
  CLAUDE.md                        stack e como rodar/testar       ver painel/CLAUDE.md
projetos/<nome>/                   um projeto = um repositório git
  CLAUDE.md                        contexto do projeto             escreve: documentador
  _gestao/ESPECIFICACAO.md         o que o projeto é               escreve: planejador
  _gestao/PLANO.md                 fases e ordem                   escreve: planejador
  _gestao/DECISOES.md              decisões datadas (só adiciona)  escrevem: todos
  _gestao/PROGRESSO.md             diário do projeto               escrevem: documentador/orquestrador
  _gestao/pesquisas/               relatórios técnicos             escreve: pesquisador
  _gestao/tarefas/T-NNN-*.md       AS TAREFAS (status = verdade)   escrevem: todos, via protocolo
```
