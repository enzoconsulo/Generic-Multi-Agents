# -*- coding: utf-8 -*-
"""Corpo do PLANO DE DESENVOLVIMENTO. Usa os helpers de plano_base.py.

Regras deste documento, que valem para qualquer edicao futura:

  1. DUAS siglas, e so duas: E1..E13 para as etapas, R1..R15 para os
     requisitos. Nada de codigo separado para marco, fase ou tipo de tarefa —
     o que a etapa entrega e chamado de "entrega da etapa", por extenso.
  2. Texto objetivo. Onde couber tabela, vai tabela: rende muito mais
     informacao por centimetro que paragrafo corrido.
  3. Comeca pela visao geral. Quem ler so a primeira pagina tem de sair
     sabendo quando o projeto comeca, quando o desenvolvimento comeca e
     termina, e quando a entrega acontece.
  4. Teto de 10 paginas. Confira com `python medir_paginas.py <arquivo>`.

Monte com `python gerar_plano.py`. Nao rode este arquivo sozinho.
"""

# ================================================================ CAPA
p("Fábrica de Software Multi-Agente", tam=20, cor=AZUL, negrito=True,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=1, espaco=1.0)
p("Plano de desenvolvimento", tam=12, cor=CINZA,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=3, espaco=1.0)

reg = doc.add_paragraph()
reg.paragraph_format.space_after = Pt(6)
borda = OxmlElement("w:pBdr")
bot = OxmlElement("w:bottom")
bot.set(qn("w:val"), "single")
bot.set(qn("w:sz"), "12")
bot.set(qn("w:color"), "2A78D6")
borda.append(bot)
reg._p.get_or_add_pPr().append(borda)

p("Trabalho de Conclusão de Curso   ·   Enzo Consulo   ·   setembro de 2026", tam=9,
  cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=6)

# ---------------------------------------------------------------- visão geral
doc.add_heading("Visão geral", level=1)

caixa("O QUE SERÁ CONSTRUÍDO",
      "Um sistema que recebe a descrição de um projeto em linguagem natural e o constrói de ponta "
      "a ponta. Agentes especializados planejam, implementam, testam, revisam e documentam — cada "
      "um com papel definido e autoridade limitada. Depois do pedido inicial, o sistema trabalha "
      "sozinho.")

figura("fig1_visao_geral.png",
       "Figura 1 — O projeto do começo ao fim. São 210 dias corridos, divididos em 13 etapas de "
       "15 dias, mais um recesso de fim de ano.", 17.0)

passos([("210", "dias de projeto",
         "De 04/09/2026 a 01/04/2027, incluindo 15 dias de recesso entre 18/12 e 01/01."),
        ("13", "etapas de 15 dias",
         "Cada etapa termina com uma entrega concreta, que precisa estar pronta para a seguinte "
         "começar."),
        ("105", "dias de desenvolvimento",
         "A construção do sistema vai de 03/11/2026 a 02/03/2027 — as etapas E5 a E11."),
        ("30", "dias de validação",
         "As etapas E12 e E13 testam o sistema com projetos reais e fazem os ajustes finais.")])

caixa("COMO LER ESTE DOCUMENTO",
      "Ele usa apenas duas siglas, do começo ao fim: E1 a E13 são as treze etapas, e R1 a R15 são "
      "os requisitos. Não há código separado para marco, fase ou tipo de tarefa — o que cada "
      "etapa produz é chamado de entrega da etapa, escrito por extenso. Cada seção é curta de "
      "propósito, e as figuras carregam o que texto explicaria pior.",
      cor="14865D", fundo="E7F7F1", cor_titulo=VERDE)

quebra()

# ================================================================ PARTE I
parte("I", "O projeto", "O que se quer resolver, e o que o sistema fará.")

doc.add_heading("1.  O problema", level=1)

p("Modelos de linguagem escrevem código competente; isso já não é o gargalo. A dificuldade "
  "aparece no trabalho longo — uma tarefa com vinte decisões encadeadas, verificação no meio e "
  "correção depois. O modelo perde o fio, não porque escreve pior, mas porque nada no sistema o "
  "obriga a manter o rumo.")

