# -*- coding: utf-8 -*-
"""Figuras novas da documentacao COMPLETA (v7).
Reaproveita helpers e cores de figuras3.py. Salva em figs3/ com nomes proprios."""
import io, os
from matplotlib.patches import FancyBboxPatch, Rectangle

AQUI = os.path.dirname(os.path.abspath(__file__))
_src = io.open(os.path.join(AQUI, "figuras3.py"), encoding="utf-8").read()
_cabeca = _src[:_src.index("# ---------------------------------------------------------------- Fig 1")]
exec(compile(_cabeca, "figuras3-helpers", "exec"))


# ================================================================ anatomia da tarefa
def fig_tarefa():
    fig, ax = tela(7.0, 3.55)
    titulo(ax, 0.06, 3.44,
           "A tarefa é a unidade de trabalho — e cada campo dela existe para resolver um problema específico.")

    x0, w = 0.10, 3.86
    ax.add_patch(FancyBboxPatch((x0, 0.62), w, 2.62,
                                boxstyle="round,pad=0,rounding_size=0.06",
                                linewidth=1.3, edgecolor=BLUE, facecolor="#fbfcfe", zorder=1))
    rotulo(ax, x0 + 0.16, 3.10, "T-014  ·  Tela de propriedades do jogador", fs=7.8, cor=BLUE,
           ha="left", weight="bold")
    ax.plot([x0 + 0.16, x0 + w - 0.16], [2.98, 2.98], color=LINE, lw=1.0, zorder=2)

    campos = [
        ("status", "em-execução", "onde ela está agora"),
        ("prioridade", "alta", "quem sai da fila primeiro"),
        ("dependências", "T-009, T-011", "só fica pronta quando as duas fecharem"),
        ("áreas", "web/propriedades/", "os arquivos que ela pode tocar"),
        ("tentativas", "1", "quantas vezes já voltou reprovada"),
        ("especialista", "frontend", "quem da equipe a executa"),
    ]
    y = 2.80
    for nome, valor, papel in campos:
        rotulo(ax, x0 + 0.18, y, nome, fs=6.4, cor=INK, ha="left", weight="bold")
        rotulo(ax, x0 + 1.20, y, valor, fs=6.4, cor=BLUE, ha="left")
        rotulo(ax, x0 + 2.16, y, papel, fs=5.9, cor=MUT, ha="left", style="italic")
        y -= 0.24

    ax.plot([x0 + 0.16, x0 + w - 0.16], [1.30, 1.30], color=LINE, lw=1.0, zorder=2)
    secoes = [
        ("Objetivo", "o que deve existir quando terminar"),
        ("Critérios de aceite", "comando + resultado esperado, um por linha"),
        ("Notas de execução", "escrito por quem constrói"),
        ("Verificação / Revisão", "escrito pelos portões — nunca por quem constrói"),
    ]
    y = 1.14
    for nome, desc in secoes:
        rotulo(ax, x0 + 0.18, y, nome, fs=6.4, cor=INK, ha="left", weight="bold")
        rotulo(ax, x0 + 1.60, y, desc, fs=5.9, cor=SEC, ha="left")
        y -= 0.20

    notas = [
        (2.86, "dependências", "resolvem a ORDEM sem\nninguém decidir na hora", BLUE),
        (2.20, "áreas", "resolvem o PARALELISMO:\nduas tarefas só rodam juntas\nse não se cruzarem", VIOLET),
        (1.46, "tentativas", "resolvem a ESCADA de\nresposta ao fracasso", ORANGE),
        (0.86, "seções separadas", "resolvem a SEPARAÇÃO:\nquem constrói não escreve\nonde os portões escrevem", AQUA),
    ]
    px = x0 + w + 0.22
    for y, t, d, cor in notas:
        rotulo(ax, px, y, t, fs=6.5, cor=cor, ha="left", weight="bold")
        rotulo(ax, px, y - 0.22, d, fs=6.0, cor=SEC, ha="left")
        ax.plot([px - 0.12, px - 0.04], [y, y], color=cor, lw=1.0, zorder=1)

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.42,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=BLUE, facecolor=BLUE_T, zorder=1))
    rotulo(ax, 3.50, 0.31,
           "Tamanho de uma tarefa: de trinta a noventa minutos de trabalho de agente. Maior que isso, o agente se perde;\n"
           "menor, o custo de explicar o contexto para ele passa a dominar a conta.",
           fs=6.3, cor=SEC)
    salvar(fig, "fig15-tarefa.png")


