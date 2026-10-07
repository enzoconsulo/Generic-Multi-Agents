---
id: T-082
titulo: "Confinamento: destino RELATIVO de link é resolvido contra o diretório REAL, não contra o texto"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-081]
areas: [lib/fabrica/ferramentas/confinamento.ex, test/fabrica/ferramentas/confinamento_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-02
---

## Objetivo
Fechar uma fuga do confinamento que existe nas duas plataformas: quando um diretório do MEIO do
caminho já é link e o link seguinte tem destino RELATIVO, `Confinamento.real/1` resolve esse destino
contra o diretório TEXTUAL, e não contra o diretório real. Por isso julga "dentro" um caminho que o
sistema operacional abre fora da raiz.

## Contexto
Achado pelo executor da T-080 (Notas do Ciclo 1 de `T-080-confinamento-raiz-unix.md`), NÃO
corrigido lá por estar fora do escopo da causa B:

- Em `real/1`, o destino de um link vem de `:file.read_link_all/1` e é expandido com
  `Path.expand(destino, Path.dirname(caminho))` — o `dirname` do caminho COMO TEXTO.
- O kernel resolve o destino relativo a partir do diretório onde o link REALMENTE está. Exemplo:
  `raiz/d1/d2/atalho -> /tmp` e `/tmp/l -> ../../x`. Pedido `raiz/d1/d2/atalho/l`: o texto dá
  `raiz/d1/x` (dentro), mas o acesso real vai a `/x` (fora).
- O agente consegue montar isso sozinho (`rodar` com `ln -s`), então não depende de estado
  pré-existente na máquina.
- Conserto provável: expandir contra `real(Path.dirname(caminho))`. Confirme lendo o código depois
  da T-080/T-081 (`real/1` foi reescrita na T-080: sobe por todos os ancestrais, com teto de 40
  saltos).

## Critérios de aceite
- [ ] Teste novo, que falha antes do conserto: com `d2/atalho` apontando para um diretório FORA da
      raiz, e dentro dele um link de destino relativo que sobe até outro lugar fora da raiz, o
      `resolver/2` do caminho que passa pelos dois links devolve `{:erro, :fora_do_confinamento}`.
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] Um link de destino relativo que, resolvido a partir do diretório real, fica DENTRO da raiz
      continua aceito (teste explícito, para o conserto não virar recusa em massa).
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`

## Notas de execução

### Ciclo 1

**O que foi feito.** `Confinamento.real/1` deixou de resolver o destino de link com
`Path.expand(destino, Path.dirname(caminho))` (o `dirname` do TEXTO) e passou a andar componente a
componente a partir da raiz do sistema, como o kernel (`andar/3` + `partir_destino/2`, privadas):
o prefixo acumulado é sempre REAL; cada componente juntado a ele, se for link, é trocado pelo
destino — relativo continua do prefixo real, absoluto recomeça da raiz dele. A confirmação pedida
no Contexto ("expandir contra `real(dirname)`") estava certa quanto à causa, mas o conserto de uma
linha foi descartado por dois motivos medidos/raciocinados:

1. **`..` dentro do destino** (`l -> atalho/../z`, com `atalho` link para fora): `Path.expand`
   anula `atalho/..` no texto antes de seguir o link — a MESMA fuga (destino relativo julgado pelo
   texto, não pelo diretório real). A caminhada resolve `..` só depois dos links anteriores a ele.
   Teste próprio; falhava antes.
2. **Contagem de saltos por ramo vira exponencial** com `real(dirname)` + `real(destino)` na mesma
   chamada (links que se multiplicam, `n1 -> n2/n2`, ... pedem 2^n). Agora `saltos` conta a
   resolução INTEIRA, como o `MAXSYMLINKS` do kernel (40, mesmo teto). Teste-guarda com 25 links
   (`@tag timeout: 10_000`), que a implementação antiga também passava (ela era linear) — ele
   protege a decisão, não prova a fuga.

Semântica da T-080 preservada: componente ausente é anexado e a caminhada segue (o link mais acima
continua sendo seguido); ciclo continua `{:erro, :fora_do_confinamento}`. Saída idêntica
(`normalizar/1` no fim). `Path.absname/2` (e não `expand`) no destino absoluto, para não anular
`..` e para o `\x` do Windows herdar a unidade do prefixo.

**Testes novos** (fim de `confinamento_test.exs`, describe "escape 7 ... (T-082)"):
- critério 1 — `d1/d2/atalho -> fora/alvo` e `fora/alvo/l -> ../../x`: o teste primeiro prova que
  o SO sai da raiz (`File.read!` lê `<base>/x/segredo.txt`) e depois exige
  `{:erro, :fora_do_confinamento}` para `d1/d2/atalho/l/segredo.txt`, `d1/d2/atalho/l` e
  `d1/d2/atalho/l/novo/arquivo.txt`;
- `..` dentro do destino relativo depois de um link (item 1 acima);
- critério 2 — link relativo simples (`rel -> sub`) aceito, e `atalho-fundo -> sub/a/b` com
  `sub/a/b/volta -> ../../alvo`: pelo TEXTO sairia da raiz, pelo diretório real fica em
  `sub/alvo` — aceito (antes do conserto era RECUSADO: recusa falsa que o conserto também tira);
- teto global de 40 saltos (item 2 acima).

Destino relativo exige symlink de verdade (a junção `mklink /J` só aceita absoluto). Uma sonda em
tempo de compilação do teste (`@sem_link_relativo`) tenta `File.ln_s` relativo; sem privilégio
(Windows sem modo desenvolvedor) o describe sai como PULADO com o motivo (`@describetag skip:`),
não aprovado por vazio. No Linux a sonda devolve `nil` e tudo roda. O ramo Windows não foi
exercitado nesta máquina.

**Prova do "antes"** (`git stash push lib/fabrica/ferramentas/confinamento.ex`): 41 testes, 3
falhas — exatamente os três cenários de fuga/recusa falsa. Com o conserto: 41 testes, 0 falhas.

**Fluxo real** (`mix run`, `ln -s` de verdade num temporário): `cat .../d1/d2/atalho/l/segredo.txt`
imprime "segredo de x" (o kernel sai), e `Arquivo.ler(raiz, "d1/d2/atalho/l/segredo.txt")` →
`{:erro, :fora_do_confinamento}`; `Arquivo.ler(raiz, "rel/a.txt")` (link relativo para dentro) →
`{:ok, "ok\n"}`.

**Bateria:** `mix fabrica.ci` completo — 1ª execução caiu SÓ pela intermitente conhecida
`test/fabrica/criterios/classe_falha_test.exs:315` (fora das áreas); 2ª execução: 6/6 ok
(formato, compilar, lint `credo --strict`, testes, tipos/dialyzer, backup).

**Arquivos:** `lib/fabrica/ferramentas/confinamento.ex` (real/1 → caminhada; comentário reescrito),
`test/fabrica/ferramentas/confinamento_test.exs` (4 testes + sonda no fim do arquivo; nenhuma
linha anterior deslocada).

**Reproduzir:** `mix test test/fabrica/ferramentas/confinamento_test.exs`

**Commit:** `db7b126`

**Sugestão (não feita):** `juntar/2` usa `Path.expand` no pedido do agente, então `atalho/../x`
vira `x` antes de qualquer link; isso NÃO é fuga hoje (a ferramenta abre o caminho devolvido, já
sem `..`), mas devolve um caminho diferente do que o kernel abriria com o texto original. Se um
dia alguma ferramenta usar o texto cru em vez do devolvido, vira fuga — candidato a nota no GUIA.


## Verificação

### Ciclo 1

**HEAD:** 652e0ca (T-082: hash da revisão), trabalho em db7b126

- **[PASSOU] [executado] Critério 1: links relativos que saem da raiz são recusados**
  Comando: `mix test test/fabrica/ferramentas/confinamento_test.exs` + prova real com `ln -s` fora do projeto
  Saída: 41 tests, 0 failures. Teste específico: `d1/d2/atalho -> /tmp/alvo` e `alvo/l -> ../../x`, chamada `resolver/2` com `d1/d2/atalho/l/segredo.txt` retorna `{:erro, :fora_do_confinamento}`. Kernel acessa o arquivo (`segredo de x`), mas a função recusa.

- **[PASSOU] [executado] Critério 2: links relativos que ficam dentro da raiz são aceitos**
  Comando: prova real com link relativo `sub/a/b/volta -> ../../alvo` que fica dentro
  Saída: `resolver/2` chamado com `sub/a/b/volta/a.txt` retorna `{:ok, "/tmp/.../raiz/sub/a/b/volta/a.txt"}`. Link relativo foi resolvido contra o diretório real e ficou dentro — aceito.

Suíte completa: 1267 tests, 1 failure (intermitente conhecida `classe_falha_test.exs:315`, fora das áreas — rodada 2 confirma); `mix test test/fabrica/ferramentas/confinamento_test.exs` isolado: 41 passed, 0 failed.

Graus de prova: 2 executados, 0 inspecionados, 0 julgados.

## Conformidade

Conformidade: cumpre

- [Critério 1: teste novo que falha antes; `d2/atalho` → fora + link relativo que sobe para outro
  lugar fora → `{:erro, :fora_do_confinamento}`] → `test/fabrica/ferramentas/confinamento_test.exs:376`
  (`d1/d2/atalho -> fora/alvo`, `fora/alvo/l -> ../../x`; prova primeiro que o SO sai, com
  `File.read!`, e depois exige a recusa para `.../l/segredo.txt`, `.../l` e `.../l/novo/arquivo.txt`).
  "Falha antes" conferido de forma independente: a versão `db7b126^` de `confinamento.ex`, compilada à
  parte num temporário, devolve `{:ok, ".../projeto/d1/d2/atalho/l/s.txt"}` nesse cenário; a atual
  recusa. Conserto: `lib/fabrica/ferramentas/confinamento.ex:210-246` (`real/1` → `andar/3` +
  `partir_destino/2`).
- [Critério 2: link relativo que, pelo diretório real, fica dentro continua aceito] →
  `confinamento_test.exs:420` (link relativo simples `rel -> sub` + o caso inverso, `atalho-fundo ->
  sub/a/b` com `volta -> ../../alvo`, que pelo texto sairia e de verdade fica dentro).
- **Objetivo, no espírito:** a fuga está fechada, e não só na forma do exemplo. Fiz 7.500 consultas
  em mundos aleatórios de links (destinos relativos com `..`/`.`, absolutos, `/`, ciclos, links que
  se multiplicam), comparando com o `realpath` do GNU como oráculo: **0 fugas, 0 recusas falsas, 0
  divergências** do caminho real nos caminhos que existem.
- **Escopo, sobre a ampliação (pergunta do orquestrador):** a caminhada componente a componente é o
  **conserto mínimo que fecha a fuga descrita no Objetivo**, e não sobra. O conserto de uma linha
  sugerido no Contexto deixaria aberta a mesma classe de fuga ("destino relativo julgado pelo texto"),
  só que com `..` DENTRO do destino: conferi que, com `l2 -> atalho/../z` e `atalho -> fora/alvo`, a
  versão antiga aceita `l2` (`{:ok, ".../projeto/l2"}`) enquanto o kernel vai a `fora/z`. Expandir
  contra `real(dirname)` ainda passaria `atalho/../z` por `Path.expand`, que anula `atalho/..` antes de
  seguir o link. O teto global de saltos é consequência direta dessa escolha. Ficou dentro das `areas`
  declaradas (os dois arquivos), e o Contexto da tarefa ("Conserto provável", "Confirme lendo o
  código") deixava a forma em aberto. O 4º teste (teto de 40, `:443`) é guarda da decisão, não
  sobra: não prova a fuga, mas trava a propriedade que a decisão introduziu.
- **Contrato com o resto do plano:** a semântica da D-014 continua valendo: `\` como separador,
  caixa que segue o SO, raiz `/` preservada, recusa de UNC. A T-080 também: componente ausente
  anexado com o link mais acima seguido, ciclo julgado como fora. Sondei caso a caso, antes e depois
  (detalhe na Revisão).
- **Prova visual:** não se aplica (tarefa sem interface).
- **Não verificado:** o ramo Windows (junção/`mklink`, destino `\x` relativo ao volume via
  `Path.absname/2`, forma do destino que `read_link_all` devolve para junção). Os testes novos saem
  PULADOS lá sem privilégio de symlink, com motivo. Isso não muda o veredito (o pedido é das duas
  plataformas, e o que dá para provar aqui é Linux), mas o Windows fica sem prova.

## Revisão

### Ciclo 1

Commit revisado: `db7b126` (gravado nas Notas; `652e0ca`/`152726a` só tocam o arquivo da tarefa).
Diff lido inteiro. Além do diff, abri só o que o julgamento exigiu: o resto de `confinamento.ex`
(`juntar/2`, `dentro?/2`, `normalizar/1`, `sob?/2`, para conferir o que `real/1` recebe e como o
resultado é comparado) e os pontos de chamada de `resolver/2` em `arquivo.ex` e `claude_cli.ex`, para
responder se a sobra de `juntar/2` é fuga hoje.

**Aprovado. Nenhum achado `critica`/`importante`.**

Sondas (cópias renomeadas do módulo novo e do de `db7b126^`, compiladas num temporário fora do
projeto, com `ln -s` reais. Não rodei `mix test` nem a CI). Igual antes e depois, e correto:
- raiz `/`: `resolver("/", "etc/passwd")` e `("/", "../../etc")` → `{:ok, ...}`;
- link para fora absoluto (`etc -> /etc`) e link para `/` (`raizsis -> /`) → `:fora_do_confinamento`;
- ciclo `c1 <-> c2` → `:fora_do_confinamento`. `l4 -> l4/a/.` também: o `realpath` do GNU **trava**
  nesse caso, e o módulo recusa no 41º salto;
- `\` como separador: `..\fora\x` → fora; `sub\f.txt` → `{:ok, ".../sub/f.txt"}`. Destino de link com
  `\` no Linux é um nome só, como no kernel;
- irmão em outra caixa (`../Projeto/x`, e link `irmao -> ../Projeto`) → fora;
- UNC `\\srv\share` e `//srv/share` → `:caminho_unc`. Dispositivo `nul.txt` → `:dispositivo`;
- link relativo para dentro (`rel -> sub`, `ponto -> .`, `pai -> ..` voltando a `projeto/`,
  `proprio -> <raiz absoluta>`) → aceito;
