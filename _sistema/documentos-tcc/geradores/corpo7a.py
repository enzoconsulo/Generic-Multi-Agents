# ================================================================ CAPA
p("Fábrica de Software Multi-Agente", tam=22, cor=AZUL, negrito=True,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=1, espaco=1.0)
p("Documentação completa da arquitetura", tam=12.5, cor=CINZA,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=4, espaco=1.0)

reg = doc.add_paragraph()
reg.paragraph_format.space_after = Pt(7)
borda = OxmlElement("w:pBdr")
bot = OxmlElement("w:bottom")
bot.set(qn("w:val"), "single")
bot.set(qn("w:sz"), "12")
bot.set(qn("w:color"), "2A78D6")
borda.append(bot)
reg._p.get_or_add_pPr().append(borda)

p("Trabalho de Conclusão de Curso   ·   Enzo Consulo   ·   agosto de 2026", tam=9,
  cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=7)

caixa("O QUE É ESTE SISTEMA",
      "Um sistema que recebe a descrição de um projeto em linguagem natural e o constrói de ponta a "
      "ponta. Ele não é um assistente que responde perguntas sobre código: é uma linha de produção "
      "em que agentes especializados planejam, implementam, verificam, revisam e documentam — cada "
      "um com um papel definido e com autoridade limitada. A intervenção humana obrigatória "
      "acontece uma única vez, no pedido inicial.")

caixa("COMO LER ESTE DOCUMENTO",
      "Ele foi escrito para ser lido do começo ao fim por alguém que não conhece nenhuma das "
      "tecnologias envolvidas. Cada parte usa apenas o que as anteriores já explicaram: o "
      "vocabulário vem antes das peças, as peças vêm antes da plataforma, e os assuntos que "
      "costumam ser tratados como avançados — custo, memória semântica, concorrência — só aparecem "
      "depois que tudo o que eles pressupõem já foi apresentado. Quem tiver pressa pode ler apenas "
      "as faixas coloridas de abertura de cada parte e as figuras: elas contam a história inteira.",
      cor="1BAF7A", fundo="E7F7F1", cor_titulo=VERDE)

doc.add_heading("Roteiro", level=1)

tabela(["Parte", "O que ela responde", "Onde chega"],
       [["*I — O problema", "por que trabalho longo com um modelo de linguagem falha",
         "a ideia de tratar construção como linha de produção"],
        ["*II — O vocabulário", "o que são agente, ferramenta, laço, contexto e token",
         "como um agente trabalha, do primeiro ao último passo"],
        ["*III — As peças", "o que é uma tarefa, o que são os portões, o que acontece ao falhar",
         "o ciclo completo de uma tarefa, do backlog à entrega"],
        ["*IV — A plataforma", "por que Elixir, quais ferramentas e o papel de cada uma",
         "a árvore de processos e o que o banco guarda"],
        ["*V — A economia", "onde o dinheiro é gasto e como o desenho reduz a conta",
         "as cinco alavancas de custo e o contexto por papel"],
        ["*VI — A memória", "como um agente que começa do zero sabe o que já foi decidido",
         "os dois índices e quando não usar cada um"],
        ["*VII — Operação", "o que acontece fora de software, e como se acompanha tudo isso",
         "um projeto inteiro, do pedido à entrega"],
        ["*VIII — O projeto", "em que ordem construir, o que fica de fora e o que pode dar errado",
         "as seis fases, o escopo e os limites conhecidos"]],
       [3.5, 7.4, 6.5])

quebra()

# ================================================================ PARTE I
parte("I", "O problema, e a ideia que responde a ele",
      "Antes de qualquer tecnologia: o que exatamente falha quando se pede a um modelo de linguagem "
      "que construa um sistema inteiro.")

doc.add_heading("1.  Onde um modelo de linguagem falha", level=1)

p("Um modelo de linguagem escreve código bem quando o pedido é curto e tudo o que ele precisa saber "
  "cabe numa conversa. Peça uma função, um trecho de consulta, a correção de um erro — o resultado "
  "costuma ser bom.")

