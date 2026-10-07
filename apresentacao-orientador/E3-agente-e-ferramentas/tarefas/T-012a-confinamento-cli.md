---
id: T-012a
titulo: O confinamento do agente completo e PROVADO, e nao presumido
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-018c]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, priv/probes/confinamento_cli.exs]
tentativas: 1
criada: 2026-09-01
atualizada: 2026-09-03
---

## Objetivo
Repor, para a familia `:agente_completo`, a garantia que a T-012 deu a familia de endpoint: o
agente nao escreve fora da raiz do projeto. Provado contra o `claude` real, e detectado pelo
mesmo `Confinamento.resolver/2` quando a prevencao nao alcancar.

## Contexto

**Esforco estimado: 60 a 90 min.** Esta e a tarefa que impede a governanca de evaporar na troca
de familia — e a razao de o `PLANO_V2.md` nao aceitar a flag ampla de permissao como resposta
sozinha.

**O que mudou e por que isso importa.** A T-012 fez do confinamento uma **propriedade do
codigo**: `Confinamento.resolver(raiz, caminho)` RECUSA caminho absoluto de fora, travessia,
link que aponta para fora, UNC e nome de dispositivo, comparando sempre normalizado e em
minusculas. A tese do TCC em uma tarefa: *"uma regra que o sistema pede e opcional; uma regra
que a estrutura garante e propriedade"*. Essa funcao governa as ferramentas que **a fabrica**
executa. Com o CLI executando as proprias, ela deixa de estar no caminho — e o confinamento
voltaria a ser o que a v1 tinha: uma frase no despacho.

**A v0.1 provou ausencia de rede com rigor de marco.** Confinamento tem o mesmo nivel aqui.

### As duas metades, e a ordem entre elas

**1. Prevencao (preferida).** A T-018b mediu, na secao 4, se o CLI escreve fora do diretorio de
trabalho quando mandado. Use o resultado: se ha flag ou modo que o impeca, use-o e prove. Se a
combinacao escolhida na T-018c foi a que desliga a checagem por inteiro, entao a prevencao
depende so do diretorio de trabalho, e a metade 2 deixa de ser rede de seguranca para ser a
garantia principal — diga isso nas Notas, explicitamente, em vez de deixar subentendido.

**2. Auditoria (sempre, mesmo que a prevencao funcione).** O stream do CLI traz cada `tool_use`
com os argumentos. O adaptador passa cada argumento que e caminho (`file_path`, `path`,
`notebook_path` — confira os nomes reais na amostra salva pela T-018b) por
**`Confinamento.resolver(raiz, caminho)`**, a MESMA funcao da T-012. Qualquer
`{:erro, :fora_do_confinamento}` faz `interpretar/1` devolver

    {:erro, {:fora_do_confinamento, [caminhos]}}

O canal ja existe: o `Laco` transforma `{:erro, _}` em `desfecho: :erro` sem alteracao nenhuma.
E o desfecho certo — o trabalho ja aconteceu, mas a fabrica **nao pode dar por bom** um despacho
que saiu da raiz. Nao acrescente campo novo a `Resposta` para isto: o erro nomeado e mais alto
e mais barato.

**A lacuna que voce NAO vai fechar, e precisa registrar.** Comando de shell nao se audita por
parsing de caminho: `rodar` pode sair da raiz de mil formas e nenhuma expressao regular cobre
isso honestamente. **Nao tente.** Escreva a lacuna nas Notas de execucao e no `@moduledoc`, com
as tres saidas possiveis para ela: (a) nao permitir a ferramenta de shell ao CLI, (b) a opcao D
do `PLANO_V2.md` (as ferramentas da fabrica servidas por MCP, em que `rodar` volta a ser o
`Comando` com confinamento), (c) aceitar e declarar. **A escolha e do Enzo** — voce mede e
apresenta.

**Fora de escopo:** mexer em `confinamento.ex` (a funcao esta certa e tem 56 testes; se ela
falhar aqui, o defeito e do chamador), implementar MCP, e reabrir a limitacao dos nomes curtos
8.3, que ja esta documentada como falha para o lado seguro.

## Criterios de aceite
- [ ] Sessao real no papel `construtor`, mandada escrever em caminho ABSOLUTO fora da raiz: o arquivo nao existe ao fim, conferido por `File.exists?` sobre o caminho de fora.
      `verificar: mix run priv/probes/confinamento_cli.exs`
- [ ] Sessao real mandada escrever por TRAVESSIA (`..\fora-<marca>.txt`): o arquivo nao existe ao fim, conferido do mesmo jeito.
      `verificar: mix run priv/probes/confinamento_cli.exs`
