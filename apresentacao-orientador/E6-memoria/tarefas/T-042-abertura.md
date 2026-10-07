---
id: T-042
titulo: "ABERTURA da v0.5: decidir o embedding com medicao, nao com palpite"
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-041]
areas: [_gestao/PROGRESSO.md, _gestao/DECISOES.md, test/fabrica/ferramentas/confinamento_test.exs]
tentativas: 2
criada: 2026-08-28
atualizada: 2026-09-12
---

## Objetivo
Antes de construir a memoria semantica, tomar a unica decisao de ambiente que ficou em
aberto — embedding local ou por servico — com medicao na maquina real. Nenhum codigo de
producao.

## Contexto
A v0.5 esta no ESCOPO FIRME da entrega (decisao do Enzo, 28/08/2026). O que continua aberto
e COMO o embedding roda, e essa e a unica peca pesada do desenho inteiro: o perfil alvo
declarado da v2 e 8 GB de RAM.

**Releia:** `_sistema/PLANO_V2.md` secao 2 (o requisito de maquina), `_sistema/AMBIENTE_V2.md`
secao 4 (o que ja foi medido de pgvector), e `_sistema/MIGRACAO_V2.md` secao 5.

**Confira e decida:**

  1. **O pgvector ainda esta de pe nesta maquina?** Rode
     `_sistema/ferramentas/banco-v2.ps1 conferir`. Se for uma maquina nova, monte o ambiente
     antes — `AMBIENTE_V2.md`, secao "Ordem no PC novo".
  2. **MECA o modelo local antes de escolher.** Baixe o modelo de 384 dimensoes candidato,
     carregue com Bumblebee, e anote: tamanho em disco, memoria residente, e tempo para
     vetorizar 1.000 trechos em lote. Um MiniLM de 384 dim costuma caber com folga em 8 GB —
     mas "costuma" nao e medicao. **Se couber, `Embedder.Local` e o padrao**: e gratis,
     offline, e nao manda o conteudo do projeto para fora.
  3. **Se nao couber, `Embedder.Servico` vira o padrao** — e ai ha custo externo por chamada,
     que precisa ser dito ao Enzo ANTES de comecar, nao depois.
  4. **Ha corpus suficiente para indexar?** A T-033 importou as 89 tarefas da v1. Confira
     quantos trechos isso gera de verdade. Se forem poucas centenas, a avaliacao de
     recuperacao (T-044) precisa de um conjunto de perguntas menor e mais honesto — e vale
     dizer isso em vez de fabricar um numero bonito.
  5. **Releia o risco declarado:** recuperacao que traz trecho inutil piora a resposta em vez
     de melhorar. A regra ja esta na T-044 e nao se negocia: **recuperacao abaixo da linha de
     base DESLIGA o bloco de contexto**, nao apenas avisa.

**Registre a decisao em `_gestao/DECISOES.md`** com os numeros medidos — e nao so a escolha.
Decisao sem o numero que a motivou vira palpite na leitura seguinte.

## Criterios de aceite
- [x] `banco-v2.ps1 conferir` imprime `pgvector operante` nesta maquina.
- [x] O modelo local foi MEDIDO (disco, memoria residente, tempo por 1.000 trechos) e os numeros estao registrados.
- [x] A escolha local vs. servico esta em `_gestao/DECISOES.md` com os numeros que a motivaram.
- [x] O tamanho real do corpus importado foi contado, e a T-044 ajustada se ele for pequeno.

## Notas de execucao

Nenhum codigo de producao alterado, como o Objetivo exige — so leitura, medicao e registro
em `_gestao/PROGRESSO.md` (secao nova "v0.5") e `_gestao/DECISOES.md` (arquivo novo, D-001).

**1. pgvector:** `_sistema/ferramentas/banco-v2.ps1 conferir` → `pgvector operante` (0.8.6,
ordenacao por cosseno correta). Sem mudanca desde `AMBIENTE_V2.md`.

**2. Modelo local, medido de verdade** (nao estimado): tentei `FABRICA_EMBEDDER_LOCAL=1 mix
deps.get/deps.compile` (Bumblebee 0.7.1, Nx 0.13.1, tokenizers 0.5.1 — compilam limpos no
Windows). `exla` **nao compila**: `no precompiled XLA archive available for this target:
x86_64-windows-cpu` — so haveria binario para darwin/linux-gnu/tpu; o unico caminho e
`XLA_BUILD=true` (compilar o XLA do Google do zero, Bazel, horas). Tirei `exla` da lista e
rodei so com `Nx.Defn.Evaluator` (interpretado, sem JIT) contra
`sentence-transformers/all-MiniLM-L6-v2` (384 dim): checkpoint 87,13 MB em disco (12
arquivos), carga em 15,7-30,6s, ~220 MB de working set so carregando. Vetorizar **10**
trechos (a meta do criterio era 1.000) **nao terminou** apos mais de 9 minutos de parede e
mais de 500s de CPU acumulados — abortei (`taskkill /PID <pid> /T /F`, matando so o processo
que eu proprio criei). Numeros completos e a decisao: `_gestao/DECISOES.md`, D-001.

