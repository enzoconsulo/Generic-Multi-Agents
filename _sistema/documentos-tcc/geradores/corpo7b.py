# ================================================================ PARTE IV
parte("IV", "A plataforma",
      "Por que Elixir, quais ferramentas compõem o sistema, o que cada uma faz aqui e como tudo "
      "isso se organiza em execução.", cor="1BAF7A")

doc.add_heading("11.  Por que Elixir", level=1)

p("A escolha de linguagem não é preferência estética: é resposta a uma lista de exigências que o "
  "problema impõe. E a primeira coisa a notar é que ", depois=2)

rico([("o gargalo deste sistema não é cálculo — é espera", True),
      (". Cada agente passa a maior parte do tempo aguardando a resposta de um serviço remoto que "
       "pode demorar minutos, falhar no meio ou precisar ser interrompido por estourar um teto de "
       "gasto. Não há conta pesada a fazer localmente; há muitos trabalhos lentos para manter em "
       "pé ao mesmo tempo.", False)])

figura("fig14-beam.png", "Figura 8 — A BEAM é a máquina virtual sobre a qual o Elixir roda. O "
       "isolamento entre processos é a propriedade que este sistema aproveita, e não um detalhe de "
       "implementação.", largura=13.8)

p("A figura mostra a diferença que decide a escolha. Numa aplicação sem isolamento, os trabalhos "
  "dividem o mesmo processo do sistema operacional: um erro não tratado em qualquer um deles "
  "derruba todos. Na BEAM, cada trabalho é um processo próprio — e “processo” aqui não é o do "
  "sistema operacional: pesa poucos quilobytes, e manter milhares deles é rotina.", antes=2,
  depois=3)

tabela(["O que o sistema exige", "O que a BEAM entrega"],
       [["dezenas de trabalhos lentos ao mesmo tempo",
         "processos leves: manter milhares deles é rotina, não façanha"],
        ["a falha de um trabalho não pode derrubar os outros",
         "isolamento de memória: cada processo cai sozinho"],
        ["alguém precisa perceber a falha e reagir",
         "supervisor: reinicia ou devolve a tarefa à fila, sem ninguém pedir"],
        ["cortar um trabalho no meio, com segurança",
         "encerrar um processo é operação normal, não recurso de emergência"],
        ["acompanhar tudo ao vivo numa tela",
         "o painel roda no mesmo ambiente, sem uma segunda aplicação"]],
       [7.6, 9.8])

rico([("O argumento decisivo é um mapeamento, não um desempenho: ", False),
      ("agente vira processo supervisionado", True),
      (". Um agente deixa de ser uma execução solta que ninguém vigia e passa a ter identificador, "
       "dono, alguém que pode encerrá-lo e — o que mais importa — alguém que percebe quando ele "
       "morre. Regras que antes precisavam ser pedidas por escrito passam a ser propriedades da "
       "estrutura.", False)], antes=2)