p("Os sistemas que existem hoje colocam vários modelos para conversar entre si. A intuição é boa "
  "e esbarra num limite: a coordenação entre eles é escrita como texto dentro de um pedido ao "
  "modelo. \"Não modifique arquivos fora do projeto\", \"não tente mais de três vezes\", \"não "
  "aprove seu próprio trabalho\". São instruções — e instrução dirigida a um modelo é pedido, não "
  "garantia.", antes=1)

caixa("A IDEIA CENTRAL DO TRABALHO",
      "Um sistema multi-agente não falha por escrever mal: falha por governar mal. A proposta é "
      "mover cada regra de convivência para onde ela deixe de ser opcional — do texto do pedido "
      "para a estrutura do programa. O sistema não precisa ser mais esperto que os existentes; "
      "precisa ser mais difícil de operar errado.",
      cor="B52C2C", fundo="FBECEA", cor_titulo=VERMELHO)

doc.add_heading("2.  Onde cada regra vai morar", level=1)

tabela(["A regra", "Como ela costuma existir", "Onde ela vai passar a morar"],
       [["*Não escrever fora do projeto", "um pedido no texto",
         "a ferramenta de escrita resolve o caminho e recusa — o agente não tem como tentar"],
        ["*No máximo três tentativas", "um lembrete que pode ser ignorado",
         "uma coluna do banco de dados, contada pelo sistema; o agente não recebe ferramenta para "
         "alterá-la"],
        ["*Quem constrói não aprova", "uma combinação de papéis",
         "quem revisa não recebe nenhuma ferramenta que escreva em arquivo"],
        ["*Não estourar o orçamento", "uma recomendação",
         "o sistema impede o trabalho de começar quando o custo estimado não cabe"]],
       [4.0, 4.4, 9.0])

doc.add_heading("3.  Objetivo", level=1)

p("Projetar, implementar e avaliar um sistema multi-agente para construção de software em que as "
  "regras de governança sejam impostas pela estrutura do programa, e não pedidas em linguagem "
  "natural a um modelo. Ao final, o resultado será comparado com o de um protótipo já existente, "
  "medido na etapa E2, nas mesmas dimensões: custo por tarefa concluída, número de tentativas por "
  "tarefa e proporção de tarefas abandonadas.")

# ================================================================ PARTE II
parte("II", "Os requisitos",
      "O que o sistema precisa fazer, sob que restrições, e em que etapa cada um é atendido.",
      cor="4A3AA7")

doc.add_heading("4.  O que o sistema precisa fazer", level=1)

tabela(["#", "Requisito", "Como será verificado", "Etapa"],
       [["*R1", "Transformar uma descrição em linguagem natural em especificação, plano e lista de "
                "tarefas", "um pedido real produz as três coisas", "E7"],
        ["*R2", "Fazer cada tarefa percorrer seis estados, registrando cada mudança junto com o "
                "relatório e o custo", "o histórico de uma tarefa mostra as seis passagens", "E7"],
        ["*R3", "Submeter toda entrega a dois julgamentos independentes: um verifica se funciona, "
                "outro se é o que foi pedido", "os dois portões reprovam por motivos diferentes",
         "E7"],
        ["*R4", "Devolver a entrega reprovada com o relatório do que faltou, decidindo como "
                "refazer a partir da causa", "uma reprovação provocada gera a decisão correta",
         "E7"],
        ["*R5", "Limitar o retrabalho, replanejar a tarefa uma vez e, se ainda falhar, entregá-la "
                "ao humano", "uma tarefa impossível chega ao humano em quatro ciclos", "E7"],
        ["*R6", "Construir tarefas independentes ao mesmo tempo, sem que uma interfira no arquivo "
                "da outra", "três tarefas em paralelo, sem conflito", "E9"],
        ["*R7", "Consultar o histórico do próprio projeto antes de decidir, citando a fonte",
         "o agente cita a decisão anterior, e a citação confere", "E10"],
        ["*R8", "Mostrar andamento, custo e saída de cada agente numa tela, ao vivo",
         "um projeto inteiro acompanhado do pedido à entrega", "E11"]],
       [1.1, 6.6, 6.5, 3.2], tam=8.0)