# ================================================================ os dois portoes
def fig_portoes():
    fig, ax = tela(7.0, 4.06)
    titulo(ax, 0.06, 3.96,
           "Dois portões, duas perguntas diferentes. Nenhum dos dois pode corrigir o que julga.")

    paineis = [
        (0.10, "PORTÃO 1  ·  quem verifica", "“funciona?”", ORANGE, ORANGE_T,
         [("o que faz", "executa literalmente cada critério\nde aceite e guarda a evidência"),
          ("o que produz", "PASSOU / FALHOU por critério,\ne como reproduzir a falha"),
          ("o que NÃO pode", "corrigir o que encontrou —\nele reprova e devolve")]),
        (3.55, "PORTÃO 2  ·  quem revisa", "“é o que foi pedido, e está correto?”", AQUA, AQUA_T,
         [("o que faz", "mapeia cada critério ao que o cumpre\ne caça defeitos nas mudanças"),
          ("o que produz", "conformidade (cumpre / parcial /\nnão cumpre) + achados com local"),
          ("o que NÃO pode", "escrever código: a ferramenta\nde escrita não existe para ele")]),
    ]
    for x, tit, pergunta, cor, fundo, linhas in paineis:
        ax.add_patch(FancyBboxPatch((x, 1.26), 3.35, 2.48,
                                    boxstyle="round,pad=0,rounding_size=0.06",
                                    linewidth=1.3, edgecolor=cor, facecolor="white", zorder=1))
        ax.add_patch(Rectangle((x, 3.46), 3.35, 0.28, linewidth=0, facecolor=cor, zorder=2))
        rotulo(ax, x + 1.675, 3.60, tit, fs=7.0, cor="white", weight="bold")
        ax.add_patch(FancyBboxPatch((x + 0.14, 3.04), 3.07, 0.32,
                                    boxstyle="round,pad=0,rounding_size=0.04",
                                    linewidth=0, facecolor=fundo, zorder=2))
        rotulo(ax, x + 1.675, 3.20, pergunta, fs=7.4, cor=cor, weight="bold")
        y = 2.80
        for nome, desc in linhas:
            rotulo(ax, x + 0.16, y, nome, fs=6.2, cor=INK, ha="left", weight="bold")
            rotulo(ax, x + 0.16, y - 0.22, desc, fs=6.0, cor=SEC, ha="left")
            y -= 0.56

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 1.00,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.2, edgecolor=VIOLET, facecolor=VIOLET_T, zorder=1))
    rotulo(ax, 0.28, 0.86, "POR QUE DOIS, E NÃO UM SÓ MAIS CAPRICHOSO", fs=6.8, cor=VIOLET,
           ha="left", weight="bold")
    rotulo(ax, 0.28, 0.60,
           "As duas perguntas são independentes. Uma entrega pode passar em TODOS os critérios, não ter defeito nenhum — e ainda assim não ser a tarefa.",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.38,
           "Isso acontece quando o critério foi mal escrito. Critério frouxo não é licença para entregar outra coisa, e é o portão 2 que pega isso.",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.20,
           "Reprovar por conformidade não exige encontrar nenhum bug — e é por isso que os dois portões não podem ser a mesma pessoa nem o mesmo agente.",
           fs=6.0, cor=MUT, ha="left", style="italic")
    salvar(fig, "fig16-portoes.png")


