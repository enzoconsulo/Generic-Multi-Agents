# -*- coding: utf-8 -*-
"""Corpo do PLANO DE DESENVOLVIMENTO. Usa os helpers de plano_base.py.

Regras deste documento, que valem para qualquer edicao futura:

  1. DUAS siglas, e so duas: E1..En para as etapas, R1..R15 para os requisitos. Os
     pacotes de trabalho estendem a das etapas: E3.1, E3.2 — nunca uma sigla nova.
  2. NENHUMA DATA ESCRITA A MAO. Todas vem de calendario_plano.py (modulo `cal`).
  3. MODULAR: cada etapa de desenvolvimento constroi uma parte completa do sistema e
     termina numa entrega demonstravel, que pode ser apresentada sozinha.
  4. POUCAS PALAVRAS. Na tabela das etapas: o que sera feito em frases curtas,
     separadas por ponto e virgula; a entrega em uma frase. Prosa so onde tabela nao
     cabe. Hoje: 36 a 58 palavras por etapa.
  5. SEM QUEBRA DE PAGINA FORCADA, e espaco entre blocos so com respiro().
  6. Criterio tem limite absoluto; o documento trata o trabalho como projeto que
     comeca do zero — conferir() recusa os termos de versao anterior.
  7. Secao numerada so com secao("titulo"). Teto de 10 paginas (medir_paginas.py).

Monte com `python gerar_plano.py`. Nao rode este arquivo sozinho.
"""
import calendario_plano as cal
import pacotes_plano as pac

br = cal.br
PLAN = cal.etapas_da_fase("plan")
DESENV = cal.etapas_da_fase("desenv")
VALID = cal.etapas_da_fase("valid")
ULTIMA = cal.NUMEROS[-1]

if sorted(pac.PACOTES) != cal.NUMEROS:
    raise SystemExit("A WBS cobre as etapas %s, mas o calendario tem %s. Acerte "
                     "pacotes_plano.py." % (sorted(pac.PACOTES), cal.NUMEROS))


def _intervalo(ns):
    """'a E1' para uma etapa, 'da E2 à E7' para varias — concorda com o calendario."""
    return "a E%d" % ns[0] if len(ns) == 1 else "da E%d à E%d" % (ns[0], ns[-1])


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
      "a ponta: agentes especializados planejam, implementam, testam e revisam, cada um com "
      "autoridade limitada. Depois do pedido, o sistema trabalha sozinho.")

figura("fig1_visao_geral.png",
       "Figura 1 — O projeto do começo ao fim: %d dias em %d etapas, sem pausa até o início das "
       "aulas. As três faixas são as fases do modelo em cascata."
       % (cal.DIAS_TOTAIS, cal.N_ETAPAS), 17.0)

if cal.RECESSO:
    periodo = "De %s a %s, com recesso de %s a %s." % (
        br(cal.INICIO), br(cal.PRAZO_FINAL), br(cal.RECESSO[0], False), br(cal.RECESSO[1]))
else:
    periodo = "De %s a %s, sem pausa." % (br(cal.INICIO), br(cal.PRAZO_FINAL))

if len(cal.ETAPAS_CHEIAS) == cal.N_ETAPAS:
    sobre_etapas = "Todas de %d dias." % cal.DIAS_POR_ETAPA
else:
    sobre_etapas = ("%d de %d dias e a última de %d, até o início das aulas."
                    % (len(cal.ETAPAS_CHEIAS), cal.DIAS_POR_ETAPA, cal.DURACAO[ULTIMA]))

passos([(str(cal.DIAS_TOTAIS), "dias até o prazo", periodo),
        (str(cal.N_ETAPAS), "etapas", sobre_etapas),
        (str(cal.dias_da_fase("desenv")), "dias de desenvolvimento",
         "De %s a %s: %s, uma parte do sistema por etapa."
         % (br(cal.INICIO_DESENVOLVIMENTO, False), br(cal.FIM_DESENVOLVIMENTO),
            _intervalo(DESENV))),
        (str(cal.dias_da_fase("valid")), "dias de validação",
         "Do fim do semestre ao início das aulas, até os critérios serem atingidos.")])

