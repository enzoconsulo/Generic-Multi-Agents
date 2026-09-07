# -*- coding: utf-8 -*-
"""Corpo do PLANO DE DESENVOLVIMENTO — VERSAO RESUMIDA (teto de 10 paginas).

Mesmo conteudo substantivo do plano_corpo.py, com a prosa explicativa
condensada e as explicacoes longas convertidas em tabela — tabela rende
muito mais informacao por centimetro que paragrafo corrido.

O que saiu em relacao a versao completa: o roteiro das partes, quatro das
sete figuras (as que duplicavam uma tabela), e os paragrafos de reforco.
O que ficou inteiro: os requisitos, a pilha de ferramentas ferramenta a
ferramenta, o cronograma, as 13 etapas com portao de saida, os riscos e
as entregas.

Monte com `python gerar_plano.py --resumido`. Nao rode este arquivo sozinho.
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

p("Trabalho de Conclusão de Curso   ·   Enzo Consulo   ·   abril de 2026", tam=9,
  cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=6)

caixa("O QUE SERÁ CONSTRUÍDO",
      "Um sistema que recebe a descrição de um projeto em linguagem natural e o constrói de ponta "
      "a ponta: agentes especializados planejam, implementam, verificam, revisam e documentam — "
      "cada um com papel definido e autoridade limitada. A intervenção humana obrigatória "
      "acontece uma única vez, no pedido inicial. Este documento é o planejamento do "
      "desenvolvimento, escrito antes da primeira linha de código: define o problema, os "
      "requisitos, a arquitetura, as ferramentas e um cronograma de 13 etapas de 15 dias, cada uma "
      "com um portão de saída verificável.")

# ================================================================ PARTE I
parte("I", "O problema, a tese e os objetivos",
      "Por que um modelo que escreve código bem ainda não constrói software sozinho.")

doc.add_heading("1.  O problema", level=1)

p("Modelos de linguagem escrevem código competente; isso já não é o gargalo. O gargalo aparece "
  "no trabalho longo: uma tarefa com vinte decisões encadeadas, verificação no meio e correção "
  "depois. O modelo perde o fio — não porque escreve pior, mas porque nada no sistema o obriga a "
  "manter o rumo.")

p("Os sistemas multi-agente atuais atacam isso colocando vários modelos para conversar. A "
  "intuição é boa e esbarra num limite: a coordenação entre eles é escrita como texto dentro de "
  "um prompt. \"Não modifique arquivos fora do projeto\", \"não tente mais de três vezes\", \"não "
  "aprove seu próprio trabalho\". São instruções — e instrução dirigida a um modelo "
  "probabilístico é pedido, não garantia.", antes=1)

caixa("O DIAGNÓSTICO, E A TESE",
      "Um sistema multi-agente não falha por escrever mal — falha por governar mal; e governança "
      "escrita em prosa dentro de um prompt é governança opcional, porque quem a lê é um modelo "
      "que pode não obedecer sem que nada perceba. A proposta é mover cada regra para onde ela "
      "deixe de ser opcional: o compilador, a árvore de processos e o esquema do banco. O sistema "
      "não precisa ser mais esperto que os existentes — precisa ser mais difícil de operar errado.",
      cor="B52C2C", fundo="FBECEA", cor_titulo=VERMELHO)

doc.add_heading("2.  Onde cada regra vai morar", level=1)

tabela(["A regra", "Como ela existe hoje", "Onde ela passa a morar"],
       [["*Não escrever fora do projeto", "um pedido no texto do prompt",
         "a ferramenta de escrita resolve o caminho e recusa: o agente não tem como tentar"],
        ["*No máximo três tentativas", "um lembrete que o agente pode ignorar",
         "uma coluna do banco, incrementada pelo sistema; o agente não recebe ferramenta para "
         "alterá-la"],
        ["*Quem constrói não aprova", "uma combinação de papéis",
         "quem revisa não recebe nenhuma ferramenta que escreva em arquivo"],
        ["*Não estourar o orçamento", "uma recomendação",
         "um supervisor impede o trabalho de começar quando o custo estimado não cabe"]],
       [4.0, 4.6, 8.8])

doc.add_heading("3.  Objetivos", level=1)

rico([("Objetivo geral.  ", True, AZUL),
      ("Projetar, implementar e avaliar um sistema multi-agente para construção de software em que "
       "as regras de governança — confinamento, limite de retrabalho, separação entre construir e "
       "aprovar, e teto de custo — sejam impostas pela estrutura do programa, e não solicitadas em "
       "linguagem natural a um modelo.", False)], tam=9.3, depois=3)

tabela(["#", "Objetivo específico", "Como será verificado"],
       [["*OE1", "Levantar o estado da arte e delimitar a contribuição original",
         "revisão bibliográfica escrita e comparada"],
        ["*OE2", "Estabelecer uma linha de base de medição a partir de um protótipo, antes de "
                 "construir a versão final", "conjunto de dados extraído e congelado"],
        ["*OE3", "Projetar uma arquitetura em que cada regra tenha um mecanismo estrutural "
                 "correspondente", "cada regra mapeada a um mecanismo, com justificativa"],
        ["*OE4", "Implementar o sistema em sete incrementos, cada um encerrado por um marco",
         "os sete marcos, verificados por comando"],
        ["*OE5", "Colocar o sistema para construir projetos reais e medir contra a linha de base",
         "comparação quantitativa nas mesmas dimensões"],
        ["*OE6", "Refinar o sistema a partir do que a operação real revelar",
         "registro das correções, com a causa de cada uma"]],
       [1.4, 9.4, 6.6])

doc.add_heading("4.  Delimitação do escopo", level=1)

tabela(["Fica DENTRO do escopo", "Fica FORA, e por quê"],
       [["*Construção de software, do pedido à entrega",
         "Geração de imagem, áudio ou vídeo — outro domínio de verificação"],
        ["*Um provedor de modelo, com a fronteira preparada para outros",
         "Catálogo de provedores, negociação de capacidades, plugins"],
        ["*Execução local, numa única máquina",
         "Nuvem, múltiplos nós, escalonamento horizontal"],
        ["*Painel de acompanhamento de uso próprio",
         "Multiusuário, autenticação, permissões — não há segundo operador"],
        ["*Medição de custo, ciclos e taxa de reprovação",
         "Avaliação estética do código gerado — subjetiva demais para medir"]],
       [8.7, 8.7])

doc.add_heading("5.  Critérios de aceitação do trabalho", level=1)

p("O trabalho será considerado bem-sucedido se, ao fim da Etapa 13, as quatro afirmações abaixo "
  "puderem ser demonstradas ao vivo — e não apenas descritas.", tam=9.0, cor=CINZA, depois=3)

passos([("1", "Constrói sozinho",
         "Um projeto real é planejado, construído, verificado, revisado e entregue sem intervenção "
         "humana depois do pedido inicial."),
        ("2", "Governa de verdade",
         "Cada regra da seção 2 tem um teste que a prova, incluindo testes que tentam violá-la de "
         "propósito e falham."),
        ("3", "Cabe na máquina",
         "Roda no perfil de 8 GB e 4 núcleos declarado no RNF-01, com o pico de memória medido."),
        ("4", "Melhora o medido",
         "O resultado é comparado à linha de base da Etapa 2 nas mesmas dimensões, com o número "
         "publicado — inclusive se for desfavorável.")])

# ================================================================ PARTE II
parte("II", "Os requisitos",
      "O que o sistema precisa fazer, sob que restrições, e o mecanismo que garante cada uma.",
      cor="4A3AA7")

doc.add_heading("6.  Requisitos funcionais", level=1)

tabela(["#", "Requisito funcional", "Etapa"],
       [["*RF-01", "A partir de uma descrição em linguagem natural, produzir especificação, plano "
                   "e tarefas decompostas", "E07"],
        ["*RF-02", "Cada tarefa percorre seis estados explícitos, e cada mudança é registrada com "
                   "o relatório e o custo que a produziram", "E07"],
        ["*RF-03", "Toda entrega passa por dois julgamentos independentes: um verifica se funciona, "
                   "outro se é o que foi pedido", "E07"],
        ["*RF-04", "Entrega reprovada volta para execução com o relatório anexado, e o sistema "
                   "decide COMO refazer a partir da causa", "E07"],
        ["*RF-05", "O retrabalho tem limite; esgotado, a tarefa é replanejada uma vez e, se ainda "
                   "falhar, entregue ao humano", "E07"],
        ["*RF-06", "Tarefas independentes podem ser construídas ao mesmo tempo, sem que uma "
                   "interfira no arquivo da outra", "E09"],
        ["*RF-07", "O sistema consulta o histórico do próprio projeto antes de decidir, e cita a "
                   "fonte do que recuperou", "E10"],
        ["*RF-08", "Andamento, custo e saída de cada agente acompanhados numa tela, ao vivo",
         "E11"]],
       [1.6, 12.6, 3.2])

doc.add_heading("7.  Requisitos não funcionais", level=1)

p("Requisito não funcional sem mecanismo é intenção. Cada um abaixo vem com o seu.", tam=9.0,
  cor=CINZA, depois=2)

tabela(["#", "Requisito não funcional", "Mecanismo que o garante"],
       [["*RNF-01", "Roda em máquina modesta: 8 GB de RAM e 4 núcleos",
         "nenhum modelo carregado localmente antes da E10; o componente pesado vira adaptador "
         "trocável, escolhido por medição"],
        ["*RNF-02", "Custo contabilizado em duas unidades — cota consumida e valor em dólar",
         "tabela própria no banco, alimentada a cada volta do agente"],
        ["*RNF-03", "Nenhum agente escreve fora da raiz do projeto",
         "a ferramenta de escrita resolve o caminho e recusa; não é validação de texto"],
        ["*RNF-04", "A suíte de testes roda sem rede, sem cota e sem chave de API",
         "adaptadores falsos determinísticos, e um teste que falha se a chave estiver definida"],
        ["*RNF-05", "A morte de um agente não derruba os outros nem perde o trabalho",
         "cada agente é um processo supervisionado, e a fila devolve a tarefa"],
        ["*RNF-06", "O gasto de uma rodada não ultrapassa um teto declarado",
         "parada limpa: impede começar o que não cabe, nunca corta no meio"],
        ["*RNF-07", "Trocar o fornecedor de modelo não exige alterar o núcleo",
         "uma fronteira declarada; o fornecedor entra como adaptador"]],
       [1.8, 7.2, 8.4])

# ================================================================ PARTE III
parte("III", "As ferramentas",
      "O que será usado para construir, com versão, papel e a justificativa de cada escolha.",
      cor="C24E1E")

doc.add_heading("8.  Por que Elixir e a plataforma OTP", level=1)

p("É a decisão mais consequente do projeto, e a que mais precisa de justificativa — Elixir não é "
  "a escolha óbvia para um sistema que conversa com modelos de linguagem, território de Python. "
  "O argumento é sobre a natureza do gargalo: o sistema não faz contas pesadas, ele espera. Cada "
  "agente passa a maior parte do tempo aguardando um serviço remoto que demora dezenas de "
  "segundos e pode falhar. O problema real é manter dezenas desses trabalhos em voo, poder cortar "
  "um com segurança e sobreviver quando um morre — que é exatamente para o que a plataforma OTP "
  "foi construída.")

caixa("O MAPEAMENTO DECISIVO",
      "Um agente em execução é um processo supervisionado: tem identificador, tem dono, tem quem "
      "o mate quando preciso e quem perceba que morreu — de graça, pela plataforma. Onde agentes "
      "são apenas chamadas de função dentro de um laço, nada disso existe sem ser construído à mão.")

tabela(["Alternativa", "O que ganharia", "Por que não foi escolhida"],
       [["*Python + Celery", "o ecossistema de IA mais rico",
         "isolamento e supervisão ficam por conta da aplicação; matar um trabalho no meio é "
         "notoriamente frágil"],
        ["*Node/TypeScript", "uma linguagem só, do banco à tela",
         "concorrência de espera é bem servida, mas um erro não isolado derruba o processo inteiro"],
        ["*Go", "concorrência excelente, binário único",
         "sem supervisão hierárquica embutida; a árvore de recuperação seria escrita à mão"],
        ["*Elixir/OTP", "supervisão, isolamento e concorrência nativos",
         "ESCOLHIDA — ao custo de um ecossistema de IA menor"]],
       [3.1, 4.9, 9.4])

caixa("O QUE ELIXIR NÃO RESOLVE",
      "Honestidade obrigatória, e deve constar da defesa: Elixir não barateia o modelo — o preço "
      "por token é do fornecedor. E o ecossistema de IA em Elixir é menor que o de Python. O risco "
      "é aceitável porque a parte pesada é espera de rede, não cálculo; a única etapa numérica tem "
      "biblioteca madura e pode ser delegada a um serviço externo.",
      cor="C24E1E", fundo="FCF0EA", cor_titulo=LARANJA)

doc.add_heading("9.  A pilha, camada por camada", level=1)

tabela(["Ferramenta", "Ver.", "Papel no sistema", "Por que ela, e não outra"],
       [["*Elixir", "1.19", "Linguagem de todo o sistema",
         "sintaxe de alto nível sobre a plataforma OTP"],
        ["*Erlang/OTP", "28", "Runtime: processos, supervisão, tolerância a falha",
         "é a razão da escolha da plataforma"],
        ["*Mix", "—", "Compilação, dependências e comandos próprios",
         "vem com a linguagem; as rotinas do projeto viram comandos `mix`"],
        ["*Phoenix", "1.8", "Framework web que serve o painel",
         "padrão do ecossistema; integra com a árvore de supervisão"],
        ["*LiveView", "1.2", "Tela ao vivo, atualizada pelo servidor",
         "evita uma segunda pilha de frontend só para mostrar estado que já está no servidor"],
        ["*Bandit", "1.5", "Servidor HTTP", "escrito em Elixir puro; menos peças"],
        ["*Tailwind + daisyUI", "—", "Estilo do painel",
         "componentes prontos; o painel é ferramenta de uso próprio, não produto"],
        ["*PostgreSQL", "18", "Banco: todo o estado do sistema",
         "transação real — permite mudar estado, gravar relatório e lançar custo atomicamente"],
        ["*Ecto", "3.13", "Acesso ao banco, migrações e validação",
         "a camada de dados idiomática do ecossistema"],
        ["*Oban", "2.24", "Fila de trabalhos durável, dentro do próprio banco",
         "enfileirar um trabalho e mudar o estado da tarefa na MESMA transação; fila externa não "
         "permitiria"],
        ["*pgvector", "0.8", "Busca por similaridade semântica",
         "extensão do próprio PostgreSQL: a memória mora no mesmo banco do estado, sem segundo "
         "serviço"],
        ["*ExUnit", "—", "Suíte de testes", "vem com a linguagem"],
        ["*Credo", "1.7", "Análise estática de estilo",
         "roda em modo estrito; reprovar nele interrompe a verificação"],
        ["*Dialyzer", "—", "Checagem estática de tipos",
         "é uma das formas concretas de mover a regra para o compilador"],
        ["*Req", "0.5", "Cliente HTTP para falar com o modelo",
         "de baixo nível de propósito: o sistema precisa controlar onde marcar os pontos de cache"],
        ["*Telemetry", "1.0", "Instrumentação: eventos e métricas por despacho",
         "o painel lê os mesmos eventos que o motor emite"],
        ["*Git", "—", "Versionamento do sistema e de cada projeto construído",
         "cada projeto gerado nasce como repositório próprio, com um commit por tarefa"]],
       [2.7, 1.0, 5.3, 8.4], tam=7.6)

doc.add_heading("10.  A verificação como comando único", level=1)

p("Todo o controle de qualidade fica atrás de um comando só, e a ordem dos estágios é a regra: o "
  "que falha mais rápido e mais barato roda primeiro, e o primeiro que falhar interrompe os "
  "seguintes. É este comando que roda em toda verificação — tanto à mão quanto quando um agente "
  "verifica a própria entrega.")

codigo(["mix verificar   # um comando, quatro estagios, do mais barato ao mais caro",
        "  1. mix format --check-formatted     # formatacao   — segundos",
        "  2. mix compile --warnings-as-errors # compilacao   — aviso reprova",
        "  3. mix credo --strict               # estilo       — modo estrito",
        "  4. mix test                         # testes       — sem rede, sem cota",
        "",
        "mix dialyzer   # checagem de tipos: estagio proprio, fora do comando do dia a dia,",
        "               # porque a primeira execucao demora minutos. Nao e opcional."])

p("O ambiente será montado na Etapa 4 com scripts de instalação reproduzíveis, não passo a passo "
  "em prosa: o trabalho pode precisar mudar de máquina, e instalação que não se reproduz é "
  "trabalho perdido. O banco não será instalado como serviço do sistema, e sim subido por script "
  "quando se for trabalhar — assim não consome memória o tempo todo, o que importa sob o RNF-01.",
  antes=2)

# ================================================================ PARTE IV
parte("IV", "A arquitetura planejada",
      "Como as peças se encaixam, e onde cada regra da Parte I vai morar.", cor="184F95")

doc.add_heading("11.  Visão em camadas", level=1)

p("Quatro camadas, com uma regra: cada uma só conhece a de baixo. O painel não fala com o modelo; "
  "ele lê o mesmo banco e escuta os mesmos eventos que o motor emite — assim a tela não tem uma "
  "cópia própria do estado para divergir.", depois=2)

figura("fig3_arquitetura.png",
       "Figura 1 — As quatro camadas. As duas fronteiras do meio (em roxo) são o que permite "
       "trocar o fornecedor de modelo ou o mecanismo de busca sem tocar no motor.", 15.6)

doc.add_heading("12.  O ciclo de vida de uma tarefa", level=1)

p("A unidade de trabalho é a tarefa: pequena, com objetivo escrito e critérios de aceite que são "
  "comandos, não opiniões. Ela percorre seis estados, e cada passagem é feita por um agente "
  "diferente do que a construiu.", depois=2)

figura("fig4_ciclo.png",
       "Figura 2 — Os seis estados e os dois portões, que respondem a perguntas independentes: "
       "uma entrega pode funcionar perfeitamente e ainda assim não ser a que foi pedida.", 16.2)

rico([("Por que dois portões, e não um.  ", True, AZUL),
      ("Porque \"passou nos testes\" e \"é o que foi pedido\" são perguntas diferentes, e a segunda não é redutível à primeira. Um critério de aceite mal escrito pode ser satisfeito por uma entrega que resolve outro problema; o segundo portão existe para pegar exatamente isso, e reprovar por ali não exige apontar defeito técnico nenhum.", False)], tam=9.2, antes=1, depois=3)

rico([("A ferramenta que o revisor não recebe.  ", True, AZUL),
      ("O agente que revisa não tem, entre suas ferramentas, nenhuma que escreva em arquivo. Não é "
       "uma instrução para que não corrija: é a ausência da capacidade. É o exemplo mais direto do "
       "que a tese propõe — a separação entre construir e aprovar deixa de depender de disciplina "
       "e passa a depender da estrutura.", False)], tam=9.2, antes=1, depois=3)

doc.add_heading("13.  O que acontece quando falha", level=1)

p("Falha é o caso comum, não a exceção — e é onde a maioria dos sistemas ou desiste cedo demais "
  "ou entra em laço infinito. Cada reprovação muda a estratégia, em vez de repetir a aposta que "
  "já falhou. O contador de ciclos é incrementado pelo sistema: o agente não tem ferramenta para "
  "alterá-lo.", depois=2)

tabela(["Ciclo", "Resposta", "O que muda em relação à tentativa anterior"],
       [["*1º", "Sobe o modelo", "o retrabalho usa um modelo mais forte que o do disparo. O "
                                 "gatilho é um fato medido — a tarefa voltou reprovada —, não um "
                                 "palpite feito antes de tentar"],
        ["*2º", "Troca o especialista", "duas reprovações sob o mesmo prompt indicam viés de "
                                        "ataque, e não dificuldade da tarefa"],
        ["*3º", "Replaneja", "a tarefa é quebrada ou reescrita; a original é cancelada com "
                             "referência à substituta"],
        ["*4º", "Bloqueia", "vai para o humano, com o motivo registrado na própria tarefa"]],
       [1.4, 3.6, 12.4])

doc.add_heading("14.  A fronteira do fornecedor de modelo", level=1)

tabela(["Família", "Quem roda o laço de ferramentas", "Como é governada"],
       [["*Agente completo", "o próprio fornecedor",
         "por opções de invocação: permissão, ferramentas permitidas, diretório de trabalho, teto "
         "de turnos"],
        ["*Endpoint de modelo", "o sistema, com as próprias ferramentas",
         "pelas ferramentas que o sistema implementa e entrega ao modelo"]],
       [3.6, 5.0, 8.8])

p("A régua que o projeto se impõe: acrescentar um fornecedor deve ser escrever um adaptador e "
  "declará-lo — nunca alterar o núcleo. A Etapa 8 terá um critério de aceite que prova isso, "
  "conduzindo dois adaptadores definidos apenas no código de teste, sem alterar uma linha do "
  "código de produção.", antes=1)

# ================================================================ PARTE V
parte("V", "O método e o cronograma",
      "Por que cascata, e como os 195 dias se dividem.", cor="14865D")

doc.add_heading("15.  Por que o modelo cascata", level=1)

p("As fases acontecem em sequência, e cada uma só começa quando a anterior fecha num portão "
  "verificado. É um modelo criticado onde os requisitos são voláteis — e é por isso que cabe "
  "aqui: o problema é conhecido antes de começar, porque um protótipo funcional já existe e será "
  "medido na Etapa 2; há um único desenvolvedor e prazo fixo, sem cliente mudando de ideia; e a "
  "pesquisa exige que os critérios de sucesso estejam escritos antes de existir o código que será "
  "medido — ajustar o alvo depois de ver onde a flecha caiu invalida o resultado.")

caixa("O CUIDADO QUE O MODELO EXIGE",
      "Tarefa escrita com meses de antecedência envelhece: as últimas serão executadas sobre um "
      "código que já tomou decisões que o planejamento não podia prever. Por isso as etapas E07, "
      "E09, E10 e E11 abrem conferindo o plano contra o código que existe, e registrando o que foi "
      "ajustado e por quê. \"Conferido, nada divergiu\" também é registro válido. É o controle de "
      "mudança da cascata, aplicado dentro da construção.",
      cor="4A3AA7", fundo="EFEDFA", cor_titulo=ROXO)

figura("fig2_esforco.png",
       "Figura 3 — Como os 195 dias se dividem entre as quatro fases. Um projeto de pesquisa que gasta 85% do prazo codificando chega ao fim com muito código e nenhuma medição.", 16.4)

figura("fig1_cronograma.png",
       "Figura 4 — As 13 etapas de 15 dias, de 13 de abril a 24 de outubro de 2026. Trinta por "
       "cento do prazo acontece antes da primeira linha de código, e quinze por cento depois da "
       "última.", 16.4)

p("Cada etapa de implementação termina num marco — uma afirmação demonstrável rodando o sistema, não descrevendo-o. Os marcos são cumulativos: cada um pressupõe todos os anteriores, e é isso que impede o projeto de avançar sobre fundação não verificada.", antes=3, depois=2)

figura("fig7_marcos.png",
       "Figura 5 — Os sete marcos de implementação. Não medem porcentagem de conclusão: medem capacidade adquirida.", 15.8)

# ================================================================ PARTE VI
parte("VI", "As 13 etapas",
      "O que será feito em cada quinzena, e o que precisa ser verdade para a seguinte começar.",
      cor="2A78D6")

tabela(["Etapa", "Objetivo e atividades principais", "Portão de saída"],
       [["*E01\n13/04–27/04",
         "*Requisitos e viabilidade.  Caracterizar o problema; elicitar requisitos funcionais e "
         "não funcionais, cada um com o mecanismo que o verificará; fixar o perfil de máquina alvo "
         "(8 GB, 4 núcleos) como restrição de arquitetura; estudar viabilidade de custo; delimitar "
         "o escopo por escrito.",
         "Requisitos revisados e congelados. Daqui em diante, requisito novo só entra por controle "
         "de mudança registrado."],

        ["*E02\n28/04–12/05",
         "*Estado da arte e linha de base.  Revisar os sistemas multi-agente existentes e "
         "delimitar a originalidade; auditar as execuções reais do protótipo, extraindo custo por "
         "despacho, ciclos por tarefa e taxa de reprovação; catalogar os mecanismos do protótipo "
         "que funcionam e não estão documentados.",
         "Linha de base extraída e congelada. É o portão mais importante da primeira metade: sem "
         "número anterior, a conclusão seria uma afirmação, não um resultado."],

        ["*E03\n13/05–27/05",
         "*Projeto arquitetural.  Decidir a plataforma a partir da natureza do gargalo, "
         "registrando o motivo de cada recusa; desenhar as camadas, a máquina de estados com os "
         "dois portões, a escada do fracasso e as fronteiras trocáveis; mapear cada regra de "
         "governança a um mecanismo concreto.",
         "Arquitetura revisada e congelada. Decisões registradas não se reabrem sem fato novo — e "
         "o que conta como fato novo está escrito."],

        ["*E04\n28/05–11/06",
         "*Projeto detalhado e ambiente.  Decompor o sistema em sete incrementos utilizáveis; "
         "escrever as tarefas atômicas com critérios de aceite executáveis; montar o grafo de "
         "dependências; instalar e provar o ambiente com script reproduzível; documentar as "
         "armadilhas de instalação.",
         "Ambiente responde ao teste de sanidade e as tarefas estão revisadas. Fim da fase de "
         "projeto: a codificação começa, e o que ela fará já está escrito."],

        ["*E05\n12/06–26/06",
         "*Fundação verificável.  Criar o projeto com a barra de qualidade desde o commit "
         "inicial; criar o esquema do banco (projetos, tarefas, ciclos, despachos, custos); "
         "implementar as duas fronteiras com adaptadores falsos determinísticos; contabilidade em "
         "duas unidades; backup e restauração; importar a linha de base.",
         "*MARCO 1 — a suíte roda sem rede, sem cota e sem chave de API, provado por um teste que "
         "falha de propósito se a chave estiver definida."],

        ["*E06\n27/06–11/07",
         "*O agente e as ferramentas.  Construir o índice denso do projeto, gerado por programa e "
         "sem modelo; montar o prefixo estável para reaproveitamento de cache; ferramentas de "
         "arquivo com confinamento embutido; ferramenta de comando com prazo e morte da árvore de "
         "processos; o laço do agente como processo supervisionado; teto de chamadas por papel; os "
         "dois adaptadores de fornecedor.",
         "*MARCO 2 — um agente resolve uma tarefa real de ponta a ponta, e a soma do custo das "
         "voltas bate com o total informado pelo fornecedor."],

        ["*E07\n12/07–26/07",
         "*A linha de produção.  Conferir o plano contra o código existente; implementar os seis "
         "estados com transição transacional; promoção por dependências e ordenação da fila; "
         "execução mecânica dos critérios com lista de binários permitidos; a distinção entre "
         "comando quebrado e entrega falha; os dois portões; o diagnóstico de reprovação e a "
         "escada de quatro degraus.",
         "*MARCO 3 — uma tarefa percorre os seis estados, reprova DE PROPÓSITO num critério "
         "plantado para falhar, é retrabalhada e conclui."],

        ["*E08\n27/07–10/08",
         "*Integração e governança do fornecedor.  Escrever e versionar um instrumento de medição "
         "ANTES de rodá-lo; medir a superfície real de governança do fornecedor (permissões, "
         "confinamento de diretório, teto de turnos); provar o confinamento em vez de presumi-lo; "
         "impor o teto de voltas pelo mecanismo do fornecedor. Etapa com folga reservada para o "
         "replanejamento que a medição pode exigir.",
         "*MARCO 4 — trocar de fornecedor não toca o núcleo: dois adaptadores definidos apenas no "
         "código de teste são conduzidos sem uma linha alterada em produção."],

        ["*E09\n11/08–25/08",
         "*Concorrência e tolerância a falhas.  Conferir o plano contra os custos já medidos; "
         "árvore de supervisão com um processo por tarefa em voo; fila durável que enfileira e "
         "muda o estado na mesma transação; exclusão mútua por área de arquivo verificada pelo "
         "motor; teto de orçamento com parada limpa; recuperação de trabalho parcial; medir o pico "
         "de memória.",
         "*MARCO 5 — três tarefas em paralelo; matar o processo de uma não afeta as outras, e a "
         "morta volta à fila sem perder o que já foi feito."],

        ["*E10\n26/08–09/09",
         "*A memória do projeto.  Medir disco, memória e tempo do modelo de vetores antes de "
         "escolher entre rodá-lo na máquina ou delegar a um serviço; ingestão do histórico no "
         "commit, fora do caminho crítico; busca híbrida combinando similaridade semântica e termo "
         "exato; bloco de contexto com a fonte citada; avaliar a qualidade da recuperação.",
         "*MARCO 6 — num projeto com histórico, o agente cita a decisão anterior em vez de decidir "
         "de novo, e a citação aponta para a fonte correta."],

        ["*E11\n10/09–24/09",
         "*Painel e automação.  Conferir o que o banco grava contra o que as telas mostram; quadro "
         "de tarefas por estado ao vivo; console do agente e custo da rodada; parar e retomar um "
         "processo supervisionado; encadeamento automático de rodadas com a decisão isolada como "
         "função pura e com teto de gasto e de rodadas obrigatórios; varredura de segredos.",
         "*MARCO 7 — um projeto inteiro acompanhado na tela do pedido à entrega, com o custo "
         "atualizando em tempo real e um botão que interrompe com segurança."],

        ["*E12\n25/09–09/10",
         "*Testes de sistema em uso real.  Selecionar de três a cinco projetos nunca usados "
         "durante a construção; executar cada um do pedido à entrega sem intervenção, registrando "
         "tarefas, ciclos, reprovações, bloqueios e custo; testar na máquina alvo medindo o pico "
         "de memória; provocar falhas de propósito — matar agentes, derrubar o banco, esgotar a "
         "cota; catalogar cada defeito com a causa raiz.",
         "Os projetos rodaram do pedido à entrega e o comportamento real está documentado, "
         "inclusive onde falhou. Defeito observado e não registrado é defeito que volta."],

        ["*E13\n10/10–24/10",
         "*Refinamento, medição final e entrega.  Executar as correções priorizadas, cada uma com "
         "o teste que impede a regressão; reexecutar os projetos de teste; medir contra a linha de "
         "base da E02 nas mesmas dimensões — custo por tarefa, ciclos, taxa de reprovação, "
         "bloqueios e tempo; publicar o número; escrever o documento de entrega.",
         "*MARCO FINAL — um projeto inteiro entregue sem intervenção, e o resultado medido contra "
         "a linha de base, com o número publicado."]],
       [1.9, 10.0, 5.5], tam=7.5)

# ================================================================ PARTE VII
parte("VII", "Prática, riscos e resultado",
      "As quatro últimas semanas, o que pode dar errado e como o sucesso será julgado.",
      cor="B52C2C")

caixa("O QUE MUDA NAS QUATRO ÚLTIMAS SEMANAS",
      "Até a Etapa 11 o sistema terá sido construído contra tarefas escolhidas e critérios "
      "controlados: isso prova que as peças funcionam, não que o conjunto entrega. Nas Etapas 12 e "
      "13 deixa de haver tarefa preparada — o sistema recebe projetos que nunca viu, com falhas "
      "não previstas, custo real e cota real. Cada falha observada vira uma correção com a causa "
      "registrada, e é esse registro, mais do que o sistema funcionando, que sustenta a conclusão. "
      "São as duas etapas que NÃO devem ser sacrificadas se algo atrasar: o corte sai do escopo da "
      "E10 ou da E11, que são incrementos, não fundação.",
      cor="14865D", fundo="E7F7F1", cor_titulo=VERDE)

doc.add_heading("16.  Riscos e mitigação", level=1)

tabela(["Risco", "Impacto", "Mitigação planejada"],
       [["*Uma premissa sobre a interface do fornecedor não se confirmar", "alto",
         "instrumento de medição escrito e versionado ANTES de rodar, na E08, com folga na própria "
         "etapa para o replanejamento"],
        ["*Tarefas planejadas na E04 envelhecerem até serem executadas", "médio",
         "conferência obrigatória do plano contra o código no início das etapas E07, E09, E10 e "
         "E11"],
        ["*O custo de execução estourar o orçamento", "alto",
         "contabilidade em duas unidades desde a E05; teto por rodada e por tarefa na E09, com "
         "parada limpa"],
        ["*O limite de cota interromper trabalho no meio", "médio",
         "reconhecer a parada, registrar o trabalho parcial e retomar; nunca descartar o que já "
         "foi feito"],
        ["*O modelo de vetores não caber na máquina alvo", "médio",
         "a decisão local × serviço é tomada por medição na E10, e o componente é adaptador "
         "trocável desde a E05"],
        ["*Atraso acumulado comprimir as etapas finais", "alto",
         "as E12 e E13 são inegociáveis; o corte sai do escopo da E10 ou da E11"],
        ["*Falta de acesso pago bloquear uma medição", "baixo",
         "todo marco é dividido em uma parte demonstrável sem custo e outra que exige gasto; a "
         "segunda é declarada pendente, não reprovada"]],
       [4.8, 1.6, 11.0], tam=7.7)

doc.add_heading("17.  Entregas ao orientador", level=1)

tabela(["Quando", "O que será entregue"],
       [["*Fim da E02 · 12/05", "Requisitos congelados, revisão do estado da arte e a linha de "
                                "base medida"],
        ["*Fim da E04 · 11/06", "Documento de arquitetura com as decisões justificadas, e o plano "
                                "de tarefas completo"],
        ["*Fim da E07 · 26/07", "Demonstração ao vivo: uma tarefa percorrendo os seis estados, "
                                "incluindo uma reprovação provocada"],
        ["*Fim da E09 · 25/08", "Demonstração: tarefas em paralelo e recuperação de falha "
                                "provocada"],
        ["*Fim da E11 · 24/09", "Demonstração: um projeto acompanhado na tela, do pedido à entrega"],
        ["*Fim da E13 · 24/10", "Documento de entrega com a medição final contra a linha de base, "
                                "e a defesa preparada"]],
       [4.0, 13.4])

doc.add_heading("18.  O resultado esperado", level=1)

p("Ao fim dos 195 dias, o trabalho deve poder demonstrar que as regras de governança de um sistema "
  "multi-agente podem ser movidas do prompt para a estrutura do programa, e que a mudança se "
  "traduz em número: menos ciclos de retrabalho por tarefa, menos tarefas abandonadas por "
  "esgotamento e custo por entrega comparável ou menor que o da linha de base.")

p("Vale registrar o que o trabalho NÃO vai afirmar. Não que o sistema escreve código melhor que "
  "outros — a qualidade do código é do modelo, não da arquitetura em volta dele. Não que a "
  "abordagem é mais barata em termos absolutos, porque o preço por token é do fornecedor. E não "
  "que dispensa supervisão humana: dispensa intervenção durante a construção, o que é diferente.",
  antes=1)

caixa("O QUE FICA, SE TUDO O MAIS MUDAR",
      "Modelos vão melhorar, ficar mais baratos e mudar de nome. A parte deste trabalho que não "
      "depende disso é a estrutura: tarefas pequenas com estado explícito, dois julgamentos "
      "independentes feitos por quem não construiu, falha limitada com uma tentativa de "
      "redimensionamento antes de desistir, e tudo registrado no instante em que acontece. Se o "
      "modelo de amanhã for dez vezes melhor, essa estrutura continua sendo o que transforma "
      "capacidade em entrega confiável.")

doc.save(DESTINO)
print("gerado:", DESTINO)
