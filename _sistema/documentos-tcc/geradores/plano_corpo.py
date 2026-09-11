# -*- coding: utf-8 -*-
"""Corpo do PLANO DE DESENVOLVIMENTO. Usa os helpers de plano_base.py.

Regras deste documento, que valem para qualquer edicao futura:

  1. DUAS siglas, e so duas: E1..En para as etapas, R1..R15 para os requisitos.
     conferir(), no fim deste arquivo, se recusa a gravar se aparecer outra.
  2. NENHUMA DATA ESCRITA A MAO. Todas vem de calendario_plano.py (modulo `cal`).
     A data de inicio ja mudou duas vezes; na segunda, havia ~15 lugares para
     acertar no texto.
  3. Ordem de apresentacao: visao geral -> problema e objetivo -> cronograma ->
     requisitos -> funcionamento -> ferramentas -> riscos. O cronograma vem antes
     dos requisitos de proposito: num planejamento, e o que o orientador procura.
  4. Secao numerada so com secao("titulo") — o numero e automatico.
  5. Teto de 10 paginas. Confira com `python medir_paginas.py <arquivo>`.

Monte com `python gerar_plano.py`. Nao rode este arquivo sozinho.
"""
import calendario_plano as cal

br = cal.br
PLAN = cal.etapas_da_fase("plan")
DESENV = cal.etapas_da_fase("desenv")
VALID = cal.etapas_da_fase("valid")

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
       "Figura 1 — O projeto do começo ao fim: %d dias corridos até o prazo final, %d etapas de "
       "%d dias, recesso de fim de ano e %d dias de margem."
       % (cal.DIAS_TOTAIS, cal.N_ETAPAS, cal.DIAS_POR_ETAPA, cal.MARGEM), 17.0)

if cal.RECESSO:
    periodo = "De %s a %s. Recesso de %s a %s." % (
        br(cal.INICIO), br(cal.PRAZO_FINAL), br(cal.RECESSO[0], False), br(cal.RECESSO[1]))
else:
    periodo = "De %s a %s, sem recesso." % (br(cal.INICIO), br(cal.PRAZO_FINAL))

if cal.RECESSO and cal.RECESSO_ANTES_DA_ETAPA == VALID[-1] and len(VALID) == 2:
    validacao = ("A E%d testa com projetos reais antes do recesso; a E%d ajusta e entrega "
                 "depois dele." % (VALID[0], VALID[1]))
else:
    validacao = "As etapas %s testam com projetos reais e fazem os ajustes finais." % cal.faixa("valid")

passos([(str(cal.DIAS_TOTAIS), "dias até o prazo", periodo),
        (str(cal.N_ETAPAS), "etapas de %d dias" % cal.DIAS_POR_ETAPA,
         "Cada uma termina com uma entrega concreta; a seguinte só começa quando ela está pronta."),
        (str(cal.dias_da_fase("desenv")), "dias de desenvolvimento",
         "De %s a %s — etapas %s." % (br(cal.INICIO_DESENVOLVIMENTO), br(cal.FIM_DESENVOLVIMENTO),
                                       cal.faixa("desenv"))),
        (str(cal.dias_da_fase("valid")), "dias de validação", validacao)])

caixa("COMO LER ESTE DOCUMENTO",
      "Duas siglas, do começo ao fim: E1 a E%d são as etapas, e R1 a R15 são os requisitos. Não há "
      "código para marco, fase ou tipo de tarefa — o que cada etapa produz é chamado de entrega da "
      "etapa, por extenso. A ordem é a de uma apresentação: o problema e o objetivo, o cronograma, "
      "os requisitos, como o sistema vai funcionar, as ferramentas e os riscos." % cal.N_ETAPAS,
      cor="14865D", fundo="E7F7F1", cor_titulo=VERDE)

quebra()

# ================================================================ PARTE I
parte("I", "O projeto", "O que se quer resolver, o objetivo e como o resultado será julgado.")

secao("O problema")

