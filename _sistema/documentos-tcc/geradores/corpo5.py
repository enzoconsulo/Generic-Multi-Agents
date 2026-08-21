# ================================================================ CAPA
p("Fábrica de Software Multi-Agente", tam=20, cor=AZUL, negrito=True,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=1, espaco=1.0)
p("Arquitetura de um sistema que constrói software usando agentes de linguagem",
  tam=11, cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=4, espaco=1.0)

reg = doc.add_paragraph()
reg.paragraph_format.space_after = Pt(6)
borda = OxmlElement("w:pBdr")
bot = OxmlElement("w:bottom")
bot.set(qn("w:val"), "single")
bot.set(qn("w:sz"), "12")
bot.set(qn("w:color"), "2A78D6")
borda.append(bot)
reg._p.get_or_add_pPr().append(borda)

p("Trabalho de Conclusão de Curso   ·   Enzo Consulo   ·   agosto de 2026", tam=8.8,
  cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=6)

caixa("O QUE ESTE DOCUMENTO APRESENTA",
      "A arquitetura de um sistema que recebe a descrição de um projeto em linguagem natural e o "
      "constrói de ponta a ponta, coordenando agentes especializados que planejam, implementam, "
      "verificam, revisam e documentam — com intervenção humana apenas no pedido inicial. O texto "
      "parte do vocabulário mínimo, explica por que a linguagem escolhida é o Elixir, detalha as "
      "ferramentas envolvidas e termina no plano de execução. Um protótipo desta arquitetura já foi "
      "construído e rodou projetos reais; o que se descreve aqui é o sistema em si, e cada seção "
      "pode ser lida sem conhecimento prévio dele.")

# ================================================================ 1
doc.add_heading("1.  O problema", level=1)

p("Um modelo de linguagem escreve código bem quando o pedido é curto e tudo o que ele precisa saber "
  "cabe numa conversa. Pedir “construa este sistema” é outra coisa: o trabalho dura horas, atravessa "
  "dezenas de arquivos e depende de decisões tomadas no começo que ainda precisam valer no fim. É "
  "nesse regime que ele falha — e as falhas não são de escrita, são de processo.")

marcador("Perda de contexto. ", "A conversa cresce, o começo sai de vista, e o modelo passa a "
         "contradizer o que ele mesmo decidiu.")
marcador("Decisão sem rastro. ", "O porquê de uma escolha ficou no meio do diálogo; quando a "
         "sessão termina, some com ela.")
marcador("Autoaprovação. ", "Quem escreveu o código é quem afirma que ele está pronto — e "
         "raramente se reprova.")
marcador("Tentativa sem limite. ", "Um ponto difícil consome tentativa após tentativa e trava "
         "tudo o que vinha atrás.")

p("A proposta deste trabalho é tratar a construção de software como uma linha de produção: dividir "
  "o pedido em tarefas pequenas e nomeadas, dar a cada uma um estado explícito, e passar cada "
  "entrega por revisores que não a construíram. O modelo continua sendo o operário; o sistema "
  "decide o que ele faz, quando, e com que autoridade.", antes=2)

figura("fig1-fluxo.png", "Figura 1 — Do pedido à entrega. A única intervenção humana obrigatória é "
       "a primeira caixa; daí em diante o sistema decide sozinho.")

passos([
    ("1", "Pedido", "O usuário descreve o que quer, uma vez, em linguagem natural."),
    ("2", "Planejamento", "Um agente gera a especificação, um plano em fases e de 8 a 20 tarefas "
                          "com dependências."),
    ("3", "Construção", "Cada tarefa é implementada por um agente especialista naquela área."),
    ("4", "Dois portões", "Um verifica se funciona; outro revisa se é o que foi pedido. Nenhum "
                          "dos dois pode corrigir."),
    ("5", "Entrega", "Tarefa concluída vira um commit próprio, e o sistema segue para a próxima."),
])

