# -*- coding: utf-8 -*-
"""Corpo do PLANO DE DESENVOLVIMENTO. Usa os helpers de plano_base.py.

Monte com `python gerar_plano.py`. Nao rode este arquivo sozinho.
"""


# ------------------------------------------------------------------- helper local
def etapa(cod, titulo, janela, objetivo, atividades, entregaveis, portao, cor="2A78D6"):
    """Um bloco de etapa: faixa com codigo e titulo, objetivo, atividades, saida."""
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cel = t.rows[0].cells[0]
    cel.width = Cm(17.4)
    sombra(cel, cor)
    _sem_bordas(t)
    par = cel.paragraphs[0]
    par.paragraph_format.space_before = Pt(2)
    par.paragraph_format.space_after = Pt(2)
    fonte(par.add_run(cod + "   "), tam=10.5, negrito=True, cor=BRANCO)
    fonte(par.add_run(titulo + "   "), tam=10.5, negrito=True, cor=BRANCO)
    fonte(par.add_run(janela), tam=8, cor=BRANCO, italico=True)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)

    rico([("Objetivo.  ", True, RGBColor(0x18, 0x4F, 0x95)), (objetivo, False)], tam=9.3, depois=2)

    p("Atividades", tam=8.2, cor=MUDO, negrito=True, antes=2, depois=1)
    for negrito, resto in atividades:
        marcador(negrito, resto, tam=9.0)

    rico([("Entregáveis.  ", True, RGBColor(0x52, 0x51, 0x4E)), (entregaveis, False, CINZA)],
         tam=8.8, antes=3, depois=2)
    caixa("PORTÃO DE SAÍDA", portao, cor="14865D", fundo="E7F7F1", cor_titulo=VERDE, tam=8.6)