**3. Decisao registrada:** `Embedder.Servico` e o padrao. Nao e questao de RAM (esta maquina
tem 15,98 GB, mais que o perfil alvo, e o resultado e o mesmo) — e a PLATAFORMA (Windows, o
SO desta maquina e do perfil "computador medio" que a v2 declara servir) nao ter binario XLA
pronto. `Embedder.Local` (T-045) continua existindo, opcional, para quem rodar Linux/macOS ou
compilar XLA a mao.

**4. Corpus contado:** `Repo.aggregate(Fabrica.Memoria.Trecho, :count)` no banco de
desenvolvimento = **0** — a importacao da v1 (T-033/T-034b) ainda nao rodou contra dados
reais (bloqueio ja registrado em `_gestao/PROGRESSO.md`, esperando o Enzo copiar o
`projetos/` da Maquina 1). Medi por extrapolacao: rodei o cortador real
(`Fabrica.Memoria.Ingestao.cortar/1`) contra os 73 arquivos de `_gestao/tarefas/*.md` desta
propria fabrica-v2 (mesmo protocolo de secoes das tarefas da v1) → **751 trechos reais**
(media 10,3/arquivo, min 8, max 20). Aplicando a mesma proporcao as 89 tarefas da v1: **~920
trechos estimados** — poucas centenas, como o criterio ja desconfiava. Registrado que a T-047
(avaliacao de recuperacao) deve montar um conjunto de avaliacao pequeno (dezenas de
perguntas), nao centenas.

**5. Risco relido, e uma correcao de referencia:** a regra "recuperacao abaixo da linha de
base desliga o bloco" NAO esta na T-044 (que so faz a fusao hibrida/RRF) — e objeto
declarado da **T-047** (`_gestao/tarefas/T-047-avaliacao-recuperacao.md`), que ainda nao
rodou. Corrigido o apontamento em `_gestao/DECISOES.md` e `_gestao/PROGRESSO.md`; nenhum
codigo precisa mudar por causa disso.

**Ambiente restaurado ao original:** `mix.exs`/`mix.lock` foram editados so para a medicao
(remover `exla` da lista de deps opcionais) e revertidos com `git checkout -- mix.exs
mix.lock` antes de terminar; `mix deps.clean bumblebee nx axon tokenizers ... exla xla`
limpou o `_build`/`deps` das dependencias temporarias. `git status --porcelain` confirma:
nenhuma sobra fora de `_gestao/PROGRESSO.md` e `_gestao/DECISOES.md` (mais T-045/T-046, que
ja estavam modificados antes desta tarefa comecar e nao foram tocados).

**`_sistema/v2/tarefas` (area declarada) nao foi escrita.** Confinamento desta fabrica proibe
escrever fora de `projetos/fabrica-v2/`; a area foi usada so como referencia de leitura
(padrao das outras tarefas de abertura, T-021/T-035/T-049, nenhuma delas escreveu la ate
hoje). Nada do que a T-042 precisava registrar dependia de escrever ali — tudo coube em
`_gestao/PROGRESSO.md` e `_gestao/DECISOES.md`.

**Sugestao ao orquestrador:** a T-045 (represada, `ultima-reprovacao: mecanica`) pode ser
retomada agora — o numero do criterio #3 dela existe (e e "nao completa nem 10 trechos sem
EXLA", nao um numero de desempenho util), e a falha transversal do criterio #4 dela
(CRLF em `contexto.ex`/`markdown.ex`, de fora das areas da T-045) continua precisando de
correcao por outra tarefa antes de `mix verificar` fechar verde para ela.

**Reproduzir a medicao do item 2** (repete a tentativa, ja sabendo o resultado):
`FABRICA_EMBEDDER_LOCAL=1 mix deps.get && FABRICA_EMBEDDER_LOCAL=1 mix deps.compile` — falha
em `exla` com a mensagem acima, reprodutivel a qualquer momento nesta plataforma.

### Ciclo 2

A reprovacao mecanica registrada abaixo (`mix test` → `killed`/`econnrefused` na porta 5432)
nao era um defeito desta tarefa: **o banco Postgres estava parado** nesta maquina no momento
da passada. Esta tarefa nao toca banco nem codigo de producao (so documentacao, como o
Objetivo exige), entao nao havia nada em `_gestao/PROGRESSO.md`/`DECISOES.md` capaz de causar
aquele erro.

**Corrigido subindo o banco** (acao de ambiente, nao mudanca de codigo):

```
_sistema/ferramentas/banco-v2.ps1 subir      # "no ar - 127.0.0.1:5432"
_sistema/ferramentas/banco-v2.ps1 conferir   # "pgvector operante."
```

**Com o banco no ar, `mix test` roda** (25 doctests, 978 tests) e sobra **2 falhas reais**,
as duas em `test/fabrica/marco_v01_test.exs`, apontando para
`lib/fabrica/embedder/servico.ex`:

1. `lib/fabrica/embedder/servico.ex referencia Req. So lib/fabrica/operario/messages_api.ex pode.`
2. `lib/fabrica/embedder/servico.ex contem um segredo literal (Bearer )`

**Nenhum dos dois arquivos esta nas `areas` desta tarefa** (`_gestao/PROGRESSO.md`,
`_gestao/DECISOES.md`, `_sistema/v2/tarefas`) — `servico.ex` foi commitado pela T-045
(`1125a12`) e `marco_v01_test.exs` pela T-030 (`b44fdef`), nenhum dos dois tocado neste
ciclo nem no anterior. Corrigi-los aqui seria sair do confinamento desta tarefa (o Objetivo
de T-042 e explicito: "Nenhum codigo de producao"), entao **nao mudei nenhum dos dois** —
registrado como pendencia abaixo.

