# -*- coding: utf-8 -*-
"""Versao 3: arquitetura + escopo + plano tecnico da reimplementacao em Elixir/OTP."""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

AQUI = os.path.dirname(os.path.abspath(__file__))
FIGS = os.path.join(AQUI, "figs3")
DESTINO = r"C:\Users\enzoc\OneDrive\Documentos\Gerador_de_projetos\fabrica-multi-agente-arquitetura-3.docx"

AZUL = RGBColor(0x18, 0x4F, 0x95)
AZUL_CLARO = RGBColor(0x2A, 0x78, 0xD6)
TINTA = RGBColor(0x0B, 0x0B, 0x0B)
CINZA = RGBColor(0x52, 0x51, 0x4E)
MUDO = RGBColor(0x89, 0x87, 0x81)
ROXO = RGBColor(0x4A, 0x3A, 0xA7)
VERDE = RGBColor(0x1B, 0xAF, 0x7A)
FONTE = "Calibri"
MONO = "Consolas"

doc = Document()
s = doc.sections[0]
s.page_width, s.page_height = Cm(21), Cm(29.7)
s.left_margin = s.right_margin = Cm(2.0)
s.top_margin = Cm(1.7)
s.bottom_margin = Cm(1.6)


def fonte(run, nome=FONTE, tam=None, cor=None, negrito=None, italico=None):
    run.font.name = nome
    run._element.rPr.rFonts.set(qn("w:eastAsia"), nome)
    if tam:
        run.font.size = Pt(tam)
    if cor is not None:
        run.font.color.rgb = cor
    if negrito is not None:
        run.bold = negrito
    if italico is not None:
        run.italic = italico
    return run


normal = doc.styles["Normal"]
normal.font.name = FONTE
normal.font.size = Pt(9.5)
normal.font.color.rgb = TINTA
normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONTE)
pf = normal.paragraph_format
pf.space_after = Pt(4)
pf.line_spacing = 1.06
pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

for nome, tam, cor, antes, depois in [("Heading 1", 13, AZUL, 9, 3),
                                      ("Heading 2", 10, TINTA, 6, 2)]:
    st = doc.styles[nome]
    st.font.name = FONTE
    st.font.size = Pt(tam)
    st.font.color.rgb = cor
    st.font.bold = True
    st.font.italic = False
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONTE)
    st.paragraph_format.space_before = Pt(antes)
    st.paragraph_format.space_after = Pt(depois)
    st.paragraph_format.keep_with_next = True
    st.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT


def p(texto="", tam=9.5, cor=TINTA, negrito=False, italico=False,
      alinhamento=None, antes=0, depois=4, espaco=1.06):
    par = doc.add_paragraph()
    if texto:
        fonte(par.add_run(texto), tam=tam, cor=cor, negrito=negrito, italico=italico)
    par.paragraph_format.space_before = Pt(antes)
    par.paragraph_format.space_after = Pt(depois)
    par.paragraph_format.line_spacing = espaco
    if alinhamento is not None:
        par.paragraph_format.alignment = alinhamento
    return par


def rico(pedacos, tam=9.5, depois=4, antes=0):
    par = doc.add_paragraph()
    for pedaco in pedacos:
        t, n = pedaco[0], pedaco[1]
        c = pedaco[2] if len(pedaco) > 2 else TINTA
        fonte(par.add_run(t), tam=tam, cor=c, negrito=n)
    par.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    par.paragraph_format.space_after = Pt(depois)
    par.paragraph_format.space_before = Pt(antes)
    par.paragraph_format.line_spacing = 1.06
    return par


def marcador(negrito, resto, tam=9.5):
    par = doc.add_paragraph(style="List Bullet")
    fonte(par.add_run(negrito), tam=tam, negrito=True, cor=TINTA)
    fonte(par.add_run(resto), tam=tam, cor=TINTA)
    par.paragraph_format.space_after = Pt(1)
    par.paragraph_format.line_spacing = 1.04
    par.paragraph_format.left_indent = Cm(0.5)
    par.paragraph_format.first_line_indent = Cm(-0.28)
    par.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    return par


def figura(arquivo, legenda, largura=13.4):
    par = doc.add_paragraph()
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    par.paragraph_format.space_before = Pt(4)
    par.paragraph_format.space_after = Pt(1)
    par.add_run().add_picture(os.path.join(FIGS, arquivo), width=Cm(largura))
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(6)
    fonte(cap.add_run(legenda), tam=7.5, cor=MUDO, italico=True)


def sombra(celula, cor_hex):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), cor_hex)
    celula._tc.get_or_add_tcPr().append(shd)


def tabela(cabecalho, linhas, larguras, tam=8.2):
    t = doc.add_table(rows=1, cols=len(cabecalho))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders = OxmlElement("w:tblBorders")
    for lado in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{lado}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:color"), "D9D9D6")
        borders.append(el)
    t._tbl.tblPr.append(borders)
    for i, texto in enumerate(cabecalho):
        cel = t.rows[0].cells[i]
        cel.text = ""
        par = cel.paragraphs[0]
        par.paragraph_format.space_after = Pt(0)
        par.paragraph_format.space_before = Pt(0)
        par.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        fonte(par.add_run(texto), tam=tam, negrito=True, cor=RGBColor(0xFF, 0xFF, 0xFF))
        sombra(cel, "2A78D6")
    for j, linha in enumerate(linhas):
        cells = t.add_row().cells
        for i, texto in enumerate(linha):
            cells[i].text = ""
            par = cells[i].paragraphs[0]
            par.paragraph_format.space_after = Pt(0)
            par.paragraph_format.space_before = Pt(0)
            par.paragraph_format.line_spacing = 1.0
            par.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
            negrito = texto.startswith("*")
            mono = texto.startswith("`")
            limpo = texto.lstrip("*`")
            fonte(par.add_run(limpo), nome=MONO if mono else FONTE, tam=tam - 0.4 if mono else tam,
                  cor=TINTA if (negrito or mono) else CINZA, negrito=negrito)
            if j % 2 == 1:
                sombra(cells[i], "F5F5F2")
    for linha in t.rows:
        for i, cel in enumerate(linha.cells):
            cel.width = Cm(larguras[i])
    doc.add_paragraph().paragraph_format.space_after = Pt(3)
    return t


def caixa(titulo, texto, cor="2A78D6", fundo="EAF2FD", cor_titulo=AZUL):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cel = t.rows[0].cells[0]
    cel.width = Cm(17.0)
    sombra(cel, fundo)
    borders = OxmlElement("w:tblBorders")
    for lado in ("top", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{lado}")
        el.set(qn("w:val"), "none")
        borders.append(el)
    el = OxmlElement("w:left")
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), "18")
    el.set(qn("w:color"), cor)
    borders.append(el)
    t._tbl.tblPr.append(borders)
    par = cel.paragraphs[0]
    par.paragraph_format.space_before = Pt(2)
    par.paragraph_format.space_after = Pt(2)
    par.paragraph_format.line_spacing = 1.04
    par.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    fonte(par.add_run(titulo + "  "), tam=8.8, negrito=True, cor=cor_titulo)
    fonte(par.add_run(texto), tam=8.8, cor=TINTA)
    doc.add_paragraph().paragraph_format.space_after = Pt(3)
    return t