doc.add_heading("5.  Sob que restrições", level=1)

tabela(["#", "Restrição", "O mecanismo que a garante", "Etapa"],
       [["*R9", "Roda em uma máquina modesta: 8 GB de memória e 4 núcleos",
         "nada pesado é carregado antes da E10, e o único componente pesado é trocável", "E10"],
        ["*R10", "O custo é contado em duas unidades: cota consumida e valor em dinheiro",
         "uma tabela própria, alimentada a cada resposta do modelo", "E5"],
        ["*R11", "Nenhum agente escreve fora da pasta do projeto",
         "a própria ferramenta de escrita recusa o caminho de fora", "E6"],
        ["*R12", "Os testes rodam sem internet, sem consumir cota e sem chave de acesso",
         "substitutos de mentira, e um teste que falha se a chave existir", "E5"],
        ["*R13", "A morte de um agente não derruba os outros nem perde o trabalho",
         "cada agente é um processo isolado, e a fila devolve a tarefa", "E9"],
        ["*R14", "O gasto de uma rodada não passa de um teto declarado",
         "o sistema impede começar o que não cabe, e nunca corta no meio", "E9"],
        ["*R15", "Trocar o fornecedor do modelo não exige mexer no núcleo",
         "o fornecedor entra por uma fronteira, como peça encaixável", "E8"]],
       [1.2, 6.2, 6.8, 3.2], tam=8.0)

quebra()

# ================================================================ PARTE III
parte("III", "Como o sistema vai funcionar",
      "As quatro camadas, o caminho de uma tarefa e o que acontece quando ela falha.",
      cor="184F95")

doc.add_heading("6.  As quatro camadas", level=1)

p("Cada camada só conhece a de baixo. A tela não conversa com o modelo: ela lê o mesmo banco de "
  "dados e escuta os mesmos avisos que o motor emite — assim ela não tem uma cópia própria do "
  "estado para divergir.", depois=2)

figura("fig2_arquitetura.png",
       "Figura 2 — As quatro camadas. As duas fronteiras do meio, em roxo, são o que permite "
       "trocar o fornecedor do modelo ou o mecanismo de busca sem mexer no motor (R15).", 15.4)

doc.add_heading("7.  O caminho de uma tarefa", level=1)

p("A unidade de trabalho é a tarefa: pequena, com objetivo escrito e critérios de aceite que são "
  "comandos, não opiniões. Ela percorre seis estados, e cada passagem é feita por um agente "
  "diferente daquele que construiu.", depois=2)

figura("fig3_ciclo.png",
       "Figura 3 — Os seis estados e os dois portões. As perguntas são independentes: uma entrega "
       "pode funcionar perfeitamente e ainda assim não ser a que foi pedida.", 16.0)

rico([("A ferramenta que o revisor não recebe.  ", True, AZUL),
      ("Quem revisa não tem, entre suas ferramentas, nenhuma que escreva em arquivo. Não é uma "
       "instrução para que não corrija: é a ausência da capacidade. É o exemplo mais direto da "
       "ideia central — a separação entre construir e aprovar deixa de depender de disciplina e "
       "passa a depender da estrutura.", False)], tam=9.2, antes=1, depois=3)

doc.add_heading("8.  O que acontece quando uma tarefa falha", level=1)

p("Falha é o caso comum, não a exceção. Cada reprovação muda a estratégia, em vez de repetir a "
  "aposta que já falhou. Quem conta os ciclos é o sistema: o agente não tem ferramenta para mexer "
  "no contador.", depois=2)

tabela(["Ciclo", "O que o sistema faz", "Por quê"],
       [["*1º", "Refaz com um modelo mais forte",
         "o gatilho é um fato — a tarefa voltou reprovada —, não um palpite feito antes de tentar"],
        ["*2º", "Troca o agente especializado",
         "duas reprovações seguidas sob a mesma abordagem indicam viés, não dificuldade da tarefa"],
        ["*3º", "Replaneja: quebra ou reescreve a tarefa",
         "se a abordagem não funciona, o problema pode estar no tamanho ou no recorte da tarefa"],
        ["*4º", "Bloqueia e entrega ao humano",
         "com o motivo registrado; insistir mais custa dinheiro sem aumentar a chance de acerto"]],
       [1.4, 5.2, 10.8])

