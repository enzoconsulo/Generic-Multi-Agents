"""
Gera o conjunto de tarefas da v2 e o ROTEIRO.md, a partir da especificacao abaixo.

POR QUE UM GERADOR, E NAO 64 ARQUIVOS ESCRITOS A MAO
O indice e as tarefas precisam contar a MESMA historia. Mantidos a mao, divergem na
primeira renumeracao — e um roteiro que mente e pior que roteiro nenhum. Aqui a
especificacao e a fonte unica: o ROTEIRO e as tarefas saem dela.

REGRA QUE O GERADOR RESPEITA, E QUE E A MAIS IMPORTANTE
Ele NUNCA sobrescreve um arquivo de tarefa que ja existe. Assim que a T-001 for
executada, o frontmatter dela passa a carregar estado real (status, tentativas,
relatorios dos portoes) — e estado nao se regenera. Rodar de novo cria so o que falta.
Para reescrever uma tarefa de proposito, apague o arquivo antes.

USO
    python _sistema/v2/gerar-tarefas.py
"""

import io
import os
from datetime import date

RAIZ = os.path.dirname(os.path.abspath(__file__))
DIR_TAREFAS = os.path.join(RAIZ, "tarefas")
HOJE = date.today().isoformat()

# ---------------------------------------------------------------------------
# As seis versoes. Cada uma: id, nome, o que a versao entrega, e o marco.
# ---------------------------------------------------------------------------

VERSOES = [
    {
        "id": "v0.1",
        "nome": "A fundacao que se prova sozinha",
        "entrega": "Um projeto que compila, testa e sobe o banco — sem tocar a rede e sem gastar cota.",
        "marco": "`mix verificar` roda a suite inteira sem rede, sem cota e sem chave de API.",
        "opcional": False,
    },
    {
        "id": "v0.2",
        "nome": "Um agente faz uma tarefa",
        "entrega": "Despachar um agente contra uma tarefa real e ver o custo discriminado volta a volta.",
        "marco": "Um agente resolve uma tarefa real de ponta a ponta; e o prefixo do projeto e escrito UMA vez e lido pelos despachos seguintes, provado por `cache_read_input_tokens`.",
        "opcional": False,
    },
    {
        "id": "v0.3",
        "nome": "A linha de producao",
        "entrega": "Uma tarefa percorre os seis estados, reprova, e retrabalhada e conclui — sozinha.",
        "marco": "Uma tarefa percorre os seis estados, reprova DE PROPOSITO, e retrabalhada e conclui, com tudo registrado em transacao.",
        "opcional": False,
    },
    {
        "id": "v0.4",
        "nome": "A fabrica que aguenta queda",
        "entrega": "Tres tarefas ao mesmo tempo; matar uma no meio nao afeta as outras.",
        "marco": "Tres tarefas rodam em paralelo; matar o processo de uma nao afeta as outras duas, e ela volta a fila.",
        "opcional": False,
    },
    {
        "id": "v0.5",
        "nome": "A fabrica que lembra",
        "entrega": "O agente comeca a tarefa sabendo o que ja foi decidido, e por que.",
        "marco": "Num projeto com historico, o agente cita a decisao anterior em vez de decidir de novo.",
        "opcional": False,
    },
    {
        "id": "v1.0",
        "nome": "A fabrica completa",
        "entrega": "Um projeto inteiro planejado, construido e entregue sem intervencao, acompanhado na tela.",
        "marco": "Um projeto inteiro e planejado, construido e entregue sem intervencao, com o custo acompanhado na tela.",
        "opcional": False,
    },
]

# ---------------------------------------------------------------------------
# As tarefas. A ordem desta lista E a ordem de execucao.
#
# campos: v, slug, titulo, dep (lista de ids), areas, objetivo, contexto,
#         criterios (lista de (texto, comando|None))
# ---------------------------------------------------------------------------

T = []


def tarefa(v, slug, titulo, dep, areas, objetivo, contexto, criterios, prio="alta"):
    T.append(
        {
            "v": v,
            "slug": slug,
            "titulo": titulo,
            "dep": dep,
            "areas": areas,
            "objetivo": objetivo.strip(),
            "contexto": contexto.strip(),
            "criterios": criterios,
            "prio": prio,
        }
    )


# ===========================================================================
# v0.1 — A FUNDACAO
# ===========================================================================

tarefa(
    "v0.1", "scaffold", "Scaffold Phoenix com qualidade, GUIA e commit inicial", [],
    ["mix.exs", "config/config.exs", "config/test.exs", "README.md", "_gestao/GUIA.md", ".formatter.exs"],
    """
Criar o projeto Elixir/Phoenix `fabrica`, com formatador, Credo, Dialyzer e ExUnit
configurados e rodando, um alias `mix verificar` que roda tudo de uma vez, README com os
comandos reais, `_gestao/GUIA.md` preenchido e um commit contendo tudo isso. Esta e a
fundacao: toda tarefa seguinte depende dela.
""",
    """
O REPOSITORIO DA v2 E `projetos/fabrica-v2/` (decisao de 28/08, em
`DECISOES_FECHADAS.md`): git proprio, ao lado, ja fora do `.gitignore` da raiz da fabrica.
A v1 fica INTOCADA. Crie o diretorio, rode `git init` nele, e trabalhe la dentro — nada
desta tarefa toca a arvore da v1.

Rode `mix phx.new fabrica --database postgres --no-mailer --no-gettext` dentro dele.
LiveView fica LIGADO (e a tela da v1.0) mas nenhuma pagina propria e
criada agora — o scaffold do Phoenix ja vem com a pagina inicial e ela basta.

Configure em `mix.exs` as dependencias de qualidade: `credo` e `dialyxir` (ambas
`only: [:dev, :test], runtime: false`). Acrescente o alias que vira o comando unico da
fabrica:

    verificar: ["format --check-formatted", "compile --warnings-as-errors", "credo --strict", "test"]

`mix dialyzer` fica FORA do alias de proposito: a primeira execucao constroi a PLT e
demora minutos, o que tornaria o comando de verificacao inutilizavel no dia a dia. Ele
entra na verificacao continua (T-007) como estagio separado.

Configure `config/test.exs` para o banco de teste apontar para o Postgres local
(127.0.0.1:5432, usuario `postgres`, auth trust — ver `_sistema/AMBIENTE_V2.md`).

Preencha `_gestao/GUIA.md` a partir de `_sistema/templates/GUIA.md`: secao 1 com a stack e
os comandos reais, secao 2 com os modulos que o PLANO ja preve (`Fabrica.Operario`,
`Fabrica.Embedder`, `Fabrica.Tarefa`, `Fabrica.Portao`), secoes 3 e 4 enxutas — elas
crescem a cada tarefa. NAO deixe o texto de instrucao do template no arquivo final.

NOMENCLATURA: tudo em portugues (modulo, funcao, variavel, mensagem de erro), como no
resto da fabrica. `Fabrica.Tarefa`, nao `Fabrica.Task`. Esta decisao esta em
`DECISOES_FECHADAS.md` e nao se reabre.
""",
    [
        ("`mix verificar` roda e passa (formato, compilacao sem warning, Credo estrito, testes).", "mix verificar"),
        ("O projeto compila sem nenhum warning.", "mix compile --warnings-as-errors"),
        ("`_gestao/GUIA.md` existe, esta preenchido e nao contem o texto de instrucao do template (inspecionavel).", None),
        ("README.md tem 'Como rodar' e 'Como testar' com os comandos reais (inspecionavel).", None),
    ],
)