def codigo(linhas, legenda=None):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cel = t.rows[0].cells[0]
    cel.width = Cm(17.0)
    sombra(cel, "F7F7F4")
    borders = OxmlElement("w:tblBorders")
    for lado in ("top", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{lado}")
        el.set(qn("w:val"), "none")
        borders.append(el)
    el = OxmlElement("w:left")
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), "18")
    el.set(qn("w:color"), "C3C2B7")
    borders.append(el)
    t._tbl.tblPr.append(borders)
    primeiro = True
    for l in linhas:
        par = cel.paragraphs[0] if primeiro else cel.add_paragraph()
        primeiro = False
        par.paragraph_format.space_before = Pt(1 if not primeiro else 2)
        par.paragraph_format.space_after = Pt(0)
        par.paragraph_format.line_spacing = 1.0
        par.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        comentario = l.strip().startswith("#") or l.strip().startswith("--")
        fonte(par.add_run(l if l else " "), nome=MONO, tam=7.6,
              cor=VERDE if comentario else TINTA)
    if legenda:
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.LEFT
        cap.paragraph_format.space_before = Pt(1)
        cap.paragraph_format.space_after = Pt(6)
        fonte(cap.add_run(legenda), tam=7.5, cor=MUDO, italico=True)
    else:
        doc.add_paragraph().paragraph_format.space_after = Pt(3)


# ================================================================ CABEÇALHO
p("Fábrica de Software Multi-Agente", tam=22, cor=AZUL, negrito=True,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=1, espaco=1.0)
p("Arquitetura, escopo e plano técnico da reimplementação em Elixir/OTP",
  tam=11.5, cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=6, espaco=1.0)

reg = doc.add_paragraph()
reg.paragraph_format.space_after = Pt(8)
borda = OxmlElement("w:pBdr")
bot = OxmlElement("w:bottom")
bot.set(qn("w:val"), "single")
bot.set(qn("w:sz"), "12")
bot.set(qn("w:color"), "2A78D6")
borda.append(bot)
reg._p.get_or_add_pPr().append(borda)

p("Documento de projeto — Trabalho de Conclusão de Curso   ·   Enzo Consulo   ·   "
  "agosto de 2026   ·   versão 3", tam=9, cor=CINZA,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=8)

caixa("RESUMO",
      "Este documento projeta a segunda versão de uma fábrica de software multi-agente: um "
      "sistema que recebe a descrição de um projeto em linguagem natural e o constrói de ponta "
      "a ponta, coordenando agentes especializados que planejam, implementam, verificam, revisam "
      "e documentam. A primeira versão existe, roda e foi medida em uso real; este documento "
      "descreve o que ela provou, o que ela cobrou e como reconstruí-la sobre uma base que "
      "sustente por desenho aquilo que hoje depende de disciplina — concorrência supervisionada "
      "em Elixir/OTP, estado transacional em PostgreSQL, memória semântica do projeto sobre "
      "pgvector e controle explícito do cache de prompt. O texto vai do vocabulário mínimo até "
      "o plano de execução em seis fases, passando pela stack escolhida e pelas razões de cada "
      "escolha.")

# ================================================================ 1
doc.add_heading("1.  O que este documento é, e o que ele substitui", level=1)

p("Existe hoje uma fábrica funcionando. Ela nasceu como uma camada de organização sobre uma "
  "ferramenta de linha de comando em que um modelo de linguagem opera dentro de um diretório: "
  "lê e escreve arquivos, executa comandos e observa a saída deles. Sobre essa base foram "
  "construídos um protocolo de tarefas, um elenco de agentes com papéis separados, dois portões "
  "de qualidade e um painel web. Ela planejou, construiu, verificou e revisou projetos reais, e "
  "cada despacho ficou registrado — o que permite falar dela com números em vez de impressões.")

rico([("Este documento não descreve aquele sistema: descreve o próximo. ", True),
      ("A diferença de propósito é grande o bastante para justificar uma reimplementação, e não "
       "uma refatoração. A versão atual foi construída ", False),
      ("descobrindo o problema enquanto o resolvia", True),
      (" — o que é o modo certo de começar, e o modo errado de terminar. As decisões que "
       "sobreviveram à medição estão listadas na seção 4 e são preservadas integralmente. O que "
       "não sobreviveu foi quase sempre a mesma coisa: um mecanismo correto, dependente de uma "
       "regra escrita em português que alguém precisava lembrar de seguir.", False)])

caixa("A TESE DA REIMPLEMENTAÇÃO",
      "Um sistema multi-agente não falha por escrever mal — falha por governar mal. E governança "
      "escrita em prosa é governança opcional. A versão 2 move para o compilador, para a árvore "
      "de supervisão e para o esquema do banco tudo aquilo que hoje é uma frase imperativa "
      "dirigida a um modelo. O que puder ser um teste, será um teste; o que puder ser uma "
      "restrição de tipo, será um tipo; o que puder ser um processo supervisionado, não será "
      "uma promessa.")

# ================================================================ 2
doc.add_heading("2.  As ferramentas e o vocabulário", level=1)

p("Os termos abaixo aparecem no restante do documento com significado técnico preciso. Vale "
  "fixá-los antes de qualquer coisa, porque três deles — contexto, despacho e cache de prompt — "
  "são o que decide a conta do sistema inteiro.", depois=3)

tabela(["Termo", "O que é, e qual o papel dentro do sistema"],
       [["*Modelo de linguagem",
         "O operário. Executa uma instrução escrita e produz texto ou pedidos de ação; não guarda "
         "memória de uma execução para a outra."],
        ["*Messages API",
         "A interface HTTP do provedor do modelo. Uma requisição carrega as ferramentas "
         "disponíveis, a instrução permanente e o histórico inteiro da conversa; devolve a "
         "resposta, o motivo da parada e a contabilidade de tokens."],
        ["*Agente",
         "Um papel especializado: um prompt de sistema, a lista de ferramentas que ele pode usar "
         "e o modelo que o executa. Na versão 2 é também um processo do sistema operacional "
         "virtual, com endereço e supervisor."],
        ["*Ferramentas (tools)",
         "As ações que existem para aquele papel — ler, escrever, rodar comando, buscar. "
         "Restringir a lista restringe o que o agente é capaz de fazer, não apenas o que ele "
         "deveria fazer."],
        ["*Laço de tool use",
         "O ciclo que faz um agente trabalhar: pede-se ao modelo, ele responde pedindo uma "
         "ferramenta, o sistema executa e devolve o resultado, e assim até ele parar por conta "
         "própria. Cada volta é uma requisição HTTP paga."],
        ["*Despacho",
         "Uma execução completa de agente: uma tarefa entra, um laço de tool use roda até o fim, "
         "um relatório e um custo saem."],
        ["*Contexto",
         "Tudo o que o modelo tem diante de si numa requisição. É reenviado por inteiro a cada "
         "volta do laço — o que torna o custo sensível ao número de idas ao modelo, não só ao "
         "tamanho do texto."],
        ["*Cache de prompt",
         "Mecanismo do provedor que guarda o prefixo já processado de uma requisição. Escrever "
         "no cache custa mais que o preço normal; ler dele custa um décimo. É a alavanca de "
         "custo mais direta que existe no desenho."],
        ["*Embedding",
         "A representação numérica de um trecho de texto, de modo que trechos com significado "
         "próximo fiquem próximos no espaço. É o que permite perguntar “onde já tratamos disto?” "
         "sem saber a palavra exata usada."],
        ["*BEAM / OTP",
         "A máquina virtual do Elixir e o conjunto de padrões que ela traz: processos leves e "
         "isolados, supervisores que reiniciam o que morreu, e comunicação por mensagem."]],
       [3.4, 13.6])