# ================================================================ 2
doc.add_heading("2.  O vocabulário mínimo", level=1)

p("Seis termos sustentam todo o restante do documento. Os três últimos são os que decidem o custo "
  "do sistema, e por isso reaparecem na seção 8.", depois=3)

tabela(["Termo", "O que significa aqui"],
       [["*Modelo de linguagem",
         "o operário: recebe texto e devolve texto ou pedidos de ação; não lembra de nada entre "
         "uma execução e outra"],
        ["*Ferramenta",
         "uma ação que o modelo pode pedir para ser executada: ler um arquivo, rodar um teste, "
         "escrever código"],
        ["*Agente",
         "um papel — o texto que define o que ele faz, as ferramentas que ele pode usar e o "
         "modelo que o executa"],
        ["*Laço de tool use",
         "o ciclo pergunta → pedido de ferramenta → resposta, repetido até o modelo dizer que "
         "terminou"],
        ["*Contexto",
         "tudo o que vai numa requisição ao modelo; é reenviado por inteiro a cada volta do laço"],
        ["*Token",
         "a unidade em que o modelo é cobrado, tanto no que entra quanto no que sai"]],
       [3.4, 14.0])

figura("fig13-agente.png", "Figura 2 — A anatomia de um agente. Trocar o texto do papel troca o "
       "comportamento; retirar uma ferramenta retira a capacidade.", largura=13.6)

rico([("Os papéis acima são genéricos — quem planeja, quem constrói, quem verifica, quem revisa — e "
       "servem a qualquer projeto. Há ainda um segundo tipo de agente, e ele é provavelmente a peça "
       "mais característica do sistema: ", False),
      ("ao planejar, o sistema sintetiza do próprio pedido de dois a cinco especialistas", True),
      (" — um para o banco de dados, outro para a interface, outro para as regras de negócio —, "
       "cada um com o seu domínio, seus arquivos e as decisões que ele não pode reinventar. Cada "
       "tarefa nasce apontando para o especialista da área que ela toca, de modo que a execução é "
       "guiada desde o início, e não improvisada no momento em que o trabalho começa.", False)])

# ================================================================ 3
doc.add_heading("3.  Como um agente trabalha", level=1)

p("Um agente em execução é um laço. Ele monta a requisição, chama a API do modelo e olha o motivo "
  "da parada: se o modelo pediu ferramentas, o sistema as executa e devolve os resultados; se ele "
  "terminou, o laço acaba. Cada volta é uma requisição paga — e, como o contexto é reenviado "
  "inteiro, uma volta tardia custa mais que uma volta inicial.")

figura("fig4-laco.png", "Figura 3 — O laço de tool use. Os resultados voltam sempre numa única "
       "mensagem, e as ferramentas pedidas na mesma volta são executadas em paralelo.",
       largura=13.6)

rico([("Daí uma propriedade que orienta o desenho inteiro: ", False),
      ("o custo não é proporcional ao tamanho do código, e sim ao número de idas ao modelo", True),
      (". Um agente que resolve a tarefa em oito voltas custa muito menos que um que leva "
       "vinte — mesmo escrevendo o mesmo arquivo no fim. É por isso que o sistema investe em dar "
       "ao agente um bom ponto de partida, em vez de deixá-lo descobrir o projeto sozinho.", False)])

# ================================================================ 4
doc.add_heading("4.  Por que Elixir", level=1)

p("O gargalo deste sistema não é cálculo: é espera. Cada agente passa a maior parte do tempo "
  "aguardando a resposta de um serviço remoto que pode demorar minutos, falhar no meio ou ser "
  "cortado por estourar um teto de gasto. A linguagem precisa, então, manter dezenas desses "
  "trabalhos em voo ao mesmo tempo, isolar a falha de cada um e permitir encerrar qualquer um "
  "deles com segurança.")