# ================================================================ esquema do banco
def fig_banco():
    fig, ax = tela(7.0, 3.62)
    titulo(ax, 0.06, 3.50,
           "O que o sistema grava. Cada linha nasce dentro de uma transação — ou entra tudo, ou não entra nada.")

    tabelas = [
        (0.10, 3.14, 1.70, "projetos", ["nome", "domínio", "criado_em"], AQUA),
        (2.05, 3.14, 1.80, "tarefas", ["título · status", "prioridade", "dependências · áreas",
                                       "tentativas", "especialista"], BLUE),
        (4.10, 3.14, 1.70, "especialistas", ["nome · domínio", "prompt (versionado)"], VIOLET),
        (5.98, 3.14, 0.92, "trechos", ["conteúdo", "vetor", "fonte"], VIOLET),
        (0.10, 1.76, 1.70, "decisões", ["texto · motivo", "tarefa de origem"], AQUA),
        (2.05, 1.76, 1.80, "ciclos", ["número · papel", "desfecho", "relatório"], BLUE),
        (4.10, 1.76, 1.70, "execuções", ["modelo · voltas", "tokens (4 tipos)", "custo · duração"], ORANGE),
    ]
    for x, topo, w, nome, cols, cor in tabelas:
        alt = 0.36 + len(cols) * 0.19
        ax.add_patch(FancyBboxPatch((x, topo - alt), w, alt,
                                    boxstyle="round,pad=0,rounding_size=0.04",
                                    linewidth=1.2, edgecolor=cor, facecolor="white", zorder=2))
        ax.add_patch(Rectangle((x, topo - 0.24), w, 0.24, linewidth=0, facecolor=cor, zorder=3))
        rotulo(ax, x + w / 2, topo - 0.12, nome, fs=6.6, cor="white", weight="bold")
        yy = topo - 0.40
        for c in cols:
            rotulo(ax, x + 0.10, yy, c, fs=5.8, cor=SEC, ha="left")
            yy -= 0.19

    def liga(p1, p2, cor=MUT):
        ax.plot([p1[0], p2[0]], [p1[1], p2[1]], color=cor, lw=1.0, zorder=1)

    liga((1.80, 2.72), (2.05, 2.72))          # projetos -> tarefas
    liga((3.85, 2.72), (4.10, 2.72))          # tarefas -> especialistas
    liga((2.95, 1.93), (2.95, 1.76))          # tarefas -> ciclos
    liga((3.85, 1.34), (4.10, 1.34))          # ciclos -> execucoes
    liga((0.95, 2.31), (0.95, 1.76))          # projetos -> decisoes
    rotulo(ax, 6.44, 2.16, "é aqui que mora o\níndice por significado", fs=5.8, cor=VIOLET)

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.62,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=BLUE, facecolor=BLUE_T, zorder=1))
    rotulo(ax, 0.28, 0.58, "AS TRÊS PERGUNTAS QUE ESTE ESQUEMA PRECISA RESPONDER SEM REPROCESSAR NADA",
           fs=6.6, cor=BLUE, ha="left", weight="bold")
    rotulo(ax, 0.28, 0.37,
           "“em que pé está o projeto?”  ·  “por que esta tarefa custou isto, ciclo a ciclo?”  ·  “o que já foi decidido aqui, e por quê?”",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.19,
           "Nenhuma delas se responde lendo transcrição de conversa — e é por isso que o estado não mora no processo do agente.",
           fs=6.0, cor=MUT, ha="left", style="italic")
    salvar(fig, "fig17-banco.png")


# ================================================================ escada de prova
def fig_escada():
    fig, ax = tela(7.0, 3.32)
    titulo(ax, 0.06, 3.22,
           "Fora de software, “verificar” não é uma coisa só. Todo critério fica num de três degraus — e o degrau é declarado.")

    degraus = [
        (0.30, 0.82, 1.55, "3. JULGADO", "avaliação item a item contra uma\nlista de itens objetivos",
         "“cada seção abre com uma frase-tese”", RED, RED_T),
        (2.35, 1.42, 1.55, "2. INSPECIONADO", "um script abre o arquivo entregue\ne afirma fatos sobre ele",
         "abrir o .pptx e contar: 12 slides", ORANGE, ORANGE_T),
        (4.40, 2.02, 1.55, "1. EXECUTADO", "um comando roda e o resultado\ndele é o veredito",
         "rodar os testes: 6 passam", AQUA, AQUA_T),
    ]
    for x, y, w, nome, desc, exemplo, cor, fundo in degraus:
        ax.add_patch(FancyBboxPatch((x, y), w + 0.60, 0.96,
                                    boxstyle="round,pad=0,rounding_size=0.05",
                                    linewidth=1.3, edgecolor=cor, facecolor=fundo, zorder=2))
        rotulo(ax, x + 0.14, y + 0.78, nome, fs=7.0, cor=cor, ha="left", weight="bold")
        rotulo(ax, x + 0.14, y + 0.48, desc, fs=6.0, cor=SEC, ha="left")
        rotulo(ax, x + 0.14, y + 0.14, exemplo, fs=5.9, cor=MUT, ha="left", style="italic")

    seta(ax, (0.18, 0.86), (0.18, 2.92), cor=MUT, lw=1.2)
    rotulo(ax, 0.06, 1.88, "melhor", fs=6.2, cor=MUT, rot=90)

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.62,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=VIOLET, facecolor=VIOLET_T, zorder=1))
    rotulo(ax, 0.28, 0.58, "A REGRA, E POR QUE ELA EXISTE", fs=6.6, cor=VIOLET, ha="left",
           weight="bold")
    rotulo(ax, 0.28, 0.37,
           "Suba sempre o mais alto possível; descer um degrau é decisão registrada, não conveniência. Quem verifica é obrigado a dizer qual degrau usou.",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.19,
           "Sem esse rótulo, um projeto pode parecer ter dois portões quando tem um e meio — e ninguém percebe até a entrega sair errada.",
           fs=6.0, cor=MUT, ha="left", style="italic")
    salvar(fig, "fig18-escada.png")


