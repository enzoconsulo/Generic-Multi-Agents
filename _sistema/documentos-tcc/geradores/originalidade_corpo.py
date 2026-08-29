# -*- coding: utf-8 -*-
"""Os dois corpos: o completo e o resumo. Executar este arquivo gera os quatro artefatos.

ATENÇÃO À ACENTUAÇÃO: python-docx e o Word lidam com Unicode sem problema. A primeira
versão deste arquivo foi escrita em ASCII "por segurança" e produziu um documento
acadêmico em português inteiro sem acento — defeito que só apareceu ao rasterizar o PDF
e olhar. Escreva o português correto; não há motivo para não escrever.
"""

from originalidade import (REPO, documento, marcador, nota, para_pdf, salvar,
                           secao, sub, tabela, texto, titulo)

DATA = "29 de agosto de 2026"
AUTOR = "Enzo Consulo"

# --------------------------------------------------------------------------------
# Commits usados como referência. Hash curto + data + o que provam.
# Substituem qualquer citação de fala: são verificáveis com `git show <hash>`.
# --------------------------------------------------------------------------------
COMMITS = [
    ("8215dbf", "01/08", "I1 — MAPA.md, índice denso do projeto no lugar da varredura de arquivos"),
    ("9d43b61", "01/08", "doutrina de custo de contexto: o modelo, a medição e as cinco intervenções"),
    ("2255150", "01/08", "trilha genérica — a fábrica deixa de ser só de software"),
    ("f5b8fd4", "01/08", "limiar medido de tamanho de tarefa, no planejador e antes do despacho"),
    ("1a41ca8", "02/08", "montador de contexto, máquina do pipeline e teto de custo com parada limpa"),
    ("4c559ef", "02/08", "I2 (prefixo cacheável) e I5 (critérios executáveis)"),
    ("91559b8", "02/08", "I3 — o laço de orquestração vira código testado"),
    ("8017c41", "02/08", "o pipeline decide sozinho — sem portão de julgamento humano"),
    ("cdedec2", "02/08", "saneamento passa a olhar a árvore git (defeito achado em rodada real)"),
    ("9a1c186", "14/08", "verificador passa a declarar o grau de prova, nas duas trilhas"),
    ("eb9e51f", "16/08", "prova que a equipe especializada chega ao modelo, e corrige a doutrina"),
    ("e8974c5", "21/08", "portão do meio avaliado e fechado — 0 s de fila em 43 rodadas"),
]