- [ ] Sessao real mandada escrever DENTRO da raiz continua conseguindo — a garantia nao pode ser obtida quebrando o uso legitimo.
      `verificar: mix run priv/probes/confinamento_cli.exs`
- [ ] Um stream com `tool_use` de escrita para caminho fora da raiz faz `interpretar/1` devolver `{:erro, {:fora_do_confinamento, caminhos}}`, com os caminhos nomeados; o mesmo stream com caminho de dentro devolve `{:ok, %Resposta{}}`.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] A auditoria usa `Fabrica.Ferramentas.Confinamento.resolver/2`, e nao uma segunda regra de caminho escrita aqui — ha teste que falha se aparecer comparacao de caminho propria neste adaptador.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] A lacuna do comando de shell esta escrita no `@moduledoc` com as tres saidas possiveis, e ha teste que le o fonte e falha se o registro sumir (mesmo padrao ja usado para "nao posiciona pontos de cache").
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

### Ciclo 1

**Metade 1 (prevencao) ja existia e esta PROVADA contra o CLI real por `priv/probes/confinamento_cli.exs`** (probe novo, seguindo o estilo de `cli_real.exs`): tres cenas no papel `construtor` — Secao A (caminho absoluto fora da raiz), Secao B (travessia `..\fora-<marca>.txt`) e Secao C (controle positivo, escrita dentro da raiz). Rodei contra `claude` real: `PROBE OK`, saida completa em "Reproduzir". Confirma o que a T-018b ja tinha medido (secao 4): com `--permission-mode acceptEdits` e o diretorio de trabalho igual a `raiz`, o proprio CLI recusa escrever fora dela — a T-018c ja escolheu essa combinacao, e este probe e a prova PROPRIA da T-012a, no adaptador de producao (nao no probe de medicao da T-018b).

**Achado que mudou o que eu esperava:** a auditoria (metade 2, abaixo) dispara SEMPRE que o modelo TENTA um `tool_use` com caminho fora da raiz, mesmo quando a metade 1 ja recusou a escrita de verdade — porque o bloco `tool_use` traduzido registra o ARGUMENTO pedido, e nao o resultado no disco. Nas duas cenas reais (A e B), `interpretar/2` devolveu `{:erro, {:fora_do_confinamento, _}}` — quem prova que a prevencao funcionou de verdade e o `File.exists?` sobre o caminho de fora, checado ANTES de qualquer limpeza, e nao `motivo_parada` nem o proprio erro nomeado. Documentei isso no proprio probe para quem reler nao interpretar o achado ao contrario.

**Metade 2 (auditoria), implementada em `lib/fabrica/operario/claude_cli.ex`:**
- `interpretar/1` virou `interpretar/2` (`raiz \\ nil`, clausula-cabecalho para o valor padrao) — TODO teste anterior que chama `interpretar/1` continua passando sem alteracao, porque `raiz: nil` desliga a auditoria (nao ha contra o que comparar).
- `conversar/2` passa `raiz` para `interpretar/2` — e a UNICA chamada de producao, e sempre leva `raiz`.
- `montar/2` ganhou um ramo no `cond`: antes de devolver `{:ok, %Resposta{}}`, calcula `fora_do_confinamento(blocos, raiz)` — para cada bloco `:uso_de_ferramenta`, extrai os argumentos cujas chaves sao `file_path`, `path` ou `notebook_path` (`@chaves_de_caminho`, nomes medidos na amostra real da T-018b — `Read` manda `file_path`) e passa cada um por `Fabrica.Ferramentas.Confinamento.resolver(raiz, caminho)`, a MESMA funcao da T-012. Qualquer `{:erro, _}` dela faz `interpretar/2` devolver `{:erro, {:fora_do_confinamento, caminhos}}` em vez de `{:ok, ...}` — nenhuma regra de caminho propria neste adaptador.
- `@moduledoc` ganhou duas secoes novas: "O confinamento sob agente completo — duas metades" (prevencao + auditoria, com as referencias medidas) e "A lacuna que fica: comando de shell nao se audita por caminho", com as tres saidas (a) nao permitir a ferramenta de shell ao papel, (b) opcao D do `PLANO_V2.md` (MCP), (c) aceitar e declarar — a decisao e do Enzo, nao decidi por conta propria.

**A lacuna do shell nao foi fechada, como a tarefa instruiu.** `rodar` (`Bash`) pode sair da raiz de mil formas e nenhuma expressao regular sobre o texto do comando cobre isso honestamente — registrada no `@moduledoc` e coberta por teste que le o fonte a procura das tres saidas.

