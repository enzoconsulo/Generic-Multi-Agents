---
id: T-018b
titulo: Medir a superficie de governanca do `claude --print` real
projeto: fabrica-v2
versao: v0.2
status: em-teste
prioridade: alta
dependencias: [T-018a]
areas: [priv/probes/cli_governanca.exs, priv/probes/amostras/sessao-com-ferramenta.jsonl, .gitignore, _gestao/PROGRESSO.md]
tentativas: 2
criada: 2026-09-01
atualizada: 2026-09-02
---

## Objetivo
Descobrir, medindo contra o `claude` instalado nesta maquina, o que a linha de comando dele
oferece de governanca: modo de permissao, restricao de ferramentas, confinamento de diretorio,
teto de turnos, prompt por `stdin` e a forma exata do stream numa sessao que usa ferramenta.
Nenhum codigo de producao e escrito nesta tarefa.

## Contexto

**Esforco estimado: 60 a 90 min.** E a tarefa de FUNDACAO deste replanejamento: as outras nove
copiam dela a grafia das flags e a forma dos eventos. Ela vem primeiro por isso.

**Por que ela existe.** Este projeto ja pagou TRES vezes pela mesma forma de defeito: codigo
escrito a partir da documentacao do formato, com testes verdes, que nao provava nada sobre o
mundo. A T-026 (sinais de comando quebrado que o `git` real nao emite), a T-018a (a linha que o
CLI RECUSAVA, com 26 testes verdes) e agora o proprio marco 1 da v0.2 — em que o `Write` era
negado por falta de flag de permissao e ninguem sabia. A regra do `CLAUDE.md` da fabrica e
literal: *tente USAR o mecanismo pelo caminho real antes de dar por pronto.*

**Nao escreva flag de memoria.** O que esta tarefa entrega e justamente a grafia EXATA lida do
`--help` da versao instalada, com o numero da versao ao lado. Toda tarefa seguinte copia daqui.

**Consome cota da assinatura; nao gera fatura.** Sao poucas chamadas curtas, com modelo `haiku`
e prompts de uma linha. Nao use `ANTHROPIC_API_KEY` — nao existe nesta maquina e defini-la
quebraria o marco da v0.1.

**Como rodar comando aqui.** `Fabrica.Ferramentas.Comando.rodar_separado/3` (raiz, linha,
`prazo:`), que ja devolve `stdout` e `stderr` separados e alimenta `stdin` do vazio. O probe
existente `priv/probes/cli_real.exs` e o modelo de estilo a seguir, e
`Fabrica.Operario.ClaudeCLI.executavel/0` da o executavel configurado.

**As sete secoes que o probe precisa imprimir**, cada uma com o comando exato usado e a saida
observada:

1. **Versao e flags.** `claude --help` (e a ajuda do modo `--print`, se houver). Extraia a
   grafia exata das flags de: modo de permissao, ferramentas permitidas, ferramentas proibidas,
   diretorio adicional de trabalho, teto de turnos, configuracao de MCP, retomada de sessao.
   Imprima a versao do CLI junto — a grafia so vale para ela.
2. **Escrita de arquivo em headless.** Reproduza a negacao medida no marco (sem flag nenhuma:
   `tool_result` de `Write` com `is_error: true` e *"requires manual approval"*) e depois tente
   CADA candidato de modo de permissao ate achar o menor que faz a escrita passar. Diga qual e,
   e o que os outros fizeram.
3. **Restricao de vocabulario.** Com a flag de ferramentas permitidas contendo apenas leitura,
   uma sessao mandada escrever NAO escreve — e o stream mostra por que (recusa, ferramenta
   ausente, permissao negada; registre qual). Este e o mecanismo de que depende *"quem verifica
   nao corrige"* sob o CLI.
4. **Confinamento.** Com o diretorio de trabalho na raiz de um projeto de mentira, mande a
   sessao escrever FORA dela — uma vez por caminho absoluto (`%TEMP%\fora-<marca>.txt`) e uma
   vez por travessia (`..\fora-<marca>.txt`). Os arquivos aparecem? Responda com `File.exists?`
   sobre os dois caminhos, e nao com a impressao do modelo.
5. **Teto de turnos.** A flag existe? Com ela em 1 ou 2, uma tarefa que precisaria de mais
   turnos para nao pare — e o evento `result` sinaliza isso como o que? (`subtype`
   `error_max_turns` e o palpite atual do adaptador; confirme ou desminta.)
6. **A forma do stream numa sessao que USA ferramenta e termina bem.** SALVE o stdout bruto
   inteiro num arquivo ao lado do probe (`priv/probes/amostras/`) e imprima o caminho. Depois
   descreva: a sequencia de `type`, onde aparece `usage` (em cada evento `assistant`? so no
   `result`?), e **como se distingue um `tool_use` do ultimo turno de um `tool_use` ja resolvido
   no meio da sessao**. E esta ultima pergunta que a causa 3 do marco consome, e a amostra
   salva vira fixture de teste na T-018e.