# ================================================================ CAPA
p("Fábrica de Software Multi-Agente", tam=22, cor=AZUL, negrito=True,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=1, espaco=1.0)
p("Plano de desenvolvimento", tam=12.5, cor=CINZA,
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

p("Trabalho de Conclusão de Curso   ·   Enzo Consulo   ·   abril de 2026", tam=9,
  cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=7)

caixa("O QUE SERÁ CONSTRUÍDO",
      "Um sistema que recebe a descrição de um projeto em linguagem natural e o constrói de ponta "
      "a ponta. Não é um assistente que responde perguntas sobre código: é uma linha de produção "
      "em que agentes especializados planejam, implementam, verificam, revisam e documentam — cada "
      "um com um papel definido e com autoridade limitada. A intervenção humana obrigatória "
      "acontece uma única vez, no pedido inicial.")

caixa("O QUE É ESTE DOCUMENTO",
      "O planejamento do desenvolvimento, escrito antes da primeira linha de código. Ele define o "
      "problema, os requisitos, a arquitetura pretendida, as ferramentas que serão usadas e um "
      "cronograma de 13 etapas de 15 dias, cada uma com um portão de saída verificável. As quatro "
      "últimas semanas são reservadas para sair do papel: colocar o sistema para construir "
      "projetos reais, medir o que ele entrega e refinar o que a prática mostrar. Foi escrito para "
      "ser lido por quem não conhece Elixir nem as ferramentas envolvidas — todo termo técnico é "
      "definido antes do primeiro uso.",
      cor="14865D", fundo="E7F7F1", cor_titulo=VERDE)

doc.add_heading("Roteiro", level=1)

tabela(["Parte", "O que ela responde", "Onde chega"],
       [["*I — O problema", "por que trabalho longo com um modelo de linguagem falha",
         "a tese e os objetivos do trabalho"],
        ["*II — Os requisitos", "o que o sistema precisa fazer, e sob que restrições",
         "os critérios pelos quais ele será julgado"],
        ["*III — As ferramentas", "o que será usado para construir, e por quê",
         "a pilha completa, camada por camada"],
        ["*IV — A arquitetura", "como as peças se encaixam e onde mora cada regra",
         "o ciclo de uma tarefa, do pedido à entrega"],
        ["*V — O método", "por que cascata, e como o cronograma se divide",
         "as 13 etapas e os marcos de cada uma"],
        ["*VI — As etapas", "o que exatamente será feito em cada quinzena",
         "objetivo, atividades e portão de saída de cada etapa"],
        ["*VII — O fechamento", "como o resultado será medido, e o que pode dar errado",
         "os riscos, as entregas e o critério de sucesso"]],
       [3.4, 7.5, 6.5])

quebra()

# ================================================================ PARTE I
parte("I", "O problema e os objetivos",
      "Por que um modelo que escreve código bem ainda não constrói software sozinho.")

doc.add_heading("1.  O problema", level=1)

p("Modelos de linguagem escrevem código competente. Isso já não é o gargalo. O gargalo aparece "
  "quando o trabalho é longo: uma tarefa que exige vinte decisões encadeadas, cada uma dependendo "
  "da anterior, com verificação no meio e correção depois. Aí o modelo perde o fio — não porque "
  "escreve pior, mas porque nada no sistema o obriga a manter o rumo.")

p("Os sistemas multi-agente disponíveis hoje atacam esse problema colocando vários modelos para "
  "conversar entre si. É uma boa intuição, e ela esbarra num limite: a coordenação entre eles "
  "costuma ser escrita como texto dentro de um prompt. \"Não modifique arquivos fora do projeto\", "
  "\"não tente mais de três vezes\", \"não aprove seu próprio trabalho\". São instruções, e "
  "instrução dirigida a um modelo probabilístico é um pedido, não uma garantia.", antes=2)

caixa("O DIAGNÓSTICO",
      "Um sistema multi-agente não falha por escrever mal — falha por governar mal. E governança "
      "escrita em prosa dentro de um prompt é governança opcional, porque quem a lê é um modelo "
      "que pode não obedecer, sem que nada no sistema perceba.",
      cor="B52C2C", fundo="FBECEA", cor_titulo=VERMELHO)

doc.add_heading("2.  A proposta", level=1)

p("A proposta deste trabalho é mover cada uma dessas regras para um lugar onde ela deixe de ser "
  "opcional:")

marcador("A regra de não escrever fora do projeto ",
         "não é pedida ao agente: é a ferramenta de escrita que resolve o caminho e recusa o que "
         "está fora da raiz. O agente não tem como desobedecer, porque não tem como tentar.")
marcador("O limite de três tentativas ",
         "não é lembrado ao agente: é uma coluna no banco de dados, incrementada pelo sistema. O "
         "agente sequer recebe uma ferramenta para alterá-la.")
marcador("A separação entre construir e aprovar ",
         "não é combinada: quem revisa simplesmente não recebe a ferramenta de editar arquivos. "
         "Aprovar o próprio conserto deixa de ser uma questão de disciplina.")
marcador("O teto de gasto ",
         "não é uma recomendação: é um supervisor que impede um trabalho de começar quando o "
         "custo estimado não cabe no orçamento restante.")

p("O nome técnico disso é mover a regra do prompt para a estrutura — para o compilador, para a "
  "árvore de processos e para o esquema do banco de dados. É essa troca que o trabalho investiga, "
  "e é ela que a arquitetura da Parte IV materializa peça por peça.", antes=3)

caixa("A TESE",
      "O sistema não precisa ser mais esperto que os que existem hoje: precisa ser mais difícil de "
      "operar errado. Uma regra que o sistema pede é uma regra opcional; uma regra que a estrutura "
      "garante é uma propriedade.")

doc.add_heading("3.  Objetivos", level=1)

rico([("Objetivo geral.  ", True, AZUL),
      ("Projetar, implementar e avaliar um sistema multi-agente para construção de software em que "
       "as regras de governança — confinamento, limite de retrabalho, separação entre construir e "
       "aprovar, e teto de custo — sejam impostas pela estrutura do programa, e não solicitadas em "
       "linguagem natural a um modelo.", False)], tam=9.3, depois=4)

p("Objetivos específicos", tam=8.6, cor=MUDO, negrito=True, antes=2, depois=1)

tabela(["#", "Objetivo específico", "Como será verificado"],
       [["*OE1", "Levantar o estado da arte em sistemas multi-agente para engenharia de software e "
                 "delimitar a contribuição original", "revisão bibliográfica escrita e comparada"],
        ["*OE2", "Estabelecer uma linha de base de medição a partir de um protótipo funcional, "
                 "antes de construir a versão final", "conjunto de dados extraído e congelado"],
        ["*OE3", "Projetar uma arquitetura em que cada regra de governança tenha um mecanismo "
                 "estrutural correspondente", "cada regra mapeada a um mecanismo, com justificativa"],
        ["*OE4", "Implementar o sistema em sete incrementos, cada um encerrado por um marco "
                 "executável", "os sete marcos, verificados por comando"],
        ["*OE5", "Colocar o sistema para construir projetos reais e medir o resultado contra a "
                 "linha de base", "comparação quantitativa nas mesmas dimensões"],
        ["*OE6", "Refinar o sistema a partir do que a operação real revelar",
                 "registro das correções, com a causa de cada uma"]],
       [1.5, 9.3, 6.6])

doc.add_heading("4.  Delimitação do escopo", level=1)

p("Declarar o que fica de fora é parte do planejamento, e evita que o trabalho cresça sem "
  "controle no meio do caminho.")

tabela(["Fica DENTRO do escopo", "Fica FORA do escopo, e por quê"],
       [["*Construção de software, do pedido à entrega",
         "Geração de imagem, áudio ou vídeo — outro domínio de verificação"],
        ["*Um provedor de modelo, com a fronteira preparada para outros",
         "Catálogo de provedores, negociação de capacidades, sistema de plugins"],
        ["*Execução local, numa única máquina",
         "Implantação em nuvem, múltiplos nós, escalonamento horizontal"],
        ["*Painel de acompanhamento de uso próprio",
         "Multiusuário, autenticação, permissões — não há segundo operador"],
        ["*Medição de custo, ciclos e taxa de reprovação",
         "Avaliação da qualidade estética do código gerado — subjetiva demais para medir"]],
       [8.7, 8.7])

quebra()

# ================================================================ PARTE II
parte("II", "Os requisitos",
      "O que o sistema precisa fazer, sob que restrições, e como cada exigência será verificada.",
      cor="4A3AA7")

doc.add_heading("5.  Requisitos funcionais", level=1)

tabela(["#", "Requisito funcional", "Etapa"],
       [["*RF-01", "A partir de uma descrição em linguagem natural, o sistema produz especificação, "
                   "plano de execução e uma lista de tarefas decompostas", "E07"],
        ["*RF-02", "Cada tarefa percorre seis estados explícitos, e cada mudança de estado é "
                   "registrada junto com o relatório e o custo que a produziram", "E07"],
        ["*RF-03", "Toda entrega passa por dois julgamentos independentes: um verifica se funciona, "
                   "outro verifica se é o que foi pedido", "E07"],
        ["*RF-04", "Uma entrega reprovada volta para execução com o relatório anexado, e o sistema "
                   "decide COMO refazer a partir da causa da reprovação", "E07"],
        ["*RF-05", "O retrabalho tem limite; esgotado o limite, a tarefa é replanejada uma vez e, "
                   "se ainda assim falhar, entregue ao humano", "E07"],
        ["*RF-06", "Várias tarefas independentes podem ser construídas ao mesmo tempo, sem que "
                   "uma interfira no arquivo da outra", "E09"],
        ["*RF-07", "O sistema consulta o histórico do próprio projeto antes de decidir, e cita a "
                   "fonte do que recuperou", "E10"],
        ["*RF-08", "O andamento, o custo e a saída de cada agente são acompanhados numa tela, ao "
                   "vivo", "E11"]],
       [1.7, 12.6, 3.1])

doc.add_heading("6.  Requisitos não funcionais", level=1)

p("São estes que mais restringem a arquitetura — e, por isso, cada um vem com o mecanismo que "
  "pretende garanti-lo. Um requisito não funcional sem mecanismo é uma intenção.")

tabela(["#", "Requisito não funcional", "Mecanismo pretendido"],
       [["*RNF-01", "Roda em uma máquina modesta: 8 GB de RAM e 4 núcleos",
         "nenhum modelo carregado localmente antes da E10; o componente pesado vira adaptador "
         "trocável, escolhido por medição"],
        ["*RNF-02", "O custo é contabilizado em duas unidades — cota consumida e valor equivalente "
                    "em dólar", "tabela própria no banco, alimentada a cada volta do agente"],
        ["*RNF-03", "Nenhum agente escreve fora da raiz do projeto",
         "a ferramenta de escrita resolve o caminho e recusa; não é validação de texto"],
        ["*RNF-04", "A suíte de testes roda sem rede, sem consumir cota e sem chave de API",
         "adaptadores falsos determinísticos, e um teste que falha se a chave estiver definida"],
        ["*RNF-05", "A morte de um agente em execução não derruba os outros nem perde o trabalho",
         "cada agente é um processo supervisionado, e a fila devolve a tarefa"],
        ["*RNF-06", "O gasto de uma rodada não ultrapassa um teto declarado",
         "parada limpa: impede começar o que não cabe, nunca corta no meio"],
        ["*RNF-07", "Trocar o fornecedor de modelo não exige alterar o núcleo",
         "uma fronteira declarada; o fornecedor entra como adaptador"]],
       [1.9, 7.4, 8.1])

doc.add_heading("7.  Critérios de aceitação do trabalho", level=1)

p("O trabalho será considerado bem-sucedido se, ao fim da Etapa 13, as quatro afirmações abaixo "
  "puderem ser demonstradas ao vivo, e não apenas descritas.")

passos([("1", "Constrói sozinho",
         "Um projeto real é planejado, construído, verificado, revisado e entregue sem intervenção "
         "humana depois do pedido inicial."),
        ("2", "Governa de verdade",
         "Cada regra da Parte I tem um teste que a prova, incluindo testes que tentam violá-la "
         "de propósito e falham."),
        ("3", "Cabe na máquina",
         "Roda no perfil de 8 GB e 4 núcleos declarado no RNF-01, com o pico de memória medido."),
        ("4", "Melhora o medido",
         "O resultado é comparado à linha de base da Etapa 2 nas mesmas dimensões, com o número "
         "publicado — inclusive se for desfavorável.")])

quebra()

# ================================================================ PARTE III
parte("III", "As ferramentas",
      "O que será usado para construir o sistema, e a justificativa de cada escolha.",
      cor="C24E1E")

doc.add_heading("8.  A pilha, em uma página", level=1)

figura("fig6_ferramentas.png",
       "Figura 1 — As cinco famílias de ferramenta que o projeto usa. Nenhuma delas é escolha de "
       "gosto: cada uma resolve um requisito da Parte II, e a seção seguinte diz qual.", 17.0)

doc.add_heading("9.  Por que Elixir e a plataforma OTP", level=1)

p("Esta é a decisão mais consequente do projeto, e a que mais precisa de justificativa, porque "
  "Elixir não é a escolha óbvia para um sistema que conversa com modelos de linguagem — esse "
  "território é de Python.")

rico([("O argumento é sobre a natureza do gargalo.  ", True, AZUL),
      ("O sistema não faz contas pesadas: ele espera. Cada agente passa a maior parte do tempo "
       "aguardando a resposta de um serviço remoto que demora dezenas de segundos e que pode "
       "falhar. O problema real é manter dezenas desses trabalhos lentos e falíveis em voo ao "
       "mesmo tempo, poder cortar um deles com segurança, e sobreviver quando um morre.", False)],
     tam=9.3, antes=2, depois=3)

p("A plataforma OTP — o runtime sobre o qual Elixir roda, com trinta anos de uso em telefonia — "
  "foi construída exatamente para isso. Ela oferece um mapeamento que resolve o problema de "
  "governança do projeto inteiro:")

caixa("O MAPEAMENTO DECISIVO",
      "Um agente em execução é um processo supervisionado. Isso significa que ele tem um "
      "identificador, tem um dono, tem quem o mate quando preciso e tem quem perceba que ele "
      "morreu — de graça, pela plataforma. Nos ambientes em que agentes são apenas chamadas de "
      "função dentro de um laço, nada disso existe sem ser construído à mão.")

p("Alternativas consideradas, e o motivo de cada recusa", tam=8.6, cor=MUDO, negrito=True,
  antes=3, depois=1)

tabela(["Alternativa", "O que ganharia", "Por que não foi escolhida"],
       [["*Python + Celery", "o ecossistema de IA mais rico que existe",
         "isolamento e supervisão de processos ficam por conta da aplicação; matar um trabalho no "
         "meio é notoriamente frágil"],
        ["*Node/TypeScript", "uma linguagem só do banco à tela",
         "concorrência de espera é bem servida, mas um erro não isolado derruba o processo inteiro; "
         "é o desenho do protótipo, e é onde ele mais dói"],
        ["*Go", "concorrência excelente e binário único",
         "sem supervisão hierárquica embutida; a árvore de recuperação teria de ser escrita e "
         "testada à mão"],
        ["*Elixir/OTP", "supervisão, isolamento e concorrência de espera nativos",
         "ESCOLHIDA — ao custo de um ecossistema de IA menor, mitigado abaixo"]],
       [3.3, 5.6, 8.5])

caixa("O QUE ELIXIR NÃO RESOLVE",
      "Honestidade obrigatória, e ela deve constar da defesa: Elixir não barateia o modelo — o "
      "preço por token é do fornecedor, e nenhuma escolha de linguagem muda isso. E o ecossistema "
      "de IA em Elixir é menor que o de Python. O risco é aceitável porque a parte pesada do "
      "sistema é espera de rede, não cálculo; a única etapa numérica do projeto tem biblioteca "
      "madura e, se necessário, pode ser delegada a um serviço externo.",
      cor="C24E1E", fundo="FCF0EA", cor_titulo=LARANJA)

quebra()

doc.add_heading("10.  A pilha, camada por camada", level=1)

tabela(["Ferramenta", "Versão", "Papel no sistema", "Por que ela, e não outra"],
       [["*Elixir", "1.19", "Linguagem de todo o sistema",
         "sintaxe de alto nível sobre a plataforma OTP"],
        ["*Erlang/OTP", "28", "Runtime: processos, supervisão, tolerância a falha",
         "é a razão da escolha; ver seção 9"],
        ["*Mix", "—", "Compilação, dependências e tarefas de linha de comando",
         "vem com a linguagem; as tarefas próprias do projeto viram comandos `mix`"],
        ["*Phoenix", "1.8", "Framework web que serve o painel",
         "padrão do ecossistema; integra com a árvore de supervisão"],
        ["*LiveView", "1.2", "Tela ao vivo, atualizada pelo servidor",
         "evita uma segunda pilha de frontend só para mostrar estado que já está no servidor"],
        ["*Bandit", "1.5", "Servidor HTTP", "escrito em Elixir puro; menos peças que o alternativo"],
        ["*Tailwind + daisyUI", "—", "Estilo do painel",
         "componentes prontos; o painel é ferramenta de uso próprio, não produto"],
        ["*PostgreSQL", "18", "Banco de dados: todo o estado do sistema",
         "transação real — é o que permite mudar estado, gravar relatório e lançar custo de forma "
         "atômica"],
        ["*Ecto", "3.13", "Acesso ao banco, migrações e validação",
         "a camada de dados idiomática do ecossistema"],
        ["*Oban", "2.24", "Fila de trabalhos durável, dentro do próprio banco",
         "permite enfileirar um trabalho e mudar o estado da tarefa na MESMA transação; uma fila "
         "externa não permitiria"],
        ["*pgvector", "0.8", "Busca por similaridade semântica",
         "extensão do próprio PostgreSQL: a memória do projeto mora no mesmo banco do estado, sem "
         "um segundo serviço"],
        ["*ExUnit", "—", "Suíte de testes", "vem com a linguagem"],
        ["*Credo", "1.7", "Análise estática de estilo e consistência",
         "roda em modo estrito, e reprovar nele interrompe a verificação"],
        ["*Dialyzer", "—", "Checagem estática de tipos",
         "é uma das formas concretas de \"mover a regra para o compilador\" que a tese afirma"],
        ["*Req", "0.5", "Cliente HTTP para falar com o modelo",
         "cliente de baixo nível de propósito: o sistema precisa controlar onde marcar os pontos "
         "de cache, e uma camada de conveniência esconderia exatamente isso"],
        ["*Telemetry", "1.0", "Instrumentação: eventos e métricas por despacho",
         "padrão do ecossistema; o painel lê os mesmos eventos que o motor emite"],
        ["*Git", "—", "Versionamento do sistema e de cada projeto construído",
         "cada projeto gerado nasce como repositório próprio, com um commit por tarefa"]],
       [2.8, 1.3, 5.3, 8.0], tam=7.8)

doc.add_heading("11.  A verificação como comando único", level=1)

p("Todo o controle de qualidade do projeto será acessível por um comando só, e a ordem dos "
  "estágios é a regra: o que falha mais rápido e mais barato roda primeiro, e o primeiro estágio "
  "que falhar interrompe os seguintes. É este comando que o sistema roda em toda verificação — "
  "tanto quando o desenvolvedor o chama à mão quanto quando um agente verifica a própria entrega.")

codigo(["# um comando, quatro estagios, na ordem do mais barato para o mais caro",
        "mix verificar",
        "",
        "  1. mix format --check-formatted     # formatacao   — segundos",
        "  2. mix compile --warnings-as-errors # compilacao   — aviso reprova",
        "  3. mix credo --strict               # estilo       — modo estrito",
        "  4. mix test                         # testes       — sem rede, sem cota",
        "",
        "# a checagem de tipos fica FORA do comando do dia a dia, de proposito:",
        "# a primeira execucao constroi uma tabela de tipos e demora minutos.",
        "# Ela e estagio proprio da verificacao continua, e nao e opcional.",
        "mix dialyzer"],
       "Figura 2 — O comando único de verificação. Um agente não decide se testa: ele roda isto, e "
       "o resultado é binário.")

doc.add_heading("12.  Ambiente de desenvolvimento", level=1)

p("A montagem do ambiente é atividade da Etapa 4, e produzirá scripts de instalação "
  "reproduzíveis — não um passo a passo em prosa. O motivo é prático: o trabalho pode precisar "
  "mudar de máquina no meio, e instalação que não se reproduz é trabalho perdido.")

marcador("Sistema operacional. ",
         "Windows, com PowerShell. A escolha é a máquina disponível, não uma exigência: nada no "
         "projeto depende dela.")
marcador("Banco em modo manual. ",
         "O PostgreSQL não será instalado como serviço do sistema, e sim subido por script quando "
         "se for trabalhar — assim ele não consome memória o tempo todo, o que importa sob o "
         "RNF-01.")
marcador("A extensão de busca vetorial ",
         "precisa ser compilada com as ferramentas de build C++ da Microsoft; o script de "
         "instalação cuidará disso e será versionado junto com o projeto.")
marcador("Editor e controle de versão. ",
         "Git desde o primeiro commit, com um commit por tarefa concluída — o histórico é o "
         "registro de progresso do trabalho.")

quebra()

# ================================================================ PARTE IV
parte("IV", "A arquitetura planejada",
      "Como as peças se encaixam, e onde exatamente cada regra da Parte I vai morar.",
      cor="184F95")

doc.add_heading("13.  Visão em camadas", level=1)

p("O sistema se organiza em quatro camadas. A regra que as governa é simples: uma camada só "
  "conhece a de baixo. O painel não fala com o modelo; ele lê o mesmo banco e escuta os mesmos "
  "eventos que o motor emite. Isso garante que a tela nunca minta — ela não tem uma cópia própria "
  "do estado para divergir.")

figura("fig3_arquitetura.png",
       "Figura 3 — As quatro camadas. As duas fronteiras do meio (em roxo) são o que permite "
       "trocar o fornecedor de modelo ou o mecanismo de busca sem tocar no motor.", 17.0)

doc.add_heading("14.  O ciclo de vida de uma tarefa", level=1)

p("A unidade de trabalho do sistema é a tarefa: pequena, com objetivo escrito e com critérios de "
  "aceite que são comandos, não opiniões. Ela percorre seis estados, e a passagem de um para o "
  "outro é sempre feita por um agente diferente do que a construiu.")

figura("fig4_ciclo.png",
       "Figura 4 — Os seis estados e os dois portões. Cada portão responde a uma pergunta "
       "diferente, e as duas são independentes: uma entrega pode funcionar perfeitamente e ainda "
       "assim não ser a que foi pedida.", 17.0)

rico([("Por que dois portões, e não um.  ", True, AZUL),
      ("Porque \"passou nos testes\" e \"é o que foi pedido\" são perguntas diferentes, e a "
       "segunda não é redutível à primeira. Um critério de aceite mal escrito pode ser satisfeito "
       "por uma entrega que resolve outro problema. O segundo portão existe para pegar exatamente "
       "isso, e reprovar por ali não exige apontar nenhum defeito técnico.", False)],
     tam=9.3, antes=3, depois=3)

rico([("A ferramenta que o revisor não recebe.  ", True, AZUL),
      ("O agente que revisa não tem, no seu conjunto de ferramentas, nenhuma que escreva em "
       "arquivo. Não é uma instrução para que ele não corrija: é a ausência da capacidade. É o "
       "exemplo mais direto do que a tese propõe — a separação entre construir e aprovar deixa de "
       "depender de disciplina e passa a depender da estrutura.", False)], tam=9.3, depois=3)

doc.add_heading("15.  O que acontece quando falha", level=1)

p("Falha é o caso comum, não a exceção — e é aqui que a maioria dos sistemas multi-agente ou "
  "desiste cedo demais ou entra em laço infinito. O plano prevê uma escada de quatro degraus, em "
  "que cada reprovação muda a estratégia, em vez de repetir a aposta que já falhou.")

figura("fig5_escada.png",
       "Figura 5 — A escada de resposta ao fracasso. O contador de ciclos é incrementado pelo "
       "sistema, não pelo agente: ele não tem ferramenta para alterá-lo.", 17.0)

caixa("POR QUE SUBIR DE MODELO SÓ NO RETRABALHO",
      "Usar o modelo mais capaz em tudo custa caro e desperdiça: a maioria das tarefas passa de "
      "primeira. O gatilho para subir é um fato medido — a tarefa voltou reprovada —, não um "
      "palpite sobre a dificuldade dela feito antes de tentar.")

doc.add_heading("16.  A fronteira do fornecedor de modelo", level=1)

p("O sistema precisa falar com um modelo de linguagem, e há duas formas muito diferentes de fazer "
  "isso. O plano prevê acomodar as duas por trás de uma fronteira única, porque é essa fronteira "
  "que atende o RNF-07 e que permite comparar as duas na hora de medir custo.")

tabela(["Família", "Exemplo", "Quem roda o laço de ferramentas", "Como é governada"],
       [["*Agente completo", "uma ferramenta de linha de comando que já é um agente",
         "o próprio fornecedor", "por opções de invocação: permissão, ferramentas permitidas, "
         "diretório de trabalho, teto de turnos"],
        ["*Endpoint de modelo", "a API de mensagens do fornecedor",
         "o sistema, com as próprias ferramentas",
         "pelas ferramentas que o sistema implementa e entrega ao modelo"]],
       [3.2, 4.0, 4.0, 6.2])

p("A régua que o projeto se impõe: acrescentar um fornecedor novo deve ser escrever um adaptador "
  "e declará-lo — nunca alterar o núcleo. A Etapa 8 terá um critério de aceite que prova isso, "
  "conduzindo dois adaptadores definidos apenas no código de teste, sem alterar uma linha do "
  "código de produção.", antes=2)

quebra()

# ================================================================ PARTE V
parte("V", "O método e o cronograma",
      "Por que cascata, como as 195 dias se dividem, e o que cada marco precisa provar.",
      cor="14865D")

doc.add_heading("17.  Por que o modelo cascata", level=1)

p("O desenvolvimento seguirá o modelo cascata: as fases acontecem em sequência, e cada uma só "
  "começa quando a anterior fecha num portão verificado. É um modelo criticado quando os "
  "requisitos são voláteis — e é justamente por isso que ele cabe aqui.")

marcador("O problema é conhecido antes de começar. ",
         "Um protótipo funcional já existe e será medido na Etapa 2. Os requisitos não serão "
         "descobertos durante a construção: eles saem da análise do que o protótipo faz mal.")
marcador("O trabalho tem um único desenvolvedor e um prazo fixo. ",
         "Não há cliente mudando de ideia nem entregas parciais a negociar. O que existe é uma "
         "banca, uma data e um resultado a demonstrar.")
marcador("A pesquisa exige que o plano preceda a execução. ",
         "Para que a medição final signifique alguma coisa, os critérios de sucesso precisam estar "
         "escritos antes de existir o código que será medido. Ajustar o alvo depois de ver onde a "
         "flecha caiu invalida o resultado.")
marcador("A decomposição é cara e se faz uma vez. ",
         "As tarefas serão escritas todas na Etapa 4, com critérios de aceite executáveis. É "
         "trabalho concentrado que rende durante as sete etapas de implementação.")

caixa("O CUIDADO QUE O MODELO EXIGE",
      "Tarefa escrita com meses de antecedência envelhece: as últimas serão executadas sobre um "
      "código que já tomou decisões que o planejamento não podia prever. Por isso cada etapa de "
      "implementação a partir da E07 abrirá com uma conferência do plano contra o código que "
      "existe, registrando o que foi ajustado e por quê. \"Conferido, nada divergiu\" também é "
      "registro válido. É o controle de mudança da cascata, aplicado dentro da construção.",
      cor="4A3AA7", fundo="EFEDFA", cor_titulo=ROXO)

doc.add_heading("18.  As fases e a divisão do tempo", level=1)

figura("fig2_esforco.png",
       "Figura 6 — Como os 195 dias se dividem entre as quatro fases. Trinta por cento do prazo "
       "acontece antes da primeira linha de código, e outros quinze por cento depois da última.",
       17.0)

p("A proporção é deliberada. Um projeto de pesquisa que gasta 85% do prazo codificando chega ao "
  "fim com muito código e nenhuma medição; as duas pontas — o que se mede antes e o que se prova "
  "depois — são o que transforma o trabalho em resultado defensável.", antes=1)

doc.add_heading("19.  O cronograma", level=1)

figura("fig1_cronograma.png",
       "Figura 7 — As 13 etapas de 15 dias, de 13 de abril a 24 de outubro de 2026. Cada barra é "
       "uma quinzena fechada por um portão de saída.", 17.0)

tabela(["Etapa", "Período", "Fase", "Entrega da etapa"],
       [["*E01", "13/04 – 27/04", "Requisitos", "Requisitos levantados e congelados"],
        ["*E02", "28/04 – 12/05", "Requisitos", "Estado da arte e linha de base de medição"],
        ["*E03", "13/05 – 27/05", "Projeto", "Arquitetura decidida, com as alternativas registradas"],
        ["*E04", "28/05 – 11/06", "Projeto", "Ambiente montado e tarefas decompostas"],
        ["*E05", "12/06 – 26/06", "Implementação", "Fundação que se verifica sem rede e sem custo"],
        ["*E06", "27/06 – 11/07", "Implementação", "Um agente resolve uma tarefa real"],
        ["*E07", "12/07 – 26/07", "Implementação", "A linha de produção: estados e portões"],
        ["*E08", "27/07 – 10/08", "Implementação", "Governança do fornecedor de modelo"],
        ["*E09", "11/08 – 25/08", "Implementação", "Concorrência e tolerância a falhas"],
        ["*E10", "26/08 – 09/09", "Implementação", "Memória do projeto"],
        ["*E11", "10/09 – 24/09", "Implementação", "Painel ao vivo e automação"],
        ["*E12", "25/09 – 09/10", "Testes", "Operação real, com projetos de verdade"],
        ["*E13", "10/10 – 24/10", "Testes", "Refinamento, medição final e entrega"]],
       [1.6, 3.2, 3.0, 9.6])

doc.add_heading("20.  Os marcos de implementação", level=1)

p("Cada etapa de implementação termina num marco — uma afirmação que pode ser demonstrada "
  "rodando o sistema, não descrevendo-o. Os marcos são cumulativos: cada um pressupõe todos os "
  "anteriores, e é isso que impede que o projeto avance sobre fundação não verificada.")

figura("fig7_marcos.png",
       "Figura 8 — Os sete marcos de implementação. Não medem porcentagem de conclusão: medem "
       "capacidade adquirida, e cada um é demonstrável ao vivo.", 16.4)

quebra()

# ================================================================ PARTE VI
parte("VI", "As etapas, uma a uma",
      "O que exatamente será feito em cada quinzena, e o que precisa ser verdade para a seguinte "
      "começar.", cor="2A78D6")

etapa("E01", "Levantamento de requisitos e viabilidade", "13/04 a 27/04  ·  dias 1–15",
      "Fixar o problema e o critério de sucesso antes de qualquer decisão técnica. Nenhuma linha "
      "sobre tecnologia será escrita nesta etapa — de propósito, para que a escolha da plataforma "
      "seja consequência dos requisitos e não o contrário.",
      [("Caracterizar o problema ", "com precisão: o que exatamente falha em sistemas multi-agente "
        "quando o trabalho é longo, e por quê."),
       ("Elicitar requisitos funcionais ", "a partir do fluxo pretendido, do pedido à entrega."),
       ("Elicitar requisitos não funcionais, ", "e para cada um decidir como ele será verificado — "
        "requisito que não se verifica não entra."),
       ("Fixar o perfil de máquina alvo ", "(8 GB de RAM, 4 núcleos) como restrição de arquitetura, "
        "não como preferência."),
       ("Estudar a viabilidade de custo: ", "o sistema consome cota de um serviço pago, e o "
        "orçamento é requisito de projeto."),
       ("Delimitar o escopo, ", "escrevendo explicitamente o que fica de fora e por quê.")],
      "Documento de requisitos; matriz de requisitos funcionais e não funcionais, cada um com o "
      "mecanismo de verificação; parecer de viabilidade; declaração de escopo.",
      "Os requisitos estão revisados com o orientador e congelados. A partir daqui, requisito novo "
      "só entra por controle de mudança registrado — é a linha de base do projeto.")

etapa("E02", "Estado da arte e linha de base de medição", "28/04 a 12/05  ·  dias 16–30",
      "Medir o que já existe antes de projetar o que virá. Esta etapa produz o número contra o "
      "qual todo o resultado final será comparado.",
      [("Revisão do estado da arte: ", "os sistemas multi-agente de propósito geral e os agentes "
        "voltados a engenharia de software, com o que cada um resolve e o que deixa em aberto."),
       ("Delimitar a originalidade ", "do trabalho por escrito — o que aqui é novo, o que é "
        "aplicação de ideia conhecida, e o que é engenharia."),
       ("Auditar o protótipo existente: ", "percorrer as execuções reais já registradas e extrair "
        "custo por despacho, número de ciclos por tarefa e taxa de reprovação."),
       ("Catalogar os mecanismos do protótipo ", "que funcionam e não estão documentados — sem "
        "isso, a versão nova nasce com arquitetura melhor e operação mais frágil."),
       ("Congelar a linha de base ", "num conjunto de dados versionado, com a data da extração.")],
      "Revisão bibliográfica escrita; documento de delimitação de originalidade; análise do "
      "protótipo; conjunto de dados da linha de base, congelado e versionado.",
      "A linha de base está extraída e congelada. É o portão mais importante da primeira metade: "
      "sem número anterior, a conclusão do trabalho seria uma afirmação; com ele, é um resultado "
      "comparável.")

etapa("E03", "Projeto arquitetural", "13/05 a 27/05  ·  dias 31–45",
      "Escolher a plataforma e desenhar a arquitetura que torna a governança estrutural — imposta "
      "pelo compilador, pelo runtime e pelo banco de dados.",
      [("Decidir a plataforma ", "a partir da natureza do gargalo (espera, não cálculo), avaliando "
        "as alternativas e registrando o motivo de cada recusa."),
       ("Desenhar as camadas ", "e a regra de dependência entre elas."),
       ("Desenhar a máquina de estados ", "da tarefa, com os dois portões e a escada de resposta ao "
        "fracasso."),
       ("Desenhar as fronteiras trocáveis ", "— fornecedor de modelo e mecanismo de busca — que "
        "atendem os requisitos RNF-01 e RNF-07."),
       ("Mapear cada regra de governança ", "a um mecanismo estrutural concreto; regra sem "
        "mecanismo volta para o desenho."),
       ("Registrar as limitações conhecidas ", "da escolha, inclusive as desfavoráveis.")],
      "Documento de arquitetura com diagramas; registro de decisões, cada uma com o motivo e as "
      "alternativas descartadas; mapa regra → mecanismo.",
      "A arquitetura está revisada com o orientador e congelada. As decisões registradas não se "
      "reabrem sem fato novo — e o que conta como fato novo está escrito.")

etapa("E04", "Projeto detalhado, ambiente e decomposição", "28/05 a 11/06  ·  dias 46–60",
      "Transformar a arquitetura em um plano executável tarefa a tarefa, e deixar a máquina pronta "
      "para construir. É a última etapa antes da codificação.",
      [("Decompor o sistema em sete incrementos, ", "cada um utilizável por si — não porcentagem "
        "de conclusão, mas capacidade que passa a existir."),
       ("Escrever as tarefas atômicas, ", "cada uma com objetivo, dependências declaradas e "
        "critérios de aceite que são comandos executáveis."),
       ("Montar o grafo de dependências ", "entre as tarefas, que define a ordem de execução e "
        "quais podem correr em paralelo."),
       ("Instalar e provar o ambiente: ", "linguagem, runtime, banco e a extensão de busca "
        "vetorial, com script de instalação reproduzível."),
       ("Documentar as armadilhas de instalação ", "encontradas, com a solução de cada uma — o "
        "projeto pode precisar mudar de máquina.")],
      "Plano de incrementos; conjunto completo de tarefas com critérios executáveis; grafo de "
      "dependências; scripts de instalação do ambiente; guia de armadilhas.",
      "O ambiente responde ao teste de sanidade e as tarefas estão revisadas. Fim da fase de "
      "projeto: a codificação começa na etapa seguinte, e o que ela vai fazer já está escrito.")

quebra()

etapa("E05", "Implementação I — a fundação que se prova sozinha",
      "12/06 a 26/06  ·  dias 61–75",
      "Um projeto que compila, testa e sobe o banco sem tocar a rede e sem gastar cota. É a etapa "
      "que dá vontade de pular e a que sustenta as outras seis.",
      [("Criar o projeto ", "com a barra de qualidade instalada desde o commit inicial: formatação "
        "verificada, aviso de compilação tratado como erro, análise estática estrita, suíte de "
        "testes e checagem de tipos."),
       ("Criar o esquema do banco: ", "projetos, tarefas, ciclos de retrabalho, despachos e custos "
        "— o estado do sistema passa a viver em tabelas."),
       ("Implementar as duas fronteiras ", "e, para cada uma, um adaptador falso e determinístico. "
        "São eles que a suíte usará para sempre."),
       ("Implementar a contabilidade em duas unidades ", "(RNF-02), gravada a cada volta."),
       ("Implementar backup e restauração ", "do banco — o estado agora vive fora do git, e "
        "precisa de rede de segurança própria."),
       ("Importar a linha de base ", "da Etapa 2 para dentro do sistema.")],
      "Projeto compilando com a suíte verde; esquema do banco migrado; as duas fronteiras com "
      "adaptadores falsos; contabilidade; rotina de backup.",
      "MARCO 1 — a suíte inteira roda sem rede, sem consumir cota e sem chave de API, provado por "
      "um teste que falha de propósito se a chave estiver definida durante a execução.")

etapa("E06", "Implementação II — o agente e as ferramentas",
      "27/06 a 11/07  ·  dias 76–90",
      "Despachar um agente contra uma tarefa real e ver o custo discriminado. Ao fim desta etapa o "
      "sistema executa trabalho de verdade, ainda que uma tarefa por vez.",
      [("Construir o índice denso do projeto: ", "um resumo gerado por programa, sem modelo, com a "
        "estrutura e o propósito de cada peça pública. É por ele que o agente se orienta, em vez "
        "de ler o código inteiro."),
       ("Montar o prefixo estável ", "do pedido ao modelo — idêntico byte a byte entre despachos, "
        "para que o fornecedor possa reaproveitá-lo e cobrar menos."),
       ("Implementar as ferramentas de arquivo ", "com o confinamento embutido (RNF-03): a "
        "ferramenta resolve o caminho e recusa o que está fora da raiz."),
       ("Implementar a ferramenta de comando ", "com prazo máximo e morte da árvore inteira de "
        "processos — matar só o processo pai deixa netos vivos segurando o terminal."),
       ("Implementar o laço do agente ", "como processo supervisionado, com endereço e dono."),
       ("Implementar o teto de chamadas de ferramenta ", "por papel, e a única via pela qual o "
        "agente pode reportar resultado."),
       ("Implementar os dois adaptadores de fornecedor ", "previstos na seção 16.")],
      "Índice denso gerado por comando; montador de prefixo; conjunto de ferramentas confinadas; "
      "laço supervisionado; dois adaptadores de fornecedor.",
      "MARCO 2 — um agente resolve uma tarefa real de ponta a ponta, e o custo de cada volta fica "
      "gravado no banco. A soma das voltas tem de bater com o total informado pelo fornecedor.")

etapa("E07", "Implementação III — a linha de produção",
      "12/07 a 26/07  ·  dias 91–105",
      "Uma tarefa percorre os seis estados, é reprovada, retrabalhada e concluída sozinha. É aqui "
      "que o conjunto de peças vira uma fábrica.",
      [("Conferir o plano contra o código ", "que já existe, e registrar o que divergiu — a "
        "primeira aplicação do controle de mudança da seção 17."),
       ("Implementar os seis estados ", "com transição transacional: estado, relatório e custo "
        "mudam juntos ou não mudam."),
       ("Implementar a promoção de tarefas ", "por dependências satisfeitas, e a ordenação da fila."),
       ("Implementar a leitura e a execução mecânica ", "dos critérios de aceite, com lista de "
        "binários permitidos."),
       ("Implementar a distinção entre o comando quebrado e a entrega falha ", "— sem ela, um "
        "critério mal escrito consome as três tentativas da tarefa."),
       ("Implementar os dois portões, ", "e a ausência da ferramenta de escrita para quem revisa."),
       ("Implementar o diagnóstico de reprovação ", "e a escada de quatro degraus da Figura 5.")],
      "Máquina de estados transacional; fila com promoção por dependências; execução mecânica de "
      "critérios; os dois portões; diagnóstico e escada de retrabalho.",
      "MARCO 3 — uma tarefa percorre os seis estados, reprova DE PROPÓSITO num critério plantado "
      "para falhar, é retrabalhada e conclui — com cada transição registrada em transação.")

etapa("E08", "Implementação IV — integração e governança do fornecedor",
      "27/07 a 10/08  ·  dias 106–120",
      "Exercitar o sistema contra a ferramenta real do fornecedor e fechar as lacunas de "
      "governança que só aparecem no contato com ela. Etapa deliberadamente reservada para isso: "
      "a experiência com o protótipo mostra que é aqui que as premissas de projeto são testadas "
      "pela realidade.",
      [("Escrever e versionar um instrumento de medição ", "ANTES de rodá-lo, para que o resultado "
        "não possa ser ajustado depois do fato."),
       ("Medir a superfície real de governança ", "do fornecedor: quais controles de permissão "
        "existem, o que faz uma escrita passar, se o vocabulário de ferramentas se restringe, se o "
        "diretório de trabalho confina e qual o teto de turnos."),
       ("Provar o confinamento, em vez de presumi-lo: ", "uma sessão mandada escrever fora da raiz "
        "não pode conseguir, e o que a prevenção não alcançar precisa ser barrado por auditoria."),
       ("Impor o teto de voltas pelo mecanismo do fornecedor, ", "e não pedindo no texto do prompt."),
       ("Ajustar o desenho da fronteira ", "se a medição contrariar o que o projeto supunha — e "
        "registrar a mudança com a causa."),
       ("Reservar folga nesta etapa ", "para o replanejamento que a medição pode exigir.")],
      "Instrumento de medição versionado e seu relatório; adaptador de fornecedor governado; prova "
      "de confinamento; registro das divergências entre o previsto e o medido.",
      "MARCO 4 — trocar de fornecedor não toca o núcleo: dois adaptadores, um de cada família, "
      "definidos apenas no código de teste, são conduzidos pelo sistema sem uma linha alterada no "
      "código de produção.")

quebra()

etapa("E09", "Implementação V — concorrência e tolerância a falhas",
      "11/08 a 25/08  ·  dias 121–135",
      "Rodar várias tarefas ao mesmo tempo, sobreviver à morte de uma delas, e nunca começar o que "
      "não cabe no orçamento.",
      [("Conferir o plano contra o código ", "e contra os custos que as etapas anteriores mediram "
        "de verdade — os valores presumidos no planejamento podem ter envelhecido."),
       ("Construir a árvore de supervisão: ", "cada tarefa em voo vira um processo com endereço, "
        "dono e registro."),
       ("Implementar a fila durável ", "no próprio banco, de modo que enfileirar um trabalho e "
        "mudar o estado da tarefa aconteçam na mesma transação."),
       ("Implementar a exclusão mútua por área de arquivo, ", "verificada pelo motor e não "
        "confiada ao texto do despacho."),
       ("Implementar o teto de orçamento com parada limpa: ", "impedir de começar o que não cabe, "
        "nunca cortar no meio — trabalho interrompido custa igual e não entrega nada."),
       ("Implementar a recuperação após queda, ", "reconhecendo trabalho parcial deixado na árvore "
        "de arquivos."),
       ("Medir o pico real de memória, ", "que é o que decide o limite de concorrência sob o "
        "RNF-01.")],
      "Árvore de supervisão; fila durável transacional; exclusão mútua por área; teto de orçamento "
      "com parada limpa; rotina de recuperação; medição de memória.",
      "MARCO 5 — três tarefas rodam em paralelo; matar o processo de uma no meio não afeta as "
      "outras duas, e a tarefa morta volta à fila sem perder o trabalho já feito.")

etapa("E10", "Implementação VI — a memória do projeto",
      "26/08 a 09/09  ·  dias 136–150",
      "Fazer o agente começar a tarefa já sabendo o que foi decidido antes, e por quê — em vez de "
      "decidir de novo, às vezes ao contrário.",
      [("Medir antes de escolher: ", "espaço em disco, memória residente e tempo de processamento "
        "do modelo de vetores rodando localmente, para decidir entre rodá-lo na máquina ou delegar "
        "a um serviço. É aqui que o RNF-01 cobra sua dívida."),
       ("Implementar a ingestão do histórico ", "no momento do commit, fora do caminho crítico — "
        "indexar não pode atrasar quem está construindo."),
       ("Implementar a busca híbrida: ", "similaridade semântica e termo exato, combinados. Os dois "
        "índices respondem perguntas diferentes, e o semântico é o caro e o aproximado."),
       ("Montar o bloco de contexto recuperado ", "com a fonte citada, para que o agente possa "
        "dizer de onde tirou a informação."),
       ("Avaliar a qualidade da recuperação ", "com um conjunto de perguntas de referência — "
        "memória que traz o trecho errado é pior que memória nenhuma.")],
      "Relatório da medição do modelo de vetores; ingestão automática ao commitar; busca híbrida; "
      "bloco de contexto com fonte; avaliação da recuperação.",
      "MARCO 6 — num projeto com histórico, o agente cita a decisão anterior em vez de decidir de "
      "novo, e a citação aponta para a fonte correta.")

etapa("E11", "Implementação VII — painel ao vivo e automação",
      "10/09 a 24/09  ·  dias 151–165",
      "Acompanhar na tela um projeto sendo planejado, construído, verificado, revisado e entregue "
      "— e deixar o sistema encadear rodadas sozinho, com freios.",
      [("Conferir o que o banco realmente grava ", "contra o que as telas pretendem mostrar — "
        "diferença aqui vira tela que mente."),
       ("Construir o quadro de tarefas por estado, ", "atualizado ao vivo pelo mesmo barramento de "
        "eventos que o motor emite."),
       ("Construir o console do agente e o custo da rodada, ", "visíveis enquanto o trabalho "
        "acontece."),
       ("Implementar parar e retomar: ", "um botão que encerra um processo supervisionado com "
        "segurança."),
       ("Implementar o encadeamento automático de rodadas, ", "com a decisão isolada como função "
        "pura — portanto testável sem subir a interface — e com teto de gasto e de rodadas "
        "obrigatórios."),
       ("Implementar a varredura de segredos ", "antes de qualquer publicação.")],
      "Painel com quadro de tarefas, console e custo ao vivo; controle de parar e retomar; "
      "encadeamento automático com freios; varredura de segredos.",
      "MARCO 7 — um projeto inteiro é acompanhado na tela do pedido à entrega, com o custo "
      "atualizando em tempo real e um botão que interrompe com segurança.")

quebra()

# ------------------------------------------------- as etapas de prática
parte("VII", "Do hipotético à prática",
      "As quatro últimas semanas: colocar o sistema para trabalhar de verdade, medir e refinar.",
      cor="14865D")

p("Até a Etapa 11 o sistema terá sido construído contra tarefas escolhidas e critérios "
  "controlados. Isso prova que as peças funcionam; não prova que o conjunto entrega. As duas "
  "últimas etapas existem para essa diferença — e são a parte do cronograma que não deve ser "
  "sacrificada se algo atrasar, porque é dela que sai o resultado do trabalho.", antes=2)

caixa("O QUE MUDA NESTAS QUATRO SEMANAS",
      "Deixa de haver tarefa preparada. O sistema recebe pedidos de projeto que ele nunca viu, "
      "construídos por agentes que erram de formas não previstas, com custo real e cota real. Cada "
      "falha observada vira uma correção com a causa registrada — e é esse registro, mais do que o "
      "sistema funcionando, que sustenta a conclusão do trabalho.")

etapa("E12", "Testes de sistema em uso real", "25/09 a 09/10  ·  dias 166–180",
      "Sair do hipotético. Colocar o sistema para construir projetos reais, de ponta a ponta, sem "
      "intervenção, e observar o que a operação revela.",
      [("Selecionar de três a cinco projetos de teste ", "de naturezas diferentes, nenhum deles "
        "usado durante a construção, com complexidade crescente."),
       ("Executar cada projeto do pedido à entrega ", "sem intervenção humana, registrando tudo: "
        "tarefas concluídas, ciclos gastos, reprovações, bloqueios e custo."),
       ("Testar o sistema na máquina alvo ", "de 8 GB e 4 núcleos, medindo o pico de memória e o "
        "limite prático de concorrência (RNF-01)."),
       ("Provocar falhas de propósito: ", "matar agentes no meio, derrubar o banco, esgotar a cota, "
        "e verificar se o sistema se recupera como projetado."),
       ("Catalogar cada defeito observado ", "com a causa raiz, distinguindo defeito de "
        "implementação de premissa de projeto equivocada."),
       ("Priorizar as correções ", "pelo impacto no resultado, não pela facilidade de consertar.")],
      "Relatório de execução dos projetos de teste; medição na máquina alvo; catálogo de defeitos "
      "com causa raiz; lista priorizada de correções.",
      "Os projetos de teste rodaram do pedido à entrega e o comportamento real do sistema está "
      "documentado — inclusive onde ele falhou. Defeito observado e não registrado é defeito que "
      "volta.")

etapa("E13", "Refinamento, medição final e entrega", "10/10 a 24/10  ·  dias 181–195",
      "Corrigir o que a operação real mostrou, medir o resultado contra a linha de base e fechar o "
      "trabalho.",
      [("Executar as correções priorizadas ", "na Etapa 12, cada uma com o teste que impede a "
        "regressão."),
       ("Reexecutar os projetos de teste ", "após as correções, para confirmar que o "
        "comportamento melhorou e que nada mais quebrou."),
       ("Medir o resultado contra a linha de base ", "da Etapa 2, nas mesmas dimensões: custo por "
        "tarefa concluída, ciclos por tarefa, taxa de reprovação, tarefas bloqueadas e tempo até a "
        "conclusão."),
       ("Publicar o número, ", "inclusive se for desfavorável — resultado negativo medido com rigor "
        "é resultado; resultado favorável não medido não é."),
       ("Escrever o documento de entrega ", "com o que foi construído, o que foi medido e o que "
        "ficou de fora."),
       ("Finalizar a documentação ", "e preparar a defesa.")],
      "Correções aplicadas com teste de regressão; reexecução dos projetos de teste; comparação "
      "quantitativa contra a linha de base; documento de entrega; documentação final.",
      "MARCO FINAL — um projeto inteiro é planejado, construído, verificado, revisado e entregue "
      "sem intervenção, e o resultado está medido contra a linha de base, com o número publicado.")

quebra()

# ================================================================ PARTE VIII
parte("VIII", "Verificação, riscos e resultado",
      "Como a qualidade será garantida ao longo do caminho, o que pode dar errado e como o "
      "sucesso será julgado.", cor="B52C2C")

doc.add_heading("21.  Estratégia de verificação", level=1)

p("A verificação não é uma fase no fim: ela acontece em quatro níveis, todos ativos desde a "
  "Etapa 5. O que a fase final acrescenta é o único nível que não pode ser antecipado — o sistema "
  "operando sobre problemas que ele nunca viu.")

tabela(["Nível", "O que verifica", "Quando roda", "Quem executa"],
       [["*Automático, por comando", "formatação, compilação, estilo, tipos e testes de unidade",
         "a cada tarefa, antes de qualquer aprovação", "o comando único da seção 11"],
        ["*Critérios de aceite", "se a tarefa entregou o que sua descrição pedia",
         "no primeiro portão de cada tarefa", "um agente verificador, executando comandos"],
        ["*Conformidade e defeito", "se a entrega é a que foi pedida, e se tem defeito real",
         "no segundo portão, sobre o trabalho já commitado", "um agente revisor, sem ferramenta de "
         "escrita"],
        ["*Marco de incremento", "se a capacidade prometida pela etapa existe de fato",
         "ao fim de cada etapa de implementação", "demonstração ao vivo, contra o enunciado escrito "
         "antes"],
        ["*Sistema, em uso real", "se o conjunto entrega projetos que ninguém preparou",
         "Etapas 12 e 13", "projetos de teste, executados sem intervenção"]],
       [3.4, 5.6, 4.4, 4.0], tam=7.9)

doc.add_heading("22.  Riscos e mitigação", level=1)

tabela(["Risco", "Impacto", "Mitigação planejada"],
       [["*Uma premissa sobre a interface do fornecedor não se confirmar", "alto",
         "instrumento de medição escrito e versionado ANTES de rodar, na E08, com folga na própria "
         "etapa para o replanejamento"],
        ["*Tarefas planejadas na E04 envelhecerem até serem executadas", "médio",
         "conferência obrigatória do plano contra o código no início das etapas E07, E09, E10 e E11"],
        ["*O custo de execução estourar o orçamento disponível", "alto",
         "contabilidade em duas unidades desde a E05; teto por rodada e por tarefa na E09, com "
         "parada limpa"],
        ["*O limite de cota do serviço interromper trabalho no meio", "médio",
         "reconhecer a parada, registrar o trabalho parcial e retomar; nunca descartar o que já "
         "foi feito"],
        ["*O modelo de vetores não caber na máquina alvo", "médio",
         "a decisão local × serviço é tomada por medição na E10, e o componente é adaptador "
         "trocável desde a E05"],
        ["*Atraso acumulado comprimir as etapas finais", "alto",
         "as E12 e E13 são inegociáveis; se algo atrasar, o corte sai do escopo da E10 ou da E11, "
         "que são incrementos e não fundação"],
        ["*Falta de acesso pago bloquear uma medição", "baixo",
         "todo marco é dividido em uma parte demonstrável sem custo e outra que exige gasto, e a "
         "segunda é declarada pendente em vez de reprovada"]],
       [5.0, 1.8, 10.6], tam=7.9)

doc.add_heading("23.  Entregas ao orientador", level=1)

p("Para que o acompanhamento não dependa de reuniões longas, cada fase produz um documento curto "
  "e verificável, e as etapas de implementação produzem demonstração ao vivo.")

tabela(["Quando", "O que será entregue"],
       [["*Fim da E02  ·  12/05", "Requisitos congelados, revisão do estado da arte e a linha de "
                                  "base medida"],
        ["*Fim da E04  ·  11/06", "Documento de arquitetura com as decisões justificadas, e o plano "
                                  "de tarefas completo"],
        ["*Fim da E07  ·  26/07", "Primeira demonstração ao vivo: uma tarefa percorrendo os seis "
                                  "estados, incluindo uma reprovação provocada"],
        ["*Fim da E09  ·  25/08", "Segunda demonstração: tarefas em paralelo e recuperação de "
                                  "falha provocada"],
        ["*Fim da E11  ·  24/09", "Terceira demonstração: um projeto acompanhado na tela, do pedido "
                                  "à entrega"],
        ["*Fim da E13  ·  24/10", "Documento de entrega com a medição final contra a linha de base, "
                                  "e a defesa preparada"]],
       [4.2, 13.2])

doc.add_heading("24.  O resultado esperado", level=1)

p("Ao fim dos 195 dias, o trabalho deve poder afirmar — e demonstrar — que as regras de "
  "governança de um sistema multi-agente podem ser movidas do prompt para a estrutura do "
  "programa, e que essa mudança se traduz em número: menos ciclos de retrabalho por tarefa, menos "
  "tarefas abandonadas por esgotamento e custo por entrega comparável ou menor que o da linha de "
  "base.")

p("Vale registrar desde já o que o trabalho NÃO vai afirmar. Não vai dizer que o sistema escreve "
  "código melhor que outros — a qualidade do código é do modelo, não da arquitetura em volta "
  "dele. Não vai dizer que a abordagem é mais barata em termos absolutos, porque o preço por "
  "token é do fornecedor. E não vai dizer que dispensa supervisão humana: dispensa intervenção "
  "durante a construção, o que é diferente.", antes=2)

caixa("O QUE FICA, SE TUDO O MAIS MUDAR",
      "Modelos vão melhorar, ficar mais baratos e mudar de nome. A parte deste trabalho que não "
      "depende disso é a estrutura: tarefas pequenas com estado explícito, dois julgamentos "
      "independentes feitos por quem não construiu, falha limitada com uma tentativa de "
      "redimensionamento antes de desistir, e tudo registrado no instante em que acontece. Se o "
      "modelo de amanhã for dez vezes melhor, essa estrutura continua sendo o que transforma "
      "capacidade em entrega confiável.")

doc.save(DESTINO)
print("gerado:", DESTINO)