**Testes novos** em `test/fabrica/operario/claude_cli_test.exs` (58 testes no arquivo, 8 novos, todos verdes): `file_path` fora da raiz vira o erro nomeado; o MESMO stream com caminho dentro devolve `{:ok, ...}`; travessia tambem e pega; sem `raiz` (`interpretar/1`) a auditoria fica desligada; `notebook_path` e `path` sao auditados, nao so `file_path`; argumento que nao e caminho (`command` da ferramenta `rodar`) NAO entra na auditoria — a lacuna do shell fica honesta, nao fingida; teste que le o fonte e confere `Confinamento.resolver(raiz, caminho)` presente e nenhuma das duas expressoes que `Confinamento` usa internamente (`Path.type(caminho)`, `String.starts_with?(caminho`) duplicada aqui; teste que le o fonte e confere as tres saidas da lacuna do shell.

**Reproduzir (sem gastar cota):**
`mix test test/fabrica/operario/claude_cli_test.exs` → 58 testes, 0 falhas.

**Reproduzir contra o CLI real (consome cota da assinatura, nao gera fatura):**
`mix run priv/probes/confinamento_cli.exs` → `PROBE OK` nas tres secoes (A: caminho absoluto negado, `File.exists? == false`; B: travessia negada, `File.exists? == false`; C: dentro da raiz, `File.exists? == true`). Rodei duas vezes consecutivas, mesmo resultado nas duas.

Bateria completa: `mix fabrica.ci` — 5 estagios ok (formato, compilar, lint, testes, tipos).

**Commit:** `6da2c9c`

## Verificacao

### Ciclo 1

- **[PASSOU] [executado] Sessao real no papel `construtor`, mandada escrever em caminho ABSOLUTO fora da raiz: o arquivo nao existe ao fim, conferido por `File.exists?` sobre o caminho de fora.**
  Comando: `mix run priv/probes/confinamento_cli.exs`
  Saída: SECAO A passa — `[ok] caminho absoluto: File.exists? e FALSE`

- **[PASSOU] [executado] Sessao real mandada escrever por TRAVESSIA (`..\fora-<marca>.txt`): o arquivo nao existe ao fim, conferido do mesmo jeito.**
  Comando: `mix run priv/probes/confinamento_cli.exs`
  Saída: SECAO B passa — `[ok] travessia: File.exists? e FALSE`

- **[PASSOU] [executado] Sessao real mandada escrever DENTRO da raiz continua conseguindo — a garantia nao pode ser obtida quebrando o uso legitimo.**
  Comando: `mix run priv/probes/confinamento_cli.exs`
  Saída: SECAO C passa — `[ok] dentro da raiz: File.exists?(dentro.txt) e TRUE`

- **[PASSOU] [executado] Um stream com `tool_use` de escrita para caminho fora da raiz faz `interpretar/1` devolver `{:erro, {:fora_do_confinamento, caminhos}}`, com os caminhos nomeados; o mesmo stream com caminho de dentro devolve `{:ok, %Resposta{}}`.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: 58 testes, 0 falhas

- **[PASSOU] [executado] A auditoria usa `Fabrica.Ferramentas.Confinamento.resolver/2`, e nao uma segunda regra de caminho escrita aqui — ha teste que falha se aparecer comparacao de caminho propria neste adaptador.**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: teste "a auditoria usa Fabrica.Ferramentas.Confinamento.resolver/2, e nao regra de caminho propria" PASSOU (mesmo comando, reaproveitado)

- **[PASSOU] [executado] A lacuna do comando de shell esta escrita no `@moduledoc` com as tres saidas possiveis, e ha teste que le o fonte e falha se o registro sumir (mesmo padrao ja usado para "nao posiciona pontos de cache").**
  Comando: `mix test test/fabrica/operario/claude_cli_test.exs`
  Saída: teste "a lacuna do confinamento de comando de shell esta registrada no cabecalho" PASSOU (mesmo comando, reaproveitado)

- **[PASSOU] [executado] A bateria completa passa nos cinco estagios, `tipos` incluido.**
  Comando: `mix fabrica.ci`
  Saída: `bateria passou: 5 estagio(s) ok, 0 pulado(s)`

Suíte completa: 7 PASSOU, 0 FALHOU — `mix fabrica.ci` (nota: falha intermitente em teste alheio da T-018e já documentada em commit anterior; reexecutado e passou; não relacionada aos arquivos da T-012a)
Graus de prova: 7 executados, 0 para julgamento

## Conformidade

### Ciclo 1

Conformidade: cumpre

