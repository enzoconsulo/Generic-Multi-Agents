---
id: T-020a
titulo: O Laco nao repassa a raiz do projeto ao operario
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-015, T-018a]
areas: [lib/fabrica/agente/laco.ex, lib/fabrica/operario/falso.ex, test/fabrica/agente/laco_test.exs, test/fabrica/operario/falso_test.exs]
tentativas: 1
criada: 2026-08-31
atualizada: 2026-08-31
---

## Objetivo
Fazer o `Agente.Laco` repassar a raiz do projeto ao operario em toda volta, para que o agente
rode DENTRO do projeto que lhe foi dado e nao no diretorio de quem o chamou.

## Contexto

**Como foi descoberto.** Achado da revisao da T-018a, registrado sem conserto porque nao
afetava o probe. Afeta o marco 1 da T-020, que e onde ele doi — e e por isso que esta tarefa
existe agora.

O defeito e uma linha. Em `lib/fabrica/agente/laco.ex` o laco despacha assim:

    Operario.conversar(requisicao(estado), agulha: estado.agulha)

O `Estado` tem o campo `raiz` (padrao `"."`) e ele JA e usado no laco — a execucao de
ferramenta passa `estado.raiz` para a funcao do catalogo. O que nao acontece e o repasse ao
OPERARIO. E o `Operario.ClaudeCLI` le exatamente essa opcao:

    raiz = Keyword.get(opcoes, :raiz, ".")

Ou seja: um agente despachado com `raiz: "C:/.../projetos/alvo"` executa suas ferramentas no
projeto certo e conversa com o `claude` no diretorio errado — o de quem chamou. As duas metades
do mesmo agente trabalham em lugares diferentes, e nada acusa.

**E a familia de defeito conhecida desta fabrica: sensor sem atuador.** O dado existe, esta
correto, e nao chega em quem o le. A pergunta do CLAUDE.md — *"o sinal ja existe e esta sendo
lido no lugar errado?"* — responde sim, e o conserto e de uma linha.

**Por que isso nao apareceu em nenhum dos testes do laco.** O duble `Operario.Falso` grava as
REQUISICOES que recebeu (`Falso.vistas/1`) e descarta as OPCOES. Uma opcao que nunca chega e
indistinguivel de uma opcao que chega, do ponto de vista da suite — entao consertar so a linha
do `laco.ex` deixa a armadilha armada para a proxima opcao que alguem esquecer de repassar. O
duble precisa passar a gravar as opcoes, e o teste precisa conferir a opcao recebida, e nao o
campo do struct.

**Fronteira desta tarefa.** So o repasse da `raiz`. Nao invente repasse de `prazo`, `modelo` ou
qualquer outra opcao "ja que estamos aqui": `prazo` tem padrao proprio no adaptador e nao ha
campo correspondente no `Estado`, e ampliar o escopo aqui e o que transforma conserto de uma
linha em tarefa de tres ciclos. Se voce achar que falta outro repasse, ANOTE em `## Notas de
execucao` e nao mexa.

`MessagesAPI` nao le `:raiz` e deve continuar ignorando a opcao sem erro — confira que ele nao
quebra, nao o adapte.

## Criterios de aceite
- [ ] `Laco` repassa `raiz: estado.raiz` ao operario em TODA volta, e ha teste que le a opcao recebida pelo duble (nao o campo do struct).
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] `Operario.Falso` grava as opcoes de cada chamada, e ha teste do proprio duble provando que grava.
      `verificar: mix test test/fabrica/operario/falso_test.exs`
- [ ] Um laco de VARIAS voltas (com uso de ferramenta no meio) recebe a mesma raiz em todas elas — a opcao nao se perde depois da primeira.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

Teste-primeiro: escrevi os dois testes novos (`Falso.opcoes_vistas/1` e o repasse da raiz no
laco) ANTES de tocar na implementacao, rodei `mix test test/fabrica/operario/falso_test.exs
test/fabrica/agente/laco_test.exs` e vi os 3 casos falharem com
`UndefinedFunctionError: Fabrica.Operario.Falso.opcoes_vistas/1 is undefined` — vermelho
confirmado pelo motivo certo. So depois implementei.

**O defeito era mesmo de uma linha**, como o Contexto previa:
- `lib/fabrica/agente/laco.ex` — `laco/1` agora chama
  `Operario.conversar(requisicao(estado), agulha: estado.agulha, raiz: estado.raiz)`.