rico([("Duas propriedades da base valiam para a versão 1 e continuam valendo. ", False),
      ("Um agente começa frio", True),
      (" — não sabe nada do que aconteceu antes de ser despachado —, o que obriga o sistema a "
       "colocar por escrito, fora da conversa, tudo o que precisa sobreviver de uma execução "
       "para a seguinte. E ", False),
      ("o modelo não decide quando parar de custar", True),
      (": quem impõe teto de voltas, teto de gasto e prazo é o sistema em volta dele. Na versão 1 "
       "esses tetos eram pedidos no prompt; na versão 2 são propriedades de um processo "
       "supervisionado.", False)])

# ================================================================ 3
doc.add_heading("3.  A ideia central", level=1)

p("Um modelo de linguagem escreve bem em trechos curtos. O que ele não faz sozinho é sustentar "
  "um trabalho longo, e as falhas que aparecem aí não são falhas de geração de texto — são "
  "falhas de processo: a perda de contexto ao longo de uma sessão extensa; a ausência de rastro, "
  "porque a decisão ficou na conversa e a conversa termina; a autoaprovação, em que quem escreveu "
  "o código é quem afirma que ele está pronto; e a falha sem limite, em que um ponto difícil "
  "consome tentativas indefinidamente e trava a fila.")

p("A resposta é tratar a construção de um artefato como uma linha de produção: unidades de "
  "trabalho pequenas e nomeadas, estados explícitos, portões de qualidade operados por quem não "
  "construiu, e registro obrigatório a cada transição. O modelo continua sendo o operário — a "
  "fábrica é que decide o que ele faz, quando, e com que autoridade.", depois=3)

rico([("1. Quem implementa nunca é quem aprova.", True),
      ("  Quem verifica e quem revisa têm proibição explícita de corrigir o que julgam: reprovam "
       "e devolvem. Na versão 2 essa proibição deixa de ser uma frase e passa a ser a lista de "
       "ferramentas que o processo daquele papel recebe.", False)], depois=1)
rico([("2. Estado fora da conversa, sempre.", True),
      ("  Se tudo cair agora, a próxima execução reconstrói o mundo lendo o banco e o git.", False)],
     depois=1)
rico([("3. Falha limitada.", True),
      ("  Três ciclos por tarefa. No quarto, ela é bloqueada e reportada, e a fábrica segue com "
       "as demais — uma tarefa problemática nunca trava a linha.", False)], depois=3)

figura("fig1-fluxo.png", "Figura 1 — Do pedido à entrega. A intervenção humana obrigatória está "
       "concentrada na primeira caixa; o restante é decidido e executado pelo sistema. As duas "
       "faixas inferiores são o que muda na versão 2: onde o estado vive, e sobre o que ele roda.")

# ================================================================ 4
doc.add_heading("4.  O que a primeira versão provou", level=1)

p("Reimplementar sem inventário é jogar fora o que custou caro para aprender. A tabela abaixo é "
  "o balanço honesto: cada mecanismo da versão 1, o veredito depois do uso real, e o destino "
  "dele na versão 2.", depois=3)

tabela(["Mecanismo da v1", "Veredito", "O que a v2 faz com ele"],
       [["*Dois portões, duas perguntas",
         "Funcionou. Reprovações por conformidade pegaram entregas que passavam em todos os "
         "critérios e não eram a tarefa.",
         "Preservado sem mudança conceitual; vira transição de máquina de estados."],
        ["*Limite de 3 ciclos",
         "Funcionou. Nenhuma tarefa difícil travou a fila.",
         "Preservado, e o contador sai do texto da tarefa para uma coluna do banco."],
        ["*Equipe sob demanda",
         "Funcionou, e é provavelmente o coração do sistema: a execução é guiada por um "
         "especialista sintetizado do próprio pedido.",
         "Preservado; o prompt do especialista passa a ser dado versionado, não arquivo solto."],
        ["*Índice denso do projeto",
         "Funcionou muito bem. Derrubou o contexto por despacho de 53,5 mil para 11–14 mil "
         "tokens, sem custo de modelo para gerá-lo.",
         "Preservado e promovido: passa a ser injetado no prefixo, não oferecido ao agente."],
        ["*Critérios executáveis",
         "Funcionou. Critério que um comando resolve deixa de gastar um despacho inteiro.",
         "Preservado e ampliado: a passada mecânica roda antes de qualquer chamada paga."],
        ["*Orquestrador conduzido por modelo",
         "Falhou como economia: respondeu por 78% da fatura fazendo trabalho de máquina de "
         "estados.",
         "Substituído por código. Sobra ao modelo só o que é julgamento."],
        ["*Regras de disciplina no prompt",
         "Falharam de forma recorrente: “não encerre o turno com agente em voo” foi violada duas "
         "vezes, custando despachos inteiros.",
         "Convertidas em propriedades da árvore de supervisão e do esquema do banco."],
        ["*Contador de tentativas escrito pelo agente",
         "Falhou: quando o agente não incrementava, a mesma tarefa girava. Uma rodada mediu 41 "
         "despachos e US$ 22,55.",
         "O sistema conta, não o agente. O agente não tem permissão de escrever esse campo."],
        ["*Estado em arquivos markdown",
         "Sustentou o sistema, mas paga leitura e reescrita de arquivo inteiro a cada transição "
         "e não tem transação.",
         "Vira tabela com transação; o markdown continua sendo gerado para leitura humana."]],
       [3.9, 6.4, 6.7])

figura("fig11-custo.png", "Figura 2 — A medição que reorientou o projeto: nove dias de uso real, "
       "156 sessões, transcrições somadas aos registros de execução do painel.")