p("Modelos de linguagem já escrevem código competente; o gargalo aparece no trabalho longo — uma "
  "tarefa com vinte decisões encadeadas, verificação no meio e correção depois. Os sistemas que "
  "existem hoje colocam vários modelos para conversar, mas a coordenação entre eles é escrita como "
  "texto dentro do pedido ao modelo: \"não modifique arquivos fora do projeto\", \"não tente mais de "
  "três vezes\", \"não aprove seu próprio trabalho\". Instrução dirigida a um modelo é pedido, não "
  "garantia.")

caixa("A IDEIA CENTRAL DO TRABALHO",
      "Um sistema multi-agente não falha por escrever mal: falha por governar mal. A proposta é "
      "mover cada regra de convivência para onde ela deixe de ser opcional — do texto do pedido "
      "para a estrutura do programa. O sistema não precisa ser mais esperto que os existentes; "
      "precisa ser mais difícil de operar errado.",
      cor="B52C2C", fundo="FBECEA", cor_titulo=VERMELHO)

secao("Onde cada regra vai morar")

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

secao("Objetivo")

p("Projetar, implementar e avaliar um sistema multi-agente para construção de software em que as "
  "regras de governança sejam impostas pela estrutura do programa, e não pedidas em linguagem "
  "natural a um modelo. O resultado será comparado com o de um protótipo já existente, medido na "
  "E%d, nas mesmas dimensões: custo por tarefa concluída, tentativas por tarefa e proporção de "
  "tarefas abandonadas." % PLAN[0])

secao("Como o resultado será julgado")

p("O trabalho será bem-sucedido se, ao fim da E%d, as quatro afirmações abaixo puderem ser "
  "demonstradas ao vivo — e não apenas descritas." % cal.NUMEROS[-1],
  tam=9.0, cor=CINZA, depois=3)

passos([("1", "Constrói sozinho",
         "Um projeto real é planejado, construído, testado, revisado e entregue sem intervenção "
         "depois do pedido."),
        ("2", "Governa de verdade",
         "Cada regra da tabela acima tem um teste que a prova, incluindo testes que tentam "
         "quebrá-la de propósito e falham."),
        ("3", "Cabe na máquina",
         "Roda nos 8 GB e 4 núcleos do requisito R9, com o pico de memória medido."),
        ("4", "Melhora o medido",
         "O resultado é comparado à medida inicial da E%d, com o número publicado — inclusive se "
         "for desfavorável." % PLAN[0])])

quebra()

# ================================================================ PARTE II
parte("II", "O cronograma",
      "As %d etapas, o que cada uma entrega e quando o orientador recebe cada resultado."
      % cal.N_ETAPAS, cor="14865D")

figura("fig2_cronograma.png",
       "Figura 2 — As %d etapas. As linhas tracejadas marcam o início e o fim do desenvolvimento e o "
       "prazo final." % cal.N_ETAPAS, 16.6)

p("Cada etapa dura %d dias e termina com uma entrega concreta; a seguinte só começa quando essa "
  "entrega está pronta. As etapas %s planejam, as %s constroem e as %s validam com projetos reais."
  % (cal.DIAS_POR_ETAPA, cal.faixa("plan"), cal.faixa("desenv"), cal.faixa("valid")),
  antes=2, depois=3)