p("Pedir “construa este sistema” é outra coisa. O trabalho dura horas, atravessa dezenas de "
  "arquivos e depende de decisões tomadas no começo que ainda precisam valer no fim. É nesse regime "
  "que ele falha — e o ponto que importa é: ", depois=2)

rico([("as falhas não são de escrita, são de processo", True),
      (". O modelo continua escrevendo bem cada trecho isolado; o que se perde é a coerência do "
       "conjunto. Quatro modos de falha aparecem sempre, e nenhum deles se resolve com um modelo "
       "melhor:", False)], depois=2)

marcador("Perda de contexto. ", "A conversa cresce, o começo sai de vista, e o modelo passa a "
         "contradizer o que ele mesmo decidiu duas horas antes. Não é esquecimento: é que o começo "
         "da conversa compete por espaço com tudo o que veio depois.")
marcador("Decisão sem rastro. ", "O motivo de uma escolha — “usamos isto porque aquilo não "
         "funciona neste caso” — ficou no meio do diálogo. Quando a sessão termina, some junto. Na "
         "semana seguinte, a mesma decisão é tomada de novo, às vezes ao contrário.")
marcador("Autoaprovação. ", "Quem escreveu o código é quem afirma que ele está pronto. E quem "
         "escreveu raramente se reprova: o mesmo raciocínio que produziu o erro é o que vai "
         "procurá-lo.")
marcador("Tentativa sem limite. ", "Um ponto difícil consome tentativa após tentativa. Sem um "
         "limite explícito, ele trava tudo o que vinha atrás na fila — e o custo cresce sem que "
         "nada avance.")

doc.add_heading("2.  A proposta: tratar construção como linha de produção", level=1)

p("A resposta deste trabalho é não pedir o sistema inteiro de uma vez. Em vez disso: dividir o "
  "pedido em tarefas pequenas e nomeadas, dar a cada uma um estado explícito que fica registrado "
  "fora da conversa, e passar cada entrega por revisores que não a construíram.")

p("O modelo continua sendo o operário — quem escreve o código é ele. O sistema em volta decide o "
  "que ele faz, quando faz, com que informação e com que autoridade.", depois=3)

figura("fig1-fluxo.png", "Figura 1 — Do pedido à entrega. A única intervenção humana obrigatória é "
       "a primeira caixa; daí em diante o sistema decide sozinho. As duas faixas cinzas no rodapé "
       "são o que sustenta tudo, e aparecem em detalhe na Parte IV.")

passos([
    ("1", "Pedido", "O usuário descreve o que quer, uma vez, em linguagem natural."),
    ("2", "Planejamento", "Um agente gera a especificação, um plano em fases e de 8 a 20 tarefas "
                          "com dependências declaradas."),
    ("3", "Construção", "Cada tarefa é implementada por um agente especialista naquela área do "
                        "projeto."),
    ("4", "Dois portões", "Um verifica se funciona; outro revisa se é o que foi pedido. Nenhum dos "
                          "dois pode corrigir."),
    ("5", "Entrega", "Tarefa concluída vira um commit próprio, e o sistema segue para a próxima."),
])

doc.add_heading("3.  As três regras que governam tudo", level=1)

p("Todo o resto do documento é consequência de três decisões. Elas aparecem de novo em cada parte, "
  "aplicadas a um problema diferente.", depois=2)

marcador("Quem implementa nunca é quem aprova. ", "Verificador e revisor não têm permissão para "
         "corrigir: eles reprovam e devolvem. Isso não é uma recomendação de conduta — na Parte II "
         "veremos que a ferramenta de escrever sequer existe para eles.")
marcador("Estado fora da conversa. ", "Toda decisão, todo resultado e todo custo são gravados no "
         "momento em que acontecem. Se tudo cair agora, a próxima execução reconstrói o mundo "
         "lendo o banco e o histórico de versões — nunca relendo um diálogo.")
marcador("Falha limitada. ", "Três ciclos por tarefa. Passou disso, o sistema tenta redimensionar "
         "a tarefa uma vez; se ainda assim falhar, ela é bloqueada e reportada, e a fila segue. "
         "Uma tarefa difícil nunca trava a linha inteira.")