tarefa(
    "v0.1", "esquema", "Esquema do banco: projetos, tarefas, ciclos, despachos e custos", ["v0.1:scaffold"],
    ["priv/repo/migrations", "lib/fabrica/projetos", "lib/fabrica/tarefas", "test/fabrica/esquema_test.exs"],
    """
Criar as migracoes e os schemas Ecto que sustentam o estado inteiro da fabrica. O banco e
a fonte unica de verdade (decisao 6.2 de `MIGRACAO_V2.md`): nao existe estado que viva so
em arquivo markdown.
""",
    """
Tabelas, com o que cada uma resolve:

- `projetos` — nome, caminho absoluto, dominio (`software` ou outro), inserted_at.
- `especialistas` — projeto_id, identificador, nome, prompt, ativo. E dado VERSIONADO:
  alterar o prompt de um especialista cria linha nova, nao sobrescreve. E isso que
  permite comparar o desempenho do mesmo especialista antes e depois de uma mudanca.
- `tarefas` — projeto_id, codigo (T-NNN), titulo, objetivo, contexto, status (enum dos
  seis estados), prioridade, tentativas, especialista_id, replanejada_de_id.
- `tarefa_dependencias` — tarefa_id, depende_de_id (tabela de ligacao; dependencia e
  relacao, nao lista serializada).
- `tarefa_areas` — tarefa_id, caminho. Um ARQUIVO por linha, nunca pasta.
- `criterios` — tarefa_id, texto, comando (nullable), grau (`executado`/`inspecionado`/`julgado`).
- `ciclos` — tarefa_id, numero, papel, desfecho, relatorio. LINHA NOVA a cada
  retrabalho, nunca sobrescrita: e o que permite perguntar depois quanto custou cada
  ciclo separadamente.
- `despachos` — ciclo_id, operario, modelo, voltas, iniciado_em, terminado_em, desfecho.
- `consumos` — despacho_id, volta, tokens_entrada, tokens_cache_escrita,
  tokens_cache_leitura, tokens_saida, custo_usd, cota_unidades, duracao_ms.
  UMA LINHA POR VOLTA. O total por tarefa e uma soma; o contrario seria impossivel.

Use `citext` para o codigo da tarefa e crie os indices unicos que o dominio exige
(`projetos.nome`, `tarefas(projeto_id, codigo)`).

O status da tarefa e um `Ecto.Enum` com exatamente os seis valores do protocolo:
`backlog`, `pronta`, `em_execucao`, `em_teste`, `em_revisao`, `concluida` — mais
`bloqueada` e `cancelada`, que sao terminais.

ATENCAO ao que NAO fazer aqui: nenhuma logica de transicao entra nesta tarefa. Isto e so
o esquema e os schemas. A maquina de estados e a v0.3.
""",
    [
        ("As migracoes sobem e descem sem erro (round trip completo).", "mix ecto.reset"),
        ("Os testes do esquema passam: insercao de projeto, tarefa com dependencia e area, e leitura de volta.", "mix test test/fabrica/esquema_test.exs"),
        ("Inserir tarefa com status invalido e rejeitado pelo changeset (teste incluido acima).", "mix test test/fabrica/esquema_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.1", "operario-behaviour", "behaviour Fabrica.Operario e o adaptador Falso", ["v0.1:scaffold"],
    ["lib/fabrica/operario.ex", "lib/fabrica/operario/falso.ex", "test/fabrica/operario/falso_test.exs"],
    """
Definir o contrato `Fabrica.Operario` — a fronteira que separa a governanca do fornecedor
do modelo — e implementar `Operario.Falso`, o duble deterministico que a suite usa para
sempre.
""",
    """
Esta e a decisao 6.1 de `MIGRACAO_V2.md`, e ela e a razao de o contrato existir na v0.1 e
nao na v0.2: o marco desta versao e a suite rodando sem rede, e isso exige o contrato ja
existindo com o `Falso` implementando-o.

O contrato precisa de exatamente uma funcao, e ela e sincrona:

    @callback conversar(requisicao :: Requisicao.t(), opcoes :: keyword()) ::
                {:ok, Resposta.t()} | {:erro, termo :: term()}

`Requisicao` carrega: modelo, blocos do prefixo (com o ponto de cache de cada um), o
historico de mensagens, as ferramentas disponiveis, e o teto de voltas. `Resposta`
carrega: os blocos de conteudo devolvidos, o `motivo_parada`
(`:fim_do_turno` | `:uso_de_ferramenta` | `:teto_de_tokens` | `:recusa`), e o `Consumo`
daquela volta (os seis numeros da tabela `consumos`).

`Operario.Falso` responde a partir de um roteiro declarado no teste — uma lista de
respostas na ordem em que devem sair. Ele NAO chama rede, NAO le variavel de ambiente e
NAO tem caminho que possa acidentalmente gastar cota. E ele DEVE devolver `Consumo`
plausivel, com numeros de cache, senao os testes de contabilidade da T-005 nao teriam o
que exercitar.

Escreva tambem um teste que falha se `Operario.Falso` referenciar qualquer modulo de
HTTP. E paranoia barata e protege o marco desta versao.
""",
    [
        ("O comportamento esta definido com o callback `conversar/2` e os tipos `Requisicao`, `Resposta` e `Consumo`.", None),
        ("`Operario.Falso` devolve as respostas do roteiro, na ordem, e um `Consumo` por volta.", "mix test test/fabrica/operario/falso_test.exs"),
        ("Um roteiro esgotado devolve `{:erro, :roteiro_esgotado}` em vez de travar ou inventar resposta.", "mix test test/fabrica/operario/falso_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.1", "embedder-behaviour", "behaviour Fabrica.Embedder e o adaptador Falso", ["v0.1:scaffold"],
    ["lib/fabrica/embedder.ex", "lib/fabrica/embedder/falso.ex", "test/fabrica/embedder/falso_test.exs"],
    """
Definir o contrato `Fabrica.Embedder` e implementar `Embedder.Falso`, que produz vetores
deterministicos por hash — sem modelo, sem rede e sem custo.
""",
    """
Mesma doutrina do operario, e pelo mesmo motivo economico: o modelo de embedding local e a
UNICA peca pesada do desenho inteiro (centenas de MB a GB), e o perfil alvo declarado da v2
e 8 GB de RAM. Ver `DECISOES_FECHADAS.md`, "PERFIL ALVO DA v2".

    @callback vetorizar(textos :: [String.t()]) :: {:ok, [[float()]]} | {:erro, term()}
    @callback dimensoes() :: pos_integer()

`Embedder.Falso` gera o vetor a partir de `:erlang.phash2` do texto, expandido de forma
deterministica ate `dimensoes()` e normalizado. Duas propriedades que o teste precisa
travar: o MESMO texto sempre da o MESMO vetor, e textos diferentes dao vetores
diferentes. So isso ja permite testar a busca hibrida inteira da v0.5 sem carregar modelo
nenhum.

Fixe `dimensoes()` em 384 no `Falso` — e o tamanho de um embedding de sentence-transformer
pequeno, entao a troca para `Embedder.Local` na v0.5 nao muda o esquema do banco.

Sempre em lote (`[String.t()]`, nao `String.t()`): a ingestao da v0.5 vetoriza a historia
inteira do projeto ao commitar, e uma API de um-por-vez tornaria isso lento por desenho.
""",
    [
        ("O comportamento define `vetorizar/1` (em lote) e `dimensoes/0`.", None),
        ("O mesmo texto produz sempre o mesmo vetor; textos diferentes produzem vetores diferentes.", "mix test test/fabrica/embedder/falso_test.exs"),
        ("`dimensoes()` devolve 384 e todo vetor gerado tem exatamente esse tamanho.", "mix test test/fabrica/embedder/falso_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.1", "contabilidade", "Contabilidade em duas unidades: cota consumida e dolar-equivalente", ["v0.1:esquema", "v0.1:operario-behaviour"],
    ["lib/fabrica/custo/precos.ex", "lib/fabrica/custo/consumo.ex", "test/fabrica/custo/precos_test.exs"],
    """
Gravar, por VOLTA, os seis numeros de consumo e derivar deles as duas unidades que a v2
precisa: cota consumida (o que a operacao real gasta) e dolar-equivalente (o que a mesma
rodada custaria por API).
""",
    """
POR QUE DUAS UNIDADES, e isto e o achado que a v1 nao tem: a fabrica NAO paga por token —
ela consome cota (OAuth, assinatura, sem chave de API). Todo valor em dolar que a v1
registra e estimativa contabil, nao fatura. Sob o `Operario.ClaudeCLI` o que aperta e a
parede de cota; sob o `Operario.MessagesAPI` o que aperta e dinheiro. Ter as duas e o que
torna a Parte V do TCC honesta. Ver `DECISOES_FECHADAS.md`.

Tabela de precos por modelo (USD por milhao de tokens), com a data de conferencia no
cabecalho do arquivo — preco muda, e preco velho sem data e pior que preco ausente:

    opus-5      entrada 5   saida 25
    sonnet-5    entrada 2   saida 10
    haiku-4.5   entrada 1   saida 5

Multiplicadores de cache, conferidos na referencia da API: LEITURA 0,1x da entrada;
ESCRITA 1,25x com TTL de 5 minutos e 2,0x com TTL de 1 hora. Guarde o TTL usado na linha
de `consumos`, senao nao ha como saber qual multiplicador aplicar depois.

ARMADILHA MEDIDA NA v1, que este modulo precisa deixar visivel: a escrita de cache e ~6,7%
dos tokens e carrega ~50% da conta de entrada. Entao a funcao de resumo deve devolver a
reparticao (entrada cheia / leitura / escrita), nao so o total — e o teste deve travar
essa reparticao. Um total esconde exatamente o numero que decide o desenho.
""",
    [
        ("`Precos.estimar/1` calcula o custo de um `Consumo` aplicando 0,1x na leitura e o multiplicador do TTL na escrita.", "mix test test/fabrica/custo/precos_test.exs"),
        ("O resumo de um conjunto de consumos devolve a REPARTICAO (entrada cheia, leitura, escrita), nao so o total.", "mix test test/fabrica/custo/precos_test.exs"),
        ("Modelo desconhecido devolve `{:erro, :modelo_sem_preco}` em vez de silenciosamente contar zero.", "mix test test/fabrica/custo/precos_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.1", "backup", "Backup e restauracao do banco", ["v0.1:esquema"],
    ["lib/mix/tasks/fabrica.backup.ex", "lib/mix/tasks/fabrica.restaurar.ex", "test/mix/backup_test.exs"],
    """
Duas tarefas mix — `mix fabrica.backup` e `mix fabrica.restaurar` — que gravam e leem um
dump do banco, com teste que prova o ciclo completo.
""",
    """
POR QUE ISTO E DA v0.1 e nao "depois": na v1 o git do projeto cobria a durabilidade de
graca, porque o estado vivia em markdown commitado. Com o estado no banco, "nao perder
trabalho" passa a exigir dump — e e o tipo de coisa que so se descobre faltando depois de
perder. Ver `MIGRACAO_V2.md`, 6.2.

`mix fabrica.backup` chama `pg_dump` com `--format=custom` para um arquivo em
`prioridade/backups/AAAA-MM-DD-HHMMSS.dump` (o diretorio entra no `.gitignore` — dump nao
se versiona). `mix fabrica.restaurar <arquivo>` chama `pg_restore --clean --if-exists`.

Resolva o caminho do `pg_dump` por configuracao (`config :fabrica, :pg_bin`), com o
default apontando para a instalacao documentada em `_sistema/AMBIENTE_V2.md`. Nao dependa
do PATH: no Windows o `psql` do instalador quebrado pode estar na frente.

O teste faz o ciclo de verdade contra o banco de teste: insere um projeto e uma tarefa,
faz backup, apaga tudo, restaura, e confere que a tarefa voltou com o mesmo codigo. Se o
`pg_dump` nao estiver disponivel, o teste deve ser PULADO com mensagem clara
(`@tag :precisa_pg_dump` + `ExUnit.configure(exclude: ...)`), nunca falhar em silencio nem
passar sem testar nada.
""",
    [
        ("`mix fabrica.backup` grava um arquivo de dump e imprime o caminho.", "mix test test/mix/backup_test.exs"),
        ("O ciclo backup -> apagar -> restaurar devolve os mesmos dados (teste de round trip).", "mix test test/mix/backup_test.exs"),
        ("Sem `pg_dump` disponivel, o teste e PULADO com mensagem clara, nunca falha em silencio.", "mix test test/mix/backup_test.exs"),
        ("`prioridade/backups/` esta no `.gitignore` (inspecionavel).", None),
    ],
)

tarefa(
    "v0.1", "verificacao-continua", "Verificacao continua local, com Dialyzer em estagio proprio", ["v0.1:scaffold"],
    ["lib/mix/tasks/fabrica.ci.ex", "_gestao/ci.json", "test/mix/ci_test.exs"],
    """
Um comando unico que roda a bateria completa do projeto em estagios nomeados, com o
resultado de cada um separado — e o `_gestao/ci.json` que declara esses estagios, no mesmo
formato que a fabrica ja usa.
""",
    """
A v1 aprendeu isto por estrago (`_sistema/DECISOES_FECHADAS.md`, "Disciplina de
verificacao"): o comando de verificacao de um projeto precisa ser DECLARADO em
`_gestao/ci.json`, e nao redigido de cabeca em cada tarefa. Foi um `node --test` escrito a
mao que custou 4 ciclos e US$ 12,90 na T-030 do banco-imobiliario.

Estagios, nesta ordem (o primeiro que falhar interrompe):

    formato    mix format --check-formatted
    compilar   mix compile --warnings-as-errors
    lint       mix credo --strict
    testes     mix test
    tipos      mix dialyzer

`tipos` fica por ultimo e e o unico que pode ser pulado com `--rapido`, porque a
construcao da PLT demora minutos na primeira vez. Ele NAO pode ser removido: a checagem de
tipos e uma das formas de "mover a regra para o compilador" que a tese do TCC afirma.

Grave `_gestao/ci.json` com esses estagios e seus comandos. E este arquivo — nao a memoria
de quem escreve a tarefa — que as tarefas seguintes copiam para a linha `verificar:`.
""",
    [
        ("`mix fabrica.ci` roda os cinco estagios e imprime o resultado de cada um, nomeado.", "mix fabrica.ci --rapido"),
        ("Um estagio que falha interrompe os seguintes e o comando sai com codigo diferente de zero.", "mix test test/mix/ci_test.exs"),
        ("`_gestao/ci.json` existe e declara os cinco estagios com os comandos reais (inspecionavel).", None),
        ("`mix fabrica.ci --rapido` pula o estagio `tipos` e roda os outros quatro.", "mix fabrica.ci --rapido"),
    ],
)

tarefa(
    "v0.1", "linha-de-base", "Linha de base de medicao, extraida dos 139 jobs da v1", ["v0.1:scaffold"],
    ["prioridade/linha-de-base/extrair.exs", "prioridade/linha-de-base/LINHA_DE_BASE.md", "test/fabrica/linha_de_base_test.exs"],
    """
Extrair dos jobs ja gravados pela v1 os numeros contra os quais a v2 vai ser comparada, e
grava-los num documento. Sem isso o TCC fecha numa afirmacao em vez de num resultado.
""",
    """
A tese da v2 e "nao precisa ser mais esperta, precisa ser mais dificil de operar errado".
Isso so vira resultado se existir numero comparavel — e a licao metodologica da v1 foi
exatamente essa: o documento de custo mediu com precisao o que sabia medir e ficou cego
para 78% da conta. Ver `_sistema/CUSTO_DE_CONTEXTO.md`, secao 8.

A evidencia ja esta NESTE repositorio e ler nao custa nada:
**`_sistema/v2/linha-de-base/jobs-v1/`** — 139 arquivos, congelados em 28/08, com a
contabilidade completa de cada job da v1. Leia o `LEIA-ME.md` ao lado antes: ele explica
por que a copia existe (o diretorio original e gitignored, entao um clone nao teria os
dados) e por que os `*.log.jsonl` ficaram de fora (transcricao completa = codigo dos
projetos, e este repositorio e publico).

Se voce estiver na maquina onde a v1 roda, `painel/dados/jobs/` tem tambem os
`*.log.jsonl`, com o detalhe por ETAPA. Use-os para os numeros 1 e 3 se estiverem
disponiveis, e declare no relatorio qual fonte foi usada para cada numero.

Quatro numeros:

1. **Proporcao de despacho desperdicado** — despachos cujo desfecho foi `agente-cortado`,
   reprovacao por interferencia, ou tarefa que girou sem incrementar `tentativas`. E a
   metrica que casa com a tese.
2. **Custo por tarefa concluida** — soma dos consumos dos ciclos de uma tarefa dividida
   pelas tarefas que chegaram a `concluida`.
3. **Contexto por despacho** — a v1 ja mediu a queda de 53,5k para 11–14k tokens; registre
   o numero atual.
4. **O que se perde ao matar um agente em voo** — quantos jobs terminaram sem `result` e,
   portanto, sem custo real gravado.

O script e Elixir (`.exs`) rodando com `mix run`, le o diretorio da v1 por parametro, e
GRAVA `LINHA_DE_BASE.md` com os numeros, a data e o caminho de onde saiu cada um. Numero
citado sem o arquivo de origem vira premissa que ninguem consegue conferir — foi
exatamente o que aconteceu com os "quatro testadores em fila" de 15/08.

O teste roda o extrator contra um diretorio de jobs FALSO, montado no proprio teste, e
confere que os quatro numeros saem certos. Nao dependa de os jobs da v1 estarem presentes.
""",
    [
        ("O extrator roda contra um diretorio de jobs falso e produz os quatro numeros corretos.", "mix test test/fabrica/linha_de_base_test.exs"),
        ("`LINHA_DE_BASE.md` e gerado com os numeros, a data e o caminho de origem de cada um (inspecionavel).", None),
        ("O extrator nao falha quando um job nao tem contabilidade de tokens — ele conta e reporta quantos foram.", "mix test test/fabrica/linha_de_base_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.1", "marco", "MARCO da v0.1: a suite roda sem rede e sem cota", ["v0.1:esquema", "v0.1:operario-behaviour", "v0.1:embedder-behaviour", "v0.1:contabilidade", "v0.1:backup", "v0.1:verificacao-continua", "v0.1:linha-de-base"],
    ["_gestao/PROGRESSO.md"],
    """
Verificar, de ponta a ponta, que o marco da v0.1 foi atingido: a suite inteira roda sem
tocar a rede, sem consumir cota e sem chave de API. Registrar o veredito.
""",
    """
Esta e uma tarefa de VERIFICACAO, nao de construcao. Nada de codigo novo — se algo faltar,
abra tarefa corretiva em vez de consertar aqui.

A prova precisa ser adversarial, nao complacente. Tres checagens:

1. **Rode a suite com a rede desligada.** No Windows:
   `Disable-NetAdapter -Name <adaptador> -Confirm:$false`, rode `mix verificar`, reative.
   Se preferir nao mexer na rede, um teste que falha se qualquer modulo HTTP for
   carregado durante a suite serve como equivalente — declare qual dos dois foi usado.
2. **Confirme que nenhuma variavel de ambiente de credencial e lida.** `grep` por
   `ANTHROPIC`, `API_KEY` e `System.get_env` no codigo de producao; toda ocorrencia tem de
   estar atras do adaptador real, nunca no caminho da suite.
3. **Confirme que os cinco estagios de `mix fabrica.ci` passam** na maquina limpa.

Registre em `_gestao/PROGRESSO.md`: a data, qual metodo de prova de rede foi usado, e o
veredito. Se reprovado, liste as causas raiz — uma tarefa corretiva por causa.
""",
    [
        ("A suite inteira passa com a rede indisponivel (ou com o teste equivalente de ausencia de HTTP).", "mix verificar"),
        ("`mix fabrica.ci` passa nos cinco estagios, incluindo `tipos`.", "mix fabrica.ci"),
        ("Nenhuma leitura de credencial acontece no caminho da suite (inspecao do resultado do grep, registrada nas notas).", None),
        ("`_gestao/PROGRESSO.md` registra o marco com data, metodo de prova e veredito (inspecionavel).", None),
    ],
)

# ===========================================================================
# v0.2 — UM AGENTE FAZ UMA TAREFA
# ===========================================================================

tarefa(
    "v0.2", "indice-denso", "Gerador do indice denso do projeto (mix fabrica.mapa)", ["v0.1:scaffold"],
    ["lib/fabrica/indice/mapa.ex", "lib/mix/tasks/fabrica.mapa.ex", "test/fabrica/indice/mapa_test.exs"],
    """
Porte do `mapa.mjs` da v1: um gerador DETERMINISTICO, sem modelo, que produz a arvore de
arquivos do projeto com a assinatura e o proposito de cada simbolo publico. E ele que vai
inteiro no prefixo do despacho.
""",
    """
E o mecanismo de maior retorno medido da v1: derrubou o contexto por despacho de 53,5 mil
para 11–14 mil tokens, com custo de modelo ZERO para gerar. Ver `MIGRACAO_V2.md`, secao 4.

Para um projeto Elixir, extraia por AST (`Code.string_to_quoted/2`), nunca por regex:
modulos, `@moduledoc` (primeira linha), `def`/`defmacro` publicos com aridade e a primeira
linha do `@doc`. Para outros ecossistemas, o parser entra depois — nesta tarefa o alvo e
Elixir, que e o que a propria v2 precisa.

ARMADILHA HERDADA, E ELA E A RAZAO DE ESTA TAREFA VIR ANTES DO PREFIXO: o MAPA da v1
trazia hash do HEAD e data no cabecalho, e isso sozinho invalidaria o cache de TODO
despacho seguinte, sem erro e sem aviso. A v1 conserta isso removendo o cabecalho volatil
na hora de montar o contexto (`contexto/montador.ts`, `semCabecalhoVolatil`). A v2 nao
deve gerar o cabecalho volatil — o metadado de geracao sai para um arquivo ao lado, ou
nao existe. **O conteudo do MAPA precisa ser byte a byte identico entre duas geracoes
sobre a mesma arvore**, e isso e criterio de aceite abaixo.

Grave em `_gestao/MAPA.md`. Alvo de tamanho: ~5% do tamanho do fonte.
""",
    [
        ("`mix fabrica.mapa` gera `_gestao/MAPA.md` com arvore, assinaturas e proposito dos simbolos publicos.", "mix fabrica.mapa"),
        ("Duas geracoes seguidas sobre a MESMA arvore produzem bytes IDENTICOS (sem data, sem hash, sem contador).", "mix test test/fabrica/indice/mapa_test.exs"),
        ("Um modulo com `@moduledoc false` nao aparece no mapa; um publico aparece com aridade correta.", "mix test test/fabrica/indice/mapa_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.2", "prefixo", "Montador do prefixo estavel, com pontos de cache", ["v0.1:operario-behaviour", "v0.1:marco", "v0.2:indice-denso"],
    ["lib/fabrica/prompt/prefixo.ex", "lib/fabrica/prompt/bloco.ex", "test/fabrica/prompt/prefixo_test.exs"],
    """
Montar a parte estavel da requisicao — ferramentas, doutrina do papel e indice do projeto —
em blocos ordenados do mais estavel para o mais volatil, com no maximo quatro pontos de
cache marcados. E a alavanca de custo numero um da v2.
""",
    """
NUMERO QUE JUSTIFICA ESTA TAREFA, medido nos 27 jobs da v1 com contabilidade completa: a
leitura de cache ja e 93,14% dos tokens de entrada e a economia atual e ~80%. O que sobra
e a ESCRITA: 6,66% dos tokens carregando ~50% da conta, porque cada despacho e sessao nova
e sessao nova escreve prefixo novo (~21 por rodada). Transformar 21 escritas em 1–2 e o
premio. Ver `MIGRACAO_V2.md`, secao 1.

Ordem de montagem, imposta pela API e nao por convencao: `tools` -> `system` -> `messages`.
Um byte alterado invalida tudo o que vem DEPOIS dele. Logo, a ordem dos blocos e:

    1. ferramentas (identicas entre despachos do mesmo papel)   <- ponto de cache
    2. doutrina do papel (texto fixo do construtor/verificador) <- ponto de cache
    3. indice denso do projeto (o MAPA da T-010)                <- ponto de cache
    4. contexto especifico da tarefa                            (sem ponto — muda sempre)

Regras que o codigo tem de garantir, e cada uma vira teste:

- **Nada volatil nos blocos 1 a 3.** Sem data, sem contador, sem hash de commit, sem mapa
  serializado em ordem nao deterministica. Ordene TODA colecao antes de serializar.
- **No maximo 4 pontos de cache por requisicao** — a API rejeita mais.
- **Minimo cacheavel e POR MODELO e nao e monotonico:** 512 tokens no Opus 5, 1024 no
  Sonnet 5, **4096 no Haiku 4.5**. A fabrica roda o verificador em Haiku de proposito —
  um prefixo de verificador abaixo de 4096 tokens simplesmente NAO cacheia, sem aviso. O
  montador deve receber o modelo e avisar (log, nao erro) quando o prefixo ficar abaixo do
  minimo daquele modelo.
- **TTL de 1 hora nos blocos 1 a 3.** Escrita custa 2,0x em vez de 1,25x, mas sobrevive ao
  intervalo entre etapas — e a bateria de testes de um verificador leva minutos.

O TESTE QUE MAIS IMPORTA e o que monta o prefixo DUAS VEZES, em momentos diferentes, e
falha se os bytes divergirem. E ele que protege a economia inteira, e ele e a razao de o
`MessagesAPI` existir.
""",
    [
        ("Montar o prefixo duas vezes, em momentos diferentes, produz bytes IDENTICOS.", "mix test test/fabrica/prompt/prefixo_test.exs"),
        ("O montador nunca emite mais de 4 pontos de cache, mesmo com mais blocos.", "mix test test/fabrica/prompt/prefixo_test.exs"),
        ("Prefixo abaixo do minimo cacheavel do modelo alvo gera aviso em log com o numero do minimo.", "mix test test/fabrica/prompt/prefixo_test.exs"),
        ("Toda colecao serializada no prefixo e ordenada deterministicamente (teste com mapa embaralhado).", "mix test test/fabrica/prompt/prefixo_test.exs"),
    ],
)

tarefa(
    "v0.2", "ferramentas-arquivo", "Ferramentas de arquivo com confinamento", ["v0.1:scaffold"],
    ["lib/fabrica/ferramentas/arquivo.ex", "lib/fabrica/ferramentas/confinamento.ex", "test/fabrica/ferramentas/confinamento_test.exs"],
    """
As ferramentas `ler`, `escrever`, `editar`, `listar` e `buscar`, todas confinadas ao
diretorio do projeto — e o confinamento como propriedade do codigo, nunca como frase no
prompt.
""",
    """
A tese do TCC em uma tarefa: "uma regra que o sistema pede e uma regra opcional; uma regra
que a estrutura garante e uma propriedade". Na v1 o confinamento era uma linha no despacho
("nao toque em NADA fora de..."). Aqui ele e uma funcao que RECUSA.

`Confinamento.resolver(raiz, caminho)` devolve `{:ok, absoluto}` ou `{:erro, :fora_do_confinamento}`.
Ela precisa barrar, com teste para cada caso:

- caminho absoluto para fora (`C:\\Windows\\System32\\...`)
- travessia (`../../..`), inclusive travessia que so aparece depois de normalizar
- link simbolico que aponta para fora (resolva o caminho REAL com
  `:file.read_link_all/1` antes de comparar)
- no Windows: caminho UNC (`\\\\servidor\\share`) e nome de dispositivo (`CON`, `NUL`, `COM1`)

Compare sempre os caminhos NORMALIZADOS e em minusculas no Windows (o sistema de arquivos
e case-insensitive, e uma comparacao case-sensitive deixa passar `..\\PROJETO`).

`editar` e substituicao exata de string, com erro se a string aparecer zero ou mais de uma
vez — a mesma disciplina da ferramenta que voce esta usando agora. Isso evita a edicao que
"quase" acerta e corrompe o arquivo em silencio.
""",
    [
        ("Cada forma de escapar do confinamento e barrada, uma por teste (absoluto, travessia, link, UNC, dispositivo).", "mix test test/fabrica/ferramentas/confinamento_test.exs"),
        ("A comparacao de caminhos e case-insensitive no Windows (teste com `..\\PROJETO` em maiusculas).", "mix test test/fabrica/ferramentas/confinamento_test.exs"),
        ("`editar` recusa quando a string alvo aparece zero ou mais de uma vez, com erro nomeado.", "mix test test/fabrica/ferramentas/arquivo_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.2", "ferramenta-comando", "Ferramenta de comando, com prazo e morte da ARVORE de processos", ["v0.2:ferramentas-arquivo"],
    ["lib/fabrica/ferramentas/comando.ex", "lib/fabrica/ferramentas/arvore_processos.ex", "test/fabrica/ferramentas/comando_test.exs"],
    """
Executar um comando externo no diretorio do projeto, com prazo, captura de saida e —
o ponto dificil — encerramento da ARVORE de processos, nao so do processo lancado.
""",
    """
ARMADILHA MEDIDA NA v1: matar o processo lancado nao mata os filhos dele. A suite de um
projeto Node deixou OITO `node.exe` orfaos por estouro de prazo, numa maquina com 1,3 GB
livres. A v1 resolveu isso com `encerrarArvore(pid)`; a v2 precisa do equivalente.

No Windows: `taskkill /PID <pid> /T /F` (o `/T` e a arvore). No Unix: matar o grupo de
processos (`:erlang.open_port` com `:spawn_executable` e um wrapper `setsid`). Detecte a
plataforma e teste a que a maquina atual roda; a outra fica com teste marcado para pular.

Capture stdout e stderr SEPARADOS. Juntar os dois e o que faz o diagnostico da v0.3 nao
conseguir distinguir "o comando esta quebrado" de "a entrega falhou".

O resultado devolvido carrega: codigo de saida, stdout, stderr, duracao, e o motivo do
encerramento (`:normal` | `:prazo` | `:cancelado`). O motivo importa: prazo estourado NAO
e a mesma coisa que teste reprovado, e a v0.3 depende dessa distincao.

Prazo padrao de 2 minutos por comando, configuravel por chamada.
""",
    [
        ("Um comando que passa do prazo e encerrado e devolve motivo `:prazo`, nao `:normal`.", "mix test test/fabrica/ferramentas/comando_test.exs"),
        ("stdout e stderr voltam SEPARADOS (teste com comando que escreve nos dois).", "mix test test/fabrica/ferramentas/comando_test.exs"),
        ("Encerrar um comando que lancou um filho mata TAMBEM o filho (teste que confere o pid do neto).", "mix test test/fabrica/ferramentas/comando_test.exs"),
        ("O comando roda com o diretorio de trabalho no projeto, nunca na raiz da fabrica.", "mix test test/fabrica/ferramentas/comando_test.exs"),
    ],
)

tarefa(
    "v0.2", "guardas", "Guarda de processos e guarda de ferramental", ["v0.2:ferramenta-comando"],
    ["lib/fabrica/ferramentas/guardas.ex", "test/fabrica/ferramentas/guardas_test.exs"],
    """
Duas guardas que avaliam um comando ANTES de ele rodar: o agente nao pode matar a propria
fabrica, e nao pode reinventar uma ferramenta que a fabrica ja tem.
""",
    """
Os dois mecanismos existem na v1 (`pipeline/guarda-processos.ts` e
`pipeline/guarda-ferramental.ts`) e nao aparecem em documento nenhum do TCC. Ver
`MIGRACAO_V2.md`, secao 3.

**Guarda de processos.** Recusa comando que mataria o proprio runtime: `taskkill` sem PID
alvo, `taskkill /IM beam.exe`, `Stop-Process -Name beam|erl`, `pkill beam`, e qualquer
morte que alcance o PID do no atual ou seus ancestrais. A regra e a mesma da coleta de
orfaos da v1: **exige prova de propriedade** — so pode matar o que a propria fabrica
lancou.

**Guarda de ferramental.** Avisa (nao recusa) quando o comando reinventa algo que a
fabrica ja tem — por exemplo escrever um parser de frontmatter em vez de usar o modulo
existente, ou `curl` para algo que o cliente HTTP ja faz. A saida e um aviso anexado ao
resultado da ferramenta, que o agente le na volta seguinte.

A diferenca entre RECUSAR e AVISAR e deliberada: matar a fabrica e irreversivel; reinventar
uma roda e caro mas recuperavel, e uma recusa errada aqui bloquearia trabalho legitimo.

Ambas sao funcoes PURAS sobre a string do comando — sem I/O. E por isso que sao
testaveis exaustivamente, e e la que mora todo o julgamento.
""",
    [
        ("A guarda de processos recusa cada forma conhecida de matar o runtime, uma por teste.", "mix test test/fabrica/ferramentas/guardas_test.exs"),
        ("A guarda de processos PERMITE matar um processo que a fabrica lancou (com prova de propriedade).", "mix test test/fabrica/ferramentas/guardas_test.exs"),
        ("A guarda de ferramental AVISA e nao recusa (o comando roda, com aviso anexado).", "mix test test/fabrica/ferramentas/guardas_test.exs"),
        ("Ambas as guardas sao puras: nenhuma chamada de I/O no caminho (inspecionavel).", None),
    ],
)

tarefa(
    "v0.2", "laco", "O laco de tool use como processo supervisionado", ["v0.1:operario-behaviour", "v0.2:prefixo", "v0.2:ferramentas-arquivo", "v0.2:ferramenta-comando", "v0.2:guardas"],
    ["lib/fabrica/agente/laco.ex", "lib/fabrica/agente/estado.ex", "test/fabrica/agente/laco_test.exs"],
    """
O nucleo do sistema: um `GenServer` que monta a requisicao, chama o operario, executa as
ferramentas pedidas e repete ate o modelo dizer que terminou — ou ate bater num teto
imposto de fora.
""",
    """
E a figura 3 dos documentos, virando codigo. A forma esta no `-3-completo`, secao 7:

    def handle_info(:trabalhar, estado) do
      case Operario.conversar(estado.requisicao) do
        {:ok, %{motivo_parada: :uso_de_ferramenta} = r} ->
          resultados =
            r.conteudo
            |> Enum.filter(&(&1.tipo == :uso_de_ferramenta))
            |> Task.async_stream(&Ferramentas.executar(&1, estado.confinamento),
                 max_concurrency: 4, timeout: :timer.minutes(2), on_timeout: :kill_task)
            |> Enum.map(&resultado_ou_erro/1)

          estado
          |> anexar_turno(r.conteudo, resultados)   # TODOS os resultados num turno so
          |> contabilizar(r.consumo)                # custo e tokens gravados por volta
          |> continuar_ou_parar()                   # teto de voltas e de gasto

        {:ok, %{motivo_parada: :fim_do_turno} = r} ->
          {:stop, :normal, finalizar(estado, r)}
      end
    end

Quatro regras que o codigo tem de garantir, e cada uma tem motivo:

1. **TODOS os resultados de ferramenta voltam num turno so.** Dividi-los em varias
   mensagens ensina o modelo a parar de pedir ferramentas em paralelo — e o paralelismo
   local e de graca.
2. **Teto de voltas e de gasto NAO vao no prompt.** Sao estado do processo e
   responsabilidade do supervisor. O agente nao tem como ignora-los.
3. **Ferramenta que falha devolve resultado com `erro: true`**, nunca some. Resultado
   ausente deixa o modelo cego sobre o que aconteceu.
4. **Cada volta grava uma linha em `consumos`** antes de seguir. Um laco cortado no meio
   precisa ter deixado registro do que ja gastou — foi exatamente o que a v1 perdia nos
   jobs mais caros.

Teste com `Operario.Falso`: roteiro de tres voltas (duas com ferramenta, uma com fim de
turno) e confira que o historico tem a forma certa, que ha tres linhas de consumo, e que o
teto de voltas interrompe quando estourado.
""",
    [
        ("Um roteiro de 3 voltas resolve e o laco encerra com `:fim_do_turno`, gravando 3 linhas de consumo.", "mix test test/fabrica/agente/laco_test.exs"),
        ("Multiplas ferramentas pedidas na mesma volta voltam em UM unico turno de resultados.", "mix test test/fabrica/agente/laco_test.exs"),
        ("Ferramenta que falha devolve resultado marcado como erro; o laco continua em vez de morrer.", "mix test test/fabrica/agente/laco_test.exs"),
        ("O teto de voltas interrompe o laco e registra o desfecho como `:teto_de_voltas`.", "mix test test/fabrica/agente/laco_test.exs"),
    ],
)

tarefa(
    "v0.2", "registrar-resultado", "A ferramenta registrar_resultado, e a ausencia da de mudar estado", ["v0.1:esquema", "v0.2:laco"],
    ["lib/fabrica/ferramentas/registrar_resultado.ex", "test/fabrica/ferramentas/registrar_resultado_test.exs"],
    """
A unica forma de um agente reportar o que fez: uma chamada estruturada que o sistema grava
na transacao. E a garantia, testada, de que nao existe ferramenta de mudar status para
agente nenhum.
""",
    """
Esta e a decisao 6.2 de `MIGRACAO_V2.md`, e ela generaliza uma regra que a v1 ja tinha
pago para descobrir: o protocolo da v1 marca `ultima-reprovacao: # NAO ESCREVA. Campo do
MOTOR`. O sistema conta; o agente nao.

`registrar_resultado` recebe: o que foi feito, arquivos alterados, comandos rodados, hash
do commit, e (opcional) impedimento declarado. Grava em `ciclos.relatorio`. **Nao aceita
campo de status, nem de tentativas.** Se o agente mandar, e ignorado com aviso — nunca
aceito em silencio.

O teste que mais importa aqui e NEGATIVO: varrer o catalogo de ferramentas de todo papel e
falhar se qualquer uma permitir escrever em `tarefas.status` ou `tarefas.tentativas`. E o
equivalente, em codigo, da ausencia da ferramenta de escrever no revisor — impossibilidade,
nao regra pedida.

E lembre o motivo economico: hoje o agente gasta VOLTAS lendo o arquivo da tarefa e
reescrevendo secoes dele. Uma chamada estruturada e uma volta. Volta e o termo dominante
da conta.
""",
    [
        ("`registrar_resultado` grava o relatorio no ciclo corrente, dentro de uma transacao.", "mix test test/fabrica/ferramentas/registrar_resultado_test.exs"),
        ("Campo de status ou de tentativas enviado pelo agente e IGNORADO, com aviso registrado.", "mix test test/fabrica/ferramentas/registrar_resultado_test.exs"),
        ("Teste negativo: nenhuma ferramenta de nenhum papel permite escrever status ou tentativas.", "mix test test/fabrica/ferramentas/registrar_resultado_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.2", "orcamento-ferramentas", "Teto de chamadas de ferramenta por papel", ["v0.2:laco"],
    ["lib/fabrica/agente/orcamento_ferramentas.ex", "test/fabrica/agente/orcamento_ferramentas_test.exs"],
    """
Um teto de chamadas de ferramenta por papel, medido e nao chutado, que MEDE o estouro e o
registra — sem cortar o despacho no meio.
""",
    """
A v1 tem isso (`despachante.ts`, `orcamentoDeFerramentas` e `limiarDeDebate`), medido sobre
135 etapas reais dos proprios logs, sem gastar um centavo de modelo. Porte os numeros
lendo `<fabrica-v1>/painel/servidor/src/pipeline/despachante.ts` — nao os invente.

**MEDE E NAO CORTA, DE PROPOSITO**, e isto esta em `DECISOES_FECHADAS.md` como caso que
PARECE defeito e nao e: cortar exigiria converter chamadas em voltas, e despacho
interrompido no meio custa igual sem entregar nada (US$ 4,11 medidos num corte por cota).
E a mesma doutrina do teto de orcamento: nunca cortar no meio, so nao COMECAR o que nao
cabe.

A lacuna real da v1, e que a v2 deve fechar: la a medicao nao alimentava decisao nenhuma.
Aqui ela alimenta duas — o diagnostico da v0.3 (um despacho que estourou o teto de
ferramentas e sinal de tarefa mal dimensionada) e a estimativa do proximo despacho.

Grave o estouro em `despachos`, com o teto e o realizado.
""",
    [
        ("O teto por papel vem dos numeros medidos da v1, com a fonte citada no cabecalho do arquivo (inspecionavel).", None),
        ("Estourar o teto REGISTRA o estouro e NAO interrompe o despacho.", "mix test test/fabrica/agente/orcamento_ferramentas_test.exs"),
        ("O estouro fica legivel em `despachos` (teto e realizado), disponivel para o diagnostico da v0.3.", "mix test test/fabrica/agente/orcamento_ferramentas_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.2", "operario-cli", "Operario.ClaudeCLI — o adaptador padrao de operacao", ["v0.1:operario-behaviour", "v0.2:laco"],
    ["lib/fabrica/operario/claude_cli.ex", "test/fabrica/operario/claude_cli_test.exs"],
    """
O adaptador que conversa com o Claude Code CLI. E o PADRAO de operacao: roda na assinatura,
sem chave de API e sem converter cota em fatura.
""",
    """
Decisao 6.1 de `MIGRACAO_V2.md`. A fabrica hoje NAO paga por token — consome cota (OAuth,
assinatura Pro, sem `ANTHROPIC_API_KEY`). Este adaptador preserva isso.

Converse com o CLI por processo, em modo nao interativo, com saida em JSON por linha
(o formato de streaming de eventos). Cada evento vira um bloco de conteudo ou uma linha de
consumo. Traduza o vocabulario do CLI para o do `behaviour` — o resto da fabrica nao pode
saber qual adaptador esta rodando.

O QUE ESTE ADAPTADOR NAO CONSEGUE FAZER, e precisa estar escrito no cabecalho do arquivo:
posicionar pontos de cache. O CLI gerencia o cache sozinho e nao expoe `cache_control` nem
TTL (conferido na v1, registrado em `DECISOES_FECHADAS.md`). Por isso o `MessagesAPI`
existe — e por isso o marco desta versao mede a escrita de prefixo.

**Reconheca a parede de cota.** O CLI sinaliza limite de uso com mensagem e horario de
reabertura. Traduza para `{:erro, {:cota, reabre_em}}` — a v0.4 depende disso para dormir e
rearmar, e esse mecanismo esta ausente da documentacao inteira do TCC.

O teste NAO chama o CLI de verdade: injete o executavel por configuracao e aponte para um
script falso que imprime eventos JSON conhecidos. Assim a suite continua sem rede e sem
cota, que e o marco da v0.1 e nao pode ser quebrado aqui.
""",
    [
        ("O adaptador traduz eventos JSON do CLI para `Resposta` e `Consumo` do behaviour.", "mix test test/fabrica/operario/claude_cli_test.exs"),
        ("Mensagem de limite de uso vira `{:erro, {:cota, reabre_em}}` com o horario extraido.", "mix test test/fabrica/operario/claude_cli_test.exs"),
        ("O teste usa um executavel FALSO injetado por configuracao; a suite segue sem rede e sem cota.", "mix test test/fabrica/operario/claude_cli_test.exs"),
        ("O cabecalho do arquivo registra que este adaptador nao posiciona pontos de cache, e por que (inspecionavel).", None),
    ],
)

tarefa(
    "v0.2", "operario-api", "Operario.MessagesAPI — Req, com controle de cache", ["v0.1:operario-behaviour", "v0.2:prefixo"],
    ["lib/fabrica/operario/messages_api.ex", "test/fabrica/operario/messages_api_test.exs"],
    """
O adaptador que fala HTTP direto com a Messages API usando Req, com controle byte a byte do
prefixo, dos pontos de cache e do TTL. E ele que persegue os ~50% da conta que a escrita de
cache carrega.
""",
    """
POR QUE REQ E NAO BIBLIOTECA PRONTA (a escolha mais contraintuitiva do projeto, e ela
precisa continuar justificada): o nucleo precisa decidir, requisicao a requisicao, onde
marcar os pontos de cache e qual TTL pedir. Camada de conveniencia esconde exatamente isso.

Monte o corpo na ordem que a API impoe: `tools` -> `system` -> `messages`. Marque
`cache_control` no ultimo bloco de cada faixa estavel, com `ttl: "1h"` nos blocos 1 a 3.

TRES ARMADILHAS que este adaptador precisa tratar, e que a v1 nao tem como nem enxergar:

1. **Janela de 20 blocos.** Cada ponto de cache caminha para tras no MAXIMO 20 blocos de
   conteudo procurando entrada anterior. Uma volta com muitos `tool_use`/`tool_result` — e
   a v1 tem rodada com 472 chamadas de ferramenta — faz o ponto seguinte nao encontrar o
   anterior e ERRAR O CACHE EM SILENCIO. Insira ponto intermediario a cada ~15 blocos.
2. **Requisicoes paralelas identicas nao compartilham cache** — nenhuma le o que as outras
   ainda estao escrevendo. Quando houver fan-out, dispare UMA, espere o primeiro token, e
   so entao as demais.
3. **Mensagem de sistema no meio da conversa.** Para instrucao que muda por tarefa, use
   `{"role": "system"}` DENTRO de `messages` em vez de editar o `system` de topo — editar o
   topo invalida todo o historico cacheado. Disponivel em Opus 5 / Opus 4.8 / Fable 5, sem
   beta; nos demais, caia para bloco de texto no turno do usuario.

Verifique o ganho pelo unico lugar que nao mente: `cache_read_input_tokens` na resposta.
Se vier zero em requisicoes repetidas com o mesmo prefixo, ha invalidador silencioso.

Autenticacao por `ANTHROPIC_API_KEY`, lida SO neste modulo. O teste usa um `Req.Test` stub
— nenhuma chamada real, nenhuma leitura de credencial na suite.
""",
    [
        ("O corpo montado tem a ordem tools -> system -> messages, com no maximo 4 pontos de cache e `ttl: 1h` nos blocos estaveis.", "mix test test/fabrica/operario/messages_api_test.exs"),
        ("Um historico com mais de 20 blocos numa volta recebe ponto de cache intermediario.", "mix test test/fabrica/operario/messages_api_test.exs"),
        ("Instrucao por tarefa vai como mensagem de sistema dentro de `messages`, nunca editando o `system` de topo.", "mix test test/fabrica/operario/messages_api_test.exs"),
        ("O teste usa stub de HTTP; nenhuma credencial e lida durante a suite.", "mix test test/fabrica/operario/messages_api_test.exs"),
    ],
)

tarefa(
    "v0.2", "marco", "MARCO da v0.2: uma tarefa resolvida, e o prefixo escrito uma vez", ["v0.2:registrar-resultado", "v0.2:orcamento-ferramentas", "v0.2:operario-cli", "v0.2:operario-api"],
    ["_gestao/PROGRESSO.md"],
    """
Verificar os DOIS marcos da v0.2: um agente resolve uma tarefa real de ponta a ponta com
custo por volta gravado; e o prefixo do projeto e escrito uma vez e lido pelos despachos
seguintes.
""",
    """
Tarefa de verificacao — nada de codigo novo.

**Marco 1.** Escolha uma tarefa real e pequena num projeto de verdade (crie um projeto de
teste com 3 arquivos, se preciso). Despache um agente com `Operario.ClaudeCLI`. Confira:
a tarefa foi resolvida, ha uma linha em `consumos` por volta, e a soma bate com o total.

**Marco 2, e e este que decide se o `MessagesAPI` se justifica.** Rode DOIS despachos
seguidos no mesmo projeto com `Operario.MessagesAPI` e compare:

    despacho 1: cache_creation_input_tokens alto,  cache_read_input_tokens ~zero
    despacho 2: cache_creation_input_tokens ~zero, cache_read_input_tokens alto

Se o segundo despacho tambem escrever o prefixo, ha invalidador silencioso — e o
diagnostico e diffar os bytes do prefixo entre as duas requisicoes ate achar o que mudou.

Este marco CUSTA DINHEIRO de verdade (e o unico ponto do plano que usa chave de API).
Estime antes, declare o teto, e rode com o prefixo menor possivel que ainda passe do minimo
cacheavel. Registre o gasto real em `_gestao/PROGRESSO.md` ao lado do veredito.

Compare tambem contra a linha de base da T-008: a v1 grava ~50% da conta de entrada em
escrita de cache. Se a v2 nao melhorar isso, o `ClaudeCLI` fica como padrao e o
`MessagesAPI` volta para a prateleira — o que e uma resposta legitima, e precisa estar
escrita.
""",
    [
        ("Um agente resolve uma tarefa real e ha uma linha de consumo por volta, com soma batendo com o total.", None),
        ("Dois despachos seguidos no mesmo projeto: o segundo LE o prefixo em vez de escrever (numeros registrados).", None),
        ("O gasto real do marco 2 esta registrado em `_gestao/PROGRESSO.md`, com o teto declarado antes.", None),
        ("O veredito compara com a linha de base da T-008 e diz explicitamente se o `MessagesAPI` se justifica.", None),
    ],
)

# ===========================================================================
# v0.3 — A LINHA DE PRODUCAO
# ===========================================================================

tarefa(
    "v0.3", "abertura", "ABERTURA da v0.3: conferir o plano contra o codigo que existe", ["v0.2:marco"],
    ["_gestao/PROGRESSO.md", "_sistema/v2/tarefas"],
    """
Antes de implementar a v0.3, confrontar o planejamento com o codigo que a v0.1 e a v0.2
realmente produziram, e ajustar as tarefas desta versao onde a realidade divergiu do plano.
Nenhum codigo de producao e escrito nesta tarefa.
""",
    """
POR QUE ESTA TAREFA EXISTE: as 54 tarefas foram escritas de uma vez, em 28/08/2026, antes
de existir uma linha de codigo. As da v0.1 e v0.2 envelhecem pouco porque sao executadas
logo. Estas aqui vao ser executadas depois, sobre um codigo que ja tomou decisoes que o
planejamento nao podia prever. Ajustar aqui, de uma vez e com registro, e melhor que
improvisar tarefa a tarefa.

**Releia primeiro** (nesta ordem):
  - `_sistema/PLANO_V2.md`, secao 3, o bloco da v0.3
  - `_sistema/MIGRACAO_V2.md`, **secao 3** — os 19 mecanismos da v1 que nao estao na
    documentacao. A v0.3 e a versao que absorve a maior parte deles
  - `_sistema/DECISOES_FECHADAS.md` inteiro
  - `_gestao/PROGRESSO.md` — o veredito dos marcos da v0.1 e da v0.2

**Confira, item a item, e ajuste o que divergiu:**

  1. **O esquema real do banco** (T-002 executada) contra o que as tarefas desta versao
     assumem. Nome de coluna, nome de tabela e tipo de enum costumam mudar na hora de
     escrever a migracao. Se mudou, corrija o texto das tarefas — nao deixe a tarefa
     mentindo sobre o proprio banco.
  2. **A forma do estado do laco** (T-015) contra o que a transicao transacional precisa
     ler. Se o laco guarda o consumo de um jeito diferente do que a T-021 assume, decida
     agora qual dos dois muda.
  3. **O veredito do marco da v0.2 sobre o `MessagesAPI`.** Se ele NAO se justificou, o
     escalonamento de modelo desta versao mira o `ClaudeCLI` e a tarefa precisa dizer isso.
  4. **Abra o codigo da v1 que vai ser portado, ANTES de portar.** Sao quatro arquivos, e
     eles sao a fonte, nao a memoria de quem escreveu a tarefa:
     `pipeline/diagnostico.ts`, `pipeline/criterios.ts`, `pipeline/orcamento.ts`,
     `pipeline/maquina.ts`. Confira se os casos de teste de la estao cobertos pelos
     criterios das tarefas desta versao.
  5. **Os numeros que a v1 mediu** (tetos de voltas, custo padrao de tarefa) continuam
     valendo? Eles vieram de medicao naquele contexto; anote se algum precisa ser
     remedido depois.

**Registre em `_gestao/PROGRESSO.md`**: o que foi conferido, o que foi ajustado e por que.
Um ajuste sem justificativa registrada e indistinguivel de um desvio do plano — e e
exatamente isso que a banca vai perguntar.

Se nada precisou mudar, escreva isso tambem. "Conferido, nada divergiu" e informacao.
""",
    [
        ("Os cinco itens acima foram conferidos, um a um, com o resultado anotado.", None),
        ("Toda tarefa da v0.3 que divergia do codigo real foi corrigida (ou registrado que nenhuma divergia).", None),
        ("`_gestao/PROGRESSO.md` registra o que foi ajustado e a justificativa de cada ajuste.", None),
        ("Nenhum codigo de producao foi alterado nesta tarefa.", "git diff --stat HEAD~1 -- lib test"),
    ],
)

tarefa(
    "v0.3", "estados", "Os seis estados e a transicao transacional", ["v0.1:esquema", "v0.1:contabilidade"],
    ["lib/fabrica/tarefas/maquina.ex", "lib/fabrica/tarefas/transicao.ex", "test/fabrica/tarefas/transicao_test.exs"],
    """
A maquina de estados da tarefa: quais transicoes existem, e a garantia de que cada uma
grava estado, relatorio e custo NA MESMA TRANSACAO — ou nao grava nada.
""",
    """
Transicoes legais, e so estas:

    backlog     -> pronta         (dependencias todas concluidas)
    pronta      -> em_execucao    (despacho do construtor)
    em_execucao -> em_teste       (construtor terminou)
    em_teste    -> em_revisao     (verificador aprovou)
    em_teste    -> em_execucao    (verificador reprovou)
    em_revisao  -> concluida      (revisor aprovou)
    em_revisao  -> em_execucao    (revisor reprovou)
    qualquer    -> bloqueada      (esgotou ciclos)
    qualquer    -> cancelada      (replanejamento)

Toda transicao ilegal devolve `{:erro, {:transicao_invalida, de, para}}`. A funcao que
decide e PURA (`Maquina.pode?/2`); a que executa faz o `Ecto.Multi`.

A transacao carrega TRES coisas juntas: o novo status, a linha nova em `ciclos` com o
relatorio da etapa, e as linhas de `consumos` do despacho. Nao existe tarefa que mudou de
estado sem deixar registrado por que, nem custo gasto que nao esteja ligado a um resultado.

`tentativas` e incrementado pelo SISTEMA no momento em que a tarefa e entregue a um
construtor — nunca pelo agente. Na v1 o agente as vezes esquecia e a mesma tarefa girava:
uma rodada mediu 41 despachos e US$ 22,55.

O teste que importa: forcar um erro no meio do Multi e conferir que NADA foi gravado —
nem o status, nem o ciclo, nem o consumo.
""",
    [
        ("Cada transicao legal e aceita e cada ilegal e recusada com erro nomeado (uma por teste).", "mix test test/fabrica/tarefas/transicao_test.exs"),
        ("Erro no meio da transacao nao grava NADA: status, ciclo e consumos ficam como estavam.", "mix test test/fabrica/tarefas/transicao_test.exs"),
        ("`tentativas` e incrementado pelo sistema ao entregar a tarefa ao construtor, nunca pelo agente.", "mix test test/fabrica/tarefas/transicao_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.3", "promocao", "Promocao por dependencias e ordenacao da fila", ["v0.3:estados"],
    ["lib/fabrica/tarefas/fila.ex", "test/fabrica/tarefas/fila_test.exs"],
    """
Decidir, deterministicamente, quais tarefas passam de `backlog` para `pronta` e em que
ordem despachar as prontas.
""",
    """
Funcoes PURAS sobre uma lista de tarefas — sem I/O. E o porte de `pipeline/maquina.ts` da
v1 (`promoverProntas`, `proximosPassos`), que ja e puro e ja tem teste: traduza os casos
de teste junto com o codigo.

`promover/1` — uma tarefa vira `pronta` quando TODAS as suas dependencias estao
`concluida`. Dependencia `cancelada` conta como satisfeita se houver substituta concluida
(replanejamento); dependencia `bloqueada` NAO satisfaz.

`proximos/2` — ordena por prioridade, depois por codigo. Devolve no maximo 3 passos
paralelos, e so entre tarefas cujas `areas` sejam DISJUNTAS. Duas tarefas que tocam o
mesmo arquivo nunca saem juntas.

Ciclo de dependencias e defeito de planejamento, nao situacao normal: detecte e devolva
`{:erro, {:ciclo, caminho}}` em vez de travar.
""",
    [
        ("Tarefa com todas as dependencias concluidas e promovida; com uma pendente, nao.", "mix test test/fabrica/tarefas/fila_test.exs"),
        ("Duas tarefas com `areas` que se cruzam nunca saem no mesmo lote de paralelismo.", "mix test test/fabrica/tarefas/fila_test.exs"),
        ("Ciclo de dependencias e detectado e reportado com o caminho, sem travar.", "mix test test/fabrica/tarefas/fila_test.exs"),
        ("As funcoes sao puras: nenhum acesso a banco no caminho (inspecionavel).", None),
    ],
)

tarefa(
    "v0.3", "equipe", "Equipe sob demanda: especialistas versionados e resolucao do construtor", ["v0.1:esquema", "v0.3:promocao"],
    ["lib/fabrica/equipe.ex", "lib/fabrica/equipe/resolucao.ex", "test/fabrica/equipe/resolucao_test.exs"],
    """
Os especialistas do projeto como dado versionado no banco, e a resolucao deterministica de
QUEM executa cada tarefa.
""",
    """
A v1 chama isto de "provavelmente o coracao do sistema": a fabrica nao tem um programador
generico esperando na fila — o planejador sintetiza 2 a 5 especialistas a partir do proprio
pedido, e cada tarefa nasce apontando para o da area que ela toca.

Resolucao, em ordem: especialista da tarefa -> generico do papel. Como na v2 nao existe
mecanismo de subagente (o despacho e montado pela maquina de estados), o prompt do
especialista entra num bloco proprio ao lado do papel generico — que e exatamente o que a
v1 faz, e o unico caminho que ela executa de fato.

O PROMPT DO ESPECIALISTA E DOMINIO PURO. Nao repete commit, status, confinamento nem "leia
o protocolo" — isso ja vem do papel generico. Medido na v1: os especialistas gastavam ~70%
do texto repetindo o construtor. Escreva so o que o generico nao teria como saber: arquivos
da area, invariantes, o comando que prova um criterio dela, e as armadilhas ja pagas.

VERSIONADO: alterar o prompt cria linha nova em `especialistas`, com o anterior marcado
inativo. E isso que permite comparar o desempenho do mesmo especialista antes e depois.

Especialista referenciado que nao existe: use o generico E REGISTRE — apontar para
especialista inexistente e defeito de planejamento que so aparece se alguem escrever.
""",
    [
        ("A resolucao devolve o especialista quando ele existe, e o generico quando nao existe.", "mix test test/fabrica/equipe/resolucao_test.exs"),
        ("Especialista inexistente cai no generico E registra o defeito, em vez de falhar em silencio.", "mix test test/fabrica/equipe/resolucao_test.exs"),
        ("Alterar o prompt cria linha nova e marca a anterior inativa; o historico fica consultavel.", "mix test test/fabrica/equipe/resolucao_test.exs"),
        ("O prompt do especialista entra em bloco proprio, ao lado do papel generico, no despacho.", "mix test test/fabrica/equipe/resolucao_test.exs"),
    ],
)

tarefa(
    "v0.3", "criterios", "Criterios executaveis: leitura, allowlist e passada mecanica", ["v0.2:ferramenta-comando", "v0.3:estados"],
    ["lib/fabrica/criterios.ex", "lib/fabrica/criterios/allowlist.ex", "test/fabrica/criterios_test.exs"],
    """
Rodar de graca, antes de despachar qualquer verificador, todo criterio que tem comando —
e recusar comando inseguro por allowlist, nunca por lista de proibicoes.
""",
    """
Porte de `pipeline/criterios.ts` da v1 (728 linhas, ja puro em grande parte). E a terceira
alavanca de custo: criterio que um comando resolve deixa de gastar um despacho inteiro.

**Allowlist, nunca denylist.** A v1 aprendeu isso por estrago com `ext::<comando>` na URL
de remoto: "proibir o perigoso" e uma lista infinita, "permitir o conhecido" e finita.
Comece com: `mix`, `git`, `elixir`, `npm`, `node`, `python`, `pytest`, `cargo`, `go`,
`dotnet`. Qualquer outro binario devolve `{:recusado, :binario_nao_permitido}`.

Recuse tambem: encadeamento (`&&`, `||`, `;`, `|`), redirecionamento, e substituicao de
comando. Um criterio precisa de UM comando, nao de um script.

Deduplique dentro do lote: dois criterios que rodam o mesmo comando executam UMA vez. A v1
mede isso por uma "chave de comando" normalizada — porte a ideia.

Ao fim, produza o relatorio no formato da escada de prova: cada criterio rotulado
`[executado]`, `[inspecionado]` ou `[julgado]`, e a linha `Graus de prova:` fechando.
""",
    [
        ("Criterio com comando na allowlist executa; com binario fora dela e recusado com motivo nomeado.", "mix test test/fabrica/criterios_test.exs"),
        ("Encadeamento, redirecionamento e substituicao de comando sao recusados (um teste cada).", "mix test test/fabrica/criterios_test.exs"),
        ("Dois criterios com o mesmo comando executam UMA vez so.", "mix test test/fabrica/criterios_test.exs"),
        ("O relatorio sai com cada criterio rotulado e a linha `Graus de prova:` no fim.", "mix test test/fabrica/criterios_test.exs"),
    ],
)

tarefa(
    "v0.3", "classe-falha", "Classe de falha: o comando quebrou, ou a entrega falhou?", ["v0.3:criterios"],
    ["lib/fabrica/criterios/classe_falha.ex", "test/fabrica/criterios/classe_falha_test.exs"],
    """
Distinguir, quando um criterio nao passa, se o problema e o COMANDO (mal escrito,
dependencia ausente, ambiente) ou a ENTREGA. Sao consequencias opostas.
""",
    """
E o mecanismo mais caro que a v1 aprendeu, e ele nao esta em documento nenhum do TCC.
Sem ele, um `verificar:` mal escrito manda a tarefa de volta ao construtor repetidamente:
a T-030 do banco-imobiliario gastou 4 ciclos e US$ 12,90 com o deliverable CORRETO desde o
primeiro, porque o criterio tinha um `node --test tests` impossivel naquela maquina.

Classes, e o que cada uma dispara:

- `:ferramenta_quebrada` — binario ausente, comando nao encontrado, erro de sintaxe do
  proprio comando. **NAO conta ciclo.** Vai para o orquestrador corrigir o criterio.
- `:ambiente` — porta ocupada, arquivo travado, prazo estourado por lentidao. **Reexecuta
  UMA vez** antes de concluir; conta quantas reexecucoes houve.
- `:entrega` — o comando rodou e o resultado esta errado. **Conta ciclo**, volta ao
  construtor.

A classificacao usa: codigo de saida, stderr (separado do stdout — por isso a T-013 os
separa), e o motivo de encerramento (`:prazo` nao e `:normal`).

Funcao pura sobre o resultado do comando. Todo julgamento mora aqui, e por isso e aqui que
os testes precisam ser exaustivos.
""",
    [
        ("Binario ausente e classificado como `:ferramenta_quebrada` e NAO conta ciclo.", "mix test test/fabrica/criterios/classe_falha_test.exs"),
        ("Falha de ambiente reexecuta uma vez e registra quantas reexecucoes houve.", "mix test test/fabrica/criterios/classe_falha_test.exs"),
        ("Comando que roda e devolve resultado errado e `:entrega` e conta ciclo.", "mix test test/fabrica/criterios/classe_falha_test.exs"),
        ("Prazo estourado nao e confundido com reprovacao de entrega.", "mix test test/fabrica/criterios/classe_falha_test.exs"),
    ],
)

tarefa(
    "v0.3", "criterio-suite", "O criterio implicito da suite e a deteccao de ecossistema", ["v0.3:criterios"],
    ["lib/fabrica/criterios/suite.ex", "lib/fabrica/ecossistemas.ex", "test/fabrica/criterios/suite_test.exs"],
    """
Rodar a suite do projeto em TODA verificacao, sem que ela esteja escrita em tarefa nenhuma —
e descobrir sozinho qual e o comando, pelo ecossistema do projeto.
""",
    """
Da v1, e a razao de o template de tarefa dizer em maiusculas "NAO escreva 'a suite continua
passando' como criterio": a fabrica ja roda a suite sozinha, e escreve-la a mao so cria uma
segunda chance de errar o comando.

Deteccao por arquivo-marcador, na ordem de prioridade: `mix.exs` -> Elixir; `package.json`
-> Node; `pyproject.toml` -> Python; `Cargo.toml` -> Rust; `go.mod` -> Go; `*.csproj` ->
.NET. Se houver `_gestao/ci.json`, ELE VENCE — a deteccao e o palpite, o arquivo e a
declaracao.

O comando da suite entra na lista de criterios como `[executado]`, marcado como implicito,
para aparecer no relatorio sem ter sido escrito por ninguem.
""",
    [
        ("O ecossistema e detectado pelo arquivo-marcador, na ordem de prioridade (um teste por ecossistema).", "mix test test/fabrica/criterios/suite_test.exs"),
        ("`_gestao/ci.json` presente VENCE a deteccao automatica.", "mix test test/fabrica/criterios/suite_test.exs"),
        ("O criterio implicito aparece no relatorio marcado como implicito.", "mix test test/fabrica/criterios/suite_test.exs"),
        ("Projeto sem ecossistema reconhecido nao quebra: reporta e segue sem criterio implicito.", "mix test test/fabrica/criterios/suite_test.exs"),
    ],
)

tarefa(
    "v0.3", "portoes", "Os dois portoes, e a ausencia da ferramenta de corrigir", ["v0.3:estados", "v0.3:criterios", "v0.3:classe-falha"],
    ["lib/fabrica/portoes/verificador.ex", "lib/fabrica/portoes/revisor.ex", "test/fabrica/portoes_test.exs"],
    """
Os dois julgamentos independentes: o verificador responde "funciona?" executando os
criterios; o revisor responde "e o que foi pedido, e esta correto?". Nenhum dos dois tem a
ferramenta de escrever.
""",
    """
"Quem implementa nunca e quem aprova" deixa de ser recomendacao de conduta e vira
impossibilidade: o catalogo de ferramentas do verificador e do revisor NAO CONTEM
`escrever` nem `editar`. E o principio do menor poder aplicado a agentes.

**Verificador** — recebe os criterios e o resultado da passada mecanica JA PRONTO (a T-025
rodou de graca), executa o que sobrou, e rotula cada criterio no grau de prova. Roda no
modelo barato: verificar e mecanico.

**Revisor** — recebe o DIFF commitado e nenhum fonte inteiro. Responde duas perguntas
separadas, em duas secoes:
  - **Conformidade**: cada criterio mapeado ao que o cumpre, e o objetivo julgado.
    Reprovar por conformidade NAO exige achar defeito nenhum — entrega que passa em todos os
    criterios e nao tem bug ainda pode nao ser a tarefa. Criterio frouxo nao e licenca para
    entregar outra coisa.
  - **Revisao**: defeitos reais no diff, cada um como `[gravidade] arquivo:linha — problema`.

O formato dos achados importa: e dele que a T-030 extrai a politica de retrabalho.
""",
    [
        ("O catalogo de ferramentas do verificador e do revisor nao contem escrita (teste negativo).", "mix test test/fabrica/portoes_test.exs"),
        ("O revisor recebe o diff e nenhum fonte inteiro (teste sobre o contexto montado).", "mix test test/fabrica/portoes_test.exs"),
        ("Reprovacao por conformidade sem nenhum defeito encontrado e um desfecho valido e representavel.", "mix test test/fabrica/portoes_test.exs"),
        ("Os achados do revisor saem no formato `[gravidade] arquivo:linha — problema`.", "mix test test/fabrica/portoes_test.exs"),
    ],
)

tarefa(
    "v0.3", "diagnostico", "Diagnostico de reprovacao: decidir COMO refazer, nao so que refazer", ["v0.3:classe-falha", "v0.3:portoes"],
    ["lib/fabrica/retrabalho/diagnostico.ex", "lib/fabrica/retrabalho/politica.ex", "test/fabrica/retrabalho/diagnostico_test.exs"],
    """
Ler a reprovacao, classificar a natureza da falha e derivar a POLITICA do proximo despacho:
qual modelo, quantas voltas, que escopo, e com que foco.
""",
    """
E o mecanismo em que a v1 e mais rica que a documentacao do TCC. A doc descreve a escada
(sobe modelo -> troca especialista -> replaneja -> bloqueia); a v1 tem, alem dela, um
modulo que decide o TAMANHO do retrabalho. Ver `MIGRACAO_V2.md`, secao 3.

Entrada: qual portao reprovou, o veredito de conformidade, os achados com gravidade, e o
impedimento declarado pelo construtor (se houver).

Saida (`Politica`):
  - `modelo` — o do disparo na 1a tentativa; o reforcado da 2a em diante
  - `voltas` — teto ESTREITO para conserto pontual, medio para defeito grave ou falha
    funcional. Um conserto de uma linha nao precisa de 40 voltas
  - `escopo` — so os arquivos apontados, ou a tarefa inteira
  - `foco` — os achados nomeados, em ordem de gravidade, como bloco no despacho

Natureza da falha: `:pontual` (achado de baixa gravidade, arquivo e linha nomeados),
`:funcional` (criterio executavel reprovou), `:conformidade` (entregou outra coisa),
`:impedimento` (o construtor declarou que nao consegue).

`:conformidade` e o caso especial: NAO adianta dar mais voltas nem modelo melhor se a
tarefa entregue e outra. Ele vai direto para escopo inteiro com o objetivo recolocado no
foco.

Modulo PURO. Todo o julgamento mora aqui, e por isso e aqui que os testes sao exaustivos.
""",
    [
        ("Cada natureza de falha produz a politica esperada (um teste por natureza).", "mix test test/fabrica/retrabalho/diagnostico_test.exs"),
        ("Achado pontual gera teto de voltas ESTREITO; falha funcional gera teto medio.", "mix test test/fabrica/retrabalho/diagnostico_test.exs"),
        ("Reprovacao por conformidade vai para escopo inteiro, com o objetivo no bloco de foco.", "mix test test/fabrica/retrabalho/diagnostico_test.exs"),
        ("O bloco de foco lista os achados em ordem de gravidade.", "mix test test/fabrica/retrabalho/diagnostico_test.exs"),
    ],
)

tarefa(
    "v0.3", "escada-fracasso", "A escada de resposta ao fracasso, e o limite de 3 ciclos", ["v0.3:diagnostico"],
    ["lib/fabrica/retrabalho/escada.ex", "test/fabrica/retrabalho/escada_test.exs"],
    """
Os quatro degraus: sobe de modelo, troca de especialista, replaneja, bloqueia. Cada um so e
usado depois que o anterior falhou de verdade.
""",
    """
O gatilho e sempre FATO REGISTRADO, nunca palpite sobre dificuldade:

  1. **1a reprovacao -> sobe de modelo.** Insistir no mesmo modelo paga construtor,
     verificador e revisor de novo e queima uma das tres tentativas.
  2. **2a reprovacao sob o MESMO especialista -> troca de especialista** (vai para o
     reforcado generico). Ele foi escolhido no planejamento, antes de se saber onde a
     tarefa iria falhar; duas reprovacoes sob o mesmo prompt de dominio sao evidencia de
     que a especializacao esta enviesando o ataque. Registre a troca e o motivo.
  3. **3 ciclos esgotados -> replanejamento.** O planejador quebra a tarefa em 2–3 menores,
     que entram na fila como novas; a original vira `cancelada` com referencia. E o
     reconhecimento de que o problema pode ser de DIMENSIONAMENTO, nao de execucao.
  4. **Esgotou de novo -> bloqueia.** Autocorrecao vale UMA vez por linhagem: tarefa que ja
     nasceu de replanejamento (tem `replanejada_de`) nao replaneja outra vez.

`tentativas` conta EXECUCOES, nao reprovacoes — e quem conta e o sistema (T-022).

Ha um teto que o motor impoe sozinho, sem confiar em ninguem: **maximo de despachos por
tarefa numa rodada**. A v1 mediu 41 despachos e US$ 22,55 numa rodada so quando o contador
nao era incrementado. Mesmo com o contador correto, o teto fica — defesa em profundidade.
""",
    [
        ("Cada degrau dispara na condicao certa, e nao antes (um teste por degrau).", "mix test test/fabrica/retrabalho/escada_test.exs"),
        ("Tarefa com `replanejada_de` preenchido bloqueia em vez de replanejar de novo.", "mix test test/fabrica/retrabalho/escada_test.exs"),
        ("A troca de especialista e registrada com o motivo.", "mix test test/fabrica/retrabalho/escada_test.exs"),
        ("O teto de despachos por tarefa por rodada corta mesmo quando `tentativas` esta correto.", "mix test test/fabrica/retrabalho/escada_test.exs"),
    ],
)

tarefa(
    "v0.3", "orcamento", "Orcamento com parada limpa: teto por rodada e por tarefa", ["v0.1:contabilidade", "v0.3:estados"],
    ["lib/fabrica/orcamento.ex", "test/fabrica/orcamento_test.exs"],
    """
Impedir que a rodada COMECE trabalho que nao cabe no orcamento — e nunca cortar agente em
voo.
""",
    """
Doutrina fechada, e ela esta em `DECISOES_FECHADAS.md`: **o teto impede comecar, nao
interrompe**. Interromper no meio paga igual e nao entrega nada (US$ 4,11 medidos num corte
por cota na v1).

Dois tetos, e o segundo e o que responde a queixa real do usuario na v1 ("gastar 70% do
limite e nao entregar UMA tarefa"):

  - **teto da rodada** — antes de despachar, some o gasto ate agora com a estimativa da
    proxima tarefa; se passar, pare limpo e reporte `:orcamento`.
  - **teto por tarefa** — uma fracao do teto da rodada. Tarefa que sozinha ja consumiu
    isso nao recebe outro despacho, mesmo com orcamento de rodada sobrando.

**Autocalibragem:** a estimativa da proxima tarefa e a media do que ESTE job ja mediu, nao
uma constante. A v1 errava aqui de um jeito instrutivo — usava o custo da ETAPA do revisor
e subestimava a tarefa inteira em quatro vezes, sempre para baixo, sempre no sentido de
comecar trabalho que nao cabia. Use `custo por TAREFA concluida`, nunca por etapa.

Modulo puro; quem chama aplica.
""",
    [
        ("O teto da rodada impede COMECAR a proxima tarefa e reporta `:orcamento`, sem cortar nada em voo.", "mix test test/fabrica/orcamento_test.exs"),
        ("O teto por tarefa corta despachos daquela tarefa mesmo com orcamento de rodada sobrando.", "mix test test/fabrica/orcamento_test.exs"),
        ("A estimativa usa o custo por TAREFA concluida medido no proprio job, nao por etapa.", "mix test test/fabrica/orcamento_test.exs"),
        ("Sem medicao propria ainda, a estimativa cai num padrao declarado e o teste trava esse valor.", "mix test test/fabrica/orcamento_test.exs"),
    ],
)

tarefa(
    "v0.3", "markdown-gerado", "Geracao do markdown a partir do banco, e o commit da tarefa", ["v0.2:registrar-resultado", "v0.3:estados"],
    ["lib/fabrica/publicacao/markdown.ex", "lib/fabrica/publicacao/git.ex", "test/fabrica/publicacao/markdown_test.exs"],
    """
Gerar o arquivo markdown da tarefa a partir do banco e commita-lo junto com o trabalho —
para o git do projeto continuar legivel por humano.
""",
    """
Decisao 6.2: o banco e a verdade, o markdown e ARTEFATO GERADO. E o git FICA, inteiro —
esta explicito nos dois documentos do TCC ("reconstroi o mundo lendo o banco E o git";
"tarefa concluida vira um commit proprio").

Gere no formato do protocolo da v1: frontmatter com os campos, e as secoes Objetivo,
Contexto, Criterios, Notas de execucao, Verificacao, Conformidade, Revisao. Um leitor
humano — e o professor — precisa reconhecer o arquivo.

Como e gerado, ele tem de ser DETERMINISTICO: mesma tarefa no banco produz o mesmo arquivo,
byte a byte. Ordene tudo, nao coloque timestamp de geracao.

O commit inclui as `areas` da tarefa MAIS o arquivo markdown dela. Mensagem: `T-NNN: titulo`.

ARMADILHA DA v1, e ela custou trabalho perdido: quando o agente escreve fora das `areas`
declaradas, o commit escopado nao pega esses arquivos e o trabalho fica solto na arvore.
Detecte alteracao fora das `areas` e REPORTE antes de commitar — nao commite `add -A` em
silencio.
""",
    [
        ("O markdown gerado tem o frontmatter e as sete secoes do protocolo.", "mix test test/fabrica/publicacao/markdown_test.exs"),
        ("Duas geracoes da mesma tarefa produzem bytes identicos.", "mix test test/fabrica/publicacao/markdown_test.exs"),
        ("O commit inclui as `areas` mais o arquivo da tarefa, com mensagem `T-NNN: titulo`.", "mix test test/fabrica/publicacao/git_test.exs"),
        ("Alteracao FORA das `areas` e detectada e reportada antes do commit.", "mix test test/fabrica/publicacao/git_test.exs"),
    ],
)

tarefa(
    "v0.3", "importador", "Importador das 89 tarefas vivas da v1", ["v0.1:esquema", "v0.3:markdown-gerado"],
    ["lib/mix/tasks/fabrica.importar.ex", "test/mix/importar_test.exs"],
    """
Ler os arquivos de tarefa da v1 (`projetos/*/_gestao/tarefas/*.md`) e trazer o estado
inteiro para o banco da v2, sem perder historico.
""",
    """
E o que decide se a v2 nasce com historico ou vazia. Sao 89 tarefas em 3 projetos, um deles
com meses de trabalho (banco-imobiliario, 72 tarefas).

Leia o frontmatter e as secoes; mapeie: `status` -> enum, `dependencias` -> tabela de
ligacao, `areas` -> tabela, `tentativas` -> coluna, `agente` -> especialista, e as secoes
Verificacao/Conformidade/Revisao -> linhas em `ciclos` (uma por relatorio encontrado, na
ordem em que aparecem).

Importe tambem `_gestao/equipe.json` como `especialistas`, e `_gestao/PLANO.md` como as
fases com seus marcos.

**IDEMPOTENTE, e este e o criterio que mais importa:** rodar duas vezes deixa o banco no
mesmo estado. Use o par `(projeto, codigo)` como chave. Sem isso, um reimport acidental
duplica 89 tarefas e o estrago e silencioso.

Tarefa com status desconhecido ou frontmatter quebrado: NAO adivinhe. Importe com
`status: bloqueada`, registre o motivo, e reporte a lista ao fim. A v1 tem uma tarefa com
status estranho de proposito nas fixtures — ela e o caso de teste.
""",
    [
        ("Importar um diretorio de fixtures traz tarefas, dependencias, areas, tentativas e ciclos corretos.", "mix test test/mix/importar_test.exs"),
        ("Rodar o importador DUAS vezes deixa o banco no mesmo estado (idempotencia).", "mix test test/mix/importar_test.exs"),
        ("Tarefa com frontmatter quebrado entra como `bloqueada` com motivo, e aparece na lista final.", "mix test test/mix/importar_test.exs"),
        ("`equipe.json` vira especialistas e `PLANO.md` vira fases com marcos.", "mix test test/mix/importar_test.exs"),
    ],
)

tarefa(
    "v0.3", "marco", "MARCO da v0.3: uma tarefa percorre os seis estados e conclui", ["v0.3:escada-fracasso", "v0.3:orcamento", "v0.3:markdown-gerado", "v0.3:importador"],
    ["_gestao/PROGRESSO.md"],
    """
Verificar o marco: uma tarefa percorre os seis estados, reprova DE PROPOSITO, e retrabalhada
e conclui — com tudo registrado em transacao.
""",
    """
Tarefa de verificacao. A prova precisa ser adversarial: uma tarefa que passa de primeira
NAO prova a maquina de estados, prova so o caminho feliz.

Monte um projeto de teste com uma tarefa cujo criterio o construtor vai errar na primeira
tentativa (por exemplo, um criterio que exige uma mensagem de erro especifica). Rode o
pipeline inteiro e confira:

  1. a tarefa passou por `pronta -> em_execucao -> em_teste -> em_execucao -> ... -> concluida`;
  2. `tentativas` foi incrementado pelo SISTEMA, e bate com o numero de despachos;
  3. ha uma linha em `ciclos` por etapa, com os relatorios;
  4. o modelo SUBIU na segunda tentativa;
  5. o custo por ciclo e consultavel separadamente;
  6. o markdown gerado no git reflete o estado final.

Rode tambem o importador contra os projetos reais da v1 e confira que as 89 tarefas
entraram. Registre o numero.
""",
    [
        ("Uma tarefa percorre os seis estados, reprova de proposito, retrabalha e conclui.", None),
        ("`tentativas` bate com o numero de despachos, e o modelo subiu na segunda tentativa.", None),
        ("O custo de cada ciclo e consultavel separadamente (consulta registrada nas notas).", None),
        ("O importador traz as 89 tarefas reais da v1; o numero esta registrado em `_gestao/PROGRESSO.md`.", None),
    ],
)

# ===========================================================================
# v0.4 — A FABRICA QUE AGUENTA QUEDA
# ===========================================================================

tarefa(
    "v0.4", "abertura", "ABERTURA da v0.4: conferir concorrencia e numeros medidos", ["v0.3:marco"],
    ["_gestao/PROGRESSO.md", "_sistema/v2/tarefas"],
    """
Antes de implementar a concorrencia, confrontar o plano com o que a v0.3 mediu de verdade —
e com o que as bibliotecas de fila e supervisao oferecem hoje. Nenhum codigo de producao.
""",
    """
**Releia:** `_sistema/PLANO_V2.md` (bloco da v0.4) e `_sistema/DECISOES_FECHADAS.md`,
especialmente o item sobre `git worktree` por verificador, que e uma otimizacao JA
DESCARTADA com medicao — nao a reinvente aqui.

**Confira e ajuste:**

  1. **Os custos que a v0.3 mediu de verdade.** O teto por tarefa e a estimativa da proxima
     foram escritos com numeros da v1. Agora existem numeros da v2. Se divergirem muito,
     corrija os defaults das tarefas desta versao — e registre os dois numeros lado a lado.
  2. **O paralelismo acontece de fato?** A v1 mediu que quase nunca havia duas tarefas
     despachaveis com `areas` disjuntas ao mesmo tempo: em 43 rodadas, o 3-wide de
     construtores nao ocorreu uma vez. Se o mesmo valer aqui, o valor desta versao esta na
     SUPERVISAO e na RECUPERACAO, nao na vazao — e a tarefa de paralelismo pode encolher.
     Meca antes de decidir.
  3. **A versao atual do Oban** e a API dela. Fila durable e area que muda entre versoes
     maiores; confira a documentacao corrente antes de escrever a migracao.
  4. **O formato da mensagem de cota do CLI.** A T-018 extraiu o horario de reabertura de um
     formato observado em 2026. Confirme que ele continua o mesmo — e, se nao, ajuste o
     parse ANTES de a v0.4 depender dele.
  5. **A memoria disponivel na maquina onde isto vai rodar.** Tres agentes em paralelo mais
     Postgres mais a suite de um projeto e o pico de consumo do sistema inteiro. Meca o
     pico real na v0.3 e decida o limite de concorrencia com esse numero, nao com o 3
     escrito no plano.

**Registre em `_gestao/PROGRESSO.md`** o que foi conferido, o que mudou e por que.
""",
    [
        ("Os custos medidos na v0.3 foram comparados com os defaults do plano, e os dois numeros estao registrados.", None),
        ("Foi medido se o paralelismo de construtores acontece de fato, e a conclusao esta registrada.", None),
        ("O formato da mensagem de cota do CLI foi reconferido contra a realidade atual.", None),
        ("O limite de concorrencia foi decidido a partir do pico de memoria MEDIDO, nao do numero do plano.", None),
    ],
)

tarefa(
    "v0.4", "supervisao", "Arvore de supervisao e registro de processos", ["v0.2:laco", "v0.3:estados"],
    ["lib/fabrica/application.ex", "lib/fabrica/agente/supervisor.ex", "test/fabrica/agente/supervisor_test.exs"],
    """
Cada tarefa em voo vira um processo supervisionado, com endereco e dono — e o estado dela
NAO vive dentro do processo, vive no banco.
""",
    """
E o mapeamento que decide a escolha de Elixir: "agente vira processo supervisionado". Um
agente deixa de ser uma execucao solta que ninguem vigia e passa a ter identificador,
dono, alguem que pode encerra-lo e — o que mais importa — alguem que percebe quando ele
morre.

`DynamicSupervisor` para os agentes em voo, `Registry` para enderecar por
`{:agente, tarefa_id}`. Estrategia `:one_for_one`: a morte de um agente nao toca os outros.

O processo morre a qualquer instante sem que nada se perca, porque o estado esta no banco.
O que o supervisor faz ao perceber a morte NAO e reiniciar cegamente: e devolver a tarefa
para a fila, com o motivo registrado. Reiniciar um agente no meio da conversa gastaria
tudo de novo sem aproveitar nada.

Listar o que esta rodando e consultar o `Registry` — nunca deduzir de arquivo de log. E
isso que a tela da v1.0 vai usar.
""",
    [
        ("Tres agentes rodam sob o supervisor; matar um nao afeta os outros dois.", "mix test test/fabrica/agente/supervisor_test.exs"),
        ("A morte de um agente devolve a tarefa a fila com motivo registrado, sem reiniciar a conversa.", "mix test test/fabrica/agente/supervisor_test.exs"),
        ("Listar agentes em voo consulta o `Registry` e devolve tarefa e papel de cada um.", "mix test test/fabrica/agente/supervisor_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.4", "oban", "Fila duravel: enfileirar e mudar estado na mesma transacao", ["v0.3:estados", "v0.4:supervisao"],
    ["lib/fabrica/fila/trabalho.ex", "priv/repo/migrations", "test/fabrica/fila/trabalho_test.exs"],
    """
Trocar a fila em memoria por Oban, para que enfileirar um trabalho e mudar o estado da
tarefa acontecam na MESMA transacao.
""",
    """
E o que impede o estado classico "a tarefa consta como em execucao, mas ninguem esta
executando". Um trabalho guardado em memoria some quando o programa reinicia; a fila do
Oban vive no mesmo banco das tarefas, entao ou os dois valem, ou nenhum vale.

Configure filas separadas por papel — `construtor`, `verificador`, `revisor` — com
concorrencia propria. O verificador roda 1-wide de proposito: a bateria completa sobre uma
arvore com edicoes alheias gera reprovacao falsa, o desperdicio mais caro do sistema.

`unique` por `{tarefa_id, papel}` para impedir despacho duplicado da mesma etapa.

Trabalho interrompido pelo desligamento volta a ser despachavel na subida — sem
intervencao. Teste isso de verdade: enfileire, derrube o Oban no meio, suba, confira que o
trabalho voltou.

NAO reintroduza retentativa automatica generica. A retentativa desta fabrica e a escada da
T-031, que e deliberada e conta ciclo. Uma retentativa cega do Oban por cima disso faria a
tarefa girar sem que `tentativas` subisse — que e exatamente o defeito que custou 41
despachos na v1.
""",
    [
        ("Enfileirar e transicionar acontecem numa transacao: erro em qualquer um dos dois nao grava nenhum.", "mix test test/fabrica/fila/trabalho_test.exs"),
        ("Trabalho interrompido volta a ser despachavel apos reinicio, sem intervencao.", "mix test test/fabrica/fila/trabalho_test.exs"),
        ("`unique` impede duas etapas iguais da mesma tarefa na fila ao mesmo tempo.", "mix test test/fabrica/fila/trabalho_test.exs"),
        ("A fila do verificador roda 1-wide; a do construtor, ate 3 (inspecionavel na config).", None),
    ],
)

tarefa(
    "v0.4", "paralelismo", "Paralelismo com `areas` como exclusao mutua verificada", ["v0.3:promocao", "v0.4:oban"],
    ["lib/fabrica/fila/exclusao.ex", "test/fabrica/fila/exclusao_test.exs"],
    """
Rodar ate tres construtores ao mesmo tempo no mesmo projeto, somente quando as `areas`
declaradas nao se cruzam — e a verificacao feita pelo MOTOR, nunca confiada ao texto do
despacho.
""",
    """
ARMADILHA DA v1, documentada e paga: `areas` e o mutex do paralelismo, mas na v1 ele so
descrevia o que a TAREFA declarava — o despacho era texto livre, e uma linha de "contexto
extra" furava o mutex sem que nada acusasse. Aconteceu em 14/08: uma tarefa recebeu ordem de
mexer num arquivo que era `area` de outra, e a checagem de disjuncao, olhando as areas
declaradas, disse "ok".

Na v2 a verificacao acontece em DOIS momentos:

  1. **antes de despachar** — as areas das tarefas candidatas sao disjuntas?
  2. **na ferramenta de escrita** — o caminho que o agente esta gravando pertence as areas
     DESTA tarefa? Se nao, recusa com erro nomeado.

O segundo e o que a v1 nao tinha, e e ele que torna a regra uma propriedade em vez de uma
promessa.

Regra que fecha o desenho: **verificador exige projeto quieto.** Nunca despache verificador
com construtor ativo no MESMO projeto.
""",
    [
        ("Duas tarefas com areas que se cruzam nunca sao despachadas juntas.", "mix test test/fabrica/fila/exclusao_test.exs"),
        ("A ferramenta de escrita RECUSA caminho fora das `areas` da tarefa corrente, com erro nomeado.", "mix test test/fabrica/fila/exclusao_test.exs"),
        ("Verificador nao e despachado enquanto ha construtor ativo no mesmo projeto.", "mix test test/fabrica/fila/exclusao_test.exs"),
        ("Ate 3 construtores rodam juntos quando as areas sao disjuntas.", "mix test test/fabrica/fila/exclusao_test.exs"),
    ],
)

tarefa(
    "v0.4", "parede-cota", "A parede de cota: reconhecer, dormir e rearmar", ["v0.2:operario-cli", "v0.4:oban"],
    ["lib/fabrica/cota.ex", "test/fabrica/cota_test.exs"],
    """
Reconhecer que a cota da assinatura acabou, extrair o horario de reabertura, dormir ate la e
rearmar sozinho — sem perder o trabalho em fila.
""",
    """
ESTE MECANISMO NAO EXISTE EM DOCUMENTO NENHUM DO TCC, e e estrutural: a fabrica nao paga
por token, consome cota. Sem ele, bater a parede simplesmente derruba a rodada. Na v1 ele e
cidadao de primeira classe (`ehLimiteDeUso`, `horaDeReabertura`, o rearme do piloto) — porte
a logica lendo `<fabrica-v1>/painel/servidor/src/jobs/claude/runner-claude.ts` e
`jobs/piloto/reabertura.ts`.

Tres partes:

  1. **Reconhecer** — o `Operario.ClaudeCLI` ja traduz para `{:erro, {:cota, reabre_em}}`
     (T-016). Aqui isso vira estado do sistema, nao erro de um despacho.
  2. **Dormir** — pausar as filas do Oban, sem cancelar o que esta enfileirado. O trabalho
     fica; so nao sai.
  3. **Rearmar** — agendar a retomada para o horario informado, com folga. Se o horario nao
     vier, use recuo exponencial com teto de 1 hora.

O horario vem em formato humano ("5:30pm (America/Sao_Paulo)"), nao ISO. Faca o parse com
tolerancia e, quando falhar, caia no recuo exponencial — nunca trave por nao entender uma
string.

Deixe isso VISIVEL: uma consulta responde "a cota esta batida agora? ate quando?". E o que a
tela da v1.0 mostra e o que evita o usuario achar que a fabrica travou.
""",
    [
        ("Erro de cota pausa as filas sem cancelar trabalho enfileirado.", "mix test test/fabrica/cota_test.exs"),
        ("O horario de reabertura em formato humano e interpretado corretamente (varios formatos testados).", "mix test test/fabrica/cota_test.exs"),
        ("Horario ilegivel cai em recuo exponencial com teto, em vez de travar.", "mix test test/fabrica/cota_test.exs"),
        ("A consulta de estado responde se a cota esta batida e ate quando.", "mix test test/fabrica/cota_test.exs"),
    ],
)

tarefa(
    "v0.4", "recuperacao", "Recuperacao apos queda: sobras na arvore git e trabalho parcial", ["v0.3:markdown-gerado", "v0.4:supervisao"],
    ["lib/fabrica/recuperacao.ex", "test/fabrica/recuperacao_test.exs"],
    """
Na subida, sanear o que a sessao anterior deixou pela metade: tarefas em estado
transitorio, e trabalho nao commitado na arvore de arquivos.
""",
    """
Duas fontes de verdade para a recuperacao, e a documentacao do TCC nomeia as duas:
"reconstroi o mundo lendo o banco E o git".

**Pelo banco:** tarefa em `em_execucao`, `em_teste` ou `em_revisao` sem despacho vivo no
`Registry` esta orfa. Devolva ao estado anterior com motivo registrado.

**Pela arvore git:** existe alteracao nao commitada nas `areas` de alguma tarefa orfa?
Entao houve trabalho real que nao entrou em commit. Porte `temTrabalhoParcial` da v1.
Recupere commitando o escopo daquela tarefa, com mensagem marcando que e recuperacao — em
vez de descartar. A v1 tem esse mecanismo e ele deixou de disparar uma vez, custando
US$ 2,13 de trabalho jogado fora.

Reporte SEMPRE o que foi saneado, mesmo quando nada foi. Saneamento silencioso e como nao
ter saneamento: ninguem descobre que ele parou de funcionar.
""",
    [
        ("Tarefa em estado transitorio sem processo vivo volta ao estado anterior, com motivo.", "mix test test/fabrica/recuperacao_test.exs"),
        ("Alteracao nao commitada nas `areas` de tarefa orfa e recuperada em commit marcado como recuperacao.", "mix test test/fabrica/recuperacao_test.exs"),
        ("O saneamento reporta o que fez mesmo quando nao havia nada a fazer.", "mix test test/fabrica/recuperacao_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.4", "marco", "MARCO da v0.4: tres tarefas em paralelo, e matar uma nao derruba as outras", ["v0.4:paralelismo", "v0.4:parede-cota", "v0.4:recuperacao"],
    ["_gestao/PROGRESSO.md"],
    """
Verificar o marco: tres tarefas rodam em paralelo; matar o processo de uma no meio nao
afeta as outras duas, e a morta volta a fila.
""",
    """
Tarefa de verificacao, e ela e a mais fisica das seis: precisa MATAR processo de verdade.

Roteiro:
  1. monte um projeto com tres tarefas de areas disjuntas;
  2. dispare a rodada e confirme, pelo `Registry`, que ha tres agentes em voo;
  3. mate o processo de UM deles (`Process.exit(pid, :kill)`);
  4. confira: as outras duas terminam normalmente; a morta voltou para a fila com motivo;
     nenhuma linha de consumo se perdeu; nao sobrou arquivo editado sem dono.
  5. derrube a aplicacao inteira no meio de uma rodada e suba: o saneamento roda e reporta.

Teste tambem a parede de cota de forma controlada: injete o erro de cota e confirme que as
filas pausam e o rearme e agendado — sem cancelar o que estava enfileirado.

Registre em `_gestao/PROGRESSO.md` o veredito e o que foi observado em cada passo.
""",
    [
        ("Tres agentes em voo simultaneos, confirmados pelo `Registry`.", None),
        ("Matar um agente nao afeta os outros dois; a tarefa morta volta a fila com motivo.", None),
        ("Derrubar a aplicacao no meio e subir dispara o saneamento, que reporta o que fez.", None),
        ("Erro de cota injetado pausa as filas e agenda o rearme sem cancelar trabalho.", None),
    ],
)

# ===========================================================================
# v0.5 — A FABRICA QUE LEMBRA  (OPCIONAL)
# ===========================================================================

tarefa(
    "v0.5", "abertura", "ABERTURA da v0.5: decidir o embedding com medicao, nao com palpite", ["v0.4:marco"],
    ["_gestao/PROGRESSO.md", "_gestao/DECISOES.md", "_sistema/v2/tarefas"],
    """
Antes de construir a memoria semantica, tomar a unica decisao de ambiente que ficou em
aberto — embedding local ou por servico — com medicao na maquina real. Nenhum codigo de
producao.
""",
    """
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
  4. **Ha corpus suficiente para indexar?** A T-032 importou as 89 tarefas da v1. Confira
     quantos trechos isso gera de verdade. Se forem poucas centenas, a avaliacao de
     recuperacao (T-044) precisa de um conjunto de perguntas menor e mais honesto — e vale
     dizer isso em vez de fabricar um numero bonito.
  5. **Releia o risco declarado:** recuperacao que traz trecho inutil piora a resposta em vez
     de melhorar. A regra ja esta na T-044 e nao se negocia: **recuperacao abaixo da linha de
     base DESLIGA o bloco de contexto**, nao apenas avisa.

**Registre a decisao em `_gestao/DECISOES.md`** com os numeros medidos — e nao so a escolha.
Decisao sem o numero que a motivou vira palpite na leitura seguinte.
""",
    [
        ("`banco-v2.ps1 conferir` imprime `pgvector operante` nesta maquina.", None),
        ("O modelo local foi MEDIDO (disco, memoria residente, tempo por 1.000 trechos) e os numeros estao registrados.", None),
        ("A escolha local vs. servico esta em `_gestao/DECISOES.md` com os numeros que a motivaram.", None),
        ("O tamanho real do corpus importado foi contado, e a T-044 ajustada se ele for pequeno.", None),
    ],
)

tarefa(
    "v0.5", "ingestao", "Ingestao da historia do projeto ao commitar", ["v0.1:embedder-behaviour", "v0.3:markdown-gerado"],
    ["lib/fabrica/memoria/ingestao.ex", "lib/fabrica/memoria/trecho.ex", "test/fabrica/memoria/ingestao_test.exs"],
    """
Ao commitar, cortar e indexar a HISTORIA do projeto — decisoes com motivo, achados de
revisao, relatorios de verificacao, tarefas concluidas.
""",
    """
O corpus indexado NAO e o codigo: disso o indice denso (T-010) ja da conta, de graca e com
exatidao. E a historia — o material que a v1 produzia em volume e depois nao conseguia
consultar, porque estava espalhado por dezenas de arquivos que ninguem ia abrir.

Corte por ESTRUTURA (secao de markdown, bloco de codigo), nunca por contagem cega de
caracteres — um trecho cortado no meio de uma frase perde justamente o que o tornava
recuperavel. Em Elixir isso e trabalho proprio ou `TextChunker`.

Tabela `trechos`: projeto_id, fonte (arquivo e secao), corpo, embedding `vector(384)`, e
uma coluna `busca` do tipo `tsvector` GERADA a partir do corpo. Indices: HNSW com
`vector_cosine_ops` no embedding, GIN na busca.

Roda FORA do caminho quente — no commit, nao no despacho. Em lote, nunca um a um.

Reindexacao incremental: so o que mudou desde o ultimo commit indexado. Guarde o hash do
commit indexado por projeto. Reindexar tudo a cada commit tornaria a fase inviavel em
projeto grande.
""",
    [
        ("Ao commitar, os trechos novos e alterados sao indexados; os inalterados nao sao retocados.", "mix test test/fabrica/memoria/ingestao_test.exs"),
        ("O corte respeita a estrutura: nenhuma secao de markdown e cortada no meio de uma frase.", "mix test test/fabrica/memoria/ingestao_test.exs"),
        ("Os indices HNSW e GIN existem e sao usados (EXPLAIN registrado no teste).", "mix test test/fabrica/memoria/ingestao_test.exs"),
        ("A ingestao roda em lote, com uma unica chamada ao embedder por commit.", "mix test test/fabrica/memoria/ingestao_test.exs"),
    ],
)

tarefa(
    "v0.5", "busca-hibrida", "Busca hibrida com fusao reciproca de postos", ["v0.5:ingestao"],
    ["lib/fabrica/memoria/busca.ex", "test/fabrica/memoria/busca_test.exs"],
    """
Responder "isto ja foi resolvido aqui, e o que foi decidido na epoca?" com duas buscas ao
mesmo tempo — vetor e termo exato — fundidas por posto reciproco.
""",
    """
POR QUE DUAS BUSCAS: o vetor perde nome proprio (se a pergunta menciona uma opcao chamada
`--exigir`, ele nao tem como saber o que e aquilo) e a busca textual perde sinonimo. Uma
cobre o buraco da outra.

A consulta ja esta escrita na secao 9 do `-3-completo` e **ja foi provada rodando** nesta
maquina (ver `_sistema/AMBIENTE_V2.md`, secao 4) — copie de la, nao reescreva:

    WITH semantico AS (
      SELECT id, RANK() OVER (ORDER BY embedding <=> $1) AS pos
        FROM trechos WHERE projeto_id = $2 ORDER BY embedding <=> $1 LIMIT 40),
         textual AS (
      SELECT id, RANK() OVER (ORDER BY ts_rank_cd(busca, $3) DESC) AS pos
        FROM trechos WHERE projeto_id = $2 AND busca @@ $3 LIMIT 40)
    SELECT id FROM semantico FULL OUTER JOIN textual USING (id)
     ORDER BY COALESCE(1.0/(60 + semantico.pos), 0)
             + COALESCE(1.0/(60 + textual.pos), 0) DESC
     LIMIT 8;

A fusao por posto reciproco (k=60) dispensa calibrar pesos entre duas escalas que nao sao
comparaveis — e a razao de nao inventar uma media ponderada aqui.

SEMPRE filtre por `projeto_id`. Trecho de um projeto vazando para outro e defeito grave, e
o teste precisa travar isso explicitamente.
""",
    [
        ("A busca hibrida devolve, em primeiro, o trecho achado pelas DUAS buscas.", "mix test test/fabrica/memoria/busca_test.exs"),
        ("Um termo exato que o vetor nao acha (nome de flag) e recuperado pela metade textual.", "mix test test/fabrica/memoria/busca_test.exs"),
        ("Trecho de outro projeto NUNCA aparece no resultado.", "mix test test/fabrica/memoria/busca_test.exs"),
        ("A consulta roda numa transacao so, no mesmo banco das tarefas.", "mix test test/fabrica/memoria/busca_test.exs"),
    ],
)

tarefa(
    "v0.5", "embedder-real", "Embedder.Servico e Embedder.Local", ["v0.1:embedder-behaviour"],
    ["lib/fabrica/embedder/servico.ex", "lib/fabrica/embedder/local.ex", "test/fabrica/embedder/servico_test.exs"],
    """
Os dois adaptadores reais de embedding: um por chamada HTTP (padrao em maquina modesta) e
um local com Bumblebee (opcional, para a maquina forte).
""",
    """
Decisao registrada em `DECISOES_FECHADAS.md`: o perfil alvo da v2 e 8 GB de RAM, e o modelo
de embedding local e a UNICA peca pesada do desenho inteiro. Por isso sao dois adaptadores,
e por isso esta versao e opcional.

`Embedder.Servico` — chamada HTTP em lote, com `Req`. Configuravel: URL, modelo, chave.
Precisa devolver exatamente `dimensoes()` valores; se o servico devolver outra dimensao,
falhe com erro nomeado em vez de gravar vetor de tamanho errado (que so quebraria depois,
no indice).

`Embedder.Local` — Bumblebee + Nx com EXLA, modelo de 384 dimensoes. Carregue o modelo UMA
vez, num processo proprio supervisionado, e sirva as requisicoes por chamada — carregar por
chamada seria proibitivo. Declare no cabecalho quanto o modelo ocupa residente, medido, nao
estimado.

`Embedder.Local` fica atras de uma dependencia OPCIONAL no `mix.exs`: quem nao vai usar nao
baixa Bumblebee nem EXLA. E isso que mantem a promessa de rodar em maquina media.

Nenhum dos dois entra na suite: os testes seguem com `Embedder.Falso`. O teste do `Servico`
usa stub de HTTP; o do `Local` e marcado para pular por padrao.
""",
    [
        ("`Embedder.Servico` vetoriza em lote e falha com erro nomeado se a dimensao vier errada.", "mix test test/fabrica/embedder/servico_test.exs"),
        ("`Embedder.Local` esta atras de dependencia opcional; o projeto compila sem Bumblebee instalado.", "mix compile --warnings-as-errors"),
        ("O cabecalho de `Embedder.Local` registra o consumo residente MEDIDO do modelo (inspecionavel).", None),
        ("A suite continua usando `Embedder.Falso`; nenhum teste padrao carrega modelo ou chama rede.", "mix verificar"),
    ],
)

tarefa(
    "v0.5", "bloco-contexto", "O bloco de contexto recuperado, com a fonte citada", ["v0.5:busca-hibrida", "v0.2:prefixo"],
    ["lib/fabrica/memoria/contexto.ex", "test/fabrica/memoria/contexto_test.exs"],
    """
Montar, no inicio do despacho, o bloco com os melhores trechos recuperados — cada um com a
fonte citada — e coloca-lo DEPOIS do prefixo cacheado.
""",
    """
O ganho concreto e o agente comecar o trabalho ja sabendo "isto foi decidido assim, por este
motivo", em vez de decidir de novo, possivelmente ao contrario do que ja esta no codigo. E a
resposta direta ao segundo modo de falha da Parte I: decisao sem rastro.

ONDE ESTE BLOCO ENTRA IMPORTA MAIS DO QUE PARECE: ele muda a cada tarefa, entao vai DEPOIS
do ultimo ponto de cache. Coloca-lo antes invalidaria o prefixo inteiro a cada despacho — e
seria uma otimizacao de contexto que destroi a economia de cache, exatamente o tipo de troca
que a v2 existe para nao fazer.

Cada trecho entra com a fonte (`arquivo, secao`) para o agente poder citar e para o leitor
poder conferir. Trecho sem fonte e afirmacao sem rastro, que e o problema que estamos
resolvendo.

Teto de tamanho declarado: no maximo 8 trechos e um limite de bytes. Recuperacao que enche o
contexto piora a resposta em vez de melhorar.

QUANDO NAO USAR, e isto vai no cabecalho do modulo: busca semantica e aproximada e devolve
trechos, nao verdades. Nao substitui o indice denso (exato, completo, gratis), nao substitui
ler o arquivo que a tarefa declara tocar, e nao responde o que uma consulta ao banco responde
melhor — "quais tarefas estao bloqueadas" e um WHERE, nao uma pergunta em linguagem natural.
""",
    [
        ("O bloco entra DEPOIS do ultimo ponto de cache; o prefixo continua byte a byte igual entre despachos.", "mix test test/fabrica/memoria/contexto_test.exs"),
        ("Cada trecho recuperado vem com a fonte (arquivo e secao) citada.", "mix test test/fabrica/memoria/contexto_test.exs"),
        ("O bloco respeita o teto de 8 trechos e o limite de bytes.", "mix test test/fabrica/memoria/contexto_test.exs"),
        ("Recuperacao vazia produz despacho normal, sem bloco, em vez de bloco vazio.", "mix test test/fabrica/memoria/contexto_test.exs"),
    ],
)

tarefa(
    "v0.5", "avaliacao-recuperacao", "Avaliacao da qualidade da recuperacao", ["v0.5:busca-hibrida"],
    ["prioridade/avaliacao/perguntas.exs", "test/fabrica/memoria/avaliacao_test.exs"],
    """
Um conjunto de perguntas com resposta conhecida, medido a cada mudanca na indexacao — e a
regra de que recuperacao pior que a linha de base nao entra no prompt.
""",
    """
E a resposta ao risco declarado nos documentos: "a busca por significado trazer trecho
inutil". Busca aproximada devolve trechos, e trecho fora de contexto piora a resposta em vez
de melhorar. Sem medicao, ninguem percebe a degradacao.

Monte de 15 a 25 pares (pergunta, trecho que deveria ser recuperado) a partir da historia
REAL dos projetos da v1 — decisoes que existem, com vocabulario diferente do que a decisao
usa. Exemplo do tipo certo: pergunta "como tratamos comando perigoso?" deve recuperar a
decisao escrita como "allowlist de binarios, nunca lista de proibicoes".

Meca `recall@8` e a posicao media do trecho certo. Grave a linha de base.

A regra que fecha o mecanismo, e que e a diferenca entre sensor e atuador: se uma mudanca na
indexacao piorar o resultado abaixo da linha de base, a recuperacao NAO entra no prompt —
a fabrica roda sem ela ate alguem consertar. Sensor que nao aciona nada e o defeito
recorrente que a v1 catalogou sete vezes.
""",
    [
        ("O conjunto tem ao menos 15 pares extraidos da historia real, e `recall@8` e calculado.", "mix test test/fabrica/memoria/avaliacao_test.exs"),
        ("A linha de base fica gravada e e comparada a cada execucao.", "mix test test/fabrica/memoria/avaliacao_test.exs"),
        ("Recuperacao abaixo da linha de base DESLIGA o bloco de contexto, em vez de so avisar.", "mix test test/fabrica/memoria/avaliacao_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v0.5", "marco", "MARCO da v0.5: o agente cita a decisao anterior", ["v0.5:embedder-real", "v0.5:bloco-contexto", "v0.5:avaliacao-recuperacao"],
    ["_gestao/PROGRESSO.md"],
    """
Verificar o marco: num projeto com historico, o agente cita a decisao anterior em vez de
decidir de novo.
""",
    """
Tarefa de verificacao. O teste tem de ser honesto: escolha uma decisao que EXISTE na
historia importada da v1 e formule a tarefa com vocabulario DIFERENTE do que a decisao usa.
Se o vocabulario for o mesmo, a busca textual sozinha resolveria e o marco nao provaria nada.

Confira, no relatorio do agente, que ele CITA a decisao e a fonte. E confira, na
contabilidade, que o prefixo continuou sendo lido do cache — se o bloco recuperado tiver
invalidado o prefixo, a fase piorou o sistema em vez de melhorar, e isso e reprovacao.

Registre em `_gestao/PROGRESSO.md` a pergunta usada, o trecho recuperado e os numeros de
cache antes e depois.
""",
    [
        ("O agente cita a decisao anterior e a fonte, com vocabulario diferente do da pergunta.", None),
        ("O prefixo continua sendo LIDO do cache com o bloco recuperado presente (numeros registrados).", None),
        ("A avaliacao de recuperacao esta acima da linha de base.", None),
        ("`_gestao/PROGRESSO.md` registra pergunta, trecho recuperado e numeros de cache.", None),
    ],
)

# ===========================================================================
# v1.0 — A FABRICA COMPLETA
# ===========================================================================

tarefa(
    "v1.0", "abertura", "ABERTURA da v1.0: o que a tela precisa mostrar, e a medicao final", ["v0.5:marco"],
    ["_gestao/PROGRESSO.md", "_sistema/v2/tarefas"],
    """
Antes de construir o painel e a trilha generica, decidir o que a tela precisa mostrar a
partir do que o sistema REALMENTE grava — e preparar a comparacao final com a linha de base.
Nenhum codigo de producao.
""",
    """
Esta e a ultima versao, e ela e a entrega do TCC. O planejamento dela foi escrito antes de
existir qualquer dado; agora existem cinco versoes de dados reais.

**Releia:** `_sistema/PLANO_V2.md` (bloco da v1.0), `_sistema/MIGRACAO_V2.md` secao 7 (o que
a v1 acrescenta a esta versao), e `prioridade/linha-de-base/LINHA_DE_BASE.md` (T-008).

**Confira e ajuste:**

  1. **O que o sistema grava de verdade** contra o que as tarefas de painel assumem. A tela
     nao pode prometer um numero que o banco nao tem. Liste as colunas reais de `consumos`,
     `despachos` e `ciclos` e confronte com o que T-047 e T-048 desenham.
  2. **A versao atual do Phoenix/LiveView** e a API dela. O scaffold foi criado na v0.1, ha
     meses; confira se ha mudanca relevante antes de escrever a primeira tela.
  3. **Existe um projeto real para o teste da trilha generica?** O marco pede um artefato
     nao-software entregue de ponta a ponta. Escolha qual AGORA — um documento, um deck —
     e confira que ele tem verificador possivel. Sem isso o marco vira demonstracao vazia.
  4. **A LINHA_DE_BASE.md ainda e comparavel?** Ela foi extraida dos jobs da v1 na T-008. Se
     a v1 continuou rodando desde entao, ha mais jobs — reextraia, para a comparacao usar a
     mesma janela. E confirme que os quatro numeros da v2 sao mensuraveis com o que o sistema
     grava hoje; se algum nao for, ESTA e a hora de acrescentar a instrumentacao, nao no fim.
  5. **Escolha o projeto pequeno do marco final.** 8 a 12 tarefas, novo, nao um dos tres
     projetos vivos da v1 — migrar projeto em voo nunca foi o plano.

**Registre em `_gestao/PROGRESSO.md`** as escolhas dos itens 3 e 5, e o que foi ajustado.
""",
    [
        ("As colunas reais do banco foram confrontadas com o que as tarefas de painel assumem.", None),
        ("O projeto da trilha generica foi escolhido e tem verificador possivel (registrado).", None),
        ("A linha de base foi reextraida se a v1 continuou rodando, e os quatro numeros sao mensuraveis hoje.", None),
        ("O projeto pequeno do marco final foi escolhido e registrado.", None),
    ],
)

tarefa(
    "v1.0", "telemetria", "Barramento de eventos e telemetria por despacho", ["v0.2:laco", "v0.4:supervisao"],
    ["lib/fabrica/eventos.ex", "lib/fabrica/telemetria.ex", "test/fabrica/eventos_test.exs"],
    """
Cada despacho emite eventos — inicio, fim, modelo, voltas, tokens escritos e lidos, custo e
desfecho — num barramento que a tela assina.
""",
    """
"A contabilidade nao depende de alguem lembrar de gravar": o evento sai do proprio caminho
de execucao, via `:telemetry`, e o Phoenix PubSub distribui.

Eventos, no minimo: `[:fabrica, :despacho, :inicio | :volta | :fim]`,
`[:fabrica, :tarefa, :transicao]`, `[:fabrica, :cota, :parede | :rearme]`.

ARMADILHA DA v1, e ela e a razao de a contabilidade nao poder viver so no fim: jobs cortados
no meio nunca recebiam o evento final, e o painel marcava US$ 0,00 justamente nos jobs mais
caros. Por isso o evento e por VOLTA, nao por despacho — o que ja gastou fica registrado
mesmo se o despacho morrer no proximo segundo.

Emita tambem a reparticao de cache (escrita/leitura) em cada volta: e o numero que decide o
desenho, e ele precisa estar visivel na tela, nao so no banco.
""",
    [
        ("Cada volta emite evento com a reparticao de cache; um despacho cortado deixa o registro do que ja gastou.", "mix test test/fabrica/eventos_test.exs"),
        ("Transicao de tarefa e parede de cota emitem eventos proprios.", "mix test test/fabrica/eventos_test.exs"),
        ("Um assinante recebe os eventos na ordem em que foram emitidos.", "mix test test/fabrica/eventos_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v1.0", "painel-quadro", "Painel: quadro de tarefas por estado, ao vivo", ["v1.0:telemetria"],
    ["lib/fabrica_web/live/quadro_live.ex", "test/fabrica_web/live/quadro_live_test.exs"],
    """
A tela principal: as tarefas do projeto agrupadas pelos seis estados, atualizando sozinha
conforme o motor trabalha.
""",
    """
LiveView sobre o MESMO banco e o mesmo barramento do motor — nao e uma aplicacao separada
lendo arquivos de log, que era o desenho da v1.

Colunas pelos seis estados, mais `bloqueada`. Cada cartao: codigo, titulo, tentativas,
especialista, e o custo acumulado da tarefa.

Assine o barramento (T-052) e atualize por evento, sem polling. Polling numa tela que fica
aberta o dia todo e consulta desperdicada em ciclo infinito.

Estado vazio, carregando e erro precisam existir e serem legiveis — nao deixe a tela em
branco quando nao ha projeto selecionado.

CAPTURE A TELA E OLHE antes de dar por pronta. Tarefa de UI dada por pronta sem ninguem
olhar o PNG e aposta, e ja falhou duas vezes na v1. Grave em `_gestao/evidencias/`.
""",
    [
        ("O quadro renderiza as tarefas agrupadas pelos seis estados, com contagem por coluna.", "mix test test/fabrica_web/live/quadro_live_test.exs"),
        ("Uma transicao emitida no barramento atualiza a tela sem recarregar (teste de LiveView).", "mix test test/fabrica_web/live/quadro_live_test.exs"),
        ("Estados vazio, carregando e erro sao renderizados e legiveis.", "mix test test/fabrica_web/live/quadro_live_test.exs"),
        ("Ha captura de tela em `_gestao/evidencias/` e ela foi olhada (inspecionavel).", None),
    ],
)

tarefa(
    "v1.0", "painel-console", "Painel: console ao vivo do agente e custo da rodada", ["v1.0:telemetria", "v1.0:painel-quadro"],
    ["lib/fabrica_web/live/console_live.ex", "test/fabrica_web/live/console_live_test.exs"],
    """
Ver o que o agente esta fazendo agora, volta a volta, e quanto a rodada ja gastou —
enquanto acontece, nao depois.
""",
    """
"O painel nao e enfeite: e o instrumento que torna o custo visivel enquanto ele acontece."

Tres blocos:
  - **em voo** — quem esta rodando agora, consultando o `Registry` (nao deduzindo de log)
  - **console** — as voltas do agente selecionado, com a ferramenta chamada em cada uma
  - **custo** — o gasto da rodada, POR TAREFA e nao so por execucao, com a reparticao de
    cache (escrita/leitura) visivel

A distincao "por tarefa, nao por execucao" e o que faltou na v1: o teto se calibrava pelo
custo de uma etapa e subestimava a tarefa inteira em quatro vezes — sempre para baixo,
sempre no sentido de comecar trabalho que nao cabia.

Mostre a parede de cota quando ela estiver batida, com o horario de reabertura. Sem isso o
usuario acha que a fabrica travou.

Console de agente pode produzir muita linha: limite o que fica em memoria na tela e ofereca
o registro completo por consulta.
""",
    [
        ("A lista de agentes em voo vem do `Registry` e some quando o agente termina.", "mix test test/fabrica_web/live/console_live_test.exs"),
        ("O custo aparece POR TAREFA, com a reparticao escrita/leitura de cache visivel.", "mix test test/fabrica_web/live/console_live_test.exs"),
        ("A parede de cota aparece na tela com o horario de reabertura quando ativa.", "mix test test/fabrica_web/live/console_live_test.exs"),
        ("Ha captura de tela em `_gestao/evidencias/` e ela foi olhada (inspecionavel).", None),
    ],
)

tarefa(
    "v1.0", "parar-retomar", "Parar e retomar: um botao que encerra um processo supervisionado", ["v0.4:supervisao", "v1.0:painel-quadro"],
    ["lib/fabrica_web/live/componentes/controles.ex", "test/fabrica_web/controles_test.exs"],
    """
Cortar um agente pela tela — e o supervisor devolve a tarefa a fila, sem deixar trabalho pela
metade nem arquivo editado sem dono.
""",
    """
"Parar custa um botao. Cortar um agente e encerrar um processo supervisionado." Na v1
cancelar no meio deixava trabalho solto na arvore de arquivos; aqui a recuperacao (T-042)
cuida do que sobrou.

Parar = `DynamicSupervisor.terminate_child/2`. O supervisor devolve a tarefa a fila com
motivo `:cortado_pelo_operador` — que e distinto de `:falha` e nao conta ciclo. Cortar por
decisao do operador nao e reprovacao da tarefa.

Retomar = reenfileirar a tarefa. Se havia trabalho parcial na arvore, a recuperacao commita
antes de reenfileirar, para o proximo despacho comecar de um estado limpo.

Confirmacao antes de cortar, mostrando o que ja foi gasto — a informacao que faz a decisao
ser informada em vez de reflexa.
""",
    [
        ("Parar encerra o processo e devolve a tarefa a fila com motivo `:cortado_pelo_operador`.", "mix test test/fabrica_web/controles_test.exs"),
        ("Corte pelo operador NAO conta ciclo.", "mix test test/fabrica_web/controles_test.exs"),
        ("Retomar reenfileira, e trabalho parcial e commitado antes.", "mix test test/fabrica_web/controles_test.exs"),
        ("A confirmacao mostra o gasto acumulado da tarefa antes de cortar.", "mix test test/fabrica_web/controles_test.exs"),
    ],
)

tarefa(
    "v1.0", "piloto-decisao", "Piloto automatico: a decisao (funcao pura)", ["v0.3:orcamento", "v0.4:parede-cota"],
    ["lib/fabrica/piloto/decisao.ex", "test/fabrica/piloto/decisao_test.exs"],
    """
A tabela de decisao que diz se o piloto continua, dorme ou para — pura, testavel, e com a
ORDEM dos ramos sendo a propria regra.
""",
    """
Porte de `jobs/piloto/decisao.ts` da v1, que ja e puro e ja tem teste. O piloto encadeia
rodadas sozinho ate um criterio de parada; ele NAO e um motor novo — cada rodada e o mesmo
trabalho montado pelo mesmo caminho do botao. O que ele acrescenta e o dedo que aperta o
botao de novo, e os freios.

Freios obrigatorios (os dois, sempre): **teto de gasto acumulado** e **maximo de rodadas**.
Sem um deles configurado, o piloto nao liga.

Paradas automaticas:
  - acabou tarefa pronta
  - alguma tarefa pediu replanejamento
  - **duas rodadas seguidas sem concluir nada**
  - falha

E uma nao-parada, que e a razao de a cota ser mecanismo de primeira classe: **cota batida
nao para o piloto** — ele dorme e rearma na hora anunciada.

A ORDEM da tabela e a regra: leia o cabecalho antes de inserir um ramo no meio. Uma
condicao avaliada fora de ordem muda o comportamento sem que nenhum teste isolado acuse.

Desligar NAO corta a rodada em voo.
""",
    [
        ("Cada criterio de parada dispara na condicao certa (um teste por criterio).", "mix test test/fabrica/piloto/decisao_test.exs"),
        ("Cota batida faz o piloto DORMIR e rearmar, nunca parar.", "mix test test/fabrica/piloto/decisao_test.exs"),
        ("Sem teto de gasto ou sem maximo de rodadas, o piloto recusa ligar.", "mix test test/fabrica/piloto/decisao_test.exs"),
        ("Desligar o piloto nao corta a rodada em voo.", "mix test test/fabrica/piloto/decisao_test.exs"),
    ],
)

tarefa(
    "v1.0", "piloto-mecanica", "Piloto automatico: a mecanica e a tela", ["v1.0:piloto-decisao"],
    ["lib/fabrica/piloto/servidor.ex", "lib/fabrica_web/live/componentes/piloto.ex", "test/fabrica/piloto/servidor_test.exs"],
    """
O processo que escuta o fim de uma rodada, consulta a decisao e dispara a proxima — mais o
controle na tela.
""",
    """
A mecanica (escutar, persistir, agendar rearme) fica separada da decisao (T-056) de
proposito: uma e pura e exaustivamente testavel, a outra e I/O.

**A rodada NAO se monta aqui.** Ela chama o mesmo caminho do botao Trabalhar. Um segundo
caminho seria uma segunda fonte de verdade sobre teto e trava — e as duas divergiriam sem
ninguem ver.

Persista o estado do piloto (ligado, rodadas feitas, gasto acumulado, proximo rearme) para
ele sobreviver a um reinicio.

Na tela: o toggle, os dois tetos obrigatorios, o que ja foi consumido de cada um, e — quando
dormindo — a hora do rearme. O usuario precisa saber se esta dormindo ou travado.
""",
    [
        ("O fim de uma rodada consulta a decisao e dispara a proxima quando ela manda continuar.", "mix test test/fabrica/piloto/servidor_test.exs"),
        ("A rodada e montada pelo MESMO caminho do botao (teste que compara os dois).", "mix test test/fabrica/piloto/servidor_test.exs"),
        ("O estado do piloto sobrevive a um reinicio da aplicacao.", "mix test test/fabrica/piloto/servidor_test.exs"),
        ("A tela mostra os dois tetos, o consumido de cada um, e a hora do rearme quando dormindo.", None),
    ],
)

tarefa(
    "v1.0", "trilha-generica", "A trilha generica e a escada de prova com rotulo obrigatorio", ["v0.3:criterios", "v0.3:portoes"],
    ["lib/fabrica/trilhas.ex", "lib/fabrica/criterios/grau.ex", "test/fabrica/trilhas_test.exs"],
    """
Rotear o pipeline inteiro pelo `dominio` do projeto, e obrigar o verificador a declarar em
que degrau cada criterio foi provado.
""",
    """
A fabrica constroi qualquer artefato; software e o mais calibrado, nao o unico. O eixo que
separa os dois casos nao e "e codigo?", e sim **como se prova que ficou pronto**. Em software
a prova vem de graca; fora dele nao vem — e e ai que o desenho poderia degenerar, com o
verificador virando um segundo revisor e dois julgamentos subjetivos custando em dobro.

`dominio` ausente ou `software` -> trilha de software, SEMPRE. Qualquer outro valor ->
trilha generica. Nenhum agente de software le a doutrina generica: a generalizacao nao passa
pelo caminho quente.

Escada de prova, e o rotulo e OBRIGATORIO:
  - `executado` — um comando roda e o resultado e o veredito
  - `inspecionado` — um script abre o artefato entregue e afirma fatos sobre ele
  - `julgado` — so quando os dois primeiros sao genuinamente impossiveis, e ai contra rubrica
    de itens BINARIOS declarada na tarefa

Duas pecas completam o desenho, e as duas sao regra do planejador:
  - **a primeira tarefa instala o verificador**, antes de qualquer parte do artefato;
  - **a fonte e texto versionado; o binario e gerado por comando.** Commitar o binario como
    fonte apagaria o portao da revisao, porque ninguem revisa diff de arquivo binario.
""",
    [
        ("`dominio` ausente ou `software` roteia para a trilha de software; qualquer outro, para a generica.", "mix test test/fabrica/trilhas_test.exs"),
        ("O verificador nao consegue fechar sem rotular TODOS os criterios (rotulo ausente e erro).", "mix test test/fabrica/trilhas_test.exs"),
        ("Criterio marcado `julgado` exige a secao de rubrica com itens binarios na tarefa.", "mix test test/fabrica/trilhas_test.exs"),
        ("A proporcao de criterios `julgados` por projeto e consultavel.", "mix test test/fabrica/trilhas_test.exs"),
    ],
)

tarefa(
    "v1.0", "seguranca", "Varredura de segredos antes de publicar", ["v0.3:markdown-gerado"],
    ["lib/fabrica/seguranca.ex", "test/fabrica/seguranca_test.exs"],
    """
Varrer o repositorio por segredos antes de qualquer publicacao, e recusar quando encontrar.
""",
    """
Porte de `fabrica/seguranca.ts` da v1. A fabrica commita sozinha e pode publicar; um segredo
que escapa e irreversivel na pratica, porque fica no historico.

Padroes: chaves de API conhecidas (incluindo `sk-ant-`), tokens de nuvem, chaves privadas
(`-----BEGIN ... PRIVATE KEY-----`), `.env` versionado, e strings de conexao com senha.

RECUSA, nao avisa. E o inverso da guarda de ferramental (T-014), e a diferenca e a mesma:
reversibilidade. Reinventar uma roda e caro e recuperavel; publicar um segredo, nao.

Falso positivo tem de ser CONTORNAVEL de forma explicita e registrada (uma lista de exclusao
versionada), nunca por desligar a varredura.
""",
    [
        ("Cada padrao de segredo e detectado (um teste por padrao).", "mix test test/fabrica/seguranca_test.exs"),
        ("Segredo encontrado RECUSA a publicacao, nao apenas avisa.", "mix test test/fabrica/seguranca_test.exs"),
        ("Falso positivo e contornavel por lista de exclusao versionada, com o motivo registrado.", "mix test test/fabrica/seguranca_test.exs"),
        ("`mix verificar` continua passando.", "mix verificar"),
    ],
)

tarefa(
    "v1.0", "marco", "MARCO da v1.0: um projeto inteiro, sem intervencao", ["v1.0:painel-console", "v1.0:parar-retomar", "v1.0:piloto-mecanica", "v1.0:trilha-generica", "v1.0:seguranca"],
    ["_gestao/PROGRESSO.md", "_gestao/ENTREGA.md"],
    """
Verificar o marco final: um projeto inteiro e planejado, construido e entregue sem
intervencao, com o custo acompanhado na tela. E fechar a comparacao com a linha de base.
""",
    """
Tarefa de verificacao, e ela e a entrega do TCC.

Escolha um projeto NOVO e PEQUENO — 8 a 12 tarefas, nao um dos tres projetos vivos da v1.
Migrar projeto em voo nunca foi o plano. De o pedido em linguagem natural, ligue o piloto
com os dois tetos, e nao toque em mais nada.

Confira, ao fim:
  1. o projeto foi planejado, construido, verificado, revisado e documentado;
  2. a intervencao humana foi UMA: o pedido inicial;
  3. o custo por tarefa aparece na tela e no banco;
  4. rode tambem um projeto da trilha GENERICA (um documento ou um deck), para provar as
     duas trilhas.

**E entao feche a medicao** contra a `LINHA_DE_BASE.md` da T-008. Os quatro numeros:
proporcao de despacho desperdicado, custo por tarefa concluida, contexto por despacho, e o
que se perde ao matar um agente em voo.

Grave `_gestao/ENTREGA.md` com a comparacao. **Se algum numero piorou, escreva isso.** Um TCC
que reporta um resultado misto e honesto vale mais que um que reporta so o que deu certo — e
a banca vai perguntar exatamente pelo numero que faltar.
""",
    [
        ("Um projeto novo e pequeno e entregue de ponta a ponta com UMA intervencao humana.", None),
        ("Um projeto da trilha generica tambem e entregue, com os graus de prova rotulados.", None),
        ("`ENTREGA.md` compara os quatro numeros com a `LINHA_DE_BASE.md`, incluindo os que pioraram.", None),
        ("O custo por tarefa esta visivel na tela e consultavel no banco.", None),
    ],
)

# ===========================================================================
# RENDERIZACAO
# ===========================================================================

CABECALHO_CRITERIOS = """## Criterios de aceite
"""


def codigo(i):
    return "T-%03d" % (i + 1)


def indice():
    """Mapa "versao:slug" -> posicao.

    As dependencias sao escritas por NOME, nao por numero, e a razao e insercao: numero
    de tarefa e POSICAO, e posicao muda toda vez que uma tarefa entra no meio.
    Referencia por nome sobrevive a insercao; referencia por numero quebra em silencio —
    a validacao pega dependencia que aponta para o futuro, mas nao pega dependencia que
    aponta para a tarefa ERRADA que por acaso vem antes.
    """
    return {"%s:%s" % (t["v"], t["slug"]): i for i, t in enumerate(T)}


def resolver(t):
    """Codigos T-NNN das dependencias de uma tarefa, na ordem declarada."""
    ix = indice()
    return [codigo(ix[d]) for d in t["dep"]]


def validar():
    """Falha ANTES de escrever qualquer arquivo se as ligacoes estiverem erradas."""
    ix = indice()
    problemas = []
    if len(ix) != len(T):
        problemas.append("ha 'versao:slug' repetido — cada par tem de ser unico")
    for i, t in enumerate(T):
        meu = "%s:%s" % (t["v"], t["slug"])
        for d in t["dep"]:
            if d not in ix:
                problemas.append("%s depende de %s, que nao existe" % (meu, d))
            elif ix[d] >= i:
                problemas.append(
                    "%s (%s) depende de %s (%s), que vem depois dela"
                    % (meu, codigo(i), d, codigo(ix[d]))
                )
    if problemas:
        raise SystemExit("DEPENDENCIAS INVALIDAS:" + "".join(
            chr(10) + "  " + x for x in problemas))


def render_tarefa(i, t):
    cod = codigo(i)
    deps = "[" + ", ".join(resolver(t)) + "]"
    areas = "[" + ", ".join(t["areas"]) + "]"

    linhas = []
    linhas.append("---")
    linhas.append("id: %s" % cod)
    linhas.append("titulo: %s" % t["titulo"])
    linhas.append("projeto: fabrica-v2")
    linhas.append("versao: %s" % t["v"])
    linhas.append("status: backlog")
    linhas.append("prioridade: %s" % t["prio"])
    linhas.append("dependencias: %s" % deps)
    linhas.append("areas: %s" % areas)
    linhas.append("tentativas: 0")
    linhas.append("criada: %s" % HOJE)
    linhas.append("atualizada: %s" % HOJE)
    linhas.append("---")
    linhas.append("")
    linhas.append("## Objetivo")
    linhas.append(t["objetivo"])
    linhas.append("")
    linhas.append("## Contexto")
    linhas.append(t["contexto"])
    linhas.append("")
    linhas.append("## Criterios de aceite")
    for texto, comando in t["criterios"]:
        linhas.append("- [ ] %s" % texto)
        if comando:
            linhas.append("      `verificar: %s`" % comando)
    linhas.append("")
    linhas.append("## Notas de execucao")
    linhas.append("")
    linhas.append("")
    linhas.append("## Verificacao")
    linhas.append("")
    linhas.append("")
    linhas.append("## Conformidade")
    linhas.append("")
    linhas.append("")
    linhas.append("## Revisao")
    linhas.append("")
    return "\n".join(linhas) + "\n"


def render_roteiro():
    l = []
    l.append("# Roteiro da v2 — as %d tarefas, em ordem" % len(T))
    l.append("")
    l.append("**Gerado por `gerar-tarefas.py`. Nao edite a mao** — edite a especificacao no")
    l.append("gerador e rode de novo. Ele nunca sobrescreve tarefa que ja existe.")
    l.append("")
    l.append("A ordem desta lista e a ordem de execucao. Cada tarefa e atomica: uma sessao do")
    l.append("Claude Code abre o arquivo dela, faz o trabalho, roda os criterios e commita.")
    l.append("")
    l.append("Contexto do porque de cada coisa: `_sistema/PLANO_V2.md` (as versoes),")
    l.append("`_sistema/MIGRACAO_V2.md` (a analise) e `_sistema/DECISOES_FECHADAS.md`.")
    l.append("")
    l.append("---")
    l.append("")

    por_versao = {}
    for i, t in enumerate(T):
        por_versao.setdefault(t["v"], []).append((i, t))

    for v in VERSOES:
        itens = por_versao.get(v["id"], [])
        if not itens:
            continue
        marca = " *(opcional)*" if v["opcional"] else ""
        l.append("## %s — %s%s" % (v["id"], v["nome"], marca))
        l.append("")
        l.append("**Entrega:** %s" % v["entrega"])
        l.append("")
        l.append("| tarefa | o que faz | depende de |")
        l.append("|---|---|---|")
        for i, t in itens:
            dep = ", ".join(resolver(t)) if t["dep"] else "—"
            l.append("| **%s** | %s | %s |" % (codigo(i), t["titulo"], dep))
        l.append("")
        l.append("> **Marco da %s:** %s" % (v["id"], v["marco"]))
        l.append("")
        l.append("---")
        l.append("")

    l.append("## Como rodar uma tarefa")
    l.append("")
    l.append("No Claude Code, uma sessao por tarefa (e `/clear` entre elas):")
    l.append("")
    l.append("```")
    l.append("Leia _sistema/v2/tarefas/T-0NN-*.md e execute a tarefa inteira,")
    l.append("do codigo ao commit. Rode os criterios de aceite antes de dar por pronta.")
    l.append("```")
    l.append("")
    l.append("Uma sessao por tarefa nao e cerimonia: o custo de uma sessao cresce ao quadrado,")
    l.append("porque cada volta rele tudo que veio antes. Duas tarefas na mesma sessao custam")
    l.append("mais que duas sessoes.")
    l.append("")
    return "\n".join(l) + "\n"


def principal():
    validar()
    os.makedirs(DIR_TAREFAS, exist_ok=True)

    criados, mantidos = 0, 0
    for i, t in enumerate(T):
        nome = "%s-%s.md" % (codigo(i), t["slug"])
        caminho = os.path.join(DIR_TAREFAS, nome)
        if os.path.exists(caminho):
            mantidos += 1
            continue
        with io.open(caminho, "w", encoding="utf-8", newline="\n") as f:
            f.write(render_tarefa(i, t))
        criados += 1

    roteiro = os.path.join(RAIZ, "ROTEIRO.md")
    with io.open(roteiro, "w", encoding="utf-8", newline="\n") as f:
        f.write(render_roteiro())

    print("tarefas: %d criadas, %d ja existiam (nao tocadas)" % (criados, mantidos))
    print("roteiro: %s" % roteiro)
    print("total especificado: %d tarefas em %d versoes" % (len(T), len(VERSOES)))


if __name__ == "__main__":
    principal()