**Mas consertar so essa linha deixava a armadilha armada** (o proprio Contexto ja apontava
isso), entao o duble precisou aprender a gravar o que recebe por fora da requisicao:
- `lib/fabrica/operario/falso.ex` — o estado do Agent ganhou o campo `opcoes_vistas` (lista,
  mesma ordem de `vistas`); `iniciar/1` inicializa vazio; `conversar/2` -> `proxima/3` (era
  `/2`) agora recebe as `opcoes` inteiras e as empilha a cada chamada, esgotado o roteiro ou
  nao. Funcao publica nova: `opcoes_vistas/1`, documentada, devolvendo a lista na ordem de
  chegada.

**Testes (escritos antes, TDD):**
- `test/fabrica/operario/falso_test.exs` — `"guarda as OPCOES de cada chamada, na mesma
  ordem — e nao so a requisicao"`: duas chamadas com `raiz:` diferente, confere
  `Keyword.get/2` em cada entrada de `opcoes_vistas/1`.
- `test/fabrica/agente/laco_test.exs` — novo describe `"a raiz do projeto viaja ate o
  operario em toda volta"`, dois testes: (1) uma volta, confere `raiz: estado.raiz` chegou
  ao duble; (2) VARIAS voltas com uso de ferramenta no meio (3 voltas: duas com
  `com_ferramenta`, uma `fim()`), confere que as tres entradas de `opcoes_vistas/1` trazem a
  MESMA raiz — a opcao nao se perde depois da primeira, que era o risco que o Contexto
  descrevia.

**Confirmado, sem alterar:** `Operario.MessagesAPI` nao le `:raiz` (so `ClaudeCLI` le, com
`Keyword.get(opcoes, :raiz, ".")`, ja existente) — `opcoes` chega a ele como keyword list
qualquer, uma chave extra nao quebra nada. Rodei
`mix test test/fabrica/operario/messages_api_test.exs` (25 testes, 0 falhas) para confirmar
que continua verde sem tocar no adaptador.

**Escopo respeitado:** nao mexi em `prazo`, `modelo` nem qualquer outro repasse — so `raiz`,
como o Contexto pedia. Nao ha `Impedimento`: o Contexto descrevia o defeito e a causa com
precisao, e o conserto saiu exatamente como previsto.

**Reproduzir:**
`mix test test/fabrica/agente/laco_test.exs test/fabrica/operario/falso_test.exs`
(39 testes, 0 falhas)

Bateria completa antes de fechar: `mix verificar` (formato, compilar, `credo --strict`, 787
testes/doctests) e `mix fabrica.ci` (os cinco estagios, `tipos`/Dialyzer incluido) — ambos
`ok`.

**Commit:** `991c95d`

## Verificacao

### Ciclo 1

- **[PASSOU] [executado] Critério 1: Laco repassa raiz ao operário em TODA volta, e há teste que lê a opção recebida pelo duble**
  Comando: `mix test test/fabrica/agente/laco_test.exs`
  Saída: 22 testes, 0 falhas. O teste no describe "a raiz do projeto viaja ate o operario em toda volta" linha 272-280 confere que `Keyword.get(opcoes, :raiz)` retorna o valor passado, não o campo do struct.

- **[PASSOU] [executado] Critério 2: Operario.Falso grava as opções de cada chamada, e há teste do próprio duble provando que grava**
  Comando: `mix test test/fabrica/operario/falso_test.exs`
  Saída: 17 testes, 0 falhas. O teste na linha 79-92 verifica que `Falso.opcoes_vistas(agulha)` retorna as opções em ordem, e confere que cada entrada traz a `:raiz` correta via `Keyword.get/2`.

- **[PASSOU] [executado] Critério 3: Um laço de VÁRIAS voltas (com uso de ferramenta no meio) recebe a mesma raiz em todas elas**
  Comando: `mix test test/fabrica/agente/laco_test.exs` (mesmo arquivo do critério 1)
  Saída: 22 testes, 0 falhas. O teste na linha 282-297 do arquivo executa 3 voltas (duas com ferramenta, uma fim) e confere que todas as 3 entradas de `Falso.opcoes_vistas(agulha)` trazem a mesma raiz via `Enum.map(&Keyword.get(&1, :raiz))`, com asserção explícita: `assert raizes == ["C:/projetos/alvo", "C:/projetos/alvo", "C:/projetos/alvo"]`.