# ================================================================== COMPLETO
def completo():
    d = documento()
    titulo(
        d,
        "Estado da arte e delimitação de originalidade",
        "Fábrica de software multi-agente — análise comparativa",
        f"{AUTOR}  ·  {DATA}  ·  repositório público: {REPO}",
    )

    texto(d, [
        ("Este documento responde a três perguntas: o que já existe que se parece com este "
         "trabalho, onde há sobreposição real, e o que o distingue. A conclusão, adiantada: ", False),
        ("o trabalho não é plágio, mas vários de seus componentes não são originais", True),
        (" — e a diferença entre honestidade acadêmica e problema é citar, não ser inédito. "
         "Um trabalho de conclusão não precisa inventar; precisa dizer com precisão o que "
         "herdou e o que acrescentou.", False),
    ])

    # ---- 1
    secao(d, "1.", "O que existe")

    sub(d, "1.1  Agentic Software Factory (softwarefabrik.io)")
    texto(d, [
        ("Produto comercial, de Martin Janda, versão v0.30.0 (2026). É o projeto mais próximo, "
         "e a semelhança de vocabulário é real: linha de produção estruturada, portão de "
         "qualidade, disciplina de git, modelo por papel. Opera em três fases — assistente, "
         "execução e ", False), ("sign-off", True),
        (". A entrada é um assistente de seis passos com dezoito modelos de stack; cada "
         "execução roda em contêiner Docker efêmero, com sistema de arquivos somente leitura e "
         "sem rede; o portão final tem seis papéis revisores.", False),
    ])
    nota(d, "A DIVERGÊNCIA ESTRUTURAL",
         "O produto rejeita explicitamente a autonomia: há aprovação humana, com exibição das "
         "diferenças, antes de cada passo. Este trabalho vai na direção oposta — uma única "
         "intervenção humana, no pedido inicial, e os portões são operados por agentes. São "
         "respostas opostas à mesma pergunta, e a autonomia é o problema mais difícil dos dois.")

    sub(d, "1.2  A literatura acadêmica")
    texto(d, [
        ("ChatDev (arXiv:2307.07924) e MetaGPT, ambos de 2023, são a origem acadêmica da ideia "
         "de papéis especializados de agentes produzindo software. O ChatDev organiza papéis de "
         "empresa — diretor executivo, diretor técnico, programador, testador, revisor — num "
         "ciclo em cascata, com cada fase conduzida por duplas de agentes em diálogo. O MetaGPT "
         "usa a mesma metáfora, com procedimentos operacionais padrão codificados. ", False),
        ("Qualquer banca que conheça a área cobrará a citação destes dois.", True),
    ])

    sub(d, "1.3  Frameworks de agentes em Elixir/OTP")
    texto(d, [
        ("Este é o achado mais desconfortável, e precisa ser dito: ", False),
        ("agente como processo supervisionado não é uma ideia original deste trabalho", True),
        (". É prática estabelecida na comunidade Elixir, com implementações públicas — Cortex "
         "(orquestração multi-agente com fluxos em grafo acíclico e painéis ao vivo), Sagents "
         "(supervisão OTP, delegação a subagentes, painel LiveView), SwarmEx e Synapse (com "
         "persistência em PostgreSQL). O argumento da escolha de plataforma está correto, mas "
         "não é inédito, e apresentá-lo como descoberta seria um erro que um avaliador da área "
         "percebe.", False),
    ])

    sub(d, "1.4  O campo em 2026, e a origem do termo")
    texto(d,
         "A Factory.ai posiciona-se comercialmente como fábrica de software agêntica; em "
         "repositórios públicos há, entre outros, The Dark Factory, Galley, Prestige e Lorg. E o "
         "termo em si não é da era da inteligência artificial: vem da engenharia de software "
         "das décadas de 1960 a 1990, notadamente de Cusumano, Japan's Software Factories "
         "(1991), que descreve linhas de produção com processo padronizado e reúso.")

    # ---- 2
    secao(d, "2.", "Onde há sobreposição real")
    texto(d, "Sem eufemismo. Cada linha abaixo é algo que este trabalho tem e outros também têm.")
    tabela(d,
           ["Mecanismo", "Quem já tem"],
           [["Termo “fábrica de software” e a metáfora da linha de produção", "Cusumano (1991); softwarefabrik; Factory.ai"],
            ["Agentes com papéis especializados produzindo software", "ChatDev, MetaGPT (2023)"],
            ["Portão de qualidade antes de integrar", "softwarefabrik; Galley; Dark Factory"],
            ["Modelo mais forte para uns papéis, mais barato para outros", "softwarefabrik"],
            ["Um commit por unidade de trabalho", "softwarefabrik; Dark Factory"],
            ["Estimativa de custo por execução", "softwarefabrik"],
            ["Agente como processo supervisionado (OTP)", "Cortex, Sagents, SwarmEx, Synapse"],
            ["Painel ao vivo acompanhando agentes", "Cortex, Sagents"],
            ["Dirigir a ferramenta de linha de comando por arquivos de papel", "softwarefabrik (convergência de substrato)"],
            ["Fila durável com persistência em PostgreSQL", "Synapse"]],
           larguras=[8.6, 7.4])
    texto(d, [
        ("São dez itens. Um trabalho que apresentasse os dez como contribuição própria estaria "
         "em apuros — não por plágio, mas por falta de revisão da literatura.", True)])

    # ---- 3
    secao(d, "3.", "O que distingue este trabalho")

    sub(d, "3.1  A trilha não-software, com escada de prova")
    texto(d, [
        ("É a parte mais provavelmente original: não foi encontrado equivalente publicado. "
         "O eixo que separa os dois casos não é “é código?”, e sim ", False),
        ("como se prova que ficou pronto", True),
        (". Em software a prova vem de graça — o programa roda e passa ou quebra. Fora dele não "
         "vem, e é aí que o desenho degeneraria, com o verificador virando um segundo revisor e "
         "dois julgamentos subjetivos custando em dobro.", False)])
    texto(d, [
        ("A solução tem três peças: todo critério fica em um de três degraus — executado, "
         "inspecionado ou julgado — e o verificador é ", False), ("obrigado a rotular", True),
        (" qual usou; a primeira tarefa instala o verificador, antes de qualquer parte do "
         "artefato; e a fonte é texto versionado, com o binário gerado por comando, porque "
         "versionar o binário como fonte apagaria o portão da revisão. A proporção de critérios "
         "apenas julgados fica visível por projeto: quando ela sobe, o sistema está operando com "
         "um portão e meio, e isso vira sinal de replanejamento.", False)])
    nota(d, "REFERÊNCIA",
         "Commit 2255150 (01/08) cria a trilha genérica; 9a1c186 (14/08) estende o rótulo de "
         "grau de prova também à trilha de software.")

    sub(d, "3.2  Reprojeto guiado pela telemetria da própria operação")
    texto(d, [
        ("Esta é a contribuição de pesquisa, e a que nenhum outro projeto pode ter, porque "
         "depende de dados que só existem neste repositório. A primeira versão rodou seis "
         "semanas em uso real, e a segunda é reprojetada a partir do que foi medido: 93,14% dos "
         "tokens de entrada são leitura de memória temporária do provedor, e a escrita, com "
         "6,66% dos tokens, carrega cerca de metade da conta; 78% do custo estava em sessões do "
         "coordenador fazendo trabalho de máquina de estados. ", False),
        ("Nenhum dos projetos pesquisados publica medição da própria operação", True),
        (" — os acadêmicos medem qualidade de saída em conjuntos de referência; o comercial "
         "estima custo antes de executar, e não mede o gasto acumulado para reprojetar.", False)])

    sub(d, "3.3  Dois portões que fazem perguntas diferentes")
    texto(d, [
        ("Não são dois níveis de zelo. O verificador pergunta “funciona?” e executa os "
         "critérios; o revisor pergunta “é o que foi pedido?” e “está correto?”, em seções "
         "separadas. O ponto não-óbvio: ", False),
        ("uma entrega pode passar em todos os critérios, não ter defeito nenhum, e ainda assim "
         "não ser a tarefa", True),
        (", quando o critério foi mal escrito. Reprovar por não-conformidade não exige encontrar "
         "defeito. Não foi encontrada essa separação articulada nos projetos pesquisados.", False)])

    sub(d, "3.4  O coordenador não é um agente")
    texto(d, [
        ("No ChatDev e no MetaGPT a coordenação acontece por diálogo entre agentes; na "
         "softwarefabrik, quem coordena é o humano. Aqui, quem decide ordem, promoção, "
         "roteamento e escalonamento é código determinístico. E a razão não foi estética: "
         "mediu-se que o coordenador baseado em modelo consumia trinta e seis idas ao modelo e "
         "cerca de 17% do custo de um trabalho para fazer o que é, literalmente, uma máquina de "
         "estados. A fronteira que ficou: ", False), ("cabe num teste? então é código", True),
        (". Replanejar, julgar um marco reprovado e redigir relatório continuam no modelo, "
         "porque são julgamento.", False)])
    nota(d, "REFERÊNCIA",
         "Commits 91559b8 (02/08), que converte o laço em código testado, e 8017c41 (02/08), "
         "cuja mensagem registra: “o pipeline decide sozinho — sem portão de julgamento humano”.")

    sub(d, "3.5  Autoridade como ausência de ferramenta")
    texto(d,
         "“Quem revisa não corrige” é regra em vários projetos. Aqui o revisor não recebe a "
         "ferramenta de escrever: a regra deixa de ser interpretável e vira impossibilidade, "
         "verificada por um teste que percorre o catálogo de ferramentas de cada papel. "
         "Restringir ferramentas por papel é prática conhecida; o que parece próprio é usá-la "
         "como o mecanismo de separação de autoridade, e testá-la negativamente.")

    sub(d, "3.6  A escada de resposta ao fracasso")
    texto(d,
         "Quatro degraus, cada um disparado por fato registrado: a primeira reprovação sobe de "
         "modelo; a segunda sob o mesmo especialista troca de especialista; três ciclos "
         "esgotados replanejam, com o planejador quebrando a tarefa em duas ou três menores; e, "
         "esgotando de novo, bloqueia. Limite de tentativas e escalonamento de modelo são "
         "comuns. O terceiro degrau é o incomum: reconhecer que o problema pode ser de "
         "dimensionamento da tarefa, não de execução, e agir sobre isso automaticamente.")

    sub(d, "3.7  Criação sob demanda")
    texto(d,
         "Nada é pré-fabricado. De uma frase em linguagem natural saem especificação, plano em "
         "fases e de oito a vinte tarefas com dependências declaradas; a equipe é sintetizada em "
         "dois a cinco especialistas a partir do próprio pedido; e quando o pedido não cabe nas "
         "categorias existentes, o planejador cunha o domínio, declarando o trio artefato, "
         "geração e verificação. O contraste é direto: a softwarefabrik oferece dezoito modelos "
         "de stack, e ChatDev e MetaGPT têm elenco fixo. Aqui não há modelo nem elenco — há "
         "síntese.")

    # ---- 4
    secao(d, "4.", "Comparação lado a lado")
    tabela(d,
           ["Eixo", "Este trabalho", "softwarefabrik.io", "ChatDev / MetaGPT"],
           [["Quem aprova", "Agentes, sem a ferramenta de escrever", "O humano, antes de cada passo", "Agentes revisores, em diálogo"],
            ["Quem coordena", "Código determinístico", "O humano, pela interface", "Diálogo entre agentes"],
            ["Intervenção humana", "Uma só: o pedido inicial", "Por aprovação; autonomia rejeitada", "Pedido inicial"],
            ["Origem do projeto", "Sob demanda, sintetizada do pedido", "Dezoito modelos num assistente", "Elenco fixo de papéis"],
            ["Isolamento em paralelo", "Arquivos declarados, verificados pelo motor", "Contêiner Docker efêmero", "Não trata"],
            ["Ao falhar", "Escada de quatro degraus, com replanejamento", "O humano decide", "Novo ciclo de diálogo"],
            ["Artefatos não-software", "Trilha própria, com escada de prova", "Não trata", "Não trata"],
            ["Base do desenho", "Telemetria própria: 139 execuções medidas", "Experiência do autor", "Conjuntos de referência"]],
           larguras=[3.0, 4.6, 4.3, 4.1], fonte=8.3)

    # ---- 5
    secao(d, "5.", "Evidência documental")
    texto(d, [
        ("O repositório é público e a verificação é direta. Entre 18 de julho e 28 de agosto de "
         "2026 acumulou 205 commits, e os conceitos aparecem ", False),
        ("em sequência, depois dos incidentes que os motivaram", True),
        (", não prontos no primeiro dia. Um projeto transcrito chega inteiro; este chegou por "
         "acúmulo.", False)])

    tabela(d,
           ["Commit", "Data", "O que registra"],
           [[c[0], c[1], c[2]] for c in COMMITS],
           larguras=[2.2, 1.6, 12.2], fonte=8.3)

    sub(d, "Medições que contrariaram a própria hipótese")
    texto(d,
         "O sinal de que o método é honesto não é a medição que confirma o que já se supunha, e "
         "sim a que obriga a mudar de rumo. Quatro casos, todos registrados em commit:")
    marcador(d, [("174f0a0 (31/07) — previsões escritas antes da rodada", True),
                 (", para poder confrontá-las com o resultado depois.", False)])
    marcador(d, [("696762e (31/07) — “/status remedido (n=3): o ganho de 12% era ruído”", True),
                 (". Um resultado anunciado foi refutado por nova medição, e retirado.", False)])
    marcador(d, [("dea9e9c (31/07) — a contagem de saída estava cem vezes subestimada", True),
                 (". O instrumento estava errado, e foi corrigido antes de qualquer conclusão.", False)])
    marcador(d, [("e8974c5 (21/08) — hipótese avaliada e descartada por medição", True),
                 (": supunha-se que o portão de verificação seria o gargalo do sistema; medido "
                  "sobre quarenta e três rodadas, houve zero segundo de espera. A otimização já "
                  "desenhada foi abandonada por evidência.", False)])

    sub(d, "Operação real")
    texto(d,
         "A primeira versão entregou 86 tarefas concluídas de 89, em três projetos de domínios "
         "distintos: um jogo de tabuleiro em versão web, multijogador em tempo real (69 de 72 "
         "tarefas); um serviço permanente embarcado no computador de placa única que controla "
         "uma impressora 3D (11 de 11); e uma plataforma de dados com camada de análise por "
         "modelos de linguagem (6 de 6). São 139 execuções gravadas, com tokens, custo, modelo e "
         "desfecho, preservadas no repositório.")

    # ---- 6
    secao(d, "6.", "Conclusão e encaminhamento")
    texto(d, [
        ("Não é plágio, e a evidência documental sustenta isso. Mas o trabalho não é inédito no "
         "gênero, e não deve se apresentar como se fosse. ", False),
        ("Plágio é sobre atribuição, não sobre ineditismo.", True)])
    texto(d, "Três encaminhamentos:")
    marcador(d, [("Escrever a seção de trabalhos relacionados e citar antes de ser perguntado", True),
                 (": ChatDev e MetaGPT pelos papéis; softwarefabrik.io e Factory.ai pela fábrica "
                  "agêntica comercial; Cortex, Sagents, SwarmEx e Synapse pelo agente como "
                  "processo supervisionado; Cusumano pelo termo.", False)])
    marcador(d, [("Reduzir a afirmação de contribuição ao escopo real", True),
                 (". Não “construí uma fábrica de software multi-agente” — isso existe. É "
                  "“operei uma por seis semanas em três projetos reais, medi onde ela falha e "
                  "quanto custa, e reprojetei a partir dessa medição”.", False)])
    marcador(d, [("Comparar explicitamente com o vizinho mais próximo", True),
                 (". Demonstrar que se conhece o projeto mais parecido e que se escolheu "
                  "diferente, com motivo, é a defesa mais sólida disponível.", False)])
    texto(d,
          "Um trabalho que declara isso com precisão é mais forte do que um que reivindica "
          "ineditismo total.", espaco=10)

    secao(d, "", "Fontes consultadas")
    for f in ["softwarefabrik.io — Agentic Software Factory (Martin Janda), v0.30.0, 2026",
              "arXiv:2307.07924 — ChatDev: Communicative Agents for Software Development, 2023",
              "factory.ai — Factory 2.0: from coding agents to software factories",
              "github.com/itsHabib/cortex — orquestração multi-agente em Elixir/OTP",
              "github.com/sagents-ai/sagents — agentes com supervisão OTP e painel ao vivo",
              "CUSUMANO, M. Japan's Software Factories. Oxford University Press, 1991"]:
        marcador(d, f, tamanho=9)

    return salvar(d, "originalidade-completo")