rico([("A lição metodológica vale mais que os números. ", True),
      ("O documento de custo da versão 1 mediu com precisão o que sabia medir — o contexto por "
       "despacho, que o painel registrava — e ficou cego para 78% da fatura, que morava nas "
       "sessões do próprio coordenador. O alvo bem instrumentado tende a ser o que já se conhece, "
       "não o que mais custa. Daí uma exigência de projeto para a versão 2: ", False),
      ("contabilidade de custo por despacho, por tarefa, por projeto e por dia, no mesmo banco "
       "que guarda o trabalho", True),
      (" — não num arquivo à parte, não num relatório posterior.", False)])

# ================================================================ 5
doc.add_heading("5.  Por que Elixir/OTP", level=1)

p("A escolha de linguagem aqui não é preferência estética: é a resposta a uma lista de exigências "
  "que a versão 1 produziu por sofrimento. O sistema precisa manter dezenas de trabalhos de longa "
  "duração em voo ao mesmo tempo, cada um deles uma conversa com um serviço remoto lento e "
  "falível; precisa cortar um desses trabalhos no meio quando ele estoura um teto, sem derrubar "
  "os vizinhos; precisa sobreviver à queda de qualquer um deles sem perder trabalho commitado; e "
  "precisa mostrar tudo isso ao vivo numa tela.")

p("Esse é, quase literalmente, o enunciado do problema para o qual a BEAM foi construída. As "
  "alternativas foram consideradas de verdade, e a tabela registra o motivo de cada descarte.",
  depois=3)

tabela(["Candidato", "A favor", "Contra, para este problema"],
       [["*Elixir / OTP",
         "Processos leves e isolados; supervisores; corte e reinício por desenho; LiveView para "
         "o painel sem uma segunda stack; Postgres e filas duráveis no mesmo ecossistema.",
         "Ecossistema de aprendizado de máquina menor; menos exemplos de agentes publicados. "
         "Mitigado: o trabalho pesado é I/O, não número."],
        ["*TypeScript / Node",
         "É a stack da v1; SDK oficial do provedor; maior volume de exemplos.",
         "Concorrência sem isolamento: um erro não tratado derruba o processo inteiro. Foi "
         "exatamente a classe de falha que mais custou na v1."],
        ["*Python",
         "Ecossistema de IA e RAG dominante; embeddings triviais.",
         "Concorrência é a parte fraca; supervisão e corte limpo exigem construir o que a BEAM "
         "já dá. Continua útil — e é usado — como ferramenta chamada, não como base."],
        ["*Go",
         "Concorrência forte, binário único, ótimo desempenho.",
         "Sem supervisão nem isolamento por processo: um pânico não contido derruba tudo. Sem "
         "equivalente ao LiveView."],
        ["*Rust",
         "Segurança de memória e desempenho máximos.",
         "Custo de desenvolvimento desproporcional para um sistema cujo gargalo é a latência de "
         "um serviço remoto, não a CPU local."]],
       [2.6, 7.2, 7.2])

p("O argumento decisivo é um mapeamento, não um benchmark: na versão 1, “agente” era uma sessão "
  "efêmera que ninguém supervisionava, e o sistema tentava governá-la pedindo bom comportamento "
  "no prompt. Em OTP, agente é um processo — tem identificador, tem dono, tem quem o mate, e tem "
  "quem perceba que ele morreu.", depois=3)

figura("fig2-supervisao.png", "Figura 3 — A árvore de supervisão. Cada caixa da faixa inferior é "
       "um agente em voo; cada linha da faixa verde é uma regra que hoje existe apenas como frase "
       "num arquivo de instruções.", largura=13.6)