- ausente seguido de `..` no destino (`naoexiste/../../fora`) → recusado, mesmo lado seguro de antes.
Diferenças antes → depois: exatamente as três esperadas (as duas fugas fechadas, `d1/d2/atalho/l` e
`l2`, e a recusa falsa `fundo/volta` removida).

Terminação e custo: cada salto consome 1 de 40, e componentes sem link são consumidos. Não há
recursão por ramo. Nas 7.500 consultas do fuzz nenhuma resolução passou de 500 ms.

Sobre `juntar/2` (pergunta do orquestrador): **não é fuga hoje nas ferramentas nativas.**
`Arquivo.ler/escrever/editar/listar` (`arquivo.ex:48,70,88,100`) e `Comando` (`comando.ex:57,100`)
abrem o `absoluto` DEVOLVIDO por `resolver/2`, já sem `..`. O que é julgado é o que é aberto: pedir
`atalho/../x` lê `raiz/x`, um caminho diferente do que o kernel abriria com o texto cru, mas dentro.
Existe um consumidor que julga o texto cru e não abre o devolvido: a auditoria do `ClaudeCli`
(`claude_cli.ex:884`, metade 2 do confinamento), que julga o argumento do `tool_use` enquanto quem
abre é o CLI externo. Se o CLI passar `raiz/atalho/../x` ao kernel sem colapsar `..` no texto, a
auditoria diz "dentro" para um acesso a `fora/x`. Não verifiquei como o CLI normaliza (ferramentas
Node em geral colapsam com `path.resolve`, o que tornaria o caso inócuo). É anterior a esta tarefa e
fica fora das `areas` dela. Risco a registrar, não reprovação.