- **[PASSOU] [executado] Critério 4: A bateria completa passa nos cinco estágios, tipos incluído**
  Comando: `mix fabrica.ci`
  Saída: `bateria passou: 5 estagio(s) ok, 0 pulado(s)` — formato (2.8s), compilação (2.8s), lint (6.8s), testes (22.6s), tipos/Dialyzer (16.6s).

Verificação adicional: `mix test test/fabrica/operario/messages_api_test.exs` — 25 testes, 0 falhas. O `Operario.MessagesAPI` ignora a opção `:raiz` sem erro, como esperado.

Suíte completa: 787 testes passando (conforme `mix fabrica.ci` — estágio testes), zero falhas.
Graus de prova: 4 executados, 0 inspecionados, 0 julgados.


## Conformidade

### Ciclo 1

Conformidade: cumpre

- **Criterio 1 — `Laco` repassa `raiz: estado.raiz` em TODA volta, com teste lendo a OPCAO** →
  `lib/fabrica/agente/laco.ex:67`
  (`Operario.conversar(requisicao(estado), agulha: estado.agulha, raiz: estado.raiz)`), dentro
  de `defp laco/1`, que e o unico ponto de chamada ao operario no `lib/` inteiro (conferido por
  busca: as demais ocorrencias de `conversar(` sao as definicoes dos tres adaptadores e o
  despachante `Operario.conversar/2`). Como e recursivo sobre o estado, o repasse vale para toda
  volta por construcao. Teste em `test/fabrica/agente/laco_test.exs:267-280` — assere
  `Keyword.get(opcoes, :raiz)` sobre `Falso.opcoes_vistas/1`, isto e, a opcao RECEBIDA, nunca o
  campo do struct.
- **Criterio 2 — `Operario.Falso` grava as opcoes, com teste do proprio duble** →
  `lib/fabrica/operario/falso.ex`: estado do Agent com `opcoes_vistas: []` em `iniciar/1`,
  empilhamento em `proxima/3` (era `/2`) e a funcao publica documentada `opcoes_vistas/1` com
  `@spec opcoes_vistas(pid()) :: [keyword()]`. Teste em
  `test/fabrica/operario/falso_test.exs:79-92`, com duas chamadas de `raiz:` diferente,
  provando ordem e conteudo.
- **Criterio 3 — varias voltas com ferramenta no meio, mesma raiz em todas** →
  `test/fabrica/agente/laco_test.exs:282-297`: roteiro de 3 voltas (duas `com_ferramenta`, uma
  `fim()`) e assercao sobre a lista inteira
  (`raizes == ["C:/projetos/alvo", "C:/projetos/alvo", "C:/projetos/alvo"]`). O que o criterio
  pedia — que a opcao nao se perca depois da primeira — e exatamente o que a lista prova.
- **Criterio 4 — bateria completa nos cinco estagios** → `mix fabrica.ci` registrado na
  Verificacao: 5 estagios ok, `tipos`/Dialyzer incluido, 787 testes.

**Objetivo (espirito):** o Objetivo era fazer as duas metades do agente — ferramenta e conversa
— rodarem no MESMO projeto. O diff faz isso na unica linha que faltava, e o `ClaudeCLI` ja lia
`Keyword.get(opcoes, :raiz, ".")` sem alteracao. E o conserto de sensor-sem-atuador que a
tarefa descreveu, nao um contorno.

**Fronteira de escopo (a tarefa PROIBIU ampliar) — respeitada:** o diff toca `raiz` e nada
mais. Nao ha mencao a `prazo` nem a `modelo` em lugar nenhum da mudanca.
`lib/fabrica/operario/messages_api.ex` nao foi tocado, como a tarefa mandou — e a leitura dele
confirma que continua ignorando a chave extra sem erro: ele so faz `Keyword.get/3` e
`Keyword.take(opcoes, [:plug, :req])`, nunca `Keyword.validate!`, entao `:raiz` passa batido por
contrato e nao por sorte. `lib/fabrica/operario/claude_cli.ex` tambem intocado.

**Areas:** os 4 arquivos alterados sao exatamente os 4 declarados no frontmatter. O quinto
arquivo do commit, `_gestao/MAPA.md`, e gerado (`mix fabrica.mapa` na hora do commit) e traz
apenas a linha de `opcoes_vistas/1` — nao e escrita fora de area.

**Prova visual:** nao se aplica (tarefa sem interface).

## Revisao

### Ciclo 1

Aprovado sem ressalvas de gravidade `critica` ou `importante`.