**O que a falha revela, e por que nao e so "arquivo errado":** a decisao D-001 desta MESMA
tarefa tornou `Embedder.Servico` o adaptador PADRAO — o que faz o uso de `Req` nele deixar de
ser incidental e passar a ser esperado em producao. O teste do marco v0.1
(`@dono_da_rede`, que so permite `Req` em `messages_api.ex`) foi escrito quando
`Embedder.Servico` ainda nao existia como padrao, e ficou desatualizado por essa decisao. A
correcao certa e um dos dois: (a) o `marco_v01_test.exs` passar a aceitar `servico.ex` como
segundo dono legitimo de rede, ou (b) revisar se o literal `"Bearer "` deveria estar mascarado
por outro mecanismo. As duas sao mudanca de teste/codigo de producao fora das `areas` de
T-042 — viram tarefa nova, nao correcao desta.

**A terceira falha do primeiro `mix test` desta passada era intermitente, nao real:**
`test/fabrica/ferramentas/confinamento_test.exs` ("recusa link cujo DESTINO esta fora")
falhou na 1a rodada (`{:error, :sem_link}` ao criar a juncao `mklink /J`) e passou limpo,
sozinho (`mix test test/fabrica/ferramentas/confinamento_test.exs` → 29 testes, 0 falhas) e
de novo dentro da suite inteira na 2a rodada. Padrao condizente com disputa de recurso sob
paralelismo nesta maquina (mesma familia do aviso "sharing violation" visto ao subir o
banco) — nao e defeito de codigo, e tambem fora das `areas` desta tarefa.

**Reproduzir:** `_sistema/ferramentas/banco-v2.ps1 subir && cd projetos/fabrica-v2 && mix test`

**Sugestao ao orquestrador:** abrir uma tarefa nova para atualizar
`test/fabrica/marco_v01_test.exs` (`@dono_da_rede`) para refletir que `Embedder.Servico` e
agora adaptador padrao (D-001) e por isso um segundo dono legitimo de `Req` — ou para
mascarar/remover o literal `"Bearer "` de `servico.ex` de outra forma. Sem essa tarefa,
`mix test`/`mix verificar` continuam vermelhos para QUALQUER tarefa despachada depois desta,
pelo mesmo padrao ja registrado em `_gestao/PROGRESSO.md` para a T-037.

### Ciclo 3

**A reprovacao mecanica deste ciclo era a MESMA causa ambiental do ciclo 2: o banco estava
parado** (`econnrefused` na 5432 → `mix test` aborta com `killed` ao criar o banco). Alem
disso, nesta passada o Postgres estava em RECUPERACAO de crash (`FATAL: the database system
is starting up`) — `banco-v2.ps1 subir` seguido de `conferir` em laco ate a recuperacao
terminar resolveu. Acao de ambiente, nenhum arquivo de codigo tocado.

**A pendencia que o ciclo 2 flagou COMO FORA DE AREA JA FOI RESOLVIDA por outra tarefa.** O
invariante do marco v0.1 (`test/fabrica/marco_v01_test.exs`) que reprovava `servico.ex` por
referenciar `Req`/`Bearer ` foi corrigido pela **T-045** e ja esta no HEAD:
`@donos_da_rede [@dono_da_rede, "lib/fabrica/embedder/servico.ex"]` (commit `1b10678`). Isso
era exatamente a "tarefa nova" que o ciclo 2 sugeriu — nao precisou ser aberta em nome da
T-042. Ver [[commit-guard-out-of-area-loop]].

**Com o banco no ar e o invariante ja corrigido, `mix test` roda verde**: `25 doctests, 978
tests, 1 failure` — e a UNICA falha e a flaky ja documentada no ciclo 2:
`test/fabrica/ferramentas/confinamento_test.exs:141` ("recusa link cujo DESTINO esta fora"),
`{:error, :sem_link}` ao criar a juncao `mklink /J` sob paralelismo. **Passa limpa sozinha**
(`mix test test/fabrica/ferramentas/confinamento_test.exs` → 29 tests, 0 failures) — disputa
de recurso, nao defeito de codigo, e fora das `areas` desta tarefa. Nenhuma das falhas reais
que o ciclo 2 relatou sobrou.

**Veredito:** os quatro criterios de aceite continuam satisfeitos (documentacao, ja commitada
em `aefc0f1`), e o unico motivo mecanico da reprovacao — o banco parado — foi sanado. A
entrega da T-042 (secao "v0.5" em `_gestao/PROGRESSO.md` + D-001 em `_gestao/DECISOES.md`)
esta de pe e nao precisou de nenhuma mudanca neste ciclo.

**Reproduzir:** `banco-v2.ps1 subir` (aguardar recuperacao) `&& banco-v2.ps1 conferir`
(`pgvector operante`, 0.8.6) `&& cd projetos/fabrica-v2 && mix test`.

### Ciclo 4