figura("fig14-beam.png", "Figura 4 — A BEAM é a máquina virtual sobre a qual o Elixir roda. O "
       "isolamento entre processos é a propriedade que o sistema aproveita, e não um detalhe de "
       "implementação.", largura=13.8)

tabela(["O que o sistema exige", "O que a BEAM entrega"],
       [["dezenas de trabalhos lentos ao mesmo tempo",
         "processos leves: manter milhares deles é rotina"],
        ["a falha de um trabalho não pode derrubar os outros",
         "isolamento de memória: cada processo cai sozinho"],
        ["alguém precisa perceber a falha e reagir",
         "supervisor: reinicia ou devolve a tarefa à fila, sem ninguém pedir"],
        ["cortar um trabalho no meio, com segurança",
         "encerrar um processo é operação normal, não recurso de emergência"],
        ["acompanhar tudo ao vivo numa tela",
         "o painel roda no mesmo runtime, sem uma segunda aplicação"]],
       [7.6, 9.8])

caixa("O QUE A ESCOLHA NÃO RESOLVE",
      "Elixir não torna o modelo mais barato: o preço por token é do provedor, e nenhuma árvore de "
      "supervisão muda isso. E o ecossistema de inteligência artificial da linguagem é menor que o "
      "de Python — o que aqui pesa pouco, porque a parte pesada do sistema é espera de rede, e a "
      "única etapa realmente numérica (transformar texto em vetores) tem biblioteca madura, "
      "descrita na seção 5.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

# ================================================================ 5
doc.add_heading("5.  As ferramentas, e o papel de cada uma", level=1)

p("O sistema se organiza em cinco camadas, e cada uma só conhece a imediatamente abaixo: quem "
  "dispara não sabe qual agente vai rodar; quem decide a ordem não escreve código; quem escreve "
  "código não decide o que vem depois dele.")

figura("fig3-camadas.png", "Figura 5 — As cinco camadas e a tecnologia de cada uma. A camada de "
       "estado, no rodapé, é a única fonte de verdade: tudo acima dela pode ser reiniciado sem "
       "perda.", largura=14.0)

tabela(["Ferramenta", "O que é", "O que faz nesta aplicação"],
       [["*Elixir / BEAM", "linguagem funcional e a máquina virtual que a executa",
         "roda tudo; cada agente em voo é um processo dela"],
        ["*OTP", "biblioteca de processos supervisionados que vem com a linguagem",
         "dá o supervisor, o registro de processos e o teto de vida de cada agente"],
        ["*Phoenix / LiveView", "framework web em que a tela é atualizada pelo servidor",
         "o painel: quadro de tarefas e console ao vivo, sem escrever JavaScript"],
        ["*PostgreSQL / Ecto", "banco relacional e a biblioteca que fala com ele",
         "guarda tarefas, ciclos, custos e decisões; cada transição é uma transação"],
        ["*Oban", "fila de trabalhos que vive dentro do próprio banco",
         "enfileira o que precisa ser feito e devolve o que foi interrompido"],
        ["*Req", "cliente HTTP",
         "conversa com a API do modelo, com controle total do corpo da requisição"],
        ["*Nx / Bumblebee", "computação numérica e modelos prontos rodando no próprio computador",
         "transforma texto em vetores, em lote, sem chamar serviço pago"],
        ["*pgvector", "extensão do PostgreSQL que guarda e compara vetores",
         "a busca por significado no histórico do projeto (seção 9)"],
        ["*ExUnit / Mox", "biblioteca de testes e de dublês",
         "a suíte roda contra um cliente falso da API: sem rede e sem custo"]],
       [3.2, 6.4, 7.8])

p("Quatro dessas escolhas merecem justificativa, porque a alternativa óbvia seria outra:", antes=2,
  depois=2)

marcador("Oban, e não uma fila em memória. ", "Um trabalho em memória some quando o programa "
         "reinicia. Como a fila vive no mesmo banco das tarefas, enfileirar e mudar o estado da "
         "tarefa acontecem na mesma transação — ou os dois valem, ou nenhum vale.")
marcador("Req, e não uma biblioteca pronta de agentes. ", "O sistema precisa decidir, requisição "
         "a requisição, quais trechos do texto podem ser reaproveitados pelo provedor (seção 8). "
         "Camadas de conveniência costumam esconder exatamente esse controle.")
marcador("Bumblebee local, e não um serviço de embeddings. ", "A transformação de texto em vetores "
         "acontece a cada commit, sobre o projeto inteiro. Rodando no próprio computador, é "
         "trabalho de processador; contratada por chamada, seria custo recorrente — e mandaria o "
         "código do projeto para fora.")
marcador("Cliente falso da API nos testes. ", "Se a suíte chamar o modelo de verdade, cada "
         "execução custa dinheiro e depende da rede. Uma suíte assim deixa de ser executada, e um "
         "sistema sem suíte executada não tem como ser mudado com segurança.")

# ================================================================ 6
doc.add_heading("6.  A arquitetura em execução", level=1)

p("Com o vocabulário e as ferramentas no lugar, a arquitetura pode ser descrita em uma frase: cada "
  "tarefa em voo é um processo supervisionado, e o estado dela não vive dentro desse processo — "
  "vive no banco. O processo pode morrer a qualquer instante sem que nada se perca.")

figura("fig2-supervisao.png", "Figura 6 — A árvore de supervisão da aplicação. Cada caixa da faixa "
       "inferior é uma tarefa sendo trabalhada neste instante; a faixa verde lista o que a "
       "estrutura garante sem depender de disciplina de ninguém.", largura=14.0)

codigo([
    "def handle_info(:trabalhar, estado) do",
    "  case Fabrica.Claude.mensagens(estado.corpo) do",
    "    {:ok, %{stop_reason: \"tool_use\"} = r} ->",
    "      # as ferramentas pedidas na mesma volta sao independentes: rodam em paralelo",
    "      resultados =",
    "        r.content",
    "        |> Enum.filter(&(&1.type == \"tool_use\"))",
    "        |> Task.async_stream(&Ferramentas.executar(&1, estado.confinamento),",
    "             max_concurrency: 4, timeout: :timer.minutes(2), on_timeout: :kill_task)",
    "        |> Enum.map(&resultado_ou_erro/1)",
    "",
    "      estado",
    "      |> anexar_turno(r.content, resultados)   # TODOS os resultados num turno so",
    "      |> contabilizar(r.usage)                 # custo e tokens gravados por volta",
    "      |> continuar_ou_parar()                  # teto de voltas e de gasto",
    "",
    "    {:ok, %{stop_reason: \"end_turn\"} = r} ->",
    "      {:stop, :normal, finalizar(estado, r)}",
    "  end",
    "end",
], "O laço da figura 3, escrito como um processo do Elixir. O que não aparece aqui — teto de "
   "voltas, teto de gasto, prazo e reinício — não é pedido ao modelo: é responsabilidade do "
   "supervisor.")

# ================================================================ 7
doc.add_heading("7.  O ciclo de uma tarefa", level=1)

figura("fig6-estados.png", "Figura 7 — Os seis estados de uma tarefa. As duas setas vermelhas de "
       "volta são os portões reprovando. Esgotados os três ciclos, há duas saídas — e a primeira "
       "não é desistir: a tarefa é quebrada em menores e volta para a fila.", largura=13.8)

rico([("Quem verifica pergunta “funciona?”", True),
      (" e executa literalmente cada critério de aceite, registrando a evidência. Por isso os "
       "critérios são escritos como comando mais resultado esperado, nunca como frase avaliativa.",
       False)], depois=2)
rico([("Quem revisa pergunta “é o que foi pedido, e está correto?”", True),
      (" — duas checagens distintas. E aqui está o ponto sutil do desenho: ", False),
      ("uma entrega pode passar em todos os critérios, não ter defeito nenhum e ainda assim não "
       "ser a tarefa", True),
      (". Critério mal escrito não é licença para entregar outra coisa.", False)])

p("Reprovar não é o fim da linha. O sistema responde ao fracasso em degraus, e cada degrau só é "
  "usado depois que o anterior falhou de verdade — o gatilho é sempre um fato registrado, nunca um "
  "palpite sobre dificuldade:", antes=2, depois=2)

marcador("1ª reprovação — sobe de modelo. ", "A tarefa volta ao construtor, agora executada por um "
         "modelo mais capaz. Insistir no mesmo modelo depois de uma reprovação paga o ciclo inteiro "
         "de novo e queima uma das três tentativas.")
marcador("2ª reprovação sob o mesmo especialista — troca de especialista. ", "Ele foi escolhido no "
         "planejamento, antes de se saber onde a tarefa iria falhar; repetir é apostar duas vezes "
         "no mesmo palpite.")
marcador("3 ciclos esgotados — replanejamento. ", "O planejador reexamina a tarefa e a quebra em "
         "duas ou três menores, que entram na fila como tarefas novas. A original é cancelada, com "
         "referência às substitutas. É o reconhecimento de que o problema pode não ser de execução, "
         "e sim de dimensionamento.")
marcador("Esgotou de novo — aí sim bloqueia. ", "Uma tarefa que já nasceu de replanejamento e falha "
         "outra vez é reportada ao usuário. O sistema não replaneja um replanejamento: se o problema "
         "resistiu a duas leituras diferentes, ele precisa de uma decisão humana.")

rico([("Toda transição é uma transação", True),
      (": novo estado, relatório da etapa e custo entram juntos, ou não entram. É isso que permite "
       "perguntar depois quanto custou cada ciclo separadamente.", False)], antes=2)

p("A mesma estrutura constrói apresentações, documentos e análises. O que separa os dois casos não "
  "é “é código?”, e sim como se prova que ficou pronto: em software a prova vem de graça — o "
  "programa roda e passa ou quebra. Fora dele, a primeira tarefa passa a ser instalar um "
  "verificador, e cada critério é rotulado conforme o grau de prova que sustentou: executado por "
  "comando, inspecionado por script ou julgado contra itens objetivos.")

# ================================================================ 8
doc.add_heading("8.  O custo, e como ele é controlado", level=1)

p("Como cada volta do laço reenvia o contexto inteiro, o gasto cresce com o número de voltas "
  "multiplicado pelo tamanho do que elas carregam. A alavanca principal vem de um recurso do "
  "provedor: trechos do início da requisição podem ser guardados já processados e reaproveitados "
  "nas requisições seguintes, por um décimo do preço. Para isso, o texto precisa ser montado do "
  "mais estável para o mais volátil.")

figura("fig5-cache.png", "Figura 8 — A ordem dos blocos é a ordem em que o provedor monta a "
       "requisição, e é ela que determina o que pode ser reaproveitado.", largura=14.0)

tabela(["Alavanca de custo", "Efeito"],
       [["Prefixo estável e reaproveitado", "o trecho repetido cai para um décimo do preço"],
        ["Contexto conforme o papel", "o revisor recebe o diff, não o código inteiro"],
        ["Critérios executáveis rodados antes", "o que falha volta sem gastar um agente"],
        ["Modelo conforme o papel", "verificar é mecânico e usa o modelo mais barato"],
        ["Trabalho em lote", "metade do preço quando não há pressa pela resposta"]],
       [6.2, 11.2])

caixa("A ARMADILHA QUE ANULA ISTO, EM SILÊNCIO",
      "O reaproveitamento exige que o trecho estável seja idêntico byte a byte entre uma requisição "
      "e outra. Uma data, um contador ou um código de commit dentro dele invalida tudo o que vem "
      "depois — sem erro e sem aviso, apenas com a economia que não acontece. Por isso o sistema "
      "traz um teste que monta o prefixo duas vezes e falha se os bytes divergirem.",
      cor="E34948", fundo="FDEDED", cor_titulo=VERMELHO)

# ================================================================ 9
doc.add_heading("9.  A memória do projeto", level=1)

rico([("Um agente começa sempre sem memória do que houve antes, e o sistema resolve isso em duas "
       "camadas. A primeira é um índice gerado por script, sem custo de modelo, que responde ", False),
      ("“o que existe e como se chama”", True),
      (" — a árvore de arquivos com a assinatura de cada função pública. A segunda responde a "
       "pergunta que mais desperdiça trabalho numa fábrica: ", False),
      ("“isto já foi resolvido aqui, e o que foi decidido na época?”", True),
      (". Essa não se responde por nome de função, e sim por significado — e é para ela que "
       "existem os vetores.", False)])

figura("fig7-rag.png", "Figura 9 — A indexação roda ao commitar, fora do caminho quente; a consulta "
       "roda no início do trabalho, antes de gastar a primeira volta de modelo. O material indexado "
       "não é o código: é a história do projeto.", largura=13.8)

caixa("QUANDO NÃO USAR",
      "Busca por significado é aproximada e devolve trechos, não verdades. Ela não substitui o "
      "índice gerado, que é exato e grátis, nem responde o que uma consulta comum responde melhor: "
      "“quais tarefas estão bloqueadas” é uma consulta ao banco, não uma pergunta em linguagem "
      "natural. Ela entra quando a pergunta é sobre precedente e o vocabulário exato é desconhecido.",
      cor="1BAF7A", fundo="E7F7F1", cor_titulo=VERDE)

# ================================================================ 10
doc.add_heading("10.  Plano de execução, escopo e limites", level=1)

figura("fig12-fases.png", "Figura 10 — As seis fases e os marcos que as encerram. O marco é sempre "
       "um comportamento observável, nunca um percentual de conclusão.", largura=14.0)

p("A ordem não é arbitrária: cada fase entrega algo verificável e destrava a seguinte. A primeira é "
  "a que dá vontade de pular, e é a mais importante — é ela que torna todas as outras testáveis.",
  depois=3)

tabela(["Dentro do escopo", "Fora do escopo, e por quê"],
       [["Planejar, construir, verificar, revisar e documentar projetos",
         "publicar em produção: custo externo e credencial de terceiros"],
        ["Execução num só computador, com concorrência e supervisão",
         "distribuir em vários: o gargalo é a espera pelo modelo"],
        ["Índice semântico do histórico, com avaliação das buscas",
         "treinar modelos: destruiria a independência de fornecedor"],
        ["Painel local para acompanhar e disparar o trabalho",
         "vários usuários e autenticação: é ferramenta de um operador"]],
       [8.7, 8.7])

doc.add_heading("Limites conhecidos do desenho", level=2)

tabela(["Limite", "Como o desenho responde"],
       [["O ganho de reaproveitamento pode não se confirmar",
         "teste que monta o prefixo duas vezes e compara byte a byte"],
        ["A busca por significado pode trazer trecho inútil",
         "conjunto de perguntas com resposta conhecida, medido a cada mudança"],
        ["Uma só árvore de arquivos por projeto",
         "as áreas que cada tarefa declara viram exclusão mútua verificada pelo sistema"],
        ["O portão do meio é frágil fora de software",
         "grau de prova obrigatório, com a proporção visível no painel"]],
       [6.2, 11.2])

rico([("O que o trabalho pretende demonstrar: ", True),
      ("que a diferença entre um assistente de programação e uma linha de produção está inteiramente "
       "na camada de governança — papéis com autoridade explícita, estado transacional, portões "
       "operados por quem não construiu e falha limitada por desenho. Nada disso depende de um "
       "modelo específico ou de um fornecedor.", False)])

doc.save(DESTINO)
print("gerado:", DESTINO)
