# ================================================================ PARTE VII
parte("VII", "Além de software, e a operação",
      "O mesmo sistema construindo artefatos que não são código — e como um operador acompanha "
      "tudo isso acontecendo.", cor="2A78D6")

doc.add_heading("21.  As duas trilhas", level=1)

p("A fábrica constrói qualquer artefato: uma apresentação, um manual, uma análise de números. O "
  "eixo que separa os dois casos não é “é código?”, e sim ", depois=2)

rico([("como se prova que ficou pronto", True),
      (". Em software a prova vem de graça: o programa roda, e passa ou quebra. Fora dele não vem — "
       "e é aí que o desenho poderia degenerar. Um verificador sem nada para executar vira um "
       "segundo revisor, e dois julgamentos subjetivos sobre o mesmo artefato não são dois portões: "
       "são custo em dobro.", False)])

figura("fig10-trilhas.png", "Figura 17 — Um campo declarado no projeto escolhe o elenco inteiro. "
       "Tudo o que está na faixa verde é idêntico nas duas trilhas.", largura=13.2)

doc.add_heading("22.  A escada de prova", level=1)

p("A trilha não-software resolve o problema do portão com três peças. A primeira é a escada abaixo: "
  "todo critério de aceite fica em um de três degraus, e quem verifica é obrigado a declarar em "
  "qual deles ele ficou.")

figura("fig18-escada.png", "Figura 18 — Os três degraus. Subir é sempre preferível; descer é "
       "decisão registrada, não conveniência.", largura=13.8)

p("As outras duas peças completam o desenho:", antes=2, depois=2)

marcador("A primeira tarefa instala o verificador. ", "Antes de produzir qualquer parte do "
         "artefato, o projeto entrega um programa que sabe abrir o arquivo gerado e afirmar fatos "
         "sobre ele. Sem isso, todo critério desaba para o terceiro degrau e o portão do meio "
         "deixa de valer o que custa.")
marcador("O artefato é gerado, a fonte é versionada. ", "Um arquivo binário — apresentação, "
         "planilha, imagem — nunca é a fonte da verdade. A fonte é texto versionado, e o binário "
         "sai de um comando. Commitar o binário como fonte apagaria o portão da revisão, porque "
         "ninguém consegue revisar as mudanças de um arquivo binário.")