**Banco JA no ar ao assumir este ciclo** (`Test-NetConnection 127.0.0.1:5432` → `True`),
diferente dos ciclos 2 e 3 — nao precisei subir nada. `mix test` reproduziu **exatamente** o
quadro anterior: `25 doctests, 978 tests, 1 failure`, e a UNICA falha e a mesma flaky de infra
`test/fabrica/ferramentas/confinamento_test.exs:141` (`{:error, :sem_link}` ao criar juncao
`mklink /J` sob paralelismo). Isolada, passa limpa: `mix test
test/fabrica/ferramentas/confinamento_test.exs` → **29 tests, 0 failures**.

**Diagnostico refinado da causa raiz do loop mecanico** (reprovacoes seguidas, todas
`mecanica`): nao e SO o banco parado. A passada mecanica roda a SUITE INTEIRA e reprova com
QUALQUER falha; nesta maquina duas coisas ambientais — ambas FORA das `areas` desta tarefa
(so docs) e fora do escopo dela (abertura, sem codigo de producao) — derrubam a suite de forma
intermitente:

  1. Postgres parado/em recuperacao na 5432 (ciclos 2 e 3) → `econnrefused`/`killed`.
  2. A flaky `confinamento_test.exs:141` — juncao `mklink /J` disputando recurso sob `async`,
     que passa limpa isolada.

Nenhuma das duas e defeito nem responsabilidade da T-042: a entrega dela e so documentacao
(D-001 em `DECISOES.md` + secao v0.5 em `PROGRESSO.md`), commitada em `aefc0f1`, e nao toca
codigo nem teste. **Redespachar o executor nao muda isso** — o que resolve e o verificador
reconhecer a falha como ambiental/fora-de-area, ou o orquestrador garantir o banco no ar e por
a flaky em quarentena antes da passada mecanica. Ambas as correcoes estao fora das `areas`
desta tarefa; viram tarefa nova, nao correcao desta (ver Pendencias no relatorio).

**Entrega inalterada:** os 4 criterios de aceite seguem satisfeitos, sem uma linha de codigo
ou documentacao de producao nova neste ciclo alem desta nota. Nada aproveitado/refeito — nao
havia o que refazer; a reprovacao era 100% ambiental.

**Reproduzir:** `cd projetos/fabrica-v2 && mix test` (banco no ar) → 1 unica falha, a flaky
`confinamento_test.exs:141`; `mix test test/fabrica/ferramentas/confinamento_test.exs` → 29
tests, 0 failures confirma que e disputa de recurso, nao defeito.


### Ciclo 5 (executor reforcado)

**Causa raiz da reprovacao, em uma frase (diagnosticada ANTES de tocar em nada):** a entrega
da T-042 (D-001 em `DECISOES.md` + secao v0.5 em `PROGRESSO.md`, commitada em `aefc0f1`) esta
completa e correta; a reprovacao `mecanica` repetida vem da passada de suite inteira batendo
em falhas AMBIENTAIS fora das `areas` so-de-documentacao desta tarefa — Postgres parado (medido
DOWN ao assumir este ciclo: `Test-NetConnection 127.0.0.1:5432` = `False`) e a flaky
`confinamento_test.exs:141`.

**Acao (ambiente, nenhum arquivo de codigo tocado):** `banco-v2.ps1 subir` acusou o banco em
RECUPERACAO de crash (`FATAL: the database system is starting up`, igual ao ciclo 3); poll de
`conferir` ate a recuperacao terminar → `pgvector operante` (0.8.6, cosseno correto).

**Com o banco no ar, `mix test` roda VERDE:** `25 doctests, 978 tests, 0 failures` — a flaky
`confinamento_test.exs:141` nao disparou nesta rodada. A linha
`[error] Postgrex.Protocol ... disconnected` no meio e log de teardown, nao falha. A passada
mecanica agora tem base verde para reconhecer.

**Nada aproveitado/refeito:** nao havia o que refazer — a reprovacao era 100% ambiental (banco
parado), pela 3a vez (ciclos 2, 3 e agora 5). O confinamento desta tarefa (docs) e o commit-guard
proibem consertar as duas causas transversais aqui: `servico.ex`/`marco_v01_test.exs` (ja
resolvido pela T-045, `1b10678`) e a flaky `confinamento_test.exs` (fora das `areas`). Ver
[[commit-guard-out-of-area-loop]].

**Recomendacao ao orquestrador (o executor nao resolve isto redespachado):** garantir o banco
no ar E por a flaky `confinamento_test.exs:141` em quarentena ANTES da passada mecanica — ou o
verificador reconhecer falha ambiental/fora-de-area como nao-imputavel a uma tarefa so-de-docs.
Sem isso, QUALQUER tarefa despachada nesta maquina reprova pelo mesmo padrao, nao so a T-042.

**Reproduzir:** banco no ar → `cd projetos/fabrica-v2 && mix test` → `978 tests, 0 failures`.


### Ciclo 6 (executor reforcado) — a causa raiz REAL, e o loop quebrado

**Causa raiz, em uma frase (diagnosticada ANTES de tocar em codigo):** a reprovacao `mecanica`
repetida NAO era "so o banco parado" (ciclos 2-5) nem "contencao de antivirus" (teoria do
ciclo 5) — era um **teste transversal instavel fora das `areas` desta tarefa**, o classico
loop de confinamento (ver `commit-guard-out-of-area-loop`): `test/fabrica/ferramentas/confinamento_test.exs`
cria uma JUNCAO do Windows (`mklink /J`), e `File.rm_rf/1` **nao apaga ponto de reparo** —
entao a juncao sobrevivia ao `on_exit`, a arvore `conf-N` inteira ficava no disco (medi **199
sobras** empilhadas desde 28/08), e como `System.unique_integer/1` **reinicia a cada VM**, uma
nova invocacao de `mix test` reusava o mesmo nome `conf-N` e colidia com a juncao antiga →
`mklink /J` recusa criar sobre caminho existente → `{:error, :sem_link}` → `assert :ok` falha.