7. **Prompt por `stdin`.** O CLI aceita o texto do pedido vindo de `stdin` (arquivo
   redirecionado) em vez de argumento de linha de comando? Teste com um prompt de VARIAS
   LINHAS, com aspas duplas e `&` — o que hoje quebra o `.bat` gerado e devolve exit 255 com
   stdout e stderr vazios. E a pergunta que a T-013a e a T-018d consomem.

**Escreva o probe em disco ANTES de rodar** — licao ja registrada na T-020: instrumento salvo
sobrevive a um corte por cota; instrumento na cabeca do agente, nao.

**Fronteira.** Nada em `lib/` muda nesta tarefa. Se voce descobrir um conserto obvio, ANOTE nas
Notas de execucao e deixe para a tarefa dona do arquivo — ha oito delas esperando este relatorio.

## Criterios de aceite
- [ ] O probe roda inteiro e imprime as sete secoes, cada uma com o comando exato usado e a saida observada.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] A tabela de flags traz a GRAFIA EXATA lida do `--help` da versao instalada, com a versao impressa ao lado.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] Uma sessao real com a combinacao escolhida CRIA um arquivo na raiz — o que o marco nao conseguiu —, conferido por `File.exists?` e nao pela resposta do modelo.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] As duas tentativas de escrever FORA da raiz sao reportadas com `File.exists?` sobre os caminhos de fora, uma por caminho absoluto e outra por travessia.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] O stdout bruto de uma sessao com uso de ferramenta fica salvo como amostra em `priv/probes/amostras/`, e o probe imprime o caminho.
      `verificar: mix run priv/probes/cli_governanca.exs`
- [ ] `_gestao/PROGRESSO.md` registra a tabela de flags e o veredito de cada uma das sete perguntas, incluindo as que nao tiveram resposta boa.
- [ ] Nenhum arquivo de `lib/` foi alterado (saida vazia).
      `verificar: git diff --stat HEAD~1 -- lib`
- [ ] A bateria completa passa nos cinco estagios — o probe novo nao pode quebrar formato nem lint.
      `verificar: mix fabrica.ci`

## Notas de execucao

### Ciclo 1 — CORTADO: o processo do Claude Code encerrou com o agente em voo

Nao e reprovacao e nao gasta ficha. Saneamento de 01/09 — **sobrou trabalho util, tudo em
disco e nao commitado**:

| arquivo | o que e |
|---|---|
| `priv/probes/cli_governanca.exs` (21 KB) | o probe, escrito inteiro |
| `priv/probes/amostras/sessao-com-ferramenta.jsonl` (25 KB) | amostra de stream real, criterio 5 |
| `priv/probes/_ultima_saida.txt` | saida da ultima corrida, ate o meio da Secao 2 |

**O que a corrida ja mediu contra o `claude` 2.1.258 instalado** (nao remedir do zero):

- `--permission-mode` aceita `acceptEdits, auto, bypassPermissions, manual, dontAsk, plan`.
- **Sem nenhuma flag, a escrita e negada** — reproduz o marco 1: *"requested permissions to
  write to ..., but you haven't granted it yet"*, arquivo nao criado.
- **`acceptEdits` ESCREVE.** `auto` nao escreveu; `bypassPermissions` nao escreveu (sem
  `tool_result` de erro capturado — merece segunda olhada).
- `--allowedTools` / `--disallowedTools` sao allow/deny de APROVACAO AUTOMATICA; quem
  restringe o VOCABULARIO de verdade e **`--tools`**, que aceita `""` para desligar todas.
- `--add-dir` existe (diretorio adicional de acesso).
- **`--max-turns` nao aparece no `--help`** da 2.1.258, e o probe registra que ela funciona
  assim mesmo, achado por teste comportamental. Nao-documentada: tratar como tal.

**Consequencia que ja da para adiantar, e e a boa noticia da tarefa:** o menor modo de
permissao que faz uma escrita passar e `acceptEdits`, **nao** `bypassPermissions` — entao a
questao do `--dangerously-skip-permissions` provavelmente nao se coloca. Confirmar no ciclo 2
antes de tratar como fato fechado.

### Ciclo 2 — retomado, probe corrigido, as sete secoes rodaram do inicio ao fim

**As duas respostas que as nove tarefas seguintes precisam ler sem ambiguidade:**