caixa("O RÓTULO É O QUE IMPEDE A FÁBRICA DE MENTIR PARA SI MESMA",
      "Quando muitos critérios de um projeto caem no degrau do julgamento, o sistema está rodando "
      "com um portão e meio, não com dois. O rótulo obrigatório torna isso visível — e visível cedo, "
      "no painel, em vez de descoberto tarde, numa entrega errada. Mas ele não corrige nada "
      "sozinho: excesso de julgamento é sinal de planejamento a refazer, não de agente displicente.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

doc.add_heading("23.  O painel", level=1)

p("O painel não é enfeite: é o instrumento que torna o custo visível enquanto ele acontece, e não "
  "depois. Ele roda sobre o mesmo banco e o mesmo barramento de eventos que o motor usa — não é uma "
  "aplicação separada lendo arquivos de log.")

figura("fig22-painel.png", "Figura 19 — O painel em operação: quadro de tarefas por estado, "
       "console ao vivo do agente e o gasto da rodada.", largura=14.0)

marcador("Cada despacho emite eventos. ", "Início, fim, modelo, voltas, tokens guardados e "
         "reaproveitados, custo e desfecho. O painel assina o barramento e desenha; a contabilidade "
         "não depende de alguém lembrar de gravar.")
marcador("A tela mostra o que ainda está em voo. ", "Como cada agente é um processo com endereço, "
         "listar o que está rodando é consultar o registro de processos — não deduzir de arquivo "
         "de log.")
marcador("Parar custa um botão. ", "Cortar um agente é encerrar um processo supervisionado, e o "
         "supervisor devolve a tarefa à fila. Não fica trabalho pela metade nem arquivo editado "
         "sem dono.")
marcador("O custo aparece por tarefa, não só por execução. ", "Um teto calibrado pelo custo de uma "
         "etapa subestima a tarefa inteira — e subestimar sempre empurra o sistema a começar "
         "trabalho que não cabe no orçamento.")

doc.add_heading("24.  Um projeto de ponta a ponta", level=1)

p("Vale juntar tudo numa única passagem. A figura abaixo é um projeto real do começo ao fim: o "
  "pedido, o planejamento, as primeiras tarefas, o paralelismo, uma reprovação e o retrabalho.")

figura("fig21-projeto.png", "Figura 20 — Um projeto de ponta a ponta. A faixa verde responde à "
       "pergunta que sempre aparece: o que o usuário faz nesse intervalo todo.", largura=14.0)

quebra()

# ================================================================ PARTE VIII
parte("VIII", "O projeto de execução",
      "Em que ordem construir, o que fica deliberadamente de fora, o que pode dar errado e o que "
      "tudo isso pretende demonstrar.", cor="184F95")

doc.add_heading("25.  As seis fases", level=1)

p("A ordem não é arbitrária: cada fase entrega algo verificável e destrava a seguinte. E o marco "
  "que encerra cada uma é sempre um comportamento observável — nunca um percentual de conclusão.")

figura("fig12-fases.png", "Figura 21 — As seis fases e os marcos que as encerram.", largura=14.0)

tabela(["Fase", "O que entrega", "Marco — só passa quando"],
       [["*F1  Fundação",
         "projeto, esquema do banco, suíte de testes, verificação contínua e o cliente falso da API",
         "a suíte inteira roda sem tocar a rede e sem gastar um centavo"],
        ["*F2  Laço de agente",
         "o laço de tool use, execução de ferramentas com confinamento, montagem do prompt e "
         "contabilidade por volta",
         "um agente resolve uma tarefa real, e o custo dela aparece discriminado por volta"],
        ["*F3  Máquina de estados",
         "os seis estados, os dois portões, o limite de ciclos, a escada de resposta ao fracasso",
         "uma tarefa percorre os seis estados, reprova de propósito, é retrabalhada e conclui"],
        ["*F4  Concorrência",
         "árvore de supervisão, filas duráveis, teto de orçamento, recuperação após queda",
         "três tarefas rodam em paralelo; matar uma no meio não afeta as outras, e ela volta à fila"],
        ["*F5  Memória semântica",
         "indexação ao commitar, busca híbrida e o bloco de contexto com a fonte citada",
         "num projeto com histórico, o agente cita a decisão anterior em vez de decidir de novo"],
        ["*F6  Painel e trilha genérica",
         "tela ao vivo, telemetria, a trilha não-software e a escada de prova com rótulo obrigatório",
         "um projeto inteiro é planejado, construído e entregue sem intervenção"]],
       [2.9, 7.1, 7.4])

rico([("A primeira fase é a que dá vontade de pular, e é a mais importante. ", True),
      ("Sem o cliente falso da API, cada execução da suíte de testes custa dinheiro e depende da "
       "rede. Uma suíte assim deixa de ser executada em poucas semanas — e um sistema sem suíte "
       "executada não pode ser mudado com segurança. Toda a confiança das cinco fases seguintes "
       "depende de a primeira ter sido feita direito.", False)], antes=2)

doc.add_heading("26.  Escopo", level=1)

p("Delimitar o que fica de fora é parte do projeto, e é o que impede que um trabalho de conclusão "
  "vire uma lista de intenções.", depois=3)

tabela(["Dentro do escopo", "Fora do escopo, e por quê"],
       [["Planejar, construir, verificar, revisar e documentar projetos, com estado durável e custo "
         "contabilizado",
         "publicar em produção o que foi gerado: envolve custo externo e credencial de terceiros; "
         "fica como ação manual"],
        ["Execução num só computador, com concorrência real e supervisão",
         "distribuir em vários computadores: possível na plataforma, mas nada no problema exige — o "
         "gargalo é a espera pelo modelo"],
        ["Índice semântico do histórico do projeto, com avaliação da qualidade das buscas",
         "treinar ou ajustar modelos: o sistema é independente de modelo por desenho, e isso "
         "destruiria a propriedade"],
        ["Contabilidade por despacho, tarefa, projeto e dia, com tetos que impedem começar o que "
         "não cabe",
         "cortar um agente em voo por estouro de custo: interromper no meio paga o mesmo e não "
         "entrega nada"],
        ["Painel local para acompanhar e disparar o trabalho ao vivo",
         "vários usuários, autenticação e permissões: é ferramenta de operação de um operador"]],
       [8.4, 9.0])

doc.add_heading("27.  Riscos e limites conhecidos", level=1)

tabela(["Risco ou limite", "Por que existe", "Como o desenho responde"],
       [["*O ganho de reaproveitamento não se confirmar",
         "depende de o começo da requisição ser idêntico caractere por caractere, e um só caractere "
         "volátil o anula sem erro visível",
         "teste que monta o começo duas vezes e compara; a contabilidade separa o que foi guardado "
         "do que foi reaproveitado, então a ausência de ganho aparece no primeiro dia"],
        ["*A busca por significado trazer trecho inútil",
         "busca aproximada devolve trechos, e trecho fora de contexto piora a resposta em vez de "
         "melhorar",
         "conjunto de perguntas com resposta conhecida, medido a cada mudança na indexação; se não "
         "bate a linha de base, a recuperação não entra no prompt"],
        ["*Uma só árvore de arquivos por projeto",
         "agentes paralelos no mesmo projeto enxergam edições não commitadas uns dos outros",
         "as áreas declaradas funcionam como exclusão mútua, verificada pelo sistema antes de "
         "despachar — e não confiada ao texto do despacho"],
        ["*O portão do meio ser frágil fora de software",
         "sem programa para executar, verificar tende a virar opinião",
         "rótulo obrigatório de grau de prova, com a proporção visível no painel; excesso de "
         "julgamento é tratado como sinal de replanejamento"],
        ["*O ecossistema de IA em Elixir ser menor",
         "menos bibliotecas prontas e menos exemplos publicados que em Python",
         "o núcleo depende de HTTP e JSON, não de biblioteca de IA; o único ponto que precisa do "
         "ecossistema é o embedding, que tem caminho maduro e alternativa por serviço"]],
       [3.6, 6.4, 7.4])

doc.add_heading("28.  O que este trabalho pretende demonstrar", level=1)

p("Que a diferença entre um assistente de programação e uma linha de produção está inteiramente na "
  "camada de governança: papéis com autoridade explícita, estado externalizado e transacional, "
  "portões operados por quem não construiu, falha limitada por desenho e roteamento determinístico. "
  "Nenhum desses mecanismos depende de um modelo específico ou de um recurso exclusivo de um "
  "fornecedor — todos são decisões de arquitetura de software aplicadas a um operário novo.")

p("E, principalmente, que essas decisões precisam estar em algum lugar que não seja um pedido "
  "escrito em português dentro de um prompt. Uma regra que o sistema pede é uma regra opcional; uma "
  "regra que a estrutura garante é uma propriedade. Cada capítulo deste documento é uma versão "
  "dessa mesma troca: a separação entre construir e aprovar vira ausência de ferramenta; o limite "
  "de gasto vira um supervisor; a ordem das tarefas vira uma coluna do banco; a memória do projeto "
  "vira um índice consultável.", antes=2)

caixa("O QUE FICA, SE TUDO O MAIS MUDAR",
      "Modelos vão melhorar, ficar mais baratos e mudar de nome. A parte deste trabalho que não "
      "depende disso é a estrutura: tarefas pequenas com estado explícito, dois julgamentos "
      "independentes feitos por quem não construiu, falha limitada com uma tentativa de "
      "redimensionamento antes de desistir, e tudo registrado no instante em que acontece. Se o "
      "modelo de amanhã for dez vezes melhor, essa estrutura continua sendo o que transforma "
      "capacidade em entrega confiável.")

doc.save(DESTINO)
print("gerado:", DESTINO)