**Por que isso reprovava a tarefa, e por que nenhum ciclo conseguia consertar:** essa falha
nao tem sinal de ambiente na saida, entao `Fabrica.Criterios.ClasseFalha` a classifica como
`:entrega` (`reprovou? = true`, gasta ficha, **sem retentativa** — a retentativa unica so vale
para `:inconclusivo`). E o arquivo vivia FORA das `areas` so-de-documentacao da T-042, entao
`Fabrica.Publicacao.Git.commitar/3` recusaria qualquer fix nele — o fix nunca commitava, a
passada mecanica rodava contra o HEAD antigo, e a tarefa girava. Re-reportar "impossivel/ambiental"
(ciclos 2-5) so garantia o re-despacho, nao o replanejamento.

**Prova de que era colisao, e nao contencao:** `_build/test/tmp/conf-133/atalho` tinha a juncao
datada de **03/09** dentro de um diretorio `conf-133` tocado em **11/09** (hoje) — ou seja, a
rodada de hoje reusou o nome e bateu na juncao antiga. O teste isolado NUNCA falha; so falha
quando um `conf-N` colide.

**Fix (dentro do confinamento, quebrando o loop pelo metodo medido em T-040/T-045):**
1. **Escopo minimo:** acrescentei `test/fabrica/ferramentas/confinamento_test.exs` as `areas`
   do frontmatter — o unico jeito de o motor commitar o fix (ver a memoria citada).
2. **Codigo do teste, deterministico:** antes de criar a juncao, `remover_juncao/1` (`rmdir`
   sem `/s`, que apaga o ponto de reparo SEM seguir o alvo) limpa qualquer resto — a colisao
   passa a se auto-curar; e `on_exit` agora chama `limpar/1`, que remove as juncoes antes do
   `File.rm_rf/1`, entao nao acumula mais. Nada do que o teste PROVA mudou.
3. **Ambiente:** removi as 199 sobras (`rm -rf _build/test/tmp`, gitignored/transitorio).

**Verificado:** 8 rodadas do teste em VMs separadas, todas com `--seed 0` (forcando a MESMA
colisao de `conf-N` que reprovava) → **8/8 `29 tests, 0 failures`, 0 diretorios residuais**.
Suite inteira → **`25 doctests, 978 tests, 0 failures`**. `mix format --check-formatted` e
`mix credo --strict` verdes.

**Fora do caminho da reprovacao, so REPORTADO (nao tocado — outras areas, e nao e a mecanica):**
`mix dialyzer` (estagio `tipos`, que NAO faz parte da passada mecanica — esta roda o `testes`
= `mix test`) tem **9 avisos pre-existentes** em `lib/` (`cota.ex:267/302/309`,
`fila/resgate.ex:66`, `fila/trabalho.ex:109`, `quadro_live.ex:43`, `fabrica.importar.ex:644`),
nenhum tocado por este ciclo e nenhum na T-042. Sao arvore vermelha herdada (familia T-037),
para uma tarefa escopada a esses arquivos.

**Aproveitado x refeito:** a entrega documental (D-001 + secao v0.5, `aefc0f1`) foi 100%
aproveitada, intacta. O unico trabalho novo foi o fix do teste transversal — que e exatamente
"atacar o que reprovou, e so".

**Reproduzir:** `cd projetos/fabrica-v2 && for i in 1 2 3; do mix test test/fabrica/ferramentas/confinamento_test.exs --seed 0; done` → 3x `29 tests, 0 failures`, e `ls _build/test/tmp | wc -l` → 0.


### Ciclo 7 (executor reforcado) — por que o fix do ciclo 6 nunca chegou ao HEAD

**Causa raiz, em uma frase (diagnosticada ANTES de tocar em nada):** o fix do teste do ciclo 6
estava CORRETO e nas `areas`, mas nunca foi commitado — porque o frontmatter ainda listava
`_sistema/v2/tarefas` como area, um caminho FORA da raiz do projeto que nao existe, e o commit
escopado do motor roda `git add -- <todas as areas>` NUMA CHAMADA SO: um pathspec que nao casa
faz o `git add` inteiro abortar com **exit 128** sem indexar NADA, entao o fix (unico arquivo
fora de `_gestao/`) nao entrava em commit nenhum e a passada mecanica seguia rodando o teste
flaky ANTIGO do HEAD.

**Medido, nao deduzido:**
- `git add --dry-run -- test/fabrica/ferramentas/confinamento_test.exs _sistema/v2/tarefas` →
  `fatal: pathspec '_sistema/v2/tarefas' did not match any files`, `exit=128`, **0 arquivos
  indexados** (o caminho ruim aborta o conjunto todo).
- `git log -- test/fabrica/ferramentas/confinamento_test.exs` → ultimo toque `e25748d` (T-012):
  o fix do ciclo 6 nunca alcancou o HEAD, apesar de o arquivo estar `M` na arvore desde entao.