caixa("A TESE, EM UMA FRASE",
      "O gargalo de um sistema como este não está na geração de texto, e sim na governança. Um "
      "modelo capaz produz bom código; o que decide se o conjunto funciona é quem manda nele, com "
      "que limites, e o que acontece quando algo dá errado. Este trabalho é sobre essa camada.")

quebra()

# ================================================================ PARTE II
parte("II", "O vocabulário, e como um agente trabalha",
      "Seis termos e um mecanismo. Depois desta parte, dá para acompanhar qualquer decisão técnica "
      "do resto do documento.", cor="4A3AA7")

doc.add_heading("4.  Os termos que o resto do documento usa", level=1)

p("Nada aqui é jargão gratuito: cada termo abaixo volta a aparecer, e três deles são o que decide "
  "o custo do sistema inteiro.", depois=3)

tabela(["Termo", "O que significa neste documento"],
       [["*Modelo de linguagem",
         "o operário: recebe texto e devolve texto ou pedidos de ação. Não guarda memória entre uma "
         "execução e outra"],
        ["*Ferramenta",
         "uma ação que o modelo pode pedir para ser executada: ler um arquivo, rodar um teste, "
         "escrever código, buscar na web"],
        ["*Agente",
         "um papel: o texto que define o que ele faz, a lista de ferramentas que ele pode usar e o "
         "modelo que o executa"],
        ["*Laço de tool use",
         "o ciclo pergunta → pedido de ferramenta → resposta, repetido até o modelo dizer que "
         "terminou"],
        ["*Contexto",
         "tudo o que vai numa requisição ao modelo. É reenviado por inteiro a cada volta do laço"],
        ["*Token",
         "a unidade em que o modelo é cobrado, tanto no que entra quanto no que sai. "
         "Aproximadamente um pedaço de palavra"],
        ["*Prefixo",
         "o começo da requisição — a parte que se repete igual de uma volta para a outra (Parte V)"],
        ["*Reaproveitamento",
         "recurso do provedor: guardar o prefixo já processado e cobrar um décimo por reusá-lo "
         "(Parte V)"],
        ["*Vetor (embedding)",
         "uma lista de números que representa o significado de um texto: textos parecidos recebem "
         "números parecidos (Parte VI)"]],
       [3.4, 14.0])

doc.add_heading("5.  O que é um agente", level=1)

p("Um agente não é um programa nem um serviço. É um papel escrito em texto, mais duas coisas que o "
  "delimitam: as ferramentas que existem para ele e o modelo que o executa.")

figura("fig13-agente.png", "Figura 2 — A anatomia de um agente. Trocar o texto do papel troca o "
       "comportamento; retirar uma ferramenta retira a capacidade, e não apenas a permissão.",
       largura=13.8)

rico([("A terceira linha da figura é a que costuma passar despercebida e é a mais importante: ", False),
      ("quem revisa não recebe a ferramenta de escrever", True),
      (". A regra “o revisor não corrige o que encontra” deixa de ser uma instrução que o modelo "
       "pode interpretar mal, e passa a ser uma impossibilidade — ele não tem como escrever, "
       "porque a ação não está na lista dele. É o princípio do menor poder aplicado a agentes.",
       False)])

p("Os papéis genéricos — quem planeja, quem constrói, quem verifica, quem revisa — servem a "
  "qualquer projeto. Existe ainda um segundo tipo de agente, criado sob medida para cada projeto; "
  "ele aparece na seção 10.", antes=2)

doc.add_heading("6.  Como um agente trabalha: o laço", level=1)

p("Um agente em execução é um laço, e entender esse laço é entender o sistema inteiro — inclusive a "
  "parte do custo. O ciclo é sempre o mesmo:")

marcador("O sistema monta a requisição ", "e a envia: as ferramentas disponíveis, as instruções "
         "permanentes e todo o histórico da conversa até ali.")
marcador("O modelo responde ", "de uma entre duas formas: pedindo o uso de uma ou mais ferramentas, "
         "ou dizendo que terminou.")
marcador("Se pediu ferramentas, ", "o sistema as executa de verdade — lê o arquivo, roda o teste — "
         "e devolve os resultados numa única mensagem.")