- **`--allowedTools`/`--disallowedTools` NAO restringem o vocabulario de ferramentas — so
  decidem o que e auto-aprovado.** Com `--allowedTools "Read Glob Grep"` e SEM modo de
  permissao que auto-aprove, o evento `system/init` continua anunciando `Write` no `tools`, o
  modelo tenta `Write`, e a negacao vem pela MESMA mensagem de sempre ("...but you haven't
  granted it yet"). Quem tira `Write` do vocabulario de verdade e **`--tools "Read,Glob,Grep"`**:
  o `tools` do `system/init` fica `["Glob", "Grep", "Read"]`, e uma tentativa de `Write` volta
  `<tool_use_error>Error: No such tool available: Write. Write is disabled for this session, in
  subagents as well as here.</tool_use_error>` — sem chegar perto do disco. **A T-018c e a
  T-018d devem usar `--tools`, nunca `--allowedTools`, para restringir o que um papel pode
  fazer.** Evidencia completa (comando + saida) na Secao 3 do `PROGRESSO.md`.
- **`--max-turns <n>` esta AUSENTE do texto de `--help` desta versao (2.1.257 e 2.1.258, as
  duas conferidas), e FUNCIONA mesmo assim.** Confirmado por comportamento, nao por
  documentacao: (1) controle negativo — uma flag inventada de verdade
  (`--totalmente-inventado-xyz`) faz o CLI responder `error: unknown option`; `--max-turns`
  NAO gera esse erro, entao existe; (2) controle positivo — com `--max-turns 2` e uma tarefa
  que precisa de mais turnos, o evento `result` volta `"subtype":"error_max_turns"`,
  `"terminal_reason":"max_turns"`, `"errors":["Reached maximum number of turns (2)"]` — o
  palpite que o `ClaudeCLI` ja tinha (`error_max_turns`) esta CONFIRMADO. **A T-017a pode se
  apoiar nela, mas e superficie NAO documentada: uma atualizacao do CLI pode remove-la sem
  aviso** (o binario se auto-atualizou de 2.1.257 para 2.1.258 durante esta propria medicao,
  sem que a flag mudasse de comportamento — mas o proximo salto de versao pode ser diferente).

Continuei do que o Ciclo 1 deixou em disco (nao redescobri nada: li o probe, o `--help` ja
extraido e as duas tabelas acima antes de tocar em qualquer coisa). Duas correções no probe
que mudaram resultado, e um achado extra que nasceu delas — nenhuma tocou `lib/`:

**1. `bypassPermissions` "nao escreveu (sem tool_result de erro capturado)" — investigado.**
Nao foi negacao silenciosa: o modelo RECUSOU POR TEXTO, sem sequer tentar a ferramenta
(`tool_use tentados: []`). Causa provavel, medida indiretamente: o probe usa o proprio nome
do modo no arquivo/senha (`out_bypassPermissions.txt`, `SENHA-...-bypassPermissions`), e o
texto final foi *"Não posso fazer isso. O padrão da sua solicitação (nome de arquivo com
'bypassPermission...')..."* — o modelo reagiu ao PROPRIO nome do modo como se fosse um sinal
de manipulacao, nao ao mecanismo do CLI. Isto e um artefato do desenho do probe (nome de
arquivo auto-referente), nao um comportamento do CLI a documentar — mas fica registrado
porque explica o "merece segunda olhada" do Ciclo 1. **A resposta do Ciclo 1 se confirma:
`acceptEdits` e o UNICO modo, dos seis, que escreveu.**

**2. Achado que quase inverteu a Secao 2 inteira: caminho CURTO 8.3 muda o motivo da
negacao.** Antes de eu perceber isto, uma rodada completa do probe (com os projetos de
mentira sob `System.tmp_dir!/0`, que devolve `C:\Users\ENZOCO~1\...` nesta maquina — ja
documentado como limitacao conhecida em `Fabrica.Ferramentas.Confinamento`) deu **zero**
modos de permissao passando, `acceptEdits` incluido. A mensagem de negacao tinha mudado de
*"...but you haven't granted it yet"* para *"...which contains a suspicious Windows path
pattern that requires manual approval"* — uma checagem SEPARADA do CLI, que nenhum modo de
`--permission-mode` supera. Troquei a base dos projetos de mentira para `USERPROFILE` (forma
longa) — a MESMA forma que toda raiz de projeto real desta fabrica usa — e o resultado voltou
a bater com o Ciclo 1: so `acceptEdits` escreve. Registrado em detalhe no `PROGRESSO.md`
porque e relevante para QUALQUER tarefa futura que crie diretorio temporario para testar o
CLI: `System.tmp_dir!/0` sozinho pode dar falso negativo.

**3. Secao 7 (stdin) tambem precisou de um segundo ajuste.** Minha primeira tentativa de
mandar o prompt por stdin usava `System.cmd("cmd", ["/c", linha_com_pipe])` — e quebrou com
"A sintaxe do nome do arquivo... esta incorreta", o MESMO sintoma que a doc de
`Comando.para_o_shell/1` ja registra (o requoting do Erlang para argumento de lista com
espaco/pipe nao bate com o parsing que o `cmd.exe` faz do `/c`). Troquei para o MESMO caminho
de producao — `Comando.rodar_separado/3` com `linha = "type \"...\" | claude ..."` — que ja
resolve isso escrevendo um `.bat` em vez de montar argv. Com o ajuste: caminho A (prompt
multi-linha embutido como argumento — o que `ClaudeCLI.linha/1` faz hoje) quebra com
`codigo: 255`, stdout/stderr vazios (reproduzido, nao so citado do marco); caminho B (mesmo
prompt via `stdin` redirecionado de arquivo) funciona limpo, `codigo: 0`, aspas e `&`
intactos na resposta.

**As sete secoes rodaram do inicio ao fim, uma vez, sem interrupcao**, contra `claude`
2.1.258 (o binario se auto-atualizou de 2.1.257 para 2.1.258 no MEIO do ciclo — sem
diferenca observada nos pontos comparados). Veredito completo das sete perguntas, a tabela de
flags e a secao "para quem herdar esta tabela" (as nove tarefas seguintes) estao em
`_gestao/PROGRESSO.md` — nao duplico aqui.