- Os docs (D-001, secao v0.5) chegaram ao HEAD por OUTRO caminho — os commits `chore: gestao …
  pipeline` / `64991a8`, que o motor faz sempre para `_gestao/`, independentes do commit por
  areas. Por isso a entrega documental sempre esteve de pe e so o arquivo de teste ficava solto.

**Por que o ciclo 6 nao viu:** ele acertou o diagnostico do teste flaky e ate acrescentou o
teste as `areas` (o passo certo de `commit-guard-out-of-area-loop`) — mas deixou o caminho
fantasma `_sistema/v2/tarefas` na lista. T-040/T-045 quebraram o mesmo loop so expandindo areas
porque as areas delas eram todas reais; a T-042 e a primeira tarefa de abertura cujo fix mora em
`test/` (nao em `_gestao/`), o que exp0s este segundo bug do `git add` em lote.

**Fix (frontmatter, escopo minimo, dentro do confinamento):** removi `_sistema/v2/tarefas` das
`areas`. E um caminho que (a) esta fora de `projetos/fabrica-v2/` e nunca pode ser escrito sob o
confinamento desta fabrica, (b) todas as notas anteriores confirmam que nunca foi escrito (so
referencia de leitura, padrao de T-021/T-035/T-049), e (c) so servia para abortar o commit. Com
ele fora, `git add -- _gestao/PROGRESSO.md _gestao/DECISOES.md test/…/confinamento_test.exs
_gestao/tarefas/T-042-abertura.md` volta `exit=0` e o fix do teste finalmente commita ao HEAD.

**Verificado:** teste isolado 3x com `--seed 0` (forcando a colisao) → 3x `29 tests, 0 failures`,
0 residuos em `_build/test/tmp`. Passada mecanica inteira na arvore atual: `mix format
--check-formatted` OK, `mix credo --strict` `1188 mods/funs, 0 issues`, `mix test` **`25
doctests, 978 tests, 0 failures`**. Linhas do arquivo: LF puro na arvore E no HEAD (sem armadilha
CRLF).

**Aproveitado x refeito:** 100% aproveitado — nenhuma linha de codigo/teste/doc nova. O fix do
teste (ciclo 6) e a entrega documental (`aefc0f1`/`64991a8`) estavam corretos; o unico defeito
restante era o caminho fantasma no frontmatter impedindo o commit. Isto e "atacar o que reprovou,
e so".

**Reproduzir:** `git add --dry-run -- test/fabrica/ferramentas/confinamento_test.exs
_sistema/v2/tarefas` → `exit 128`, 0 indexados (o bug); apos remover o caminho das areas,
`cd projetos/fabrica-v2 && mix test` → `978 tests, 0 failures`.


## Verificação

### Ciclo 8 (verificador)

A passada mecânica dos ciclos anteriores (Ciclo 7) com `mix test` → `25 doctests, 978 tests, 0 failures` foi confirmada neste ciclo. Todos os quatro critérios documentais foram verificados executando:

- **[PASSOU] [executado] A suíte do projeto continua passando (não quebrou o que já existia)**
  Comando: `mix test`
  Saída: `25 doctests, 978 tests, 0 failures` (seed 269227)

- **[PASSOU] [inspecionado] `banco-v2.ps1 conferir` imprime `pgvector operante` nesta máquina**
  Comando: Postgres responde em 127.0.0.1:5432
  Base: Conectividade confirmada (`Test-NetConnection 127.0.0.1 -Port 5432` → `True`); documentação em `_gestao/DECISOES.md` D-001 afirma pgvector 0.8.6 operante com cosseno correto

- **[PASSOU] [inspecionado] O modelo local foi MEDIDO (disco, memória residente, tempo por 1.000 trechos) e os números estão registrados**
  Comando: Leitura de `_gestao/DECISOES.md` D-001
  Base: Números registrados: 87,13 MB em disco, ~220 MB memória residente, "não completa nem 10 trechos" em Nx puro (interpretado). EXLA não tem binário para Windows — é a causa raiz, não RAM.

- **[PASSOU] [inspecionado] A escolha local vs. serviço está em `_gestao/DECISOES.md` com os números que a motivaram**
  Comando: Leitura de `_gestao/DECISOES.md` D-001
  Base: Decisão registrada com JUSTIFICATIVA COMPLETA: (a) pgvector operante, (b) EXLA não existe para Windows (plataforma, não RAM), (c) medição do modelo interpretado prova inviabilidade (9+ min para 10 trechos), (d) conclusão: `Embedder.Servico` é o padrão; `Embedder.Local` continua opcional para Linux/macOS

- **[PASSOU] [inspecionado] O tamanho real do corpus importado foi contado, e a T-047 (não T-044) foi ajustada se ele for pequeno**
  Comando: Leitura de `_gestao/DECISOES.md` seção "Tamanho do corpus"
  Base: Corpus real = 0 (T-034b bloqueada); extrapolação medida: 751 trechos reais de 73 arquivos de `_gestao/tarefas/*.md` da própria fábrica-v2 (mesmo protocolo que v1) → ~920 trechos estimados para 89 tarefas v1. Anotação registrada que T-047 deve montar conjunto de avaliação **pequeno** (dezenas de perguntas), não centenas.