# (titulo, o que sera feito, entrega da etapa) — as datas saem do calendario
CONTEUDO = {
    1: ("Requisitos e estado da arte",
        "Descrever o problema com precisão; levantar os requisitos R1 a R15 e definir como cada um "
        "será verificado; estudar os sistemas parecidos e escrever o que este trabalho tem de "
        "diferente; medir o protótipo existente — custo por tarefa, tentativas por tarefa e "
        "tarefas abandonadas.",
        "Requisitos aprovados e a medida inicial do protótipo registrada. É contra essa medida que "
        "o resultado final será comparado."),
    2: ("Arquitetura e ambiente",
        "Escolher a linguagem e as ferramentas, registrando por que cada alternativa foi recusada; "
        "desenhar as camadas, o caminho da tarefa e os dois portões; quebrar o sistema em tarefas "
        "com critérios de aceite que são comandos; instalar e testar o ambiente com um roteiro que "
        "possa ser repetido.",
        "Arquitetura aprovada, lista de tarefas escrita e ambiente funcionando. É a última etapa "
        "antes de programar."),
    3: ("Fundação, agente e ferramentas",
        "Criar o projeto com a verificação de qualidade ligada desde o início; criar o banco de "
        "dados com projetos, tarefas, ciclos e custos; construir as ferramentas de arquivo com o "
        "confinamento por dentro e a de comando com prazo; colocar o agente para rodar como "
        "processo isolado, com o custo de cada resposta gravado.",
        "Um agente resolve uma tarefa real do começo ao fim, com o custo gravado — e os testes "
        "rodam sem internet e sem gastar cota."),
    4: ("Linha de produção de tarefas",
        "Implementar os seis estados de uma tarefa, com cada mudança gravada de uma vez só; a fila "
        "que libera a tarefa quando as anteriores terminam; a execução automática dos critérios de "
        "aceite; os dois portões; e a resposta em quatro degraus quando uma tarefa falha.",
        "Uma tarefa percorre os seis estados, é reprovada de propósito, é refeita e conclui — com "
        "tudo registrado."),
    5: ("Integração e execução em paralelo",
        "Medir o que o fornecedor do modelo realmente permite controlar, com o instrumento de "
        "medição escrito antes de ser usado; provar o confinamento em vez de supor; supervisionar "
        "um processo por tarefa em andamento; impedir que duas tarefas mexam no mesmo arquivo e que "
        "comece o que não cabe no orçamento.",
        "Três tarefas rodam em paralelo; matar uma no meio não afeta as outras, e ela volta à fila. "
        "Trocar de fornecedor não exige mexer no núcleo."),
    6: ("Memória e painel",
        "Guardar o histórico do projeto conforme ele é escrito e buscá-lo por significado e por "
        "termo exato, citando a fonte; medir memória e tempo antes de escolher onde essa busca vai "
        "rodar; construir a tela com o quadro de tarefas ao vivo, o console do agente, o custo da "
        "rodada e o botão de parar.",
        "Um projeto inteiro é acompanhado na tela do pedido à entrega, e o agente cita decisões "
        "anteriores em vez de decidir de novo."),
    7: ("Testes com projetos reais",
        "Executar de três a cinco projetos que nunca foram usados durante a construção, sem "
        "intervenção; testar na máquina de 8 GB medindo o pico de memória; provocar falhas de "
        "propósito — matar agentes, derrubar o banco, esgotar a cota; anotar cada defeito com a "
        "sua causa.",
        "O comportamento real do sistema documentado, inclusive onde falhou, e a lista de "
        "correções priorizada para a etapa seguinte."),
    8: ("Ajustes finais e entrega",
        "Corrigir o que a E7 revelou, cada correção com um teste que impede o problema de voltar; "
        "rodar os projetos de teste de novo; comparar o resultado com a medida inicial da E1; "
        "escrever o documento de entrega.",
        "Um projeto construído sem intervenção e o resultado comparado com a medida inicial, com o "
        "número publicado."),
}
if sorted(CONTEUDO) != cal.NUMEROS:
    raise SystemExit("A tabela do cronograma cobre as etapas %s, mas o calendario tem %s. "
                     "Acerte CONTEUDO em plano_corpo.py." % (sorted(CONTEUDO), cal.NUMEROS))

linhas, destaques = [], []


def _destaque(texto, fundo, cor=BRANCO):
    linhas.append(["", "", ""])
    destaques.append((len(linhas), texto, fundo, cor))   # indice na tabela: 0 e o cabecalho