marcador("O laço recomeça, ", "agora com uma volta a mais de histórico. Ele só termina quando o "
         "modelo diz que terminou, ou quando bate num teto imposto de fora.")

figura("fig4-laco.png", "Figura 3 — O laço de tool use. As ferramentas pedidas na mesma volta são "
       "executadas em paralelo, e os resultados voltam sempre numa única mensagem — dividi-los "
       "ensina o modelo a parar de pedir ferramentas em paralelo.", largura=13.6)

rico([("Uma propriedade desse laço orienta o desenho inteiro do sistema: ", False),
      ("o custo não é proporcional ao tamanho do código, e sim ao número de idas ao modelo", True),
      (". Como cada volta reenvia todo o histórico acumulado, uma volta tardia custa mais que uma "
       "volta inicial. Um agente que resolve a tarefa em oito voltas custa muito menos que um que "
       "leva vinte — mesmo escrevendo exatamente o mesmo arquivo no fim.", False)])

p("É por isso que o sistema investe tanto em dar ao agente um bom ponto de partida, em vez de "
  "deixá-lo descobrir o projeto sozinho abrindo arquivo por arquivo. A Parte VI é inteira sobre "
  "isso; a Parte V mostra a conta.", antes=2)

quebra()

# ================================================================ PARTE III
parte("III", "As peças do sistema",
      "A tarefa, os dois portões, o que acontece quando algo falha e a equipe que nasce junto com "
      "cada projeto.", cor="EB6834")

doc.add_heading("7.  A tarefa: a unidade de trabalho", level=1)

p("Se o pedido inteiro fosse entregue a um agente, estaríamos de volta ao problema da Parte I. Por "
  "isso o planejamento quebra o pedido em tarefas — e a tarefa é a peça central do sistema, porque "
  "é ela que carrega o estado.")

figura("fig15-tarefa.png", "Figura 4 — A anatomia de uma tarefa. À direita, o problema que cada "
       "campo resolve: nenhum deles está ali por burocracia.", largura=13.8)

p("Vale notar o que a figura mostra à direita. Os campos não descrevem a tarefa por descrever — "
  "cada um existe para tornar automática uma decisão que, de outro modo, alguém teria de tomar na "
  "hora:", antes=2, depois=2)

marcador("Dependências resolvem a ordem. ", "Uma tarefa só fica disponível quando todas as suas "
         "dependências estiverem concluídas. Ninguém precisa decidir “o que vem agora”: a fila se "
         "ordena sozinha.")
marcador("Áreas resolvem o paralelismo. ", "Duas tarefas do mesmo projeto só podem rodar ao mesmo "
         "tempo se as áreas que elas declaram tocar não se cruzarem. É o que evita que dois agentes "
         "editem o mesmo arquivo sem saber um do outro.")
marcador("Tentativas resolvem a resposta ao fracasso. ", "O número de vezes que a tarefa voltou "
         "reprovada é o que decide o próximo passo — e isso é o assunto da seção 9.")
marcador("Seções separadas resolvem a separação de papéis. ", "Quem constrói escreve nas notas de "
         "execução; os portões escrevem nas seções de verificação e revisão. Ninguém escreve na "
         "seção do outro.")

caixa("POR QUE TAREFAS DE TRINTA A NOVENTA MINUTOS",
      "É a faixa em que os dois desperdícios se equilibram. Tarefa grande demais faz o agente se "
      "perder — e, quando ela falha, joga fora muito trabalho de uma vez. Tarefa pequena demais faz "
      "o custo de explicar o contexto (que é pago inteiro a cada despacho) dominar o custo de fazer "
      "o trabalho. O planejador é instruído a quebrar o que passar disso.")

doc.add_heading("8.  Os dois portões", level=1)

p("Toda entrega passa por dois julgamentos independentes, feitos por agentes que não a "
  "construíram. Eles não são dois níveis de zelo: são duas perguntas diferentes.")

figura("fig16-portoes.png", "Figura 5 — Os dois portões. A faixa roxa explica por que não basta um "
       "só, mais caprichoso.", largura=13.8)