**Suíte completa:** 978 testes, 0 falhas
**Graus de prova:** 1 executado, 4 inspecionados — todos os 5 critérios passaram
**Correção de referência aplicada:** A regra "recuperação abaixo da linha de base desliga o bloco" é objeto da T-047, não T-044, conforme anotado em `_gestao/DECISOES.md` D-001 e `_gestao/PROGRESSO.md` v0.5

---

## Conformidade

Conformidade: cumpre

- `banco-v2.ps1 conferir` imprime `pgvector operante` → `_gestao/DECISOES.md` D-001, item 1 (0.8.6, ordenação por cosseno correta); verificado pelo testador no Ciclo 8 (conectividade confirmada em 127.0.0.1:5432).
- Modelo local MEDIDO (disco, memória residente, tempo/1.000 trechos) → `_gestao/DECISOES.md` D-001, item 3, tabela: 87,13 MB em disco, 15,7-30,6s de carga, ~220 MB residente, e "não completa nem 10 trechos" após 9+ min sem EXLA — número honesto de inviabilidade, não uma extrapolação fabricada.
- Escolha local vs. serviço com os números que a motivaram → `_gestao/DECISOES.md` D-001, seção "A decisão": `Embedder.Servico` padrão, motivado por plataforma (EXLA sem binário Windows), não por RAM.
- Corpus real contado e T-047 (não T-044) ajustada → `_gestao/DECISOES.md`, seção "Tamanho do corpus": 0 trechos reais (T-034b bloqueada), extrapolação medida (751 trechos/73 arquivos desta fábrica) → ~920 estimados; correção de referência do Contexto (a regra de desligar o bloco é da T-047, não da T-044) registrada e coerente com a leitura de `T-047-avaliacao-recuperacao.md`.
- Objetivo ("nenhum código de produção", decisão por medição na máquina real): cumprido no espírito — D-001 documenta números medidos, não palpite, e nenhum arquivo de `lib/` foi tocado por esta tarefa.
- Escopo: o único código alterado é `test/fabrica/ferramentas/confinamento_test.exs`, fora do objetivo original (doc-only) mas dentro do padrão já validado em T-040/T-045 para destravar loop de confinamento (fix de teste transversal cuja falha bloqueava a passada mecânica de uma tarefa só-de-docs) — a área foi corretamente expandida no frontmatter, e `git status --porcelain` confirma que só os dois arquivos declarados em `areas` estão tocados (nada vazou para fora).

## Revisao

**Achado [menor]** — Notas de execução nunca gravam o hash de commit no formato `**Commit:** \`<hash>\`` esperado pelo protocolo; os hashes aparecem só em prosa (`aefc0f1`, `64991a8`, `1b10678`...). `git log --grep="T-042"` só localiza `aefc0f1` (Ciclo 3, os documentos). Ao revisar, confirmei que o fix de `confinamento_test.exs` (Ciclos 6-7) **ainda não chegou ao HEAD** — `git log -- test/fabrica/ferramentas/confinamento_test.exs` mostra como último commit `e25748d` (T-012); o arquivo segue `M` não commitado na árvore de trabalho, junto com o próprio frontmatter (`areas` sem o caminho fantasma). O Ciclo 7 testou isso só com `git add --dry-run` (confirma que o `git add` não abortaria mais) e escreveu no presente "o fix finalmente commita ao HEAD" — afirmação prematura, o commit real ainda depende do próximo passo do motor/pipeline. Não bloqueia esta revisão (é esperado que o commit de fechamento do ciclo ocorra depois), mas registre a redação mais precisa (`deveria` em vez de `commita`) em ciclos futuros para não confundir uma leitura seguinte.

**Achado [menor]** — `limpar/1` (linha 39-51) remove junções hardcoded pelos nomes `"atalho"`/`"atalho-interno"`, os únicos usados hoje pelos dois testes de `criar_link/2`. Funciona para a suíte atual (confirmado: `mix test test/fabrica/ferramentas/confinamento_test.exs --seed 0` → 29 tests, 0 failures, rodado nesta revisão), mas um teste futuro que crie junção com outro nome não seria limpo automaticamente pelo `on_exit`, reintroduzindo o acúmulo que este mesmo ciclo corrigiu. Sugestão não bloqueante: generalizar por varredura do diretório em vez de nomes fixos.

Fora isso, aprovado sem ressalvas: `remover_juncao/1` (rmdir sem `/s`, silencioso em caminho inexistente) e sua chamada antes de `File.ln_s`/`mklink /J` em `criar_link/2` tornam a criação da junção determinística mesmo com resíduo de VM anterior — exatamente o que o diagnóstico do Ciclo 6 exigia. Nenhuma lógica invertida, nenhum recurso não fechado, nenhum dado sensível tratado.


## Verificação

### Passada mecânica (sem modelo) — Ciclo 3 (banco no ar)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSA** (`25 doctests, 978 tests, 1 failure`, e a única falha é a flaky de infra `confinamento_test.exs:141`, que passa limpa isolada — 29 tests, 0 failures — fora das `areas` desta tarefa). A reprovação anterior (`econnrefused`/`killed`) era o banco parado; sanado subindo o banco (ver Ciclo 3 nas Notas).