caixa("COMO LER",
      "Duas siglas: E1 a E%d são as etapas; R1 a R15, os requisitos. Cada etapa termina numa "
      "entrega demonstrável, apresentada ao orientador." % cal.N_ETAPAS,
      cor="14865D", fundo="E7F7F1", cor_titulo=VERDE)

# ================================================================ PARTE I
parte("I", "O projeto", "O problema, o objetivo e os critérios pelos quais o sistema será julgado.")

secao("O problema")

p("Modelos de linguagem já escrevem código competente; o gargalo é o trabalho longo, com muitas "
  "decisões encadeadas. Os sistemas multi-agente atuais coordenam os agentes com instruções "
  "escritas no pedido — \"não saia do projeto\", \"não tente mais de três vezes\" — e instrução "
  "dirigida a um modelo é pedido, não garantia.")

caixa("A IDEIA CENTRAL",
      "Um sistema multi-agente não falha por escrever mal, e sim por governar mal. A proposta é "
      "tirar as regras do texto do pedido e colocá-las na estrutura do programa, onde deixam de "
      "ser opcionais.",
      cor="B52C2C", fundo="FBECEA", cor_titulo=VERMELHO)

secao("Onde cada regra vai morar")

tabela(["A regra", "Como costuma existir", "Onde vai morar"],
       [["*Não escrever fora do projeto", "pedido no texto",
         "a ferramenta de escrita recusa o caminho — o agente não tem como tentar"],
        ["*No máximo três tentativas", "lembrete que pode ser ignorado",
         "contador no banco de dados, que o agente não consegue alterar"],
        ["*Quem constrói não aprova", "combinação de papéis",
         "quem revisa não recebe nenhuma ferramenta de escrita"],
        ["*Não estourar o orçamento", "recomendação",
         "o sistema não deixa começar o trabalho que não cabe"]],
       [4.3, 4.0, 9.1])

secao("Objetivo")

p("Construir um sistema multi-agente de construção de software em que as regras de governança "
  "sejam impostas pela estrutura do programa, e refiná-lo com projetos de teste até atingir os "
  "critérios de desempenho abaixo.")

secao("Critérios de desempenho")

p("São a condição de parada da validação: %s repetem testar, medir e corrigir até todos serem "
  "atingidos. Os limites e os cinco projetos de teste são definidos na E%d, não são usados na "
  "construção e não mudam — ajusta-se o sistema, nunca a régua."
  % (_intervalo(VALID).replace("da ", "as etapas da ", 1), PLAN[-1]),
  tam=9.0, cor=CINZA, depois=3)

tabela(["Critério", "Como é medido", "Atingido quando"],
       [["*Constrói sozinho", "os cinco projetos de teste, do pedido à entrega",
         "pelo menos 3 sem nenhuma intervenção"],
        ["*Conclui as tarefas", "tarefas concluídas nos cinco projetos", "80% ou mais"],
        ["*Pouco retrabalho", "execuções por tarefa concluída, em média", "até 2"],
        ["*Não aprova errado", "tarefas concluídas que falham ao ser verificadas de novo",
         "nenhuma"],
        ["*Governa de verdade", "tentativas provocadas de quebrar as quatro regras acima",
         "todas barradas"],
        ["*Aguenta falha", "agente encerrado no meio da tarefa; banco de dados derrubado",
         "recuperação sem perder trabalho"],
        ["*Custo sob controle", "rodadas que passam do teto de gasto", "nenhuma"],
        ["*Cabe na máquina", "pico de memória com três tarefas em paralelo", "até 8 GB"]],
       [3.5, 8.3, 5.6], tam=8.0)