Notas `menor` (não reprovam):
- [menor] `lib/fabrica/ferramentas/confinamento.ex:229`: `List.to_string(destino)` levanta
  `FunctionClauseError` quando o destino do link tem bytes que não são UTF-8. Nesse caso
  `:file.read_link_all/1` devolve **binário**, e não charlist. Cenário sondado: `ln -s $'x\377y' ruim`
  dentro da raiz e `resolver(raiz, "ruim/a.txt")` → exceção, em vez de `{:erro, ...}`. Não é fuga (o
  acesso não acontece) nem regressão (a versão `db7b126^` levanta igual, na mesma conversão). Mas o
  agente consegue montar o link com `rodar`, e a ferramenta morre em vez de recusar. Fica como
  candidata a corretiva de 1 linha (aceitar binário, ou tratar o caso como fora).
- [menor] Auditoria do `ClaudeCli` × `juntar/2`: ver o parágrafo acima. Candidata a tarefa própria,
  ou ao menos a uma nota no GUIA ("quem julga pelo `resolver/2` tem de abrir o caminho DEVOLVIDO").


### Orquestrador (2026-10-02) — portão mecânico da bateria completa

O testador relatou a bateria só até `testes` (caiu 2× em `classe_falha_test.exs:315`, intermitente
fora das áreas), então `tipos` e `backup` não tinham rodado. Conferido pelo orquestrador no HEAD
`152726a`, sem custo de modelo: `mix fabrica.ci` **6/6 verde** (formato 0,9 s · compilar 0,7 s · lint
3,6 s · testes 46,7 s · tipos 7,5 s · backup 5,8 s).