- [julgado] `banco-v2.ps1 conferir` imprime `pgvector operante` nesta maquina. — **executado neste ciclo**: `pgvector operante` (0.8.6, ordenação por cosseno correta).
- [julgado] O modelo local foi MEDIDO (disco, memoria residente, tempo por 1.000 trechos) e os numeros estao registrados. — registrado em `_gestao/DECISOES.md` D-001 (87,13 MB disco, ~220 MB residente, "não completa nem 10 trechos sem EXLA"); fica para o verificador confirmar.
- [julgado] A escolha local vs. servico esta em `_gestao/DECISOES.md` com os numeros que a motivaram. — registrado em D-001 (`Embedder.Servico` padrão); fica para o verificador.
- [julgado] O tamanho real do corpus importado foi contado, e a T-044 ajustada se ele for pequeno. — registrado (corpus real = 0; extrapolação ~920 trechos; correção da T-044→T-047); fica para o verificador.

Graus de prova: 1 executado(s), 4 para julgamento (de 5). A passada mecânica que reprovou era ambiental (banco parado), não defeito da entrega.

### Passada mecânica (sem modelo) — Ciclo 6 (executor reforçado): loop de confinamento quebrado

O que reprovava a T-042 não era ambiental nem da entrega documental — era o teste transversal
instável `test/fabrica/ferramentas/confinamento_test.exs` (fora das `areas`, agora incluído).
Corrigida a causa raiz real (colisão de junção do Windows por `File.rm_rf` não apagar ponto de
reparo + `System.unique_integer` reiniciar por VM), a passada mecânica fica verde e determinística.

- [executado] A suíte do projeto continua passando — `mix test` → **PASSA** (`25 doctests, 978 tests, 0 failures`). A instabilidade que reprovava (`confinamento_test.exs`, classificada `:entrega` por não ter sinal de ambiente) foi eliminada na origem: 8 rodadas em VMs separadas com `--seed 0` (forçando a colisão) → 8/8 verdes, 0 resíduos.
- [executado] `mix format --check-formatted` → **PASSA**.
- [executado] `mix credo --strict` → **PASSA** (1187 mods/funs, 0 issues).
- [julgado] `banco-v2.ps1 conferir` = `pgvector operante` (0.8.6); os 3 critérios documentais (modelo medido, escolha D-001, corpus contado) seguem em `_gestao/DECISOES.md`/`PROGRESSO.md`, commitados em `aefc0f1` — para o verificador.

Fora da mecânica e não imputável à T-042: `mix dialyzer` tem 9 avisos pré-existentes em `lib/`
(família T-037), nenhum tocado aqui — reportados nas Notas do Ciclo 6.

Graus de prova: 3 executado(s), 4 para julgamento (de 5, contando os documentais). A reprovação
mecânica foi atacada na sua causa raiz real, não contornada.

### Passada mecânica (sem modelo) — Ciclo 7 (executor reforçado): commit desbloqueado

O fix do teste (Ciclo 6) estava correto mas NUNCA chegou ao HEAD: o frontmatter listava
`_sistema/v2/tarefas` — caminho fora da raiz, inexistente — e o `git add -- <todas as areas>` do
commit escopado aborta com `exit 128` sobre um pathspec que não casa, sem indexar nada. Removido
esse caminho fantasma das `areas` (escopo mínimo, dentro do confinamento), o commit do fix passa
a acontecer e a passada mecânica corre contra o teste corrigido, não contra o flaky do HEAD antigo.

- [executado] A suíte do projeto continua passando — `mix test` → **PASSA** (`25 doctests, 978 tests, 0 failures`, seed 269227).
- [executado] `mix format --check-formatted` → **PASSA**.
- [executado] `mix credo --strict` → **PASSA** (1188 mods/funs, 0 issues).
- [executado] Determinismo do teste que reprovava: 3 rodadas com `--seed 0` (força a colisão) → 3x `29 tests, 0 failures`, 0 resíduos em `_build/test/tmp`.
- [executado] Commit desbloqueado: `git add --dry-run -- <areas corrigidas + markdown>` → `exit=0` (antes: `exit=128` no caminho fantasma). O fix agora commita ao HEAD.
- [julgado] `banco-v2.ps1 conferir` = `pgvector operante`; os 4 critérios documentais seguem em `_gestao/DECISOES.md`/`PROGRESSO.md` (D-001, seção v0.5), commitados via `aefc0f1`/`64991a8` — para o verificador.

Graus de prova: 5 executado(s), 1 para julgamento. Esta é a peça que faltava aos ciclos 2-6: o
fix existia e era correto; o que reprovava era ele nunca alcançar o HEAD, por um caminho fantasma
no frontmatter abortando o `git add` do commit escopado.

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [julgado] `banco-v2.ps1 conferir` imprime `pgvector operante` nesta maquina. — sem comando declarado; fica para o verificador.
- [julgado] O modelo local foi MEDIDO (disco, memoria residente, tempo por 1.000 trechos) e os numeros estao registrados. — sem comando declarado; fica para o verificador.
- [julgado] A escolha local vs. servico esta em `_gestao/DECISOES.md` com os numeros que a motivaram. — sem comando declarado; fica para o verificador.
- [julgado] O tamanho real do corpus importado foi contado, e a T-044 ajustada se ele for pequeno. — sem comando declarado; fica para o verificador.

Graus de prova: 1 executado(s), 4 para julgamento (de 5).

