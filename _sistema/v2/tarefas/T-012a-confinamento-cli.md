---
id: T-012a
titulo: O confinamento do agente completo e PROVADO, e nao presumido
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-018c]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, priv/probes/confinamento_cli.exs]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
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


## Verificacao


## Conformidade


## Revisao