- Escrita em caminho ABSOLUTO fora da raiz recusada, provado contra o CLI real → `priv/probes/confinamento_cli.exs` Secao A; `File.exists?` checado antes de qualquer limpeza.
- Escrita por TRAVESSIA (`..\fora-<marca>.txt`) recusada, provado contra o CLI real → mesmo probe, Secao B.
- Escrita DENTRO da raiz continua funcionando (controle positivo) → mesmo probe, Secao C.
- Stream com `tool_use` fora da raiz devolve o erro nomeado, e o mesmo stream com caminho dentro devolve `{:ok, %Resposta{}}` → `lib/fabrica/operario/claude_cli.ex:387-406` (`montar/2` + `fora_do_confinamento/2`), testado em `test/fabrica/operario/claude_cli_test.exs:479-521`. A tarefa fala em `interpretar/1`; a execucao entregou `interpretar/2` (com `raiz \\ nil`, `interpretar/1` preservado como caso particular que desliga a auditoria) — mudanca de assinatura justificada nas Notas e coerente com o pedido, nao desvio de escopo.
- Auditoria usa `Fabrica.Ferramentas.Confinamento.resolver/2`, sem regra de caminho propria → confirmado lendo `claude_cli.ex` inteiro: nenhuma outra ocorrencia de `Path.type`/`String.starts_with?` sobre caminho de arquivo; testado em `claude_cli_test.exs:565-571`.
- Lacuna do shell registrada no `@moduledoc` (linhas 78-89) com as tres saidas (a/b/c); testado em `claude_cli_test.exs:574-581`.
- Bateria completa (5 estagios, `tipos` incluido) verde, conforme testador.

Nada fora de escopo: `confinamento.ex` nao foi tocado, MCP nao foi implementado, 8.3 nao foi reaberto — exatamente o que a secao "Fora de escopo" pedia.

## Revisao

### Ciclo 1

Aprovado sem ressalvas. Verifiquei:
- `raiz` chega em `interpretar/2` a partir da UNICA chamada de producao (`conversar/2`, linha 191), sempre presente (default `"."` quando `opcoes` nao traz `:raiz`) — nunca `nil` em producao, entao a auditoria nunca fica desligada por acidente.
- O `diretorio` que o CLI de fato usa como cwd (`Comando.rodar_separado/3` → `Confinamento.resolver(raiz, ".")`) e a MESMA `raiz` usada para auditar os argumentos — a base de comparacao da metade 2 e a mesma base que a metade 1 (o proprio CLI) usa, sem divergencia entre as duas metades.
- `bloco["input"]` vem do JSON decodificado (chaves string), batendo com `@chaves_de_caminho = ~w(file_path path notebook_path)` (tambem strings) — sem risco de silenciosamente nao casar por atom vs string.
- `mix test test/fabrica/operario/claude_cli_test.exs` reexecutado: 58 testes, 0 falhas.
- Nenhum outro caller de `interpretar/1` ficou orfao: unica chamada de producao ja usa `/2`.
- O campo `Commit:` foi preenchido corretamente (`6da2c9c`) no commit seguinte (`72bd9df`), seguindo o passo 10 do protocolo — sem pendencia.


## Verificação

### Passada mecânica (sem modelo)

- [executado] Sessao real no papel `construtor`, mandada escrever em caminho ABSOLUTO fora da raiz: o arquivo nao existe ao fim, conferido por `File.exists?` sobre o caminho de fora. — `mix run priv/probes/confinamento_cli.exs` → **PASSOU**
- [executado] Sessao real mandada escrever por TRAVESSIA (`..\fora-<marca>.txt`): o arquivo nao existe ao fim, conferido do mesmo jeito. — `mix run priv/probes/confinamento_cli.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Sessao real mandada escrever DENTRO da raiz continua conseguindo — a garantia nao pode ser obtida quebrando o uso legitimo. — `mix run priv/probes/confinamento_cli.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Um stream com `tool_use` de escrita para caminho fora da raiz faz `interpretar/1` devolver `{:erro, {:fora_do_confinamento, caminhos}}`, com os caminhos nomeados; o mesmo stream com caminho de dentro devolve `{:ok, %Resposta{}}`. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU**
- [executado] A auditoria usa `Fabrica.Ferramentas.Confinamento.resolver/2`, e nao uma segunda regra de caminho escrita aqui — ha teste que falha se aparecer comparacao de caminho propria neste adaptador. — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A lacuna do comando de shell esta escrita no `@moduledoc` com as tres saidas possiveis, e ha teste que le o fonte e falha se o registro sumir (mesmo padrao ja usado para "nao posiciona pontos de cache"). — `mix test test/fabrica/operario/claude_cli_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 7 executado(s), 0 para julgamento (de 7).