_destaque("INÍCIO DO PROJETO   ·   %s" % br(cal.INICIO), "4A3AA7")
for n in cal.NUMEROS:
    if n == DESENV[0]:
        _destaque("INÍCIO DO DESENVOLVIMENTO   ·   %s" % br(cal.INICIO_DESENVOLVIMENTO), "184F95")
    if cal.RECESSO and n == cal.RECESSO_ANTES_DA_ETAPA:
        _destaque("RECESSO DE FIM DE ANO   ·   %s a %s"
                  % (br(cal.RECESSO[0]), br(cal.RECESSO[1])), "E4E4DF", cor=CINZA)
    titulo, fazer, entrega = CONTEUDO[n]
    ini, fim = cal.DATAS[n]
    linhas.append(["*E%d\n%s a\n%s" % (n, br(ini, False), br(fim)),
                   [(titulo + ".  ", True), (fazer, False)],
                   entrega])
    if n == DESENV[-1]:
        _destaque("FIM DO DESENVOLVIMENTO   ·   %s" % br(cal.FIM_DESENVOLVIMENTO), "184F95")
_destaque("PRAZO FINAL DE ENTREGA   ·   %s   ·   %d dias de margem depois da E%d"
          % (br(cal.PRAZO_FINAL), cal.MARGEM, cal.NUMEROS[-1]), "14865D")

cronograma = tabela(["Etapa", "O que será feito", "Entrega da etapa"], linhas,
                    [1.9, 9.7, 5.8], tam=7.6)
for indice, texto, fundo, cor in destaques:
    linha_destaque(cronograma, indice, texto, fundo=fundo, cor=cor)

secao("O que o orientador recebe, e quando")


def _fim(n):
    return br(cal.DATAS[n][1])


tabela(["Data", "O que será entregue"],
       [["*%s  ·  fim da E1" % _fim(1),
         "Requisitos aprovados, estudo dos sistemas parecidos e a medida inicial do protótipo"],
        ["*%s  ·  fim da E2" % _fim(2),
         "Arquitetura com as decisões justificadas, lista de tarefas e ambiente funcionando"],
        ["*%s  ·  fim da E4" % _fim(4),
         "Demonstração ao vivo: uma tarefa percorrendo os seis estados, com uma reprovação "
         "provocada"],
        ["*%s  ·  fim da E5" % _fim(5),
         "Demonstração: três tarefas em paralelo e a recuperação de uma falha provocada"],
        ["*%s  ·  fim da E6" % _fim(6),
         "Demonstração: um projeto inteiro acompanhado na tela, do pedido à entrega"],
        ["*%s  ·  fim da E7" % _fim(7),
         "Relatório dos testes com projetos reais e a lista de correções"],
        ["*%s  ·  prazo final" % br(cal.PRAZO_FINAL),
         "Documento de entrega, com o resultado comparado à medida inicial da E1"]],
       [4.4, 13.0])

quebra()

# ================================================================ PARTE III
parte("III", "Os requisitos",
      "O que o sistema precisa fazer, sob que restrições, e em que etapa cada um é atendido.",
      cor="4A3AA7")

secao("O que o sistema precisa fazer")

tabela(["#", "Requisito", "Como será verificado", "Etapa"],
       [["*R1", "Transformar uma descrição em linguagem natural em especificação, plano e lista de "
                "tarefas", "um pedido real produz as três coisas", "E4"],
        ["*R2", "Fazer cada tarefa percorrer seis estados, registrando cada mudança junto com o "
                "relatório e o custo", "o histórico de uma tarefa mostra as seis passagens", "E4"],
        ["*R3", "Submeter toda entrega a dois julgamentos independentes: um verifica se funciona, "
                "outro se é o que foi pedido", "os dois portões reprovam por motivos diferentes",
         "E4"],
        ["*R4", "Devolver a entrega reprovada com o relatório do que faltou, decidindo como "
                "refazer a partir da causa", "uma reprovação provocada gera a decisão correta",
         "E4"],
        ["*R5", "Limitar o retrabalho, replanejar a tarefa uma vez e, se ainda falhar, entregá-la "
                "ao humano", "uma tarefa impossível chega ao humano em quatro ciclos", "E4"],
        ["*R6", "Construir tarefas independentes ao mesmo tempo, sem que uma interfira no arquivo "
                "da outra", "três tarefas em paralelo, sem conflito", "E5"],
        ["*R7", "Consultar o histórico do próprio projeto antes de decidir, citando a fonte",
         "o agente cita a decisão anterior, e a citação confere", "E6"],
        ["*R8", "Mostrar andamento, custo e saída de cada agente numa tela, ao vivo",
         "um projeto inteiro acompanhado do pedido à entrega", "E6"]],
       [1.1, 7.0, 6.9, 2.4], tam=8.0)