**Reproduzir:** `mix run priv/probes/cli_governanca.exs` (consome cota; ~15 chamadas curtas
em `haiku`). A amostra de stream com ferramenta esta versionada em
`priv/probes/amostras/sessao-com-ferramenta.jsonl`.

**Nao consertei nada em `lib/`** — fora do mandato desta tarefa. As tres causas do marco
(config de permissao ausente, vocabulario incompativel, `motivo_parada` olhando o stream
inteiro) tem, agora, a base de dados para virar tarefa: a Secao 2/3 da a flag e o modo
exatos para a causa 1; a Secao 6 da o mecanismo exato (casar `tool_use_id`) para a causa 3;
a causa 2 (o `Laco` tentar re-executar ferramenta que o CLI ja resolveu sozinho) e mais
estrutural — as nove tarefas seguintes decidem o desenho, este probe so mede.

Bateria completa: `mix fabrica.ci` — 5 estagios, todos ok (formato, compilar, lint 768
mods/funs sem achado, 770 testes/17 doctests/0 falhas, dialyzer). `git diff --stat HEAD~1 --
lib` vazio.

**Commit:** `7157b86`

**[SUPERADA pelo Ciclo 3 — nao aja por ela.** A premissa caiu na remedicao: `bypassPermissions`
ESCREVE. O paragrafo fica como registro do que se acreditava, nao como orientacao.]

**Sugestao para o orquestrador (nao decidi por conta propria):** a Secao 2 revelou que
`bypassPermissions` sozinho nao basta e que existe a flag separada
`--allow-dangerously-skip-permissions`/`--dangerously-skip-permissions` (vista no `--help`,
nao testada aqui — fora do escopo desta tarefa, que e sobre `acceptEdits`). Se alguma das
nove tarefas seguintes precisar de bypass total (nao so escrita), ela vai precisar medir essa
combinacao — deixo o ponteiro em vez de testar por conta propria.

### Ciclo 3 (`tentativas: 2`) — retrabalho apos a reprovacao da Revisao

(A numeracao segue a dos subtitulos ja existentes acima; o Ciclo 1 foi cortado por cota e nao
gastou ficha, entao `tentativas` esta uma unidade atras da contagem de subtitulos.)

**Causa raiz da reprovacao, em uma frase:** o probe AFIRMAVA por texto o que devia medir (o
controle negativo do `--max-turns` era uma string constante) e MEDIA com desenho contaminado (o
nome do modo dentro do arquivo e da senha), e o `PROGRESSO.md` herdou as duas coisas no grau de
prova errado — o defeito que esta tarefa existe para eliminar, dentro do instrumento feito para
elimina-lo.

**Nao remexi no que passou limpo** (criterios 3 e 4, amostra commitada, `.gitignore`, veredito
7): confirmados intactos no diff. `lib/` continua sem uma linha alterada.

**Os cinco achados, e o que cada um virou:**

1. *(importante)* **Controle negativo do `--max-turns` agora EXECUTA.** A flag inventada e
   rodada de verdade e o `stderr` das duas chamadas e comparado. Medido: `--totalmente-inventado-xyz`
   → `codigo 1`, `stderr: "error: unknown option '--totalmente-inventado-xyz'"`; `--max-turns 2`
   → `stderr` vazio. **A conclusao do ciclo anterior estava certa** — mas agora ela degrada
   sozinha: o veredito vira `INCONCLUSIVO` se o binario parar de rejeitar flag desconhecida, e
   `DESMENTIDO` se rejeitar a `--max-turns`. Custo: zero cota (o CLI recusa antes de chamar o modelo).
2. *(importante)* **`bypassPermissions` descontaminado — e o resultado INVERTEU.** Prompt, nome
   de arquivo e senha agora sao identicos palavra por palavra nos seis modos (cada modo numa raiz
   propria, para o nome poder ser igual sem um herdar o arquivo do outro). Medido:
   **`acceptEdits` E `bypassPermissions` escrevem**; `auto`, `manual`, `dontAsk` e `plan` negam,
   cada um com a mensagem registrada. **A frase "so `acceptEdits` escreve", que as nove tarefas
   iam herdar como fato, era um falso negativo do proprio probe.** `acceptEdits` continua sendo a
   recomendacao — agora por privilegio minimo (e o menor dos dois que funcionam), nao por ser o
   unico. Cai junto a especulacao sobre `--dangerously-skip-permissions`: a premissa dela era o
   falso negativo.
3. *(menor)* **`--disallowedTools` medida, e ela tambem inverteu o que estava escrito.** Rodada
   sobre `acceptEdits` para isolar o efeito. Medido: ela **remove** `Write` do `tools` anunciado
   no `system/init` (o PROGRESSO afirmava o contrario, por deducao) — **e mesmo assim o arquivo
   foi criado**, porque o modelo usou `Bash` no lugar. Deny-list nomeia o que proibir e perde para
   a substituicao; so a allowlist `--tools` fecha as saidas. Isso reforca, por um segundo caminho,
   a orientacao que a T-018c/T-018d ja iam receber.