caixa("O QUE ELIXIR NÃO RESOLVE — E É HONESTO DIZER",
      "A troca de linguagem não barateia o modelo. Os 14% da fatura que estavam no pipeline "
      "continuam sendo pagos ao provedor, e nenhuma árvore de supervisão muda o preço de um token. "
      "O que a mudança compra é outra coisa: acaba com a classe de desperdício em que se paga por "
      "trabalho que é jogado fora — agente cortado no meio, tarefa girando por contador não "
      "incrementado, reprovação falsa por interferência entre execuções paralelas. Esse "
      "desperdício foi, na v1, a origem de dez em dez execuções falhas.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

# ================================================================ 6
doc.add_heading("6.  A arquitetura em cinco camadas", level=1)

p("O sistema se organiza em cinco camadas, e a regra que as separa é a mesma da versão 1: cada "
  "uma só conhece a camada imediatamente abaixo. Quem dispara não sabe qual agente vai rodar; "
  "quem decide a ordem não escreve código; quem escreve código não decide o que vem depois dele.",
  depois=3)

figura("fig3-camadas.png", "Figura 4 — As cinco camadas, com a stack concreta de cada uma. A "
       "camada de estado, no rodapé, é a única fonte de verdade: tudo acima dela pode ser "
       "reiniciado do zero sem perda.", largura=13.6)

doc.add_heading("A stack, escolha por escolha", level=2)

p("Todas as bibliotecas abaixo são maduras, ativas e de licença permissiva. A doutrina herdada "
  "da versão 1 vale sem alteração: scaffold oficial primeiro, biblioteca madura depois, código "
  "próprio só para o miolo do problema.", depois=3)

tabela(["Papel", "Escolha", "Por quê"],
       [["*Linguagem e runtime", "Elixir sobre a BEAM (OTP)",
         "Processos isolados, supervisão e concorrência por desenho — a seção 5."],
        ["*Aplicação web e painel", "Phoenix + LiveView",
         "Tela ao vivo sem uma segunda stack de frontend, sem API intermediária e sem "
         "estado duplicado entre cliente e servidor."],
        ["*Banco e acesso", "PostgreSQL + Ecto",
         "Transação de verdade para as transições de estado; um só banco para trabalho, "
         "contabilidade e índice semântico."],
        ["*Fila de trabalho", "Oban",
         "Filas duráveis em Postgres, com repetição, unicidade e agendamento. Um trabalho "
         "interrompido não some — volta a ser despachável."],
        ["*Cliente HTTP", "Req (sobre Finch)",
         "A Messages API é chamada diretamente. É deliberado: é a única forma de controlar "
         "onde ficam os pontos de cache — ver a seção 8."],
        ["*Embeddings", "Bumblebee + Nx (EXLA)",
         "Roda o modelo de embedding no próprio nó, em lote, sem custo por chamada e sem "
         "mandar o código do projeto para fora."],
        ["*Índice vetorial", "pgvector (extensão) + Ecto",
         "Vetor na mesma transação que o resto. Um banco a menos para operar, e junção direta "
         "com os metadados da tarefa."],
        ["*Corte de texto", "TextChunker",
         "Corte por estrutura (markdown, código), não por contagem cega de caracteres."],
        ["*Observabilidade", ":telemetry + LiveView",
         "Instrumentação nativa; cada despacho emite evento de início, fim, custo e voltas."],
        ["*Testes e qualidade", "ExUnit, Mox, Credo, Dialyzer",
         "A suíte roda contra um cliente falso da API: sem rede, sem gasto, e determinística."]],
       [3.1, 4.1, 9.8])

caixa("A ESCOLHA MAIS CONTRAINTUITIVA DO PROJETO",
      "Existem bibliotecas de alto nível para conversar com modelos em Elixir, e elas foram "
      "avaliadas. O núcleo não as usa, e o motivo é preciso: a fábrica precisa decidir, "
      "requisição a requisição, exatamente onde marcar os pontos de cache do prompt e qual "
      "tempo de vida pedir para cada um. Foi a ausência desse controle que travou a maior "
      "economia projetada na versão 1 — o SDK usado lá não expunha o parâmetro. Uma camada de "
      "conveniência que esconda o corpo da requisição reintroduz o mesmo teto. O laço de tool "
      "use tem menos de duzentas linhas; o controle vale mais que a conveniência.",
      cor="EB6834", fundo="FDEEE8", cor_titulo=RGBColor(0xC2, 0x4E, 0x1E))

# ================================================================ 7
doc.add_heading("7.  O núcleo: o laço de agente", level=1)

p("Todo o resto do sistema existe para preparar e depois julgar o que acontece nesta seção. Um "
  "agente trabalhando é um laço: monta a requisição, chama a Messages API, olha o motivo da "
  "parada. Se o modelo pediu ferramentas, o sistema as executa e devolve os resultados; se ele "
  "terminou, o laço acaba. Cada volta é uma requisição HTTP paga, e o histórico inteiro vai "
  "junto em todas elas.", depois=3)

figura("fig4-laco.png", "Figura 5 — O laço de tool use. Os resultados das ferramentas voltam "
       "sempre numa única mensagem: dividi-los em várias ensina o modelo a parar de pedir "
       "ferramentas em paralelo, e o paralelismo local é grátis.", largura=13.8)

codigo([
    "def handle_info(:trabalhar, estado) do",
    "  case Fabrica.Claude.mensagens(estado.corpo) do",
    "    {:ok, %{stop_reason: \"tool_use\"} = r} ->",
    "      # as ferramentas de uma mesma volta sao independentes: rodam em paralelo,",
    "      # cada uma no seu processo, com prazo proprio.",
    "      resultados =",
    "        r.content",
    "        |> Enum.filter(&(&1.type == \"tool_use\"))",
    "        |> Task.async_stream(&Ferramentas.executar(&1, estado.confinamento),",
    "             max_concurrency: 4, timeout: :timer.minutes(2), on_timeout: :kill_task)",
    "        |> Enum.map(&resultado_ou_erro/1)",
    "",
    "      estado",
    "      |> anexar_turno(r.content, resultados)   # TODOS os tool_result num turno so",
    "      |> contabilizar(r.usage)                 # custo e tokens gravados por volta",
    "      |> continuar_ou_parar()                  # teto de voltas e de gasto",
    "",
    "    {:ok, %{stop_reason: \"end_turn\"} = r} ->",
    "      {:stop, :normal, finalizar(estado, r)}",
    "  end",
    "end",
], "O coração do sistema, em forma reduzida. O que não aparece aqui — teto de voltas, teto de "
   "gasto, prazo, reinício — não está no prompt: está no supervisor e no estado do processo.")

rico([("O contrato de estado é o que torna o laço auditável. ", True),
      ("Cada volta grava uma linha: modelo usado, tokens de entrada, tokens escritos no cache, "
       "tokens lidos do cache, tokens de saída, custo calculado e duração. Não é telemetria "
       "opcional — é a tabela que permite responder “por que esta tarefa custou isto?” sem "
       "reprocessar nada. Na versão 1 essa pergunta exigiu ler transcrições de sessão à mão, e "
       "foi assim que se descobriu que a instrumentação existente media o lugar errado.", False)])

# ================================================================ 8
doc.add_heading("8.  Economia de tokens: o desenho de custo", level=1)

p("O custo de um despacho tem uma forma conhecida, e ela não é intuitiva. Cada volta do laço "
  "reenvia todo o contexto acumulado até ali: o gasto cresce com o número de voltas multiplicado "
  "pelo tamanho médio do contexto, e não simplesmente com o tamanho do texto. Duas consequências "
  "seguem daí, e as duas contrariam o palpite comum.")

marcador("Contexto menor vence contexto melhor colocado. ", "Foi o índice denso — e não a "
         "reorganização do prompt — que derrubou o custo por despacho na versão 1. Substituir "
         "conteúdo por um resumo denso é ganho real; mover o mesmo conteúdo de lugar é quase "
         "sempre empate.")
marcador("Menos voltas vale mais que prompt mais curto. ", "O prompt do agente é uma fração "
         "pequena do contexto de uma volta madura. Cortar duas idas ao modelo economiza mais "
         "que reescrever o prompt inteiro — e foi por isso que a passada mecânica de critérios "
         "se pagou tão rápido.")

p("Sobre essa base entra a alavanca que a versão 1 não conseguiu usar: o cache de prompt. A "
  "requisição é montada do conteúdo mais estável para o mais volátil, e marca-se até quatro "
  "pontos de corte. O que está antes de um ponto é guardado processado; nas requisições "
  "seguintes, aquele trecho custa um décimo do preço de entrada em vez do preço cheio.", depois=3)

figura("fig5-cache.png", "Figura 6 — A anatomia do prompt e os quatro pontos de cache. A ordem "
       "não é uma convenção interna: é a ordem em que o provedor monta a requisição, e é o que "
       "determina o que pode ser reaproveitado.", largura=13.6)

p("A tabela abaixo resume as cinco alavancas do desenho de custo, na ordem em que serão "
  "implementadas. Nenhuma delas depende de recurso exclusivo de um fornecedor: todas são "
  "decisões de arquitetura sobre como montar uma requisição e quando fazê-la.", depois=3)

tabela(["Alavanca", "O que é", "Efeito esperado"],
       [["*Prefixo estável e cacheado",
         "Ferramentas, doutrina e índice do projeto idênticos byte a byte entre despachos, com "
         "ponto de cache ao fim de cada bloco.",
         "O trecho repetido passa de preço cheio para um décimo, a partir da segunda requisição."],
        ["*Contexto por papel",
         "Quem constrói recebe os arquivos que a tarefa declara tocar; quem revisa recebe o diff "
         "e nenhum fonte; quem planeja não recebe fonte nenhum.",
         "Contexto que o agente não usa é pior que ausente — ele é relido a cada volta."],
        ["*Passada mecânica antes do modelo",
         "Os critérios que são comando executável rodam de graça, antes de despachar quem "
         "verifica.",
         "Critério que falha volta ao construtor sem pagar um despacho para confirmar o óbvio."],
        ["*Modelo por papel",
         "Verificar é mecânico e roda no modelo mais barato; construir usa o intermediário; o "
         "retrabalho sobe de modelo porque já existe uma reprovação medida.",
         "A diferença entre as faixas é de cinco vezes no preço de entrada — escolher errado "
         "custa mais que qualquer ajuste de prompt."],
        ["*Trabalho em lote quando não há pressa",
         "Reindexação, documentação e resumos noturnos não precisam de resposta imediata.",
         "A via assíncrona do provedor cobra metade do preço para o mesmo trabalho."]],
       [3.7, 6.6, 6.7])

figura("fig9-paralelismo.png", "Figura 7 — Paralelismo real e a trava que o limita. Três tarefas "
       "independentes rodam em três processos; mas três requisições idênticas disparadas no mesmo "
       "instante não compartilham cache, porque nenhuma delas terminou de escrevê-lo.",
       largura=13.4)

caixa("A ARMADILHA QUE ANULA TUDO ISTO, EM SILÊNCIO",
      "O cache é um casamento de prefixo byte a byte. Uma data, um contador, um hash de commit ou "
      "uma chave de dicionário serializada fora de ordem dentro do trecho estável invalida tudo "
      "o que vem depois — sem erro, sem aviso, sem qualquer sinal além da conta que não cai. Na "
      "versão 1 esse risco já era conhecido e nominal: o índice do projeto trazia o hash do commit "
      "no cabeçalho, e isso bastaria para zerar o ganho. Por isso a versão 2 tem um teste que "
      "monta o prefixo duas vezes, em momentos diferentes, e falha se os bytes divergirem.",
      cor="E34948", fundo="FDEDED", cor_titulo=RGBColor(0xB5, 0x2C, 0x2C))

# ================================================================ 9
doc.add_heading("9.  Memória: quatro camadas e um índice semântico", level=1)

p("Como um agente começa frio e qualquer execução pode terminar a qualquer momento, a memória do "
  "sistema é deliberada. A diferença em relação à versão 1 é que ela deixa de ser um conjunto de "
  "arquivos markdown lidos por inteiro e passa a ser consultável: o agente pede o que precisa, no "
  "formato em que precisa, e paga só por aquilo.", depois=3)

figura("fig8-memoria.png", "Figura 8 — As cinco memórias do sistema, com o que cada uma guarda, "
       "quanto custa lê-la e em que ordem de grandeza ela responde.", largura=13.6)

doc.add_heading("O índice semântico do projeto", level=2)

rico([("O índice denso resolve “o que existe e como se chama”. Ele é gerado por script, sem custo "
       "de modelo, e entra inteiro no prefixo. O que ele não resolve é a pergunta que mais "
       "desperdiça ciclo numa fábrica: ", False),
      ("“isto já foi resolvido aqui, e o que foi decidido na época?”", True),
      (". Essa pergunta não se responde por nome de função — se responde por significado, e é "
       "exatamente o caso de uso de um índice vetorial.", False)])

p("O corpus indexado não é o código: é a história do projeto. Decisões com o motivo registrado, "
  "achados de revisão, relatórios de verificação, receitas do guia, tarefas concluídas com o que "
  "deu errado no caminho. É material que a versão 1 produzia em volume e depois não conseguia "
  "consultar, porque estava espalhado por dezenas de arquivos que ninguém ia abrir.", depois=3)

figura("fig7-rag.png", "Figura 9 — A ingestão roda fora do caminho quente, ao commitar; a consulta "
       "roda no despacho, antes de gastar a primeira volta de modelo. Os dois índices são "
       "complementares, e a divisão entre eles está declarada na faixa inferior.", largura=13.4)

codigo([
    "-- busca hibrida: o vetor acha o que tem o mesmo significado,",
    "-- o texto acha o termo exato que o vetor perde (nome de flag, codigo de erro).",
    "WITH semantico AS (",
    "  SELECT id, RANK() OVER (ORDER BY embedding <=> $1) AS pos",
    "    FROM trechos WHERE projeto_id = $2 ORDER BY embedding <=> $1 LIMIT 40),",
    "     textual AS (",
    "  SELECT id, RANK() OVER (ORDER BY ts_rank_cd(busca, $3) DESC) AS pos",
    "    FROM trechos WHERE projeto_id = $2 AND busca @@ $3 LIMIT 40)",
    "SELECT id FROM semantico FULL OUTER JOIN textual USING (id)",
    " ORDER BY COALESCE(1.0/(60 + semantico.pos), 0)",
    "        + COALESCE(1.0/(60 + textual.pos), 0) DESC",
    " LIMIT 8;",
], "Fusão recíproca de postos: cada lista contribui com o inverso da posição, o que dispensa "
   "calibrar pesos entre duas escalas que não são comparáveis. Roda numa transação só, no mesmo "
   "banco que guarda as tarefas.")

caixa("QUANDO NÃO USAR O ÍNDICE SEMÂNTICO",
      "Busca semântica é aproximada, paga um embedding por consulta e devolve trechos — não "
      "verdades. Ela não substitui o índice denso (que é exato, completo e grátis), não substitui "
      "ler o arquivo que a tarefa declara tocar, e não deve responder nada que uma consulta "
      "estruturada responda melhor: “quais tarefas estão bloqueadas” é uma cláusula WHERE, não uma "
      "pergunta em linguagem natural. A regra do projeto: o índice semântico entra quando a "
      "pergunta é sobre precedente e o vocabulário exato é desconhecido. Fora disso, é custo com "
      "cara de sofisticação.",
      cor="1BAF7A", fundo="E7F7F1", cor_titulo=RGBColor(0x14, 0x86, 0x5D))

# ================================================================ 10
doc.add_heading("10.  O ciclo de vida de uma tarefa", level=1)

p("A tarefa é a unidade de trabalho: objetivo, contexto, critérios de aceite, dependências, áreas "
  "que toca e o especialista que a executa. Ela é dimensionada para algo entre trinta e noventa "
  "minutos de trabalho de agente — maior que isso, o agente se perde; menor, o custo de "
  "recontextualização domina.", depois=3)

figura("fig6-estados.png", "Figura 10 — A máquina de estados. As duas setas vermelhas de volta são "
       "os portões reprovando; a terceira é o limite de três ciclos protegendo a fila.",
       largura=13.6)

rico([("Quem verifica pergunta “funciona?”.", True),
      ("  Executa literalmente cada critério de aceite e registra o resultado com evidência. Por "
       "isso os critérios são escritos na forma comando mais resultado esperado, e não como "
       "frases avaliativas.", False)], depois=1)
rico([("Quem revisa pergunta “é o que foi pedido, e está correto?”.", True),
      ("  São duas checagens distintas: mapear cada critério ao que o cumpre e julgar o objetivo; "
       "depois, caçar defeitos no diff. E aqui está o ponto sutil do desenho — ", False),
      ("uma entrega pode passar em todos os critérios, não ter defeito nenhum e ainda assim não "
       "ser a tarefa", True),
      (". Critério mal escrito não é licença para entregar outra coisa.", False)], depois=3)

p("O que muda na versão 2 é o mecanismo, não a regra. Cada transição passa a ser uma transação: "
  "o novo estado, o relatório da etapa e o custo do despacho entram juntos ou não entram. O "
  "contador de tentativas é incrementado pelo sistema no momento em que a tarefa é entregue a um "
  "construtor — não pelo agente, que na versão 1 às vezes esquecia e fazia a mesma tarefa girar. "
  "E o histórico de transições é acumulativo: a tabela guarda todas, em vez de sobrescrever um "
  "campo, o que torna possível perguntar depois quanto custou cada ciclo separadamente.")

rico([("Retrabalho sobe de modelo, e o gatilho é fato medido. ", True),
      ("A primeira execução usa o modelo padrão do papel; a partir da segunda — quando existe uma "
       "reprovação registrada — o despacho vai para um modelo mais forte. Insistir no mesmo "
       "modelo depois de uma reprovação paga construtor, verificador e revisor de novo e ainda "
       "queima uma das três tentativas. Duas reprovações seguidas sob o mesmo especialista trocam "
       "o especialista, porque ele foi escolhido no planejamento, antes de se saber onde a tarefa "
       "iria falhar.", False)])

# ================================================================ 11
doc.add_heading("11.  Além de software: as duas trilhas", level=1)

rico([("A fábrica constrói qualquer artefato — uma apresentação, um manual, uma análise de "
       "números. O eixo que separa os dois casos não é “é código?”, e sim ", False),
      ("como se prova que ficou pronto", True),
      (". Em software a prova vem de graça: o programa roda e passa ou quebra. Fora dele não vem, "
       "e é aí que o desenho poderia degenerar — um verificador sem nada a executar vira um "
       "segundo revisor, e dois julgamentos subjetivos sobre o mesmo artefato não são dois "
       "portões, são custo em dobro.", False)], depois=3)

figura("fig10-trilhas.png", "Figura 11 — O roteamento. Um único campo declarado no projeto escolhe "
       "o elenco inteiro; tudo o que está na faixa verde é idêntico nas duas trilhas.",
       largura=12.8)

p("A trilha não-software resolve o problema do portão com três peças. A primeira é a escada de "
  "verificação: todo critério fica num de três degraus — executado, quando um comando roda e o "
  "resultado é o veredito; inspecionado, quando um script abre o arquivo entregue e afirma fatos "
  "sobre ele; ou julgado, só quando os dois primeiros são genuinamente impossíveis, e aí contra "
  "uma rubrica de itens binários declarada na tarefa. Quem verifica é obrigado a rotular qual "
  "degrau usou, porque é esse rótulo que impede o sistema de fingir que tem dois portões quando "
  "tem um. A segunda peça é a tarefa de fundação, que instala o verificador antes de qualquer "
  "outra coisa. E a terceira é a regra do binário: a fonte é sempre texto versionado, e o arquivo "
  "final é gerado por comando — commitar o binário como fonte de verdade apagaria o portão da "
  "revisão.")

p("Na versão 2 o rótulo do degrau deixa de ser texto e vira um campo com valores fechados, o que "
  "permite ao painel mostrar, por projeto, a proporção de critérios que estão sendo apenas "
  "julgados. Quando essa proporção sobe, o projeto está rodando com um portão e meio — e isso é "
  "problema de planejamento, não do agente que verificou.")

# ================================================================ 12
doc.add_heading("12.  A equipe que nasce com o projeto", level=1)

p("Os agentes das duas trilhas são genéricos — servem a qualquer projeto. A peça que é, "
  "provavelmente, o coração do sistema é outra: a fábrica não tem um programador genérico "
  "esperando tarefas na fila. Ao planejar, o planejador sintetiza a partir do próprio pedido uma "
  "equipe de dois a cinco especialistas, cada um com o seu domínio, seus arquivos e as regras que "
  "ele não pode inventar. Cada tarefa nasce apontando para aquele que domina a área que ela toca: "
  "a execução é guiada desde o início, não improvisada no momento do despacho.")

rico([("Toda tarefa que nomeia um especialista é executada sob o prompt dele", True),
      (". O prompt do especialista é curto por construção — ele não repete a disciplina de "
       "execução, que já vem do papel genérico; ele carrega apenas o domínio: quais arquivos são "
       "dele, quais decisões já estão fechadas e quais armadilhas daquela área já custaram caro. "
       "Na versão 2 esse prompt passa a ser dado versionado no banco, com histórico — o que "
       "permite algo que a versão 1 não permitia: comparar o desempenho de um mesmo especialista "
       "antes e depois de uma alteração no prompt dele.", False)])

caixa("A ÚNICA RENÚNCIA DELIBERADA",
      "A especialização é abandonada em um caso, e ele é planejado: quando a mesma tarefa reprova "
      "duas vezes sob o mesmo especialista, o sistema troca para o construtor reforçado genérico e "
      "registra a troca. O especialista foi escolhido no planejamento, antes de se saber onde a "
      "tarefa iria falhar — duas reprovações seguidas sob o mesmo prompt de domínio são evidência "
      "de que a especialização está enviesando o ataque.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

# ================================================================ 13
doc.add_heading("13.  Painel e observabilidade", level=1)

p("O painel não é enfeite: é o instrumento que torna o custo visível enquanto ele acontece. Na "
  "versão 1 ele já existia e provou seu valor — foi lendo os registros que ele gravava que se "
  "descobriu onde o dinheiro estava indo, sem gastar um centavo a mais para medir. Na versão 2 "
  "ele deixa de ser uma aplicação separada que lê arquivos e passa a ser uma tela sobre o mesmo "
  "banco e o mesmo barramento de eventos que o motor usa.", depois=3)

marcador("Cada despacho emite eventos de telemetria. ", "Início, fim, modelo, voltas, tokens "
         "escritos e lidos no cache, custo e desfecho. O painel assina o barramento e desenha; a "
         "contabilidade não depende de alguém lembrar de gravar.")
marcador("A tela mostra o que ainda está em voo. ", "Como cada agente é um processo com "
         "endereço, listar o que está rodando é consultar o registro de processos — não inferir "
         "de arquivos de log.")
marcador("Parar custa um botão. ", "Cortar um agente é encerrar um processo supervisionado, e o "
         "supervisor devolve a tarefa à fila. Na versão 1, cancelar no meio deixava trabalho "
         "solto na árvore de arquivos.")
marcador("O custo aparece por tarefa, não só por execução. ", "Foi a distinção que faltou na v1: "
         "o teto se calibrava pelo custo de uma etapa, e subestimava a tarefa inteira em quatro "
         "vezes — sempre para baixo, sempre no sentido de começar trabalho que não cabia.")

# ================================================================ 14
doc.add_heading("14.  Plano de execução", level=1)

p("A construção é dividida em seis fases, e a ordem entre elas não é arbitrária: cada uma entrega "
  "algo verificável e destrava a seguinte. A primeira é a mais importante, e é a que dá a "
  "tentação de pular — sem o cliente falso da API, a suíte de testes custa dinheiro a cada "
  "execução, e uma suíte que custa dinheiro deixa de ser executada.", depois=3)

figura("fig12-fases.png", "Figura 12 — As seis fases e os marcos que as encerram. O marco é sempre "
       "um comportamento observável, nunca um percentual de conclusão.", largura=13.6)

tabela(["Fase", "O que entrega", "Marco — só passa quando"],
       [["*F1  Fundação",
         "Projeto Phoenix, esquema do banco com migrações, suíte de testes, verificação contínua "
         "e o cliente falso da Messages API.",
         "A suíte inteira roda sem tocar a rede e sem gastar um centavo."],
        ["*F2  Laço de agente",
         "O laço de tool use, execução de ferramentas com confinamento, montagem do prompt com "
         "pontos de cache e contabilidade por volta.",
         "Um agente resolve uma tarefa real de ponta a ponta, e o custo dela aparece "
         "discriminado por volta."],
        ["*F3  Máquina de estados",
         "Os seis estados, os dois portões, o limite de três ciclos, o escalonamento de modelo e "
         "a passada mecânica de critérios.",
         "Uma tarefa percorre os seis estados, reprova de propósito, é retrabalhada e conclui."],
        ["*F4  Concorrência",
         "Árvore de supervisão, filas duráveis, teto de orçamento por tarefa e por rodada, "
         "recuperação após queda.",
         "Três tarefas rodam em paralelo; matar o processo de uma no meio não afeta as outras "
         "duas, e a morta volta à fila."],
        ["*F5  Memória semântica",
         "Ingestão ao commitar, embeddings em lote, busca híbrida e o bloco de contexto com a "
         "fonte citada.",
         "Num projeto com histórico, o agente cita a decisão anterior que resolvia o caso — em "
         "vez de decidir de novo."],
        ["*F6  Painel e trilha genérica",
         "Tela ao vivo, telemetria, a trilha não-software completa e a escada de prova com "
         "rótulo obrigatório.",
         "Um projeto inteiro é planejado, construído e entregue sem intervenção, com o custo "
         "acompanhado na tela."]],
       [2.9, 7.1, 7.0])

# ================================================================ 15
doc.add_heading("15.  Escopo", level=1)

p("Delimitar o que fica de fora é parte do projeto, e é o que impede que um trabalho de conclusão "
  "vire uma lista de intenções.", depois=3)

tabela(["Dentro do escopo", "Fora do escopo, e por quê"],
       [["Planejamento, construção, verificação, revisão e documentação de projetos, nas duas "
         "trilhas, com estado durável e contabilidade de custo.",
         "Implantação em produção dos artefatos gerados: envolve custo externo e credencial de "
         "terceiros; permanece como gatilho manual."],
        ["Execução local, num único nó, com concorrência real e supervisão.",
         "Distribuição em vários nós: a BEAM permite, mas nada no problema medido exige — e o "
         "gargalo é a latência do provedor, não a CPU local."],
        ["Índice semântico do histórico do projeto, com avaliação da qualidade da recuperação.",
         "Treinamento ou ajuste fino de modelos: o sistema é agnóstico ao modelo por desenho, e "
         "depender de um ajuste próprio destruiria essa propriedade."],
        ["Contabilidade por despacho, tarefa, projeto e dia, com tetos que impedem começar o que "
         "não cabe.",
         "Cortar um agente em voo por estouro de custo: interromper no meio paga o mesmo e não "
         "entrega nada. O teto impede começar, não interrompe."],
        ["Painel local de operação e acompanhamento ao vivo.",
         "Múltiplos usuários, autenticação e permissões: é ferramenta de operação de um "
         "operador, e autenticação aqui seria complexidade sem problema correspondente."]],
       [8.5, 8.5])

# ================================================================ 16
doc.add_heading("16.  Riscos e limites do desenho", level=1)

tabela(["Risco ou limite", "Por que existe", "Como o desenho responde"],
       [["*O ganho de cache não se confirmar",
         "Depende de o prefixo ser idêntico byte a byte, e um só caractere volátil o anula sem "
         "erro visível.",
         "Teste que monta o prefixo duas vezes e falha na divergência; a contabilidade separa "
         "tokens escritos de lidos, então a ausência de ganho aparece no primeiro dia."],
        ["*Recuperação semântica trazer lixo",
         "Busca por significado é aproximada; trecho fora de contexto piora a resposta em vez de "
         "melhorar.",
         "Conjunto de perguntas com resposta conhecida, medido a cada mudança na indexação; se a "
         "recuperação não bate a linha de base, ela não entra no prompt."],
        ["*O ecossistema de IA em Elixir ser menor",
         "Menos bibliotecas prontas e menos exemplos publicados que em Python.",
         "O núcleo depende de HTTP e JSON, não de biblioteca de IA. O único ponto que precisa do "
         "ecossistema é o embedding, e ali existe caminho maduro e alternativa por serviço."],
        ["*Uma árvore de trabalho por projeto",
         "Agentes paralelos no mesmo projeto enxergam edições não commitadas uns dos outros.",
         "As áreas declaradas funcionam como exclusão mútua, agora verificada pelo motor em vez "
         "de confiada ao despacho — foi assim que a v1 furou a regra sem que nada acusasse."],
        ["*O portão do meio ser frágil fora de software",
         "Sem programa para executar, verificar tende a virar opinião.",
         "Rótulo obrigatório de grau de prova, com a proporção visível no painel; excesso de "
         "julgamento é tratado como sinal de replanejamento."],
        ["*Reimplementar e perder o que funcionava",
         "Reescrita costuma jogar fora aprendizado não documentado junto com o código.",
         "O inventário da seção 4 é o contrato: cada mecanismo aprovado tem destino declarado, e "
         "os prompts dos agentes migram como estão, por terem sido calibrados em uso real."]],
       [3.5, 6.5, 7.0])

# ================================================================ 17
doc.add_heading("17.  O que o desenho pretende demonstrar", level=1)

p("Que a diferença entre um assistente de programação e uma linha de produção está inteiramente "
  "na camada de governança: separação de papéis com autoridade explícita, estado externalizado e "
  "transacional, portões operados por quem não construiu, falha limitada por desenho e roteamento "
  "determinístico. Nenhum desses mecanismos depende de um modelo específico ou de um recurso "
  "exclusivo de um fornecedor — todos são decisões de arquitetura de software aplicadas a um "
  "operário novo.")

p("E que a segunda versão de um sistema desses não deve ser mais esperta que a primeira: deve ser "
  "mais difícil de operar errado. A versão 1 provou que o desenho funciona e mostrou, com "
  "precisão, quanto ele cobra e onde ele vaza. A versão 2 não inventa um pipeline novo — ela pega "
  "o mesmo pipeline e o apoia numa base em que as regras que hoje são pedidas ao modelo passam a "
  "ser garantidas pela máquina: o processo que morre é reiniciado por quem o supervisiona, a "
  "transição que falha é revertida pela transação, o contador que precisa subir é do sistema, e o "
  "custo que precisa ser conhecido é gravado no mesmo instante em que é gasto.")

doc.save(DESTINO)
print("gerado:", DESTINO)