secao("Sob que restrições")

tabela(["#", "Restrição", "O mecanismo que a garante", "Etapa"],
       [["*R9", "Roda em uma máquina modesta: 8 GB de memória e 4 núcleos",
         "o único componente pesado — a busca por significado — é trocável e escolhido por medição",
         "E6"],
        ["*R10", "O custo é contado em duas unidades: cota consumida e valor em dinheiro",
         "uma tabela própria, alimentada a cada resposta do modelo", "E3"],
        ["*R11", "Nenhum agente escreve fora da pasta do projeto",
         "a própria ferramenta de escrita recusa o caminho de fora", "E3"],
        ["*R12", "Os testes rodam sem internet, sem consumir cota e sem chave de acesso",
         "substitutos de mentira, e um teste que falha se a chave existir", "E3"],
        ["*R13", "A morte de um agente não derruba os outros nem perde o trabalho",
         "cada agente é um processo isolado, e a fila devolve a tarefa", "E5"],
        ["*R14", "O gasto de uma rodada não passa de um teto declarado",
         "o sistema impede começar o que não cabe, e nunca corta no meio", "E5"],
        ["*R15", "Trocar o fornecedor do modelo não exige mexer no núcleo",
         "o fornecedor entra por uma fronteira, como peça encaixável", "E5"]],
       [1.2, 6.5, 7.3, 2.4], tam=8.0)

# ================================================================ PARTE IV
parte("IV", "Como o sistema vai funcionar",
      "As quatro camadas, o caminho de uma tarefa e o que acontece quando ela falha.",
      cor="184F95")

secao("As quatro camadas")

p("Cada camada só conhece a de baixo. A tela não conversa com o modelo: ela lê o mesmo banco de "
  "dados e escuta os mesmos avisos que o motor emite — assim nunca mostra um estado diferente do "
  "real.", depois=2)

figura("fig3_arquitetura.png",
       "Figura 3 — As quatro camadas. As duas fronteiras do meio, em roxo, permitem trocar o "
       "fornecedor do modelo ou o mecanismo de busca sem mexer no motor (R15).", 15.0)

secao("O caminho de uma tarefa")

p("A unidade de trabalho é a tarefa: pequena, com objetivo escrito e critérios de aceite que são "
  "comandos, não opiniões. Ela percorre seis estados, e cada passagem é feita por um agente "
  "diferente daquele que construiu.", depois=2)

figura("fig4_ciclo.png",
       "Figura 4 — Os seis estados e os dois portões. As perguntas são independentes: uma entrega "
       "pode funcionar perfeitamente e ainda assim não ser a que foi pedida.", 16.0)

rico([("A ferramenta que o revisor não recebe.  ", True, AZUL),
      ("Quem revisa não tem nenhuma ferramenta que escreva em arquivo. Não é uma instrução para que "
       "não corrija: é a ausência da capacidade — a separação entre construir e aprovar deixa de "
       "depender de disciplina e passa a depender da estrutura.", False)],
     tam=9.2, antes=1, depois=3)

secao("O que acontece quando uma tarefa falha")

p("Cada reprovação muda a estratégia, em vez de repetir a aposta que já falhou. Quem conta os "
  "ciclos é o sistema: o agente não tem ferramenta para mexer no contador.", depois=2)

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