# ================================================================ equipe de especialistas
def fig_equipe():
    fig, ax = tela(7.0, 3.60)
    titulo(ax, 0.06, 3.50,
           "A fábrica não tem um programador genérico esperando na fila: a equipe é sintetizada do próprio pedido.")

    box(ax, 0.10, 2.72, 1.44, 0.52, "o pedido\ndo usuário", ec=ORANGE, fc=ORANGE_T, fs=7.0,
        weight="bold")
    seta(ax, (1.56, 2.98), (1.86, 2.98), cor=SEC)
    box(ax, 1.88, 2.72, 1.44, 0.52, "planejador", ec=BLUE, fc=BLUE_T, fs=7.0, weight="bold")
    seta(ax, (3.34, 2.98), (3.64, 2.98), cor=SEC)
    rotulo(ax, 2.60, 2.62, "lê o pedido e decide de quais domínios\naquele projeto precisa", fs=5.9,
           cor=MUT)

    espec = [
        (3.66, "motor de regras", "server/engine/\nfunções puras, sem I/O", VIOLET),
        (3.66, "servidor", "server/sockets/\nestado das salas", VIOLET),
        (3.66, "frontend", "public/\nsem framework, por decisão", VIOLET),
    ]
    y = 2.72
    for x, nome, dom, cor in espec:
        ax.add_patch(FancyBboxPatch((x, y), 3.24, 0.52,
                                    boxstyle="round,pad=0,rounding_size=0.05",
                                    linewidth=1.1, edgecolor=cor, facecolor="white", zorder=2))
        rotulo(ax, x + 0.14, y + 0.34, nome, fs=6.8, cor=INK, ha="left", weight="bold")
        rotulo(ax, x + 0.14, y + 0.13, dom, fs=5.8, cor=SEC, ha="left")
        y -= 0.62
    rotulo(ax, 5.28, 3.38, "de 2 a 5 especialistas, com domínio e arquivos próprios", fs=6.0,
           cor=VIOLET, style="italic")

    y0 = 0.94
    tarefas = [("T-004", "motor de regras"), ("T-005", "servidor"), ("T-006", "frontend"),
               ("T-007", "motor de regras")]
    for i, (t, e) in enumerate(tarefas):
        x = 0.10 + i * 1.74
        box(ax, x, y0, 1.60, 0.40, "", ec=BLUE, fc="white", lw=1.0, r=0.04)
        rotulo(ax, x + 0.12, y0 + 0.26, t, fs=6.6, cor=INK, ha="left", weight="bold")
        rotulo(ax, x + 0.12, y0 + 0.11, "→ " + e, fs=5.8, cor=VIOLET, ha="left")
    rotulo(ax, 0.10, 1.48, "cada tarefa nasce apontando para quem domina a área que ela toca",
           fs=6.2, cor=BLUE, ha="left", weight="bold")

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.62,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=VIOLET, facecolor=VIOLET_T, zorder=1))
    rotulo(ax, 0.28, 0.58, "O PROMPT DO ESPECIALISTA É CURTO POR CONSTRUÇÃO", fs=6.6, cor=VIOLET,
           ha="left", weight="bold")
    rotulo(ax, 0.28, 0.37,
           "Ele não repete a disciplina de execução (ler a tarefa inteira, corrigir o que foi apontado, commitar) — isso já vem do papel genérico.",
           fs=6.3, cor=SEC, ha="left")
    rotulo(ax, 0.28, 0.19,
           "Ele carrega só o domínio: quais arquivos são dele, o que já foi decidido e quais armadilhas daquela área já custaram caro.",
           fs=6.3, cor=SEC, ha="left")
    salvar(fig, "fig19-equipe.png")