O que foi verificado, alem da leitura integral do diff:

- **O duble nao afrouxou nada.** `Falso.vistas/1` esta byte a byte igual: mesma assinatura,
  mesmo `Enum.reverse(estado.vistas)`, mesma docstring. O que mudou foi so o acrescimo de uma
  segunda chave ao mapa do Agent e a aridade de `proxima/2` -> `proxima/3`, que e `defp` e nao
  tem cliente fora do modulo. Nenhum teste existente podia depender dela.
- **O duble segue sem caminho para a rede ou para credencial.** Busca por `HTTP`, `Req.`,
  `Finch`, `:httpc`, `System.cmd`, `File.`, `System.get_env` e `api_key` em
  `lib/fabrica/operario/falso.ex` devolve UMA unica linha, e e a frase do proprio `@moduledoc`
  (linha 8) que enuncia a regra — nao ha referencia executavel. O diff nao acrescenta `alias`,
  `import` nem dependencia; so `Agent.get`/`Agent.get_and_update`, que ja estavam la. O teste
  do marco da v0.1 que falha se este arquivo referenciar modulo de HTTP continua satisfeito, e
  isso e coerente com os 787 testes verdes.
- **Nao ha chamada ao operario que tenha ficado sem a raiz.** Busca por `Operario.conversar` em
  `lib/` devolve um unico ponto de chamada (`laco.ex:67`), o que foi corrigido.
- **Sem duplicata de papel / roda reinventada.** Gravar as opcoes reusa o mesmo Agent e o mesmo
  padrao de `vistas/1`; nao ha segundo mecanismo de espionagem do duble concorrendo com o
  primeiro.
- **Contrato do behaviour intacto:** `@callback conversar(Requisicao.t(), keyword())` continua
  atendido; as opcoes gravadas sao a keyword list recebida, sem transformacao.

Achados (nenhum reprova):

- `[menor]` `_gestao/GUIA.md:98-125` — `opcoes_vistas/1` nao foi registrado na secao
  "Ja existe — nao reinvente", que manda em texto: *"Ao criar um helper que outra tarefa vai
  querer, acrescente-o aqui na mesma tarefa"*. E helper que outra tarefa vai querer por
  construcao: o proprio Contexto desta tarefa antecipa "a proxima opcao que alguem esquecer de
  repassar", e a tabela ja registra helper de teste equivalente
  (`Fabrica.Fonte.producao_que_casa/2`, de `test/support/`), entao o precedente do projeto
  cobre este caso. Atenuante que impede gravidade maior: `Falso.vistas/1`, o irmao mais velho
  e mais usado, tambem nunca foi registrado ali — a lacuna e do GUIA como um todo, e nao um
  desvio que esta entrega inventou. Cenario de custo, se ficar assim: uma tarefa futura que
  precise provar o repasse de `prazo` reescreve a gravacao de opcoes por nao achar a que ja
  existe. Sugestao de linha: `| provar que uma opcao chegou ao operario num teste |
  Falso.opcoes_vistas/1 — le a OPCAO recebida, nao o campo do struct | lib/fabrica/operario/falso.ex |`.
- `[menor]` `lib/fabrica/agente/laco.ex:67` — `raiz: nil` explicito no despacho agora VIAJA ate
  o adaptador. `Estado.novo/1` e `struct!(__MODULE__, opcoes)`, entao `Laco.rodar(raiz: nil)`
  produz `estado.raiz == nil`; antes a chave simplesmente nao existia e o `ClaudeCLI` caia no
  default `Keyword.get(opcoes, :raiz, ".")`, agora ela existe com valor `nil` e o default nao
  se aplica. **Nao reprova, e nao e regressao introduzida por esta tarefa:** com `raiz: nil` a
  execucao de ferramenta ja quebrava antes, no mesmo estado, por `funcao.(argumentos, nil)`
  (`laco.ex:135`) — o caminho ja estava inutilizavel por outra via. Fica registrado so porque a
  linha de default do adaptador deixou de proteger este caso, e ninguem mais notaria.

Nenhum arquivo alem do diff precisou ser aberto por inteiro; as tres consultas fora do diff
foram dirigidas e nomeadas acima: leitura de opcoes em `messages_api.ex` (para julgar se a
chave extra quebra o adaptador que a tarefa mandou nao tocar), `Estado.novo/1` em `estado.ex`
(para julgar o default de `raiz`) e a secao 4 do `GUIA.md` (achado pedido pelo despacho).