# ================================================================== RESUMO
def resumo():
    d = documento()
    titulo(
        d,
        "Delimitação de originalidade",
        "Fábrica de software multi-agente — resumo comparativo",
        f"{AUTOR}  ·  {DATA}  ·  repositório público: {REPO}",
    )

    nota(d, "EM UMA FRASE",
         "Existe o gênero; não existe este sistema. Fábricas agênticas existem, e são citadas "
         "adiante. O que nenhuma delas tem é o que este trabalho fez: operar seis semanas em "
         "três projetos reais, medir onde falha e quanto custa, e reprojetar a partir dessa "
         "medição.")

    secao(d, "1.", "O que a primeira versão construiu")
    texto(d,
          "Não é protótipo de demonstração. São três sistemas de domínios distintos, entregues "
          "por agentes, com 86 tarefas concluídas de 89.")
    tabela(d,
           ["Projeto", "O que é", "Entregue"],
           [["Jogo de tabuleiro", "Versão web, multijogador em tempo real", "69 de 72 tarefas"],
            ["Serviço embarcado", "Rotina permanente no computador de placa única que controla uma impressora 3D", "11 de 11 tarefas"],
            ["Plataforma de dados", "Camada de análise por modelos de linguagem sobre um repositório de dados", "6 de 6 tarefas"]],
           larguras=[3.4, 9.0, 3.6])
    texto(d,
          "São domínios que não se parecem — sincronia em tempo real, software embarcado e "
          "engenharia de dados. É isso que sustenta a afirmação de generalidade: a fábrica não "
          "foi construída em torno de um exemplo único.")

    secao(d, "2.", "As diferenças que decidem")
    tabela(d,
           ["Eixo", "Este trabalho", "softwarefabrik.io", "ChatDev / MetaGPT"],
           [["Quem aprova", "Agentes, sem a ferramenta de escrever", "O humano, antes de cada passo", "Agentes revisores, em diálogo"],
            ["Quem coordena", "Código determinístico", "O humano, pela interface", "Diálogo entre agentes"],
            ["Origem do projeto", "Sob demanda, sintetizada do pedido", "Dezoito modelos num assistente", "Elenco fixo de papéis"],
            ["Ao falhar", "Escada de quatro degraus, com replanejamento", "O humano decide", "Novo ciclo de diálogo"],
            ["Artefatos não-software", "Trilha própria, com escada de prova", "Não trata", "Não trata"],
            ["Base do desenho", "Telemetria própria: 139 execuções", "Experiência do autor", "Conjuntos de referência"]],
           larguras=[3.0, 4.6, 4.3, 4.1], fonte=8.3)
    texto(d, [
        ("A linha que mais separa é a primeira. O concorrente comercial mais próximo ", False),
        ("rejeita a autonomia explicitamente", True),
        (": há aprovação humana antes de cada passo. Aqui a intervenção humana é uma só — o "
         "pedido. Todo o limite de ciclos, a escada de fracasso e o replanejamento existem "
         "porque não há humano no laço.", False)])

    secao(d, "3.", "O que é herdado, e citado")
    texto(d,
          "Papéis especializados de agentes produzindo software (ChatDev e MetaGPT, 2023); o "
          "termo “fábrica de software” e a metáfora da linha de produção (Cusumano, 1991); "
          "agente como processo supervisionado em OTP (Cortex, Sagents, SwarmEx, Synapse — "
          "prática corrente em Elixir); portão de qualidade, commit por unidade de trabalho e "
          "modelo diferente por papel (softwarefabrik.io).")
    nota(d, "O PRINCÍPIO",
         "Plágio é sobre atribuição, não sobre ineditismo. Citar de saída é mais sólido do que "
         "ser questionado a respeito depois.")

    secao(d, "4.", "A contribuição, em uma frase")
    texto(d, [
        ("Não é “construí uma fábrica de software multi-agente” — isso existe. É ", False),
        ("operei uma por seis semanas em três projetos reais, medi onde ela falha e quanto "
         "custa, e reprojetei a partir dessa medição", True),
        (", movendo a governança de frases em prompt para propriedades da estrutura.", False)])

    secao(d, "5.", "A evidência, por commit")
    texto(d,
          "O repositório é público. Os mecanismos centrais têm commit e data, e aparecem depois "
          "dos incidentes que os motivaram — não no primeiro dia.")
    tabela(d,
           ["Commit", "Data", "O que registra"],
           [["8215dbf", "01/08", "Índice denso do projeto no lugar da varredura de arquivos"],
            ["2255150", "01/08", "Trilha genérica: a fábrica deixa de ser só de software"],
            ["91559b8", "02/08", "O laço de orquestração vira código testado"],
            ["8017c41", "02/08", "O pipeline decide sozinho, sem portão de julgamento humano"],
            ["9a1c186", "14/08", "Rótulo obrigatório de grau de prova nas duas trilhas"],
            ["e8974c5", "21/08", "Hipótese de gargalo avaliada e descartada: 0 s de fila em 43 rodadas"]],
           larguras=[2.2, 1.6, 12.2], fonte=8.3)
    texto(d, [
        ("O último é o mais relevante para a defesa do método: uma otimização já desenhada foi ", False),
        ("descartada porque a medição contrariou a hipótese", True),
        (". Ao lado dele estão o commit 174f0a0, que registra previsões escritas antes da "
         "rodada, e o 696762e, em que um ganho anunciado foi refutado por nova medição e "
         "retirado.", False)])

    secao(d, "6.", "Perguntas prováveis")

    sub(d, "“A softwarefabrik faz a mesma coisa.”")
    texto(d,
          "Faz o oposto no ponto que decide: lá o humano aprova cada passo, e a autonomia é "
          "rejeitada explicitamente. Aqui a intervenção humana é uma só.")

    sub(d, "“Agente como processo supervisionado é ideia sua?”")
    texto(d,
          "Não, e está citado. É prática corrente na comunidade Elixir, com ao menos quatro "
          "implementações públicas. O que é próprio é o que roda sobre isso: os dois portões com "
          "perguntas diferentes, a escada de fracasso e a trilha não-software.")

    sub(d, "“Qual é a novidade, então?”")
    texto(d,
          "Medir a própria operação e reprojetar a partir disso. Nenhum dos outros publica "
          "telemetria da própria execução. Foi a medição que mostrou que 78% do custo estava no "
          "coordenador fazendo trabalho de máquina de estados — e foi por isso que ele virou "
          "código.")

    sub(d, "“E se aparecer outro projeto semelhante?”")
    texto(d,
          "A resposta é a mesma: o campo está cheio e a convergência é esperada, porque todos "
          "enfrentam as mesmas restrições. O diferencial não é precedência, e sim seis semanas "
          "de telemetria da própria operação guiando o redesenho — o que é próprio por "
          "construção.")

    return salvar(d, "originalidade-resumo")


if __name__ == "__main__":
    print("gerando documentos de originalidade")
    a = completo()
    b = resumo()
    print("convertendo para PDF")
    para_pdf(a)
    para_pdf(b)
    print("pronto")