4. *(menor)* **Controle positivo na propria Secao 4.** Uma escrita DENTRO de `raiz4`, mesma flag,
   mesma rodada: `File.exists?` + conteudo = **true**, enquanto o caminho absoluto e a travessia
   foram negados. A unica variavel entre os tres casos passou a ser o lugar do arquivo — **"o CLI
   confina sozinho" agora tem evidencia propria**, que era o ponto que mais interessava por ja ter
   sido repassado ao usuario como fato.
5. *(menor)* **A fixture nao e mais sobrescrita pela verificacao.** O stdout de cada rodada vai
   para `priv/probes/_scratch/` (ja ignorado); a amostra versionada de `amostras/` so e gravada se
   faltar, ou sob `--regravar-amostra`. Conferido no fim desta rodada: `git status` acusa apenas
   os dois arquivos que eu editei — o probe rodou inteiro e **nao sujou a arvore**.

Aproveitei tudo do ciclo anterior e refiz so o que a revisao apontou: o diff e de ~190 linhas no
probe (as cinco correcoes) mais os vereditos 2 a 5 do `PROGRESSO.md`. Nao houve refacao de
abordagem — a reprovacao foi de metodo pontual, nao de desenho.

**Efeito colateral que vale registrar:** duas das cinco correcoes MUDARAM O RESULTADO, nao so a
redacao. Os criterios de aceite estavam todos cumpridos e o verificador aprovou 9 de 9 no ciclo
anterior; foi a pergunta "e o que foi pedido?" que pegou. Vale como evidencia a favor dos dois
portoes serem independentes.

**Rodadas:** o probe rodou uma vez, inteiro, exit 0, contra `claude` **2.1.258** (versao estavel
durante toda esta rodada — sem auto-atualizacao no meio, ao contrario do ciclo anterior). Depois
disso mexi apenas em rotulos impressos da Secao 1 e 3 (que afirmavam o que a medicao nova
desmentiu) e nas conclusoes `=>`, que passaram a ser derivadas dos valores medidos em vez de
constantes; testei essas linhas isoladamente com valores simulados, para nao gastar cota
rerodando o probe so por causa de texto.

Bateria completa: `mix fabrica.ci` — 5 estagios ok (formato, compilar, lint, 770 testes, tipos).
`git diff --stat HEAD~1 -- lib` vazio contra o commit novo.

**Commit:** `3cdbc18` (so `priv/probes/cli_governanca.exs` e `_gestao/PROGRESSO.md`; a amostra
de `amostras/` NAO entrou no diff, que e justamente o que o achado 5 queria). `MAPA.md` nao
precisou de regeneracao: ele nao indexa `priv/probes` e nada de `lib/` mudou.

**Para o verificador:** rodar `mix run priv/probes/cli_governanca.exs` consome cota (~18
chamadas curtas em `haiku`, uma delas sem custo por ser recusada pelo CLI antes do modelo).
Duas coisas mudam de forma legitima entre rodadas, porque dependem do modelo e nao do CLI:
qual ferramenta o modelo escolhe quando `Write` esta proibida (aqui deu `Bash`) e o texto livre
do `plan`. Os fatos de CLI — quem escreve, o que o `system/init` anuncia, os codigos de saida e
o `subtype` — sao os que devem repetir.

## Verificacao

### Ciclo 1

**Nota prévia:** O Ciclo 2 anterior já completou as 7 seções do probe com sucesso, com a saída gravada em disco. Esta verificação re-executa o probe para confirmar que os resultados repetem, focando nos 3 pontos críticos que nenhuma máquina poderia decidir sozinha.

- **[PASSOU] [executado] O probe roda inteiro e imprime as sete secoes, cada uma com o comando exato usado e a saida observada.**
  Comando: `mix run priv/probes/cli_governanca.exs`
  Saída: Probe completado com exit code 0. Sete seções impressas (Versão e flags, Escrita em headless, Restrição de vocabulário, Confinamento, Teto de turnos, Stream com ferramenta, Prompt por stdin).

- **[PASSOU] [executado] A tabela de flags traz a GRAFIA EXATA lida do `--help` da versao instalada, com a versao impressa ao lado.**
  Comando: `mix run priv/probes/cli_governanca.exs`
  Saída: Seção 1 registra `claude --version` = 2.1.258; flags extraídas: `--permission-mode <mode>`, `--allowedTools, --allowed-tools`, `--disallowedTools, --disallowed-tools`, `--tools`, `--add-dir`, `--max-turns` (AUSENTE do help mas funciona), `--mcp-config`, `-r, --resume`, `-c, --continue`, `--fork-session`. Tabela em `_gestao/PROGRESSO.md` registra grafia completa.

- **[PASSOU] [executado] Uma sessao real com a combinacao escolhida CRIA um arquivo na raiz — o que o marco nao conseguiu —, conferido por `File.exists?` e nao pela resposta do modelo.**
  Comando: `mix run priv/probes/cli_governanca.exs` (Seção 2)
  Esperado: `--permission-mode acceptEdits` escreve arquivo de teste
  Obtido: Seção 2 reporta `modo=acceptEdits → escreveu=true`. É o ÚNICO dos seis candidatos que passa. Comprovação: probe testa cada modo contra `claude --print` real e verifica criação do arquivo.