# ================================================================ contexto por papel
def fig_contexto():
    fig, ax = tela(7.0, 2.95)
    titulo(ax, 0.06, 2.85,
           "Cada papel recebe um contexto diferente — porque conteúdo que o agente não usa é pior que ausente.")

    comum = ["as regras do sistema", "o índice do projeto", "a tarefa por inteiro"]
    ax.add_patch(FancyBboxPatch((0.10, 2.06), 6.80, 0.52,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.2, edgecolor=BLUE, facecolor=BLUE_T, zorder=1))
    rotulo(ax, 0.26, 2.44, "IGUAL PARA TODOS (e por isso reaproveitável entre despachos)", fs=6.4,
           cor=BLUE, ha="left", weight="bold")
    rotulo(ax, 0.26, 2.22, "   ·   ".join(comum), fs=6.4, cor=SEC, ha="left")

    papeis = [
        (0.10, "quem constrói", ["os arquivos das áreas", "que a tarefa declara tocar",
                                 "", "e mais nada do projeto"], VIOLET, VIOLET_T),
        (2.40, "quem verifica", ["os critérios de aceite", "e os comandos para rodá-los",
                                 "", "o resultado da passada", "mecânica, já pronto"], ORANGE, ORANGE_T),
        (4.70, "quem revisa", ["apenas as mudanças", "(o diff do commit)",
                               "", "nenhum arquivo de fonte", "inteiro"], AQUA, AQUA_T),
    ]
    for x, nome, itens, cor, fundo in papeis:
        ax.add_patch(FancyBboxPatch((x, 0.80), 2.20, 1.06,
                                    boxstyle="round,pad=0,rounding_size=0.05",
                                    linewidth=1.2, edgecolor=cor, facecolor="white", zorder=2))
        ax.add_patch(Rectangle((x, 1.60), 2.20, 0.26, linewidth=0, facecolor=cor, zorder=3))
        rotulo(ax, x + 1.10, 1.73, nome, fs=6.8, cor="white", weight="bold")
        yy = 1.44
        for it in itens:
            if it:
                rotulo(ax, x + 1.10, yy, it, fs=6.0, cor=SEC)
            yy -= 0.17
        seta(ax, (x + 1.10, 2.04), (x + 1.10, 1.88), cor=MUT, lw=1.0)

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.58,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=RED, facecolor=RED_T, zorder=1))
    rotulo(ax, 3.50, 0.50, "POR QUE NÃO MANDAR TUDO PARA TODOS", fs=6.6, cor=RED, weight="bold")
    rotulo(ax, 3.50, 0.26,
           "Porque o contexto é reenviado a cada volta do laço. Um arquivo que o revisor nunca vai abrir não é um desperdício de uma vez:\n"
           "é um desperdício multiplicado pelo número de voltas daquele despacho.",
           fs=6.3, cor=SEC)
    salvar(fig, "fig20-contexto.png")