# ================================================================ PARTE IV
parte("IV", "As ferramentas",
      "O que será usado para construir, e por que cada escolha.", cor="C24E1E")

doc.add_heading("9.  Por que Elixir", level=1)

p("O sistema não faz contas pesadas: ele espera. Cada agente passa a maior parte do tempo "
  "aguardando a resposta de um serviço remoto que demora dezenas de segundos e pode falhar. O "
  "problema real é manter dezenas desses trabalhos em andamento ao mesmo tempo, poder cortar um "
  "com segurança e sobreviver quando um morre.")

p("Elixir roda sobre uma plataforma criada exatamente para isso, e ela dá de graça o que resolve "
  "o problema central do projeto: um agente em execução vira um processo isolado, com dono, com "
  "quem o mate quando preciso e com quem perceba que ele morreu. Em ambientes onde agentes são "
  "apenas chamadas de função dentro de um laço, nada disso existe sem ser construído à mão. O "
  "custo dessa escolha é um ecossistema de inteligência artificial menor que o de Python — "
  "aceitável, porque a parte pesada aqui é espera de rede, não cálculo.", antes=1)

doc.add_heading("10.  A pilha, camada por camada", level=1)

tabela(["Ferramenta", "Ver.", "Para que serve", "Por que ela"],
       [["*Elixir", "1.19", "Linguagem de todo o sistema", "acesso à plataforma descrita acima"],
        ["*Erlang/OTP", "28", "Base que roda os processos e os supervisiona",
         "é a razão da escolha da linguagem"],
        ["*Mix", "—", "Compila, baixa dependências e roda comandos do projeto",
         "vem junto com a linguagem"],
        ["*Phoenix", "1.8", "Estrutura da aplicação web que serve a tela",
         "padrão do ecossistema, e conversa com a supervisão"],
        ["*LiveView", "1.2", "Atualiza a tela ao vivo, a partir do servidor",
         "evita construir um segundo sistema só para mostrar o que o servidor já sabe"],
        ["*Bandit", "1.5", "Servidor que atende as requisições", "escrito na própria linguagem"],
        ["*Tailwind + daisyUI", "—", "Aparência da tela",
         "componentes prontos; a tela é ferramenta de uso próprio, não produto"],
        ["*PostgreSQL", "18", "Banco de dados com todo o estado do sistema",
         "permite mudar o estado, gravar o relatório e lançar o custo de uma vez só, sem meio-termo"],
        ["*Ecto", "3.13", "Conversa com o banco e controla as mudanças de esquema",
         "camada padrão do ecossistema"],
        ["*Oban", "2.24", "Fila de trabalhos, guardada dentro do próprio banco",
         "enfileirar o trabalho e mudar o estado da tarefa acontecem juntos; fila separada não "
         "permitiria"],
        ["*pgvector", "0.8", "Busca por semelhança de significado",
         "extensão do próprio banco: a memória mora junto do estado, sem um segundo serviço"],
        ["*ExUnit", "—", "Testes automáticos", "vem junto com a linguagem"],
        ["*Credo", "1.7", "Confere estilo e consistência do código",
         "roda em modo estrito, e reprovar nele interrompe a verificação"],
        ["*Dialyzer", "—", "Confere tipos antes de rodar",
         "é uma das formas de mover a regra para o compilador"],
        ["*Req", "0.5", "Conversa pela rede com o fornecedor do modelo",
         "de baixo nível de propósito, para o sistema controlar o reaproveitamento de contexto"],
        ["*Telemetry", "1.0", "Emite os avisos e as medidas de cada execução",
         "a tela lê os mesmos avisos que o motor emite"],
        ["*Git", "—", "Versiona o sistema e cada projeto construído",
         "cada projeto gerado nasce como repositório próprio, com um registro por tarefa"]],
       [2.7, 1.0, 5.5, 8.2], tam=7.6)