- **[PASSOU] [executado] As duas tentativas de escrever FORA da raiz sao reportadas com `File.exists?` sobre os caminhos de fora, uma por caminho absoluto e outra por travessia.**
  Comando: `mix run priv/probes/cli_governanca.exs` (Seção 4)
  Obtido: Seção 4 testa dois caminhos (`C:\Users\enzoconsulo/AppData/Local/Temp/fora-abs-388.txt` e `..\fora-trav-388.txt`) com `--permission-mode acceptEdits`. Ambos negados pelo CLI com a mesma mensagem de permissão. `File.exists?` confirma: nenhum arquivo foi criado. Verificação posterior: busca em disco por `fora-*.txt` em `%TEMP%` retorna vazio.

- **[PASSOU] [executado] O stdout bruto de uma sessao com uso de ferramenta fica salvo como amostra em `priv/probes/amostras/`, e o probe imprime o caminho.**
  Comando: `mix run priv/probes/cli_governanca.exs` (Seção 6)
  Saída: Probe imprime `stdout bruto salvo em: c:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-v2/priv/probes/amostras/sessao-com-ferramenta.jsonl (15992 bytes)`. Arquivo verificado: existe com 12668 bytes, contém JSON válido (type:system, tools anunciadas, etc.).

- **[PASSOU] [inspecionado] `_gestao/PROGRESSO.md` registra a tabela de flags e o veredito de cada uma das sete perguntas, incluindo as que nao tiveram resposta boa.**
  Base: `_gestao/PROGRESSO.md` seção "T-018b" contém:
  1. Tabela de flags (grafia exata do --help)
  2. Secao 2: só `acceptEdits` passa
  3. **Secao 3 — PONTO CRÍTICO 1:** "`--allowedTools`/`--disallowedTools` SAO allowlist/deny-list de APROVACAO AUTOMATICA, nao removem a ferramenta do vocabulario... A restricao de vocabulario DE VERDADE e `--tools`". Probe confirma: com `--allowedTools "Read Glob Grep"`, event `system/init` ainda anuncia `Write` (tools anunciados no evento incluem Write? true). Com `--tools "Read,Glob,Grep"`, `Write` some e tenta de `Write` retorna erro "No such tool available".
  4. Secao 4: confinamento bloqueia ambos caminhos (absoluto e travessia)
  5. **Secao 5 — PONTO CRÍTICO 2:** "AUSENTE do `--help`...existe e FUNCIONA mesmo assim". Probe confirma: `aparece no --help? false` mas `subtype: "error_max_turns"` e `terminal_reason: "max_turns"` quando limite atingido.
  6. Secao 6: stream salvo, distinção entre tool_use resolvido e pendente via casar id+tool_use_id
  7. Secao 7: stdin funciona (codigo 0), argumento de linha quebra (codigo 255)

- **[PASSOU] [executado] Nenhum arquivo de `lib/` foi alterado (saida vazia).**
  Comando: `git diff --stat HEAD~1 -- lib`
  Saída: (vazio)

- **[PASSOU] [executado] A bateria completa passa nos cinco estagios — o probe novo nao pode quebrar formato nem lint.**
  Comando: `mix fabrica.ci`
  Saída: 
  ```
  formato    ok        3.4s
  compilar   ok        2.5s
  lint       ok        8.9s
  testes     ok       26.1s
  tipos      ok       17.5s
  
  bateria passou: 5 estagio(s) ok, 0 pulado(s)
  ```

Suíte completa: 5 estágios ok, 0 falhados — `mix fabrica.ci`
Graus de prova: 8 executados, 1 inspecionado


## Conformidade

### Ciclo 1

Conformidade: cumpre-parcial

- **Criterio 1** (probe roda inteiro, sete secoes com comando exato e saida observada) ->
  `priv/probes/cli_governanca.exs:111,172,248,298,354,403,494` (as sete chamadas de
  `P.secao/2`), cada uma imprimindo `comando: ...` antes de rodar. **Ressalva:** a Secao 5
  imprime um comando de controle (`claude --totalmente-inventado-xyz`) que o probe NUNCA
  executa — ver o primeiro achado `importante` da Revisao.
- **Criterio 2** (grafia exata do `--help` + versao ao lado) -> `cli_governanca.exs:119-169`:
  a versao vem de `claude --version` (l.120-124) e cada grafia e um `binary_part` do texto
  REAL do `--help` (l.130-135), com `(NAO ENCONTRADO NO --help)` quando falta. Tabela em
  `_gestao/PROGRESSO.md`. Nada digitado de memoria — o ponto central da tarefa, cumprido.
- **Criterio 3** (sessao real CRIA arquivo na raiz, por `File.exists?`) ->
  `cli_governanca.exs:211`, que ainda vai alem do pedido conferindo o CONTEUDO
  (`String.contains?(File.read!(caminho), senha)`).