# ================================================================ PARTE II
parte("II", "O cronograma",
      "O modelo, as %d etapas, a divisão do trabalho e a validação." % cal.N_ETAPAS,
      cor="14865D")

secao("O modelo de desenvolvimento")

p("O desenvolvimento segue o modelo em cascata: as fases acontecem em sequência, e cada uma "
  "termina numa entrega que precisa estar pronta para a seguinte começar. Requisitos e "
  "arquitetura são fechados na E%d, antes de programar; a construção vai %s; a validação começa "
  "com o sistema completo. O modelo cabe aqui porque o escopo está definido desde o início e a "
  "data de entrega é fixa." % (PLAN[-1], _intervalo(DESENV)), depois=2)

figura("fig2_cascata.png",
       "Figura 2 — O modelo em cascata: três fases em sequência, cada uma com um portão de saída.",
       16.6)

secao("As etapas")

figura("fig3_cronograma.png",
       "Figura 3 — As %d etapas, com o início e o fim do desenvolvimento e o prazo final. A cor "
       "de cada barra é a fase." % cal.N_ETAPAS, 16.6)

frase_plan = _intervalo(PLAN)
p("Cada etapa termina numa entrega demonstrável, apresentada ao orientador; a seguinte só começa "
  "com ela pronta. %s planeja; %s, cada etapa constrói uma parte completa do sistema; %s, o "
  "sistema é validado e refinado."
  % (frase_plan[0].upper() + frase_plan[1:], _intervalo(DESENV), _intervalo(VALID)),
  antes=2, depois=3)