# ================================================================ um projeto de ponta a ponta
def fig_projeto():
    fig, ax = tela(7.0, 4.00)
    titulo(ax, 0.06, 3.90,
           "Um projeto de ponta a ponta: o que realmente acontece entre o pedido e a entrega.")

    LANE = 0.95
    hy = 0.30

    def barra(y, x, w, texto, cor, fc, fs=5.4):
        ax.add_patch(FancyBboxPatch((x, y), w, hy - 0.09,
                                    boxstyle="round,pad=0,rounding_size=0.03",
                                    linewidth=1.0, edgecolor=cor, facecolor=fc, zorder=2))
        rotulo(ax, x + w / 2, y + (hy - 0.09) / 2, texto, fs=fs, cor=INK)

    linhas = [
        ("pedido", [(0.00, 0.50, "pedido", ORANGE, ORANGE_T)]),
        ("planejamento", [(0.55, 1.30, "plano · equipe · 14 tarefas", BLUE, BLUE_T)]),
        ("T-001", [(1.90, 0.60, "fundação", VIOLET, VIOLET_T), (2.53, 0.37, "verifica", ORANGE, ORANGE_T),
                   (2.93, 0.34, "revisa", AQUA, AQUA_T)]),
        ("T-002", [(3.35, 0.57, "constrói", VIOLET, VIOLET_T), (3.95, 0.35, "verifica", ORANGE, ORANGE_T),
                   (4.33, 0.32, "revisa", AQUA, AQUA_T)]),
        ("T-003", [(3.35, 0.63, "constrói", VIOLET, VIOLET_T), (4.01, 0.35, "REPROVA", RED, RED_T),
                   (4.39, 0.56, "refaz", VIOLET, "#e6e2f7"),
                   (4.98, 0.35, "verifica", ORANGE, ORANGE_T)]),
        ("T-004", [(3.35, 0.52, "constrói", VIOLET, VIOLET_T), (3.90, 0.35, "verifica", ORANGE, ORANGE_T),
                   (4.28, 0.32, "revisa", AQUA, AQUA_T)]),
    ]
    y = 3.52
    for nome, barras in linhas:
        rotulo(ax, LANE - 0.08, y + 0.10, nome, fs=6.2, cor=SEC, ha="right")
        for dx, w, t, cor, fc in barras:
            barra(y, LANE + dx, w, t, cor, fc)
        y -= hy

    # colchete indicando o bloco paralelo
    ax.plot([LANE + 3.30, LANE + 3.30], [2.02, 2.83], color=VIOLET, lw=1.0,
            linestyle=(0, (2, 2)), zorder=1)
    rotulo(ax, LANE + 5.42, 2.42, "três tarefas\nem paralelo", fs=5.9, cor=VIOLET, ha="left")

    notas = [
        ("As três linhas do meio começam juntas porque as áreas que elas declaram tocar não se cruzam — é o que torna o paralelismo seguro.", VIOLET),
        ("A barra vermelha é uma reprovação no portão. Ela vira fato registrado, e é ela que autoriza refazer a tarefa com um modelo mais caro.", RED),
    ]
    yy = 1.72
    for t, cor in notas:
        rotulo(ax, 0.28, yy, "•", fs=7.0, cor=cor, ha="left")
        rotulo(ax, 0.42, yy, t, fs=6.1, cor=SEC, ha="left")
        yy -= 0.20

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 1.02,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.2, edgecolor=AQUA, facecolor=AQUA_T, zorder=1))
    rotulo(ax, 0.28, 0.96, "O QUE O USUÁRIO FAZ NESSE INTERVALO TODO: NADA", fs=6.8, cor=AQUA,
           ha="left", weight="bold")
    itens = [
        "Ele descreve o projeto uma vez, no início, e volta quando o sistema para.",
        "O sistema para sozinho em dois casos: a fila esvaziou, ou o que sobrou depende de uma decisão que ele não pode tomar.",
        "Nos dois casos, o relatório final diz qual é a decisão pendente — nunca “deu erro”.",
        "Cada tarefa concluída virou um commit próprio, então o histórico conta o que foi feito e por quê.",
    ]
    yy = 0.74
    for it in itens:
        rotulo(ax, 0.32, yy, "•", fs=7.0, cor=AQUA, ha="left")
        rotulo(ax, 0.46, yy, it, fs=6.2, cor=SEC, ha="left")
        yy -= 0.17
    salvar(fig, "fig21-projeto.png")