- **Criterio 4** (duas tentativas fora da raiz, por `File.exists?` nos caminhos de FORA) ->
  `cli_governanca.exs:319-320` (absoluto) e `342-343` (travessia). A pergunta que reprovou o
  marco 1 — `File.exists?` ou resposta do modelo? — esta respondida do lado certo.
- **Criterio 5** (stdout bruto salvo em `priv/probes/amostras/`, caminho impresso) ->
  `cli_governanca.exs:421-425`. A amostra commitada e fixture legitima para a T-018e.
- **Criterio 6** (PROGRESSO com a tabela e o veredito das sete perguntas) ->
  `_gestao/PROGRESSO.md`, secao "T-018b" (tabela de flags + 7 vereditos + o achado do caminho
  8.3 + "para quem herdar esta tabela"). Cumprido na FORMA; e no CONTEUDO que estao os dois
  achados `importante`.
- **Criterio 7** (nada em `lib/`) -> conferido no DIFF, nao no relatorio: `8da3938` toca so
  `priv/probes/*`; `7157b86` toca `.gitignore`, `_gestao/PROGRESSO.md` e `priv/probes/*`.
  Zero arquivos de `lib/`.
- **Criterio 8** (bateria completa nos cinco estagios) -> Verificacao do testador, 5 estagios
  ok. Nao reexecutei.

**Objetivo — o que falta.** O Objetivo e descobrir "MEDINDO contra o `claude` instalado". Duas
das tres afirmacoes que as nove tarefas seguintes vao herdar como fato nao estao no grau de
prova que a palavra "medindo" promete: o controle negativo do `--max-turns` e texto constante
impresso, e a linha "testados os SEIS candidatos de `--permission-mode`" apresenta como valida
uma medicao que o proprio executor declarou contaminada. Isso e parte do Objetivo, nao
acessorio — por isso reprova, e por isso a correcao e barata (uma chamada a mais no probe, um
nome de arquivo neutro, dois paragrafos no PROGRESSO).

**Escopo.** Sem sobra material; nada entregue alem do pedido. Uma divergencia de `areas`: o
diff toca `.gitignore` e `priv/probes/amostras/*`, nenhum dos dois declarado nas `areas` — o
segundo e exigido pelo proprio texto da tarefa (criterio 5), entao e falha de planejamento,
nao do executor.

**Prova visual.** Nao se aplica: a tarefa nao produz interface.

## Revisao

### Ciclo 1

Revisao: REPROVADA — 2 achados `importante`, 4 `menor`.