# ================================================================ PARTE V
parte("V", "As ferramentas", "O que será usado para construir, e por que cada escolha.",
      cor="C24E1E")

secao("Por que Elixir")

p("O sistema não faz contas pesadas: ele espera. Cada agente passa a maior parte do tempo "
  "aguardando um serviço remoto que demora dezenas de segundos e pode falhar, e o desafio é manter "
  "dezenas desses trabalhos em andamento, cortar um com segurança e sobreviver quando um morre. "
  "Elixir roda sobre uma plataforma feita para isso: cada agente vira um processo isolado, com "
  "dono, com quem o encerre e com quem perceba que ele morreu. O custo da escolha é um ecossistema "
  "de inteligência artificial menor que o de Python — aceitável, porque a parte pesada aqui é "
  "espera de rede, não cálculo.")

secao("A pilha, ferramenta por ferramenta")

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

secao("A verificação, num comando só")

p("Todo o controle de qualidade fica atrás de um comando. O que falha mais rápido e mais barato "
  "roda primeiro, e o primeiro estágio que falhar interrompe os seguintes. É este comando que roda "
  "em toda verificação — à mão ou quando um agente confere a própria entrega.")

codigo(["mix verificar   # quatro estagios, do mais barato ao mais caro",
        "  1. formatacao do codigo          # segundos",
        "  2. compilacao                    # qualquer aviso reprova",
        "  3. analise de estilo             # modo estrito",
        "  4. testes automaticos            # sem internet, sem cota"])

# ================================================================ PARTE VI
parte("VI", "Riscos", "O que pode dar errado, e o que já está previsto para cada caso.",
      cor="B52C2C")

secao("Riscos e o que fazer com eles")

tabela(["Risco", "Impacto", "O que está previsto"],
       [["*O fornecedor do modelo não oferecer o controle que o projeto supõe", "alto",
         "a E5 mede antes de decidir, com o instrumento de medição escrito antes de ser usado"],
        ["*O desenvolvimento, com %d dias, não caber no prazo" % cal.dias_da_fase("desenv"),
         "alto",
         "a ordem das etapas põe primeiro o que sustenta o resto; se algo atrasar, o corte sai da "
         "E6 (memória e painel), nunca da E7 e da E8"],
        ["*As tarefas escritas na E2 envelhecerem até serem executadas", "médio",
         "as etapas E4, E5 e E6 começam conferindo o plano contra o código que já existe"],
        ["*O custo de execução passar do previsto", "alto",
         "custo gravado desde a E3, e teto de gasto por rodada na E5"],
        ["*O limite de cota interromper um trabalho no meio", "médio",
         "reconhecer a parada, guardar o que já foi feito e retomar depois"],
        ["*A busca por significado não caber na máquina de 8 GB", "médio",
         "a E6 mede antes de escolher, e o componente é trocável"],
        ["*Um imprevisto encostar a entrega no prazo", "médio",
         "a E%d termina em %s: sobram %d dias de margem até %s"
         % (cal.NUMEROS[-1], br(cal.FIM_DA_ULTIMA_ETAPA), cal.MARGEM, br(cal.PRAZO_FINAL))],
        ["*Uma medição depender de acesso pago indisponível", "baixo",
         "cada entrega tem uma parte demonstrável sem custo e outra que exige gasto"]],
       [5.0, 1.6, 10.8], tam=7.8)

caixa("O QUE FICA, SE TUDO O MAIS MUDAR",
      "Modelos vão melhorar, ficar mais baratos e mudar de nome. A parte deste trabalho que não "
      "depende disso é a estrutura: tarefas pequenas com estado explícito, dois julgamentos "
      "independentes feitos por quem não construiu, falha limitada com uma tentativa de "
      "redimensionamento antes de desistir, e tudo registrado no instante em que acontece.")

conferir(n_etapas=cal.N_ETAPAS, n_requisitos=15)
doc.save(DESTINO)
print("gerado:", DESTINO)