# ================================================================ painel
def fig_painel():
    fig, ax = tela(7.0, 2.80)
    titulo(ax, 0.06, 2.70,
           "O painel: uma tela sobre o mesmo banco e o mesmo barramento de eventos que o motor usa.")

    ax.add_patch(FancyBboxPatch((0.10, 0.72), 6.80, 1.80,
                                boxstyle="round,pad=0,rounding_size=0.06",
                                linewidth=1.3, edgecolor=LINE, facecolor="#fbfbf9", zorder=1))
    ax.add_patch(Rectangle((0.10, 2.26), 6.80, 0.26, linewidth=0, facecolor="#2a3140", zorder=2))
    rotulo(ax, 0.28, 2.39, "fábrica  ·  banco-imobiliario", fs=6.4, cor="white", ha="left",
           weight="bold")
    rotulo(ax, 6.72, 2.39, "gasto da rodada:  US$ 4,18", fs=6.2, cor="#9fe0c4", ha="right")

    colunas = [
        ("backlog", 3, MUT, [("T-018", "frontend"), ("T-019", "engine"), ("T-020", "frontend")]),
        ("pronta", 2, BLUE, [("T-015", "engine"), ("T-016", "servidor")]),
        ("em execução", 3, VIOLET, [("T-012", "engine"), ("T-013", "frontend"),
                                    ("T-014", "servidor")]),
        ("em teste", 1, ORANGE, [("T-011", "servidor")]),
        ("concluída", 6, GREEN, [("T-010", "frontend"), ("T-009", "engine"), ("T-008", "engine")]),
    ]
    x = 0.26
    for nome, n, cor, cartoes in colunas:
        w = 1.24
        rotulo(ax, x + w / 2, 2.12, nome + "  (" + str(n) + ")", fs=6.0, cor=cor, weight="bold")
        for i, (tid, esp) in enumerate(cartoes):
            yy = 1.92 - i * 0.24
            ax.add_patch(FancyBboxPatch((x, yy - 0.18), w, 0.18,
                                        boxstyle="round,pad=0,rounding_size=0.03",
                                        linewidth=0.9, edgecolor=cor, facecolor="white", zorder=3))
            rotulo(ax, x + 0.08, yy - 0.09, tid + "  ·  " + esp, fs=5.2, cor=SEC, ha="left")
        if n > len(cartoes):
            rotulo(ax, x + w / 2, 1.92 - len(cartoes) * 0.24 - 0.03,
                   "+ " + str(n - len(cartoes)) + " ...", fs=5.0, cor=MUT)
        x += 1.32

    ax.add_patch(FancyBboxPatch((0.26, 0.84), 4.10, 0.36,
                                boxstyle="round,pad=0,rounding_size=0.03",
                                linewidth=0.9, edgecolor=LINE, facecolor="#f4f4f1", zorder=3))
    rotulo(ax, 0.36, 1.10, "T-013 · construtor · sonnet   volta 7/30   ·   US$ 0,42",
           fs=5.6, cor=INK, ha="left")
    rotulo(ax, 0.36, 0.94, "> editando web/propriedades/tabela.ex", fs=5.6, cor=VERDE_ESCURO,
           ha="left")

    ax.add_patch(FancyBboxPatch((4.50, 0.84), 2.30, 0.36,
                                boxstyle="round,pad=0,rounding_size=0.03",
                                linewidth=0.9, edgecolor=RED, facecolor="white", zorder=3))
    rotulo(ax, 4.62, 1.10, "3 agentes em voo   ·   parar tudo", fs=5.6, cor=RED, ha="left")
    rotulo(ax, 4.62, 0.94, "encerra os processos e devolve as tarefas", fs=5.4, cor=MUT, ha="left")

    ax.add_patch(FancyBboxPatch((0.10, 0.10), 6.80, 0.50,
                                boxstyle="round,pad=0,rounding_size=0.05",
                                linewidth=1.1, edgecolor=BLUE, facecolor=BLUE_T, zorder=1))
    rotulo(ax, 3.50, 0.44, "O PAINEL NÃO É ENFEITE: É O INSTRUMENTO QUE TORNA O CUSTO VISÍVEL ENQUANTO ELE ACONTECE",
           fs=6.4, cor=BLUE, weight="bold")
    rotulo(ax, 3.50, 0.22,
           "Listar o que está rodando é consultar o registro de processos, não deduzir de arquivo de log. Parar é encerrar um processo supervisionado,\n"
           "e o supervisor devolve a tarefa à fila — não fica trabalho pela metade.",
           fs=6.1, cor=SEC)
    salvar(fig, "fig22-painel.png")


VERDE_ESCURO = "#14865d"

for f in (fig_tarefa, fig_portoes, fig_banco, fig_escada, fig_equipe, fig_contexto,
          fig_projeto, fig_painel):
    f()
print("figuras novas em", SAIDA)