doc.add_heading("11.  A verificação, num comando só", level=1)

p("Todo o controle de qualidade fica atrás de um comando. A ordem é a regra: o que falha mais "
  "rápido e mais barato roda primeiro, e o primeiro que falhar interrompe os seguintes. É este "
  "comando que roda em toda verificação — à mão ou quando um agente confere a própria entrega.")

codigo(["mix verificar   # quatro estagios, do mais barato ao mais caro",
        "  1. formatacao do codigo          # segundos",
        "  2. compilacao                    # qualquer aviso reprova",
        "  3. analise de estilo             # modo estrito",
        "  4. testes automaticos            # sem internet, sem cota"])

quebra()

# ================================================================ PARTE V
parte("V", "O cronograma",
      "As 13 etapas, com o que cada uma faz e o que precisa estar pronto no fim dela.",
      cor="14865D")

figura("fig4_cronograma.png",
       "Figura 4 — As 13 etapas. As linhas tracejadas marcam o começo e o fim do desenvolvimento; "
       "o recesso de fim de ano separa a E7 da E8.", 16.6)

p("Cada etapa dura 15 dias e termina com uma entrega concreta. A regra é simples: a etapa "
  "seguinte só começa quando a entrega da anterior está pronta. As etapas E1 a E4 planejam, as E5 "
  "a E11 constroem e as E12 e E13 validam com projetos reais.", antes=2, depois=3)