# (titulo, o que sera feito, entrega da etapa) — as datas saem do calendario
CONTEUDO = {
    1: ("Planejamento e arquitetura",
        "levantar os requisitos R1 a R15 e o estado da arte; escolher as ferramentas e desenhar "
        "a arquitetura; dividir o trabalho em tarefas; definir os critérios de desempenho e os "
        "cinco projetos de teste",
        "Requisitos, arquitetura, tarefas, critérios e projetos de teste aprovados."),
    2: ("Fundação do sistema",
        "montar o ambiente e o projeto com verificação de qualidade; criar o banco de dados e a "
        "contagem de custo; criar as fronteiras do modelo e da busca, com substitutos para "
        "teste; cópia de segurança do banco",
        "Os testes rodam sem internet e sem consumir o serviço do modelo."),
    3: ("O agente e as ferramentas",
        "ferramentas de arquivo, confinadas, e de comando, com prazo; resumo do projeto para "
        "orientar o agente; o agente como processo supervisionado, com limite de chamadas; os "
        "adaptadores do fornecedor, com o controle dele medido antes",
        "Um agente resolve uma tarefa real com o custo gravado, e trocar de fornecedor não mexe "
        "no núcleo."),
    4: ("Linha de produção de tarefas",
        "os seis estados, com mudança gravada de uma vez só; fila por dependências; equipe de "
        "agentes especializados; critérios de aceite executados sozinhos; os dois portões; "
        "diagnóstico da reprovação; teto de gasto",
        "Uma tarefa percorre os seis estados, é reprovada de propósito, é refeita e conclui."),
    5: ("Paralelismo e tolerância a falhas",
        "um processo supervisionado por tarefa; fila durável no banco; tarefas em paralelo sem "
        "disputar arquivo; reconhecer o limite de uso do fornecedor e retomar; recuperar "
        "trabalho interrompido",
        "Três tarefas em paralelo; encerrar uma no meio não afeta as outras, e ela volta à fila."),
    6: ("Memória do projeto",
        "medir memória e tempo antes de escolher onde a busca roda; guardar o histórico a cada "
        "alteração; buscar por significado e por termo exato; entregar o contexto com a fonte "
        "citada; avaliar a qualidade da busca",
        "O agente cita a decisão anterior, com a fonte certa, em vez de decidir de novo."),
    7: ("Painel e automação",
        "medidas de cada execução; quadro de tarefas e console ao vivo, com custo; parar e "
        "retomar; rodadas automáticas com teto de gasto; entregas que não são código; busca de "
        "segredos antes de publicar",
        "Um projeto inteiro acompanhado na tela, do pedido à entrega, com o custo em tempo real."),
    8: ("Testes com projetos reais",
        "executar os cinco projetos de teste sem intervenção; medir cada critério; testar na "
        "máquina de 8 GB; provocar falhas de propósito; registrar cada defeito com a causa",
        "Primeira medição dos critérios e lista de correções por ordem de impacto."),
    9: ("Refinamento",
        "corrigir por ordem de impacto, cada correção com um teste; ajustar o desenho onde a "
        "medição indicar; repetir os testes e a medição quantas vezes for preciso",
        "Nova medição dos critérios e o que ainda falta para atingi-los."),
    10: ("Refinamento final e entrega",
         "último ciclo de correção; congelar a versão; medir o valor final de cada critério; "
         "escrever o documento de entrega",
         "Critérios atingidos — ou o valor medido publicado — e documento de entrega."),
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
    if n == VALID[0]:
        _destaque("FIM DO DESENVOLVIMENTO   ·   %s   ·   COMEÇA A VALIDAÇÃO"
                  % br(cal.FIM_DESENVOLVIMENTO), "184F95")
    if cal.RECESSO and n == cal.RECESSO_ANTES_DA_ETAPA:
        _destaque("RECESSO   ·   %s a %s" % (br(cal.RECESSO[0]), br(cal.RECESSO[1])),
                  "E4E4DF", cor=CINZA)
    titulo, fazer, entrega = CONTEUDO[n]
    ini, fim = cal.DATAS[n]
    datas = "*E%d\n%s–%s" % (n, br(ini, False), br(fim, False))
    if cal.DURACAO[n] != cal.DIAS_POR_ETAPA:
        datas += "\n%d dias" % cal.DURACAO[n]
    linhas.append([datas, [(titulo + ".  ", True), (fazer[0].upper() + fazer[1:] + ".", False)],
                   entrega])

prazo = "PRAZO FINAL   ·   %s   ·   INÍCIO DAS AULAS" % br(cal.PRAZO_FINAL)
if cal.MARGEM:
    prazo += "   ·   %d DIAS DE MARGEM" % cal.MARGEM
_destaque(prazo, "14865D")

cronograma = tabela(["Etapa", "O que será feito", "Entrega da etapa"], linhas,
                    [1.9, 10.0, 5.5], tam=7.8)
for indice, texto, fundo, cor in destaques:
    linha_destaque(cronograma, indice, texto, fundo=fundo, cor=cor)

secao("A divisão do trabalho")

p("A figura abre cada etapa nos pacotes de trabalho que a compõem — a mesma decomposição da "
  "coluna \"O que será feito\", vista em árvore. Os pacotes são numerados por etapa: E%d.1, "
  "E%d.2, e assim por diante." % (DESENV[1], DESENV[1]), depois=2)

figura("fig4_wbs.png",
       "Figura 4 — A divisão do trabalho: o projeto, as três fases, as %d etapas e os pacotes de "
       "cada uma." % cal.N_ETAPAS, 17.0)

secao("A validação: refinar até os critérios serem atingidos")

p("%s não têm lista fechada de tarefas: repetem o ciclo até os critérios serem atingidos. Cada "
  "defeito vira uma correção com a causa registrada e um teste; se a medição pedir mudança no "
  "desenho, ela entra aqui." % ("As etapas " + cal.faixa("valid")), depois=2)

figura("fig5_validacao.png",
       "Figura 5 — O ciclo da validação: para quando os critérios são atingidos, ou no início das "
       "aulas.", 16.4)

secao("Apresentações ao orientador")


def _fim(n):
    return br(cal.DATAS[n][1])


tabela(["Data", "O que será apresentado"],
       [["*%s  ·  fim da E1" % _fim(1),
         "Requisitos, arquitetura, critérios de desempenho e projetos de teste"],
        ["*%s  ·  fim da E3" % _fim(3), "Um agente resolvendo uma tarefa real, com o custo gravado"],
        ["*%s  ·  fim da E4" % _fim(4), "Uma tarefa reprovada de propósito, refeita e concluída"],
        ["*%s  ·  fim da E5" % _fim(5), "Três tarefas em paralelo e a recuperação de uma falha"],
        ["*%s  ·  fim da E7" % _fim(7), "O sistema completo, acompanhado na tela"],
        ["*%s  ·  fim da E8" % _fim(8), "A primeira medição dos critérios de desempenho"],
        ["*%s  ·  prazo final" % br(cal.PRAZO_FINAL),
         "O documento de entrega, com o valor final de cada critério"]],
       [4.4, 13.0])

# ================================================================ PARTE III
parte("III", "Os requisitos",
      "O que o sistema precisa fazer, sob que restrições, e em que etapa cada um é atendido.",
      cor="4A3AA7")

secao("O que o sistema precisa fazer")

tabela(["#", "Requisito", "Como será verificado", "Etapa"],
       [["*R1", "Transformar a descrição de um projeto em especificação, plano e tarefas",
         "um pedido real gera as três coisas", "E4"],
        ["*R2", "Levar cada tarefa por seis estados, registrando relatório e custo",
         "o histórico mostra as seis passagens", "E4"],
        ["*R3", "Julgar toda entrega duas vezes: se funciona e se é o que foi pedido",
         "os dois portões reprovam por motivos diferentes", "E4"],
        ["*R4", "Devolver a entrega reprovada com o que faltou e decidir como refazer",
         "uma reprovação provocada gera a decisão certa", "E4"],
        ["*R5", "Limitar o retrabalho: replanejar uma vez e, se falhar, passar ao humano",
         "uma tarefa impossível chega ao humano em quatro ciclos", "E4"],
        ["*R6", "Executar tarefas independentes em paralelo, sem disputa de arquivo",
         "três tarefas em paralelo, sem conflito", "E5"],
        ["*R7", "Consultar o histórico do projeto antes de decidir, citando a fonte",
         "o agente cita a decisão anterior correta", "E6"],
        ["*R8", "Mostrar andamento, custo e saída dos agentes, ao vivo",
         "um projeto inteiro acompanhado na tela", "E7"]],
       [1.1, 7.6, 6.7, 2.0], tam=8.0)

secao("Sob que restrições")

tabela(["#", "Restrição", "O mecanismo que a garante", "Etapa"],
       [["*R9", "Rodar em 8 GB de memória e 4 núcleos",
         "o único componente pesado, a busca, é trocável e escolhido por medição", "E6"],
        ["*R10", "Contar o custo em cota consumida e em dinheiro",
         "tabela alimentada a cada resposta do modelo", "E2"],
        ["*R11", "Nenhum agente escreve fora da pasta do projeto",
         "a própria ferramenta de escrita recusa o caminho", "E3"],
        ["*R12", "Testes sem internet e sem consumir o serviço do modelo",
         "substitutos para teste; um teste falha se a chave de acesso existir", "E2"],
        ["*R13", "A queda de um agente não derruba os outros nem perde trabalho",
         "processos isolados; a fila devolve a tarefa", "E5"],
        ["*R14", "Nenhuma rodada passa do teto de gasto",
         "impede começar o que não cabe, e nunca corta no meio", "E4"],
        ["*R15", "Trocar o fornecedor do modelo sem mexer no núcleo",
         "o fornecedor entra por uma fronteira", "E3"]],
       [1.2, 6.8, 7.4, 2.0], tam=8.0)

# ================================================================ PARTE IV
parte("IV", "Como o sistema vai funcionar",
      "As quatro camadas, onde ele roda, o caminho de uma tarefa e o que acontece quando ela "
      "falha.", cor="184F95")

secao("As quatro camadas")

p("Cada camada só conhece a de baixo. A tela lê o mesmo banco e os mesmos avisos do motor, então "
  "nunca mostra um estado diferente do real.", depois=2)

figura("fig6_arquitetura.png",
       "Figura 6 — As quatro camadas. As fronteiras, em roxo, permitem trocar o fornecedor do "
       "modelo ou a busca sem mexer no motor.", 15.0)

secao("Onde o sistema roda")

p("Tudo roda numa máquina só. O navegador abre o painel na porta 4000; a aplicação guarda estado, "
  "fila e busca no banco de dados, e escreve cada projeto gerado em sua própria pasta com "
  "controle de versão. A única saída para a internet é o fornecedor do modelo. O banco sobe por "
  "script quando se vai trabalhar, e não como serviço permanente, para não ocupar memória fora do "
  "uso (R9).", depois=2)

figura("fig7_infra.png",
       "Figura 7 — Onde o sistema roda. Tudo numa máquina só; a única saída para a internet é o "
       "fornecedor do modelo.", 16.6)

secao("O caminho de uma tarefa")

p("A unidade de trabalho é a tarefa: pequena, com critérios de aceite que são comandos. Cada "
  "passagem de estado é feita por um agente diferente de quem construiu.", depois=2)

figura("fig8_ciclo.png",
       "Figura 8 — Os seis estados e os dois portões: funcionar e ser o que foi pedido são "
       "perguntas diferentes.", 16.0)

rico([("A ferramenta que o revisor não recebe.  ", True, AZUL),
      ("Quem revisa não tem ferramenta de escrita: a separação entre construir e aprovar vem da "
       "estrutura, não da disciplina.", False)], tam=9.2, antes=1, depois=3)

secao("O que acontece quando uma tarefa falha")

p("Cada reprovação muda a estratégia. Quem conta os ciclos é o sistema, não o agente.", depois=2)

tabela(["Ciclo", "O que o sistema faz", "Por quê"],
       [["*1º", "Refaz com um modelo mais forte", "a reprovação é o gatilho, não um palpite"],
        ["*2º", "Troca o agente especializado",
         "duas reprovações seguidas indicam viés da abordagem"],
        ["*3º", "Quebra ou reescreve a tarefa", "o problema pode ser o tamanho da tarefa"],
        ["*4º", "Bloqueia e passa ao humano", "insistir custa sem aumentar a chance de acerto"]],
       [1.4, 5.4, 10.6])

# ================================================================ PARTE V
parte("V", "As ferramentas", "O que será usado para construir, e por que cada escolha.",
      cor="C24E1E")

secao("Por que Elixir")

p("O sistema não faz contas pesadas: ele espera respostas lentas de um serviço remoto, que podem "
  "falhar. Elixir roda sobre uma plataforma feita para manter muitos trabalhos assim ao mesmo "
  "tempo: cada agente é um processo isolado e supervisionado, e a queda de um não afeta os "
  "outros. O custo da escolha é um ecossistema de inteligência artificial menor que o de Python.")

secao("A pilha, ferramenta por ferramenta")

tabela(["Ferramenta", "Ver.", "Para que serve", "Por que ela"],
       [["*Elixir", "1.19", "Linguagem de todo o sistema",
         "dá acesso à plataforma de processos supervisionados"],
        ["*Erlang/OTP", "28", "Roda e supervisiona os processos", "é a razão da escolha"],
        ["*Mix", "—", "Compila, instala dependências e roda comandos", "vem com a linguagem"],
        ["*Phoenix", "1.8", "Aplicação web que serve a tela", "padrão do ecossistema"],
        ["*LiveView", "1.2", "Tela atualizada ao vivo pelo servidor",
         "dispensa um segundo sistema só para a interface"],
        ["*Bandit", "1.5", "Servidor HTTP", "escrito na própria linguagem"],
        ["*Tailwind + daisyUI", "—", "Aparência da tela", "componentes prontos"],
        ["*PostgreSQL", "18", "Banco com todo o estado do sistema",
         "muda estado, relatório e custo numa só transação"],
        ["*Ecto", "3.13", "Acesso ao banco e mudanças de esquema", "camada padrão do ecossistema"],
        ["*Oban", "2.24", "Fila de trabalhos dentro do banco",
         "enfileira e muda o estado da tarefa juntos"],
        ["*pgvector", "0.8", "Busca por semelhança de significado",
         "a memória fica no mesmo banco, sem outro serviço"],
        ["*ExUnit", "—", "Testes automáticos", "vem com a linguagem"],
        ["*Credo", "1.7", "Estilo e consistência do código", "em modo estrito, reprova a verificação"],
        ["*Dialyzer", "—", "Checagem de tipos", "leva regras para o compilador"],
        ["*Req", "0.5", "Conversa com o fornecedor do modelo",
         "permite controlar o reaproveitamento de contexto"],
        ["*Telemetry", "1.0", "Medidas de cada execução", "a tela lê os mesmos avisos do motor"],
        ["*Git", "—", "Versiona o sistema e os projetos gerados", "um registro por tarefa"]],
       [2.7, 1.0, 5.6, 8.1], tam=7.8)

secao("A verificação, num comando só")

p("Todo o controle de qualidade roda num comando, do estágio mais barato ao mais caro; o primeiro "
  "que falhar interrompe os seguintes.", depois=2)

codigo(["mix verificar   # quatro estagios, do mais barato ao mais caro",
        "  1. formatacao do codigo          # segundos",
        "  2. compilacao                    # qualquer aviso reprova",
        "  3. analise de estilo             # modo estrito",
        "  4. testes automaticos            # sem internet, sem custo"])

# ================================================================ PARTE VI
parte("VI", "Riscos", "O que pode dar errado, e o que já está previsto.", cor="B52C2C")

secao("Riscos e o que fazer com eles")

tabela(["Risco", "Impacto", "O que está previsto"],
       [["*O fornecedor do modelo não oferecer o controle esperado", "alto",
         "a E3 mede antes de decidir"],
        ["*O desenvolvimento (%d dias) não caber no prazo" % cal.dias_da_fase("desenv"), "alto",
         "o essencial vem primeiro; se atrasar, corta-se do painel (E7) ou da memória (E6), "
         "nunca da validação"],
        ["*Os critérios não serem atingidos até o início das aulas", "alto",
         "medição a cada ciclo desde a E8; o não atingido é publicado com o valor medido"],
        ["*As tarefas planejadas envelhecerem", "médio",
         "da E4 à E7, cada etapa começa conferindo o plano contra o código"],
        ["*O custo de uso do modelo passar do previsto", "alto",
         "custo gravado desde a E2 e teto por rodada desde a E4"],
        ["*O limite de uso do fornecedor interromper uma execução", "médio",
         "o sistema reconhece a parada, guarda o que foi feito e retoma (E5)"],
        ["*A busca não caber na máquina de 8 GB", "médio",
         "a E6 mede antes de escolher, e o componente é trocável"],
        ["*Um teste depender de acesso pago ao fornecedor", "baixo",
         "cada entrega tem uma parte demonstrável sem custo"]],
       [5.4, 1.6, 10.4], tam=7.8)

caixa("O QUE FICA, SE TUDO O MAIS MUDAR",
      "Modelos vão melhorar e mudar de nome. O que não depende deles é a estrutura: tarefas com "
      "estado explícito, dois julgamentos independentes, falha limitada e tudo registrado no "
      "momento em que acontece.")

conferir(n_etapas=cal.N_ETAPAS, n_requisitos=15)
doc.save(DESTINO)
print("gerado:", DESTINO)