rico([("O ponto sutil do desenho está na faixa inferior da figura, e vale repetir: ", False),
      ("uma entrega pode passar em todos os critérios, não ter defeito nenhum e ainda assim não ser "
       "a tarefa", True),
      (". Isso acontece quando o critério foi mal escrito — e critério frouxo não é licença para "
       "entregar outra coisa. Reprovar por não-conformidade não exige encontrar nenhum bug.", False)])

p("Daí a exigência sobre como os critérios de aceite são escritos: eles têm a forma "
  "“comando + resultado esperado”, nunca a forma de frase avaliativa. “A API funciona” não é "
  "critério; “a chamada a /usuarios devolve 200 com uma lista em JSON” é. A diferença aparece na "
  "Parte VII, quando o sistema precisa fazer isso fora de software.", antes=2)

doc.add_heading("9.  O que acontece quando uma tarefa falha", level=1)

p("Reprovar não é o fim da linha. O sistema responde ao fracasso em degraus, e cada degrau só é "
  "usado depois que o anterior falhou de verdade — o gatilho é sempre um fato registrado, nunca um "
  "palpite sobre dificuldade.")

figura("fig6-estados.png", "Figura 6 — Os seis estados de uma tarefa. As duas setas vermelhas de "
       "volta são os portões reprovando. Esgotados os três ciclos, há duas saídas — e a primeira "
       "não é desistir.", largura=13.8)

marcador("1ª reprovação — sobe de modelo. ", "A tarefa volta a quem constrói, agora executada por "
         "um modelo mais capaz. Insistir no mesmo modelo depois de uma reprovação paga o ciclo "
         "inteiro de novo e queima uma das três tentativas.")
marcador("2ª reprovação sob o mesmo especialista — troca de especialista. ", "Ele foi escolhido no "
         "planejamento, antes de se saber onde a tarefa iria falhar; repetir é apostar duas vezes "
         "no mesmo palpite.")
marcador("3 ciclos esgotados — replanejamento. ", "O planejador reexamina a tarefa e a quebra em "
         "duas ou três menores, que entram na fila como tarefas novas. A original é cancelada, com "
         "referência às substitutas. É o reconhecimento de que o problema pode não ser de execução, "
         "e sim de dimensionamento.")
marcador("Esgotou de novo — aí sim bloqueia. ", "Uma tarefa que já nasceu de replanejamento e falha "
         "outra vez é reportada ao usuário. O sistema não replaneja um replanejamento: se o "
         "problema resistiu a duas leituras diferentes, ele precisa de uma decisão humana.")

rico([("Toda transição de estado é uma transação", True),
      (": o novo estado, o relatório da etapa e o custo daquele despacho entram juntos, ou não "
       "entram. Não existe tarefa que mudou de estado sem deixar registrado por quê, nem custo "
       "gasto que não esteja ligado a um resultado.", False)], antes=2)

doc.add_heading("10.  A equipe que nasce com o projeto", level=1)

p("Aqui está, provavelmente, a peça mais característica do sistema. A fábrica não tem um "
  "programador genérico esperando tarefas na fila: ao planejar, ela sintetiza uma equipe a partir "
  "do próprio pedido.")

figura("fig19-equipe.png", "Figura 7 — Do pedido à equipe. Cada tarefa nasce apontando para o "
       "especialista da área que ela toca.", largura=13.8)

p("O prompt de cada especialista é curto de propósito. Ele não repete a disciplina de execução — "
  "ler a tarefa por inteiro, corrigir primeiro o que foi apontado, registrar o que fez, commitar — "
  "porque isso já vem do papel genérico de quem constrói. Ele carrega apenas o domínio: quais "
  "arquivos são dele, quais decisões já estão fechadas e quais armadilhas daquela área já custaram "
  "caro.", antes=2)

caixa("A ÚNICA RENÚNCIA DELIBERADA",
      "A especialização é abandonada em um caso, e ele é planejado: quando a mesma tarefa reprova "
      "duas vezes sob o mesmo especialista, o sistema troca para um construtor genérico mais "
      "capaz e registra a troca. O especialista foi escolhido no planejamento, antes de se saber "
      "onde a tarefa iria falhar — duas reprovações seguidas sob o mesmo prompt de domínio são "
      "evidência de que a especialização está enviesando o ataque ao problema.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

quebra()