tabela(["Etapa", "O que será feito", "Entrega da etapa"],
       [["*E1\n04/09 a\n18/09/26",
         "*Requisitos e viabilidade.  Descrever o problema com precisão; levantar o que o sistema "
         "precisa fazer e sob que restrições, definindo para cada item como ele será verificado; "
         "fixar a máquina alvo de 8 GB e 4 núcleos; delimitar o que fica fora do escopo.",
         "Os requisitos R1 a R15 escritos e aprovados. A partir daqui, requisito novo só entra com "
         "registro do motivo."],

        ["*E2\n19/09 a\n03/10/26",
         "*Estado da arte e medida inicial.  Estudar os sistemas parecidos que já existem e "
         "escrever o que este trabalho tem de diferente; medir o protótipo já em uso, extraindo "
         "custo por tarefa, número de tentativas e proporção de tarefas abandonadas.",
         "A medida inicial registrada e congelada. É contra ela que o resultado final será "
         "comparado na E13."],

        ["*E3\n04/10 a\n18/10/26",
         "*Projeto da arquitetura.  Escolher a linguagem e as ferramentas, registrando por que "
         "cada alternativa foi recusada; desenhar as quatro camadas, o caminho da tarefa, os dois "
         "portões e as fronteiras trocáveis; ligar cada regra a um mecanismo concreto.",
         "O desenho da arquitetura aprovado, com as decisões e seus motivos escritos. Decisão "
         "fechada não se reabre sem fato novo."],

        ["*E4\n19/10 a\n02/11/26",
         "*Projeto detalhado e ambiente.  Quebrar o sistema em partes construíveis e escrever as "
         "tarefas de cada uma, com critérios de aceite que são comandos; instalar e testar o "
         "ambiente de trabalho com um roteiro que possa ser repetido em outra máquina.",
         "O ambiente funcionando e a lista de tarefas escrita. É a última etapa antes de "
         "programar."],

        ["*E5\n03/11 a\n17/11/26",
         "*Fundação do sistema.  Criar o projeto já com a barra de qualidade ligada; criar o banco "
         "de dados com projetos, tarefas, ciclos e custos; montar as duas fronteiras com "
         "substitutos de mentira; implementar a contagem de custo em duas unidades e a cópia de "
         "segurança do banco.",
         "*Início do desenvolvimento.  Os testes rodam sem internet, sem cota e sem chave — "
         "provado por um teste que falha de propósito se a chave existir (R12, R10)."],

        ["*E6\n18/11 a\n02/12/26",
         "*O agente e as ferramentas.  Gerar o resumo do projeto que orienta o agente sem que ele "
         "leia o código inteiro; construir as ferramentas de arquivo já com o confinamento por "
         "dentro; a ferramenta de comando com prazo; o agente como processo isolado; o limite de "
         "chamadas por papel.",
         "Um agente resolve uma tarefa real do começo ao fim, e o custo de cada resposta fica "
         "gravado e confere com o total (R11)."],

        ["*E7\n03/12 a\n17/12/26",
         "*Linha de produção de tarefas.  Implementar os seis estados, com cada mudança gravada de "
         "uma vez só; a fila que libera tarefa quando as anteriores terminam; a execução automática "
         "dos critérios de aceite; os dois portões; e a escada de resposta à falha.",
         "Uma tarefa percorre os seis estados, é reprovada de propósito, é refeita e conclui — com "
         "tudo registrado (R1 a R5)."],

        ["*—\n18/12/26 a\n01/01/27", "*Recesso de fim de ano.  Sem atividade planejada.",
         "—"],

        ["*E8\n02/01 a\n16/01/27",
         "*Integração com o fornecedor.  Escrever e guardar o instrumento de medição antes de "
         "usá-lo; medir o que o fornecedor realmente oferece de controle — permissões, pasta de "
         "trabalho, limite de turnos; provar o confinamento em vez de supor. Etapa com folga "
         "reservada para o que a medição revelar.",
         "Trocar de fornecedor não mexe no núcleo: dois encaixes definidos só no teste funcionam "
         "sem alterar uma linha do sistema (R15)."],

        ["*E9\n17/01 a\n31/01/27",
         "*Execução em paralelo.  Montar a supervisão, com um processo por tarefa em andamento; a "
         "fila que grava o trabalho junto com a mudança de estado; o travamento por área de "
         "arquivo; o teto de gasto que impede começar o que não cabe; e a recuperação de trabalho "
         "interrompido.",
         "Três tarefas em paralelo; matar uma no meio não afeta as outras, e ela volta à fila sem "
         "perder o que já foi feito (R6, R13, R14)."],

        ["*E10\n01/02 a\n15/02/27",
         "*Memória do projeto.  Medir espaço, memória e tempo antes de escolher onde o mecanismo "
         "de busca vai rodar; guardar o histórico do projeto conforme ele é escrito; combinar "
         "busca por significado com busca por termo exato; montar o trecho de contexto com a fonte "
         "citada.",
         "Num projeto com histórico, o agente cita a decisão anterior em vez de decidir de novo, e "
         "a citação aponta para a fonte certa (R7, R9)."],

        ["*E11\n16/02 a\n02/03/27",
         "*Painel de acompanhamento.  Conferir o que o banco realmente grava contra o que a tela "
         "pretende mostrar; construir o quadro de tarefas ao vivo, o console do agente e o custo "
         "da rodada; o botão de parar e retomar; e o encadeamento automático de rodadas, com teto "
         "de gasto obrigatório.",
         "*Fim do desenvolvimento.  Um projeto inteiro é acompanhado na tela do pedido à entrega, "
         "com o custo atualizando em tempo real (R8)."],

        ["*E12\n03/03 a\n17/03/27",
         "*Testes com projetos reais.  Escolher de três a cinco projetos que nunca foram usados "
         "durante a construção e executar cada um sem intervenção; testar na máquina de 8 GB "
         "medindo o pico de memória; provocar falhas de propósito — matar agentes, derrubar o "
         "banco, esgotar a cota; anotar cada defeito com a sua causa.",
         "Os projetos rodaram do pedido à entrega, e o comportamento real está documentado — "
         "inclusive onde o sistema falhou."],

        ["*E13\n18/03 a\n01/04/27",
         "*Ajustes finais e entrega.  Corrigir o que a E12 revelou, cada correção com o teste que "
         "impede o problema de voltar; rodar os projetos de teste de novo; comparar o resultado "
         "com a medida inicial da E2 nas mesmas dimensões; escrever o documento de entrega.",
         "*Entrega final.  Um projeto inteiro construído sem intervenção, e o resultado comparado "
         "com a medida inicial, com o número publicado."]],
       [1.8, 9.6, 6.0], tam=7.5)