caixa("O QUE A ESCOLHA NÃO RESOLVE",
      "Elixir não torna o modelo mais barato: o preço por token é do provedor, e nenhuma árvore de "
      "supervisão muda isso. E o ecossistema de inteligência artificial da linguagem é menor que o "
      "de Python — o que aqui pesa pouco, porque a parte pesada do sistema é espera de rede, e a "
      "única etapa realmente numérica (transformar texto em vetores) tem biblioteca madura, "
      "descrita na próxima seção. Dizer o contrário seria vender a escolha por mais do que ela vale.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

doc.add_heading("12.  As ferramentas, e o papel de cada uma", level=1)

p("O sistema se organiza em cinco camadas, e a regra que as separa é simples: cada uma só conhece a "
  "imediatamente abaixo. Quem dispara não sabe qual agente vai rodar; quem decide a ordem não "
  "escreve código; quem escreve código não decide o que vem depois dele.")

figura("fig3-camadas.png", "Figura 9 — As cinco camadas e a tecnologia de cada uma. A camada de "
       "estado, no rodapé, é a única fonte de verdade: tudo acima dela pode ser reiniciado do zero "
       "sem perda.", largura=14.0)

tabela(["Ferramenta", "O que é", "O que faz nesta aplicação"],
       [["*Elixir / BEAM", "linguagem funcional e a máquina virtual que a executa",
         "roda tudo; cada agente em voo é um processo dela"],
        ["*OTP", "biblioteca de processos supervisionados que vem junto com a linguagem",
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
         "a busca por significado no histórico do projeto (Parte VI)"],
        ["*ExUnit / Mox", "biblioteca de testes e de dublês",
         "a suíte roda contra um cliente falso da API: sem rede e sem custo"]],
       [3.2, 6.4, 7.8])

doc.add_heading("As quatro escolhas que precisam de justificativa", level=2)

p("Nas outras, a alternativa óbvia é a mesma que foi escolhida. Nestas quatro, não — e por isso "
  "vale dizer o motivo.", depois=2)

marcador("Oban, e não uma fila em memória. ", "Um trabalho guardado em memória some quando o "
         "programa reinicia. Como a fila vive no mesmo banco das tarefas, enfileirar um trabalho e "
         "mudar o estado da tarefa acontecem na mesma transação: ou os dois valem, ou nenhum vale. "
         "É o que impede o estado clássico “a tarefa consta como em execução, mas ninguém está "
         "executando”.")
marcador("Req, e não uma biblioteca pronta de agentes. ", "Existem bibliotecas de alto nível para "
         "conversar com modelos, inclusive em Elixir. O núcleo não as usa porque precisa decidir, "
         "requisição a requisição, exatamente quais trechos do texto podem ser reaproveitados pelo "
         "provedor — o assunto da Parte V. Camadas de conveniência costumam esconder justamente "
         "esse controle, e sem ele a maior economia do desenho fica inacessível.")
marcador("Bumblebee local, e não um serviço de embeddings. ", "A transformação de texto em vetores "
         "acontece a cada commit, sobre a história inteira do projeto. Rodando no próprio "
         "computador, é trabalho de processador — que sobra. Contratada por chamada, seria custo "
         "recorrente, e mandaria o conteúdo do projeto para fora.")
marcador("Cliente falso da API nos testes. ", "Se a suíte chamar o modelo de verdade, cada execução "
         "custa dinheiro e depende da rede. Uma suíte assim deixa de ser executada — e um sistema "
         "sem suíte executada não tem como ser mudado com segurança. Por isso o dublê é entregue na "
         "primeira fase do projeto, e não depois.")

doc.add_heading("13.  A arquitetura em execução", level=1)

p("Com o vocabulário e as ferramentas no lugar, a arquitetura cabe em uma frase: cada tarefa em voo "
  "é um processo supervisionado, e o estado dela não vive dentro desse processo — vive no banco. O "
  "processo pode morrer a qualquer instante sem que nada se perca.")

figura("fig2-supervisao.png", "Figura 10 — A árvore de supervisão da aplicação. Cada caixa da faixa "
       "inferior é uma tarefa sendo trabalhada neste instante; a faixa verde lista o que a "
       "estrutura garante sem depender de disciplina de ninguém.", largura=14.0)

p("O laço da figura 3 — o de tool use — é o que roda dentro de cada uma daquelas caixas da faixa "
  "inferior. Escrito como um processo do Elixir, ele fica assim:", antes=2, depois=2)

codigo([
    "def handle_info(:trabalhar, estado) do",
    "  case Fabrica.Claude.mensagens(estado.corpo) do",
    "    {:ok, %{stop_reason: \"tool_use\"} = r} ->",
    "      # as ferramentas pedidas na mesma volta sao independentes: rodam em paralelo,",
    "      # cada uma no seu proprio processo, com prazo proprio",
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
], "O núcleo do sistema. Repare no que NÃO está aqui: teto de voltas, teto de gasto, prazo e "
   "reinício não são pedidos ao modelo — são responsabilidade do supervisor e do estado do "
   "processo. O agente não tem como ignorá-los.")

doc.add_heading("14.  O que o sistema grava", level=1)

p("O estado precisa sobreviver a tudo: à queda de um agente, ao fim de uma sessão, ao reinício da "
  "máquina. E precisa responder perguntas que ninguém quer responder relendo conversa.")

figura("fig17-banco.png", "Figura 11 — As tabelas principais. Cada linha nasce dentro de uma "
       "transação: ou entra tudo, ou não entra nada.", largura=14.0)

p("Duas escolhas de modelagem merecem destaque, porque não são óbvias:", antes=2, depois=2)

marcador("Ciclos são linhas novas, não sobrescritas. ", "Quando uma tarefa é retrabalhada, o ciclo "
         "anterior continua no banco. Isso permite perguntar depois quanto custou cada ciclo "
         "separadamente — e foi assim que se descobriu, na prática, que o custo de uma tarefa "
         "difícil está concentrado no retrabalho, não na primeira tentativa.")
marcador("Custo é gravado por execução, não por tarefa. ", "Cada volta do laço registra modelo, "
         "tokens de entrada, tokens guardados, tokens reaproveitados, tokens de saída, custo e "
         "duração. Um total por tarefa é uma soma; o contrário — descobrir o detalhe a partir do "
         "total — seria impossível.")

doc.add_heading("15.  Concorrência: três tarefas ao mesmo tempo", level=1)

p("Com processos isolados e estado no banco, rodar várias tarefas em paralelo deixa de ser "
  "arriscado. O limite não é técnico, é de segurança do trabalho: duas tarefas do mesmo projeto só "
  "rodam juntas se as áreas que elas declaram tocar não se cruzarem.")

figura("fig9-paralelismo.png", "Figura 12 — Três tarefas independentes rodando ao mesmo tempo, cada "
       "uma no seu processo e no seu próprio ritmo. A faixa azul registra uma trava que o "
       "paralelismo ingênuo ignora — e que é explicada na próxima parte.", largura=13.8)

caixa("UMA REGRA DE PARALELISMO QUE PARECE DETALHE E NÃO É",
      "Quem verifica precisa de projeto quieto: nunca se roda a bateria completa de testes enquanto "
      "outro agente edita a mesma árvore de arquivos. O motivo é econômico, não estético — uma "
      "reprovação falsa por interferência queima um ciclo inteiro de três, e faz o sistema "
      "responder ao fracasso com um modelo mais caro para consertar um problema que não existia.")

quebra()

# ================================================================ PARTE V
parte("V", "A economia do sistema",
      "Onde o dinheiro é realmente gasto, por que a intuição erra aqui, e as cinco alavancas que o "
      "desenho usa.", cor="C24E1E")

doc.add_heading("16.  Como o dinheiro é gasto", level=1)

p("Três fatos encadeados explicam o custo — e o terceiro é o que dá a alavanca.", depois=2)

marcador("A API não tem memória. ", "Cada requisição é independente. Se o agente já trocou dez "
         "mensagens, a décima primeira precisa reenviar as dez anteriores inteiras — senão o modelo "
         "não sabe do que se trata.")
marcador("Logo, o texto de abertura é recobrado em toda volta. ", "As instruções permanentes e o "
         "índice do projeto vão junto sempre. Num despacho de quinze voltas, paga-se quinze vezes "
         "pelo mesmo texto, sem que ele tenha mudado uma vírgula.")
marcador("O provedor deixa guardar esse começo. ", "Se a requisição seguinte começar com exatamente "
         "os mesmos caracteres, ele reaproveita o que já processou e cobra cerca de um décimo por "
         "aquele trecho.")

p("Para que o terceiro fato seja aproveitável, a requisição precisa ser montada em uma ordem "
  "específica: do conteúdo que nunca muda para o que muda sempre.", antes=2)

figura("fig5-cache-v6.png", "Figura 13 — Os quatro primeiros blocos podem ser guardados e "
       "reaproveitados; o último, não, porque muda a cada volta. Um caractere alterado num bloco "
       "invalida todos os que vêm depois dele.", largura=14.0)

caixa("A CONTA, EM NÚMEROS REDONDOS",
      "Suponha uma abertura fixa de 20 mil tokens (as instruções mais o índice do projeto) e um "
      "despacho de quinze voltas. Sem reaproveitamento, são 15 × 20 mil = 300 mil tokens cobrados a "
      "preço cheio. Com reaproveitamento: 20 mil pagos uma vez com 25% de acréscimo, mais catorze "
      "voltas a um décimo do preço — o equivalente a cerca de 53 mil. Aproximadamente um sexto da "
      "conta, pelo mesmo trabalho e sem nenhuma perda de qualidade.")

doc.add_heading("17.  As cinco alavancas", level=1)

tabela(["Alavanca de custo", "O que é", "Efeito"],
       [["*Começo da requisição sempre igual",
         "instruções, ferramentas e índice do projeto idênticos entre despachos",
         "o trecho repetido cai para um décimo do preço"],
        ["*Cada papel recebe só o que usa",
         "quem constrói leva os arquivos da tarefa; quem revisa leva só as mudanças",
         "contexto não usado é pior que ausente: é relido a cada volta"],
        ["*Checagens por comando antes do modelo",
         "os critérios que são comando executável rodam de graça, antes do despacho",
         "o que falha volta sem pagar um agente para confirmar o óbvio"],
        ["*Modelo conforme o papel",
         "verificar é mecânico e usa o modelo barato; retrabalho sobe de modelo",
         "a diferença entre as faixas é de cinco vezes no preço de entrada"],
        ["*Trabalho em lote",
         "reindexação e documentação não precisam de resposta imediata",
         "a via assíncrona do provedor cobra metade pelo mesmo trabalho"]],
       [4.0, 6.7, 6.7])

caixa("A ARMADILHA QUE ANULA TUDO ISTO, EM SILÊNCIO",
      "O reaproveitamento exige que o começo da requisição seja idêntico caractere por caractere de "
      "uma vez para a outra. Uma data, um contador ou um número de commit dentro dele invalida tudo "
      "o que vem depois — sem erro e sem aviso, apenas com a economia que não acontece. Por isso o "
      "sistema traz um teste que monta esse começo duas vezes, em momentos diferentes, e falha se "
      "os dois resultados divergirem.",
      cor="E34948", fundo="FDEDED", cor_titulo=VERMELHO)

doc.add_heading("18.  O contexto que cada papel recebe", level=1)

p("A segunda alavanca merece uma seção própria, porque é a que mais contraria a intuição. O "
  "impulso natural é dar a cada agente o máximo de informação possível — afinal, informação a mais "
  "não atrapalha. Aqui atrapalha, e o motivo é o laço.")

figura("fig20-contexto.png", "Figura 14 — O mesmo começo para todos, e depois só o que cada papel "
       "usa de fato.", largura=13.8)

rico([("Um arquivo que o revisor nunca vai abrir não é um desperdício de uma vez: ", False),
      ("é um desperdício multiplicado pelo número de voltas daquele despacho", True),
      (". Como o revisor julga o que mudou, ele recebe as mudanças e não o código inteiro; como "
       "quem verifica precisa rodar comandos, ele recebe os critérios e o resultado da passada "
       "mecânica já pronto. A informação que sobra em um papel é justamente a que falta em outro.",
       False)])

quebra()

# ================================================================ PARTE VI
parte("VI", "A memória do projeto",
      "Como um agente que começa sem saber nada descobre o que já existe — e o que já foi decidido, "
      "meses atrás.", cor="4A3AA7")

doc.add_heading("19.  O problema de começar do zero", level=1)

p("Todo agente começa sem memória do que houve antes. Isso é uma propriedade da ferramenta, não uma "
  "limitação contornável: cada despacho abre uma execução nova.")

p("Deixá-lo descobrir o projeto abrindo arquivo por arquivo seria o pior caminho possível, porque "
  "cada leitura é uma volta do laço — e volta é exatamente o que custa. Então o sistema entrega o "
  "conhecimento pronto, em camadas.", depois=3)

figura("fig8-memoria.png", "Figura 15 — As cinco memórias do sistema, o que cada uma guarda e "
       "quanto custa lê-la. Nenhuma delas é a conversa.", largura=14.0)

doc.add_heading("20.  Os dois índices", level=1)

p("As duas primeiras linhas daquela tabela merecem detalhe, porque respondem perguntas diferentes — "
  "e confundi-las é o erro mais comum quando se fala em memória para agentes.", depois=2)

marcador("“O que existe e como se chama?” ", "Responde um índice gerado por script: a árvore de "
         "arquivos com a assinatura de cada função e uma linha dizendo para que serve. Nenhum "
         "modelo envolvido, custo zero, sempre atualizado. É o sumário do projeto, e vai inteiro no "
         "prompt.")
marcador("“Isto já foi resolvido aqui, e o que foi decidido na época?” ", "Essa não se responde por "
         "nome de função — se responde por significado. E é para ela que existem os vetores.")

caixa("O QUE É UM VETOR, EM UMA FRASE",
      "Uma lista de números que representa o significado de um texto, de modo que textos com sentido "
      "próximo recebam números próximos. É isso que permite buscar por sentido em vez de por "
      "palavra: procurar “como tratamos pagamento recusado” encontra uma decisão escrita como "
      "“quando a operadora nega a transação”, sem nenhuma palavra em comum. O material indexado não "
      "é o código — disso o índice gerado já dá conta —, e sim a história do projeto: decisões com o "
      "motivo registrado, achados de revisão e tarefas concluídas.")

figura("fig7-rag-v6.png", "Figura 16 — A indexação roda ao commitar, fora do caminho do trabalho; a "
       "consulta roda no início do despacho, antes de gastar a primeira volta de modelo.",
       largura=14.0)

rico([("Por que duas buscas ao mesmo tempo, e não só a busca por significado? ", True),
      ("Porque o vetor perde nome próprio: se a pergunta menciona uma opção chamada ", False),
      ("--exigir", False),
      (", ele não tem como saber o que é aquilo — a busca por termo exato acha. E a busca por termo "
       "exato perde sinônimo, que o vetor acha. Uma cobre o buraco da outra; a etapa seguinte junta "
       "as duas listas e fica com os melhores trechos, que entram no prompt com a fonte citada.",
       False)])

p("O ganho concreto é o agente começar o trabalho já sabendo “isto foi decidido assim, por este "
  "motivo” — em vez de decidir de novo, possivelmente ao contrário do que já está no código. É a "
  "resposta direta ao segundo modo de falha da Parte I: decisão sem rastro.", antes=2)

caixa("QUANDO NÃO USAR",
      "Busca por significado é aproximada e devolve trechos, não verdades. Ela não substitui o "
      "índice gerado, que é exato, completo e grátis, nem responde o que uma consulta comum "
      "responde melhor: “quais tarefas estão bloqueadas” é uma consulta ao banco, não uma pergunta "
      "em linguagem natural. Ela entra quando a pergunta é sobre precedente e o vocabulário exato é "
      "desconhecido. Fora disso, é custo com cara de sofisticação.",
      cor="1BAF7A", fundo="E7F7F1", cor_titulo=VERDE)

quebra()