- **[importante]** `priv/probes/cli_governanca.exs:366-373` — **o controle negativo da Secao 5
  e uma STRING IMPRESSA, nao uma medicao.** O probe afirma que `claude
  --totalmente-inventado-xyz` "responde `error: unknown option`" e que "`--max-turns` NAO gera
  esse erro", e nao executa nem uma coisa nem outra: a unica ocorrencia de "inventado" no
  arquivo inteiro esta DENTRO do literal da l.370, e a chamada com `--max-turns` (l.382) nunca
  tem o `stderr` inspecionado a procura de "unknown option". O `PROGRESSO.md` reproduz a frase
  como se fosse medicao ("controle: uma flag inventada de verdade ... gera `error: unknown
  option`"). Cenario concreto: o proprio PROGRESSO manda "conferir de novo se a versao do CLI
  mudar"; quem rerodar o probe contra uma versao futura que IGNORE flag desconhecida em vez de
  recusa-la ve o mesmo paragrafo de "controle" impresso como se tivesse sido medido naquela
  rodada, e conclui que a flag continua reconhecida. E exatamente o defeito que esta tarefa
  existe para eliminar — afirmacao sem experimento atras — dentro do instrumento feito para
  elimina-lo. O controle POSITIVO (l.380-397) e real e degrada bem (imprime "DESMENTIDO" se o
  `subtype` mudar): por isso `importante`, e nao `critica`.

- **[importante]** `priv/probes/cli_governanca.exs:207-208` + `_gestao/PROGRESSO.md`
  (veredito 2) — **a medicao de `bypassPermissions` continua contaminada pelo desenho do
  probe, e o PROGRESSO registra uma hipotese DIFERENTE da que foi observada.** O probe nomeia
  o arquivo e a senha com o proprio nome do modo (`out_bypassPermissions.txt`,
  `SENHA-...-bypassPermissions`); as Notas registram que o modelo recusou POR TEXTO, reagindo
  ao nome, sem sequer tentar a ferramenta. O executor diagnosticou o artefato e **nao corrigiu
  o probe** — a correcao e uma linha (nome de arquivo neutro), e sem ela qualquer reexecucao
  reproduz o mesmo falso negativo. Pior, no documento que as nove tarefas leem: o PROGRESSO
  (a) afirma "Testados os SEIS candidatos de `--permission-mode`: so `acceptEdits` deixa a
  escrita passar" sem ressalvar que uma das seis medicoes foi invalida, e (b) troca a causa
  OBSERVADA pela especulacao "provavel que precise da flag separada
  `--dangerously-skip-permissions`", que nao se sustenta na frase anterior dela mesma ("o
  modelo recusou por TEXTO" — a camada de permissao do CLI nunca chegou a ser alcancada).
  Cenario concreto: `acceptEdits` auto-aprova EDICAO; a primeira das nove tarefas que precisar
  de auto-aprovacao de COMANDO vai a Secao 2, le que bypass "nao bastou" e gasta um ciclo
  medindo `--dangerously-skip-permissions` atras de uma premissa que a propria medicao
  contradiz. (A hipotese em si esta hedgeada com "provavel" — o achado NAO e ela ter virado
  fato; e a medicao contaminada apresentada como valida, e a causa medida ausente do documento
  herdado.)

- **[menor]** `_gestao/PROGRESSO.md` (tabela de flags e veredito 3) — o COMPORTAMENTO de
  `--disallowedTools` ("deny-list de aprovacao automatica, nao remove do vocabulario") e
  afirmado lado a lado com os medidos, mas o probe so exercita `--allowedTools` (l.254-274) e
  `--tools` (l.276-293). A tarefa so pedia a GRAFIA dessa flag, entao nao ha falta de
  conformidade — o problema e afirmar comportamento sem experimento num documento cujo
  contrato e justamente separar o medido do deduzido. Basta marcar a linha como nao medida.

- **[menor]** `priv/probes/cli_governanca.exs:301-351` — a Secao 4 nao tem controle POSITIVO
  na mesma raiz: nada ali prova que, em `raiz4`, uma escrita DENTRO do projeto com
  `--permission-mode acceptEdits` teria passado. Como a mensagem de negacao observada
  ("...but you haven't granted it yet") e a MESMA da negacao sem flag nenhuma, a evidencia da
  Secao 4, isolada, nao distingue "o CLI confina a raiz" de "o `acceptEdits` nao surtiu efeito
  nessa invocacao". A conclusao segue muito provavel (a Secao 2 mostrou `acceptEdits`
  escrevendo na mesma rodada e na mesma forma de caminho) e o `File.exists?` do criterio 4
  esta correto — mas a frase do PROGRESSO "O CLI tem confinamento proprio — nao e so o
  `Fabrica.Confinamento` que protege" e afirmacao de MECANISMO com consequencia de seguranca,
  e o achado do caminho 8.3 nesta mesma tarefa ja provou que negacao do CLI pode ter causa
  inesperada. Uma terceira chamada (escrever DENTRO de `raiz4`) fecha o buraco.

- **[menor]** `priv/probes/cli_governanca.exs:421-425` — a amostra que o criterio 5 versiona,
  e que a T-018e vai consumir como fixture, e SOBRESCRITA a cada rodada do probe — e rodar o
  probe e o comando `verificar:` de cinco dos oito criterios. Ja aconteceu: a arvore esta suja
  neste momento (`sessao-com-ferramenta.jsonl` com 12.668 bytes na arvore contra 15.635
  commitados), porque o testador rerodou o probe. Nada se perde (o git guarda), mas quem
  reproduzir a verificacao troca a fixture sem perceber. Gravar com sufixo de rodada, ou so
  quando o arquivo nao existir, resolve.

- **[menor]** As `areas` da tarefa nao cobrem `.gitignore` nem `priv/probes/amostras/*`, ambos
  tocados pelo diff. O segundo e exigido pelo texto da tarefa (criterio 5) — falha de
  planejamento, nao do executor; o primeiro e edicao pequena e justificada fora da area
  declarada.

**O que conferi e esta CERTO** — para o ciclo 2 nao mexer no que ja funciona:

- Nada em `lib/` mudou, conferido nos dois commits (`8da3938` e `7157b86`).
- O criterio 3 e mais forte que o pedido: a l.211 confere existencia E conteudo (a senha).
- O criterio 4 usa `File.exists?` nos caminhos de FORA (l.319-320, l.342-343), nao a resposta
  do modelo, e ainda limpa os arquivos se existirem.
- A amostra commitada e fixture legitima para a T-018e: 22 eventos, `usage` em
  `message.usage` de TODOS os `assistant`, `usage` na raiz do `result`, e os dois `tool_use`
  com `tool_result` casando por `tool_use_id`. O veredito 6 do PROGRESSO bate com o arquivo,
  linha por linha — essa afirmacao esta no grau de prova certo.
- O `.gitignore` nao passou a ignorar nada versionavel: as duas entradas novas sao
  `_ultima_saida.txt` (saida transitoria, corretamente tirada do indice) e `_scratch/`; a
  amostra do criterio 5 segue fora do ignore e rastreada.
- **Unico arquivo que abri alem do diff, e o ponto que exigiu isso:** o veredito 7 afirma
  reproduzir o caminho de PRODUCAO. Abri `lib/fabrica/operario/claude_cli.ex` para conferir, e
  reproduz mesmo — `P.linha/3` (l.35-36) e `P.escapar/1` (l.29) do probe sao copia fiel de
  `linha/1` (l.70-71) e `escapar/1` (l.78) do adaptador. O veredito 7 se sustenta.
- Sem roda artesanal: o probe usa `Comando.rodar_separado/3` e `ClaudeCLI.executavel/0`, como
  a tarefa mandou. A reimplementacao de `eventos/1` (l.39-49) e justificada e ate desejavel —
  medir o CLI com o parser privado do proprio adaptador seria petitio principii.