quebra()

# ================================================================ PARTE VI
parte("VI", "Riscos, entregas e resultado",
      "O que pode dar errado, o que o orientador recebe e como o sucesso será julgado.",
      cor="B52C2C")

doc.add_heading("12.  Riscos e o que fazer com eles", level=1)

tabela(["Risco", "Impacto", "O que está previsto"],
       [["*O fornecedor do modelo não oferecer o controle que o projeto supõe", "alto",
         "a E8 mede antes de decidir, com o instrumento guardado antes de ser usado, e tem folga "
         "para o replanejamento"],
        ["*As tarefas escritas na E4 envelhecerem até serem executadas", "médio",
         "as etapas E7, E9, E10 e E11 começam conferindo o plano contra o código que já existe"],
        ["*O custo de execução passar do previsto", "alto",
         "contagem em duas unidades desde a E5, e teto de gasto por rodada na E9"],
        ["*O limite de cota interromper um trabalho no meio", "médio",
         "reconhecer a parada, guardar o que já foi feito e retomar depois"],
        ["*O mecanismo de busca não caber na máquina de 8 GB", "médio",
         "a E10 mede antes de escolher, e o componente é trocável desde a E5"],
        ["*Atraso acumulado comprimir as etapas finais", "alto",
         "E12 e E13 não são negociáveis; se algo atrasar, o corte sai do escopo da E10 ou da E11"],
        ["*Uma medição depender de acesso pago indisponível", "baixo",
         "cada entrega é dividida em uma parte demonstrável sem custo e outra que exige gasto"]],
       [5.0, 1.6, 10.8], tam=7.8)

doc.add_heading("13.  O que o orientador recebe, e quando", level=1)

tabela(["Data", "Entrega"],
       [["*03/10/2026  ·  fim da E2",
         "Requisitos aprovados, estudo dos sistemas parecidos e a medida inicial do protótipo"],
        ["*02/11/2026  ·  fim da E4",
         "Arquitetura com as decisões justificadas, e a lista de tarefas completa"],
        ["*17/12/2026  ·  fim da E7",
         "Demonstração ao vivo: uma tarefa percorrendo os seis estados, com uma reprovação "
         "provocada"],
        ["*31/01/2027  ·  fim da E9",
         "Demonstração: três tarefas em paralelo, e recuperação de uma falha provocada"],
        ["*02/03/2027  ·  fim da E11",
         "Demonstração: um projeto inteiro acompanhado na tela, do pedido à entrega"],
        ["*01/04/2027  ·  fim da E13",
         "Documento de entrega, com o resultado comparado à medida inicial da E2"]],
       [4.6, 12.8])

doc.add_heading("14.  Como o sucesso será julgado", level=1)

p("O trabalho será bem-sucedido se, ao fim da E13, as quatro afirmações abaixo puderem ser "
  "demonstradas ao vivo — e não apenas descritas.", tam=9.0, cor=CINZA, depois=3)

passos([("1", "Constrói sozinho",
         "Um projeto real é planejado, construído, testado, revisado e entregue sem intervenção "
         "depois do pedido."),
        ("2", "Governa de verdade",
         "Cada regra da seção 2 tem um teste que a prova, incluindo testes que tentam quebrá-la de "
         "propósito e falham."),
        ("3", "Cabe na máquina",
         "Roda nos 8 GB e 4 núcleos do requisito R9, com o pico de memória medido."),
        ("4", "Melhora o medido",
         "O resultado é comparado à medida inicial da E2, com o número publicado — inclusive se "
         "for desfavorável.")])

caixa("O QUE FICA, SE TUDO O MAIS MUDAR",
      "Modelos vão melhorar, ficar mais baratos e mudar de nome. A parte deste trabalho que não "
      "depende disso é a estrutura: tarefas pequenas com estado explícito, dois julgamentos "
      "independentes feitos por quem não construiu, falha limitada com uma tentativa de "
      "redimensionamento antes de desistir, e tudo registrado no instante em que acontece.")

doc.save(DESTINO)
print("gerado:", DESTINO)
