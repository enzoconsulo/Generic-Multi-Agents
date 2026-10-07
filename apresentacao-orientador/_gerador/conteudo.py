# -*- coding: utf-8 -*-
"""O que é ESCRITO À MÃO na apresentação: o plano combinado (E1–E10, R1–R15) e, por etapa,
os pacotes, a ligação pacote → tarefas reais, os destaques e o que fica para a próxima rodada.

Tudo o que é NÚMERO (status, commits, testes, linhas, custo) sai do repositório no gerar.py —
aqui não há número digitado, a não ser os que estão citados de evidência registrada (e a
fonte vai junto).
"""

PROJETO_TITULO = "Fábrica de Software Multi-Agente"
AUTOR = "Enzo Consulo"
SUBTITULO = "Acompanhamento do plano de desenvolvimento"

IDEIA_CENTRAL = ("Um sistema multi-agente não falha por escrever mal, e sim por governar mal. "
                 "A proposta é tirar as regras do texto do pedido e colocá-las na estrutura do "
                 "programa, onde deixam de ser opcionais.")

REGRAS = [
    ("Não escrever fora do projeto", "a ferramenta de escrita recusa o caminho"),
    ("No máximo três tentativas", "contador no banco, que o agente não altera"),
    ("Quem constrói não aprova", "o revisor não recebe ferramenta de escrita"),
    ("Não estourar o orçamento", "o sistema não deixa começar o que não cabe"),
]

CRITERIOS = [
    ("Constrói sozinho", "≥ 3 dos 5 projetos de teste sem intervenção"),
    ("Conclui as tarefas", "≥ 80% das tarefas concluídas"),
    ("Pouco retrabalho", "≤ 2 execuções por tarefa concluída"),
    ("Não aprova errado", "nenhuma concluída falha ao ser verificada de novo"),
    ("Governa de verdade", "todas as tentativas de quebrar as 4 regras barradas"),
    ("Aguenta falha", "agente morto / banco derrubado sem perder trabalho"),
    ("Custo sob controle", "nenhuma rodada passa do teto de gasto"),
    ("Cabe na máquina", "pico ≤ 8 GB com 3 tarefas em paralelo"),
]

REQUISITOS = {
    "R1": ("Transformar a descrição de um projeto em especificação, plano e tarefas", "E4"),
    "R2": ("Levar cada tarefa por seis estados, registrando relatório e custo", "E4"),
    "R3": ("Julgar toda entrega duas vezes: se funciona e se é o que foi pedido", "E4"),
    "R4": ("Devolver a entrega reprovada com o que faltou e decidir como refazer", "E4"),
    "R5": ("Limitar o retrabalho: replanejar uma vez e, se falhar, passar ao humano", "E4"),
    "R6": ("Executar tarefas independentes em paralelo, sem disputa de arquivo", "E5"),
    "R7": ("Consultar o histórico do projeto antes de decidir, citando a fonte", "E6"),
    "R8": ("Mostrar andamento, custo e saída dos agentes, ao vivo", "E7"),
    "R9": ("Rodar em 8 GB de memória e 4 núcleos", "E6"),
    "R10": ("Contar o custo em cota consumida e em dinheiro", "E2"),
    "R11": ("Nenhum agente escreve fora da pasta do projeto", "E3"),
    "R12": ("Testes sem internet e sem consumir o serviço do modelo", "E2"),
    "R13": ("A queda de um agente não derruba os outros nem perde trabalho", "E5"),
    "R14": ("Nenhuma rodada passa do teto de gasto", "E4"),
    "R15": ("Trocar o fornecedor do modelo sem mexer no núcleo", "E3"),
}

# Tarefas que existem no repositório mas NÃO entram na apresentação (ver LEIA-ME):
# tratam da importação de dados de um sistema anterior, que o plano não menciona.
FORA_DA_APRESENTACAO = {"T-008", "T-033", "T-034b", "T-076"}

# status por requisito: "ok" atendido e provado · "parcial" construído sem prova de ponta a
# ponta · "pendente" ainda não. O texto diz COMO foi provado.
ETAPAS = [
    {
        "n": 1, "slug": "E1-planejamento", "nome": "Planejamento e arquitetura",
        "datas": "04/09 – 18/09/2026", "fase": "Planejamento", "versao": None,
        "entrega": "Requisitos, arquitetura, tarefas, critérios e projetos de teste aprovados.",
        "status": "entregue-com-pendencia",
        "status_txt": "Entregue — falta definir os 5 projetos de teste",
        "pacotes": [
            ("1.1", "Requisitos", [], "R1–R15 escritos no plano, cada um com etapa e forma de verificar"),
            ("1.2", "Estado da arte", [], "estudo de estado da arte e relatório de originalidade (documentos/)"),
            ("1.3", "Arquitetura", [], "documento de arquitetura: 4 camadas, 6 estados, 2 portões, escada de falha"),
            ("1.4", "Tarefas e critérios", [], "tarefas escritas no repositório + os 8 critérios de desempenho"),
        ],
        "requisitos": [],
        "destaques": [
            "Ideia central fechada: as regras de governança moram na estrutura do programa, não no texto do pedido.",
            "15 requisitos (R1–R15), cada um amarrado a uma etapa e a uma forma de verificação.",
            "Arquitetura em 4 camadas e a escolha do Elixir/OTP justificada (processos isolados e supervisionados).",
            "8 critérios de desempenho com limite numérico — a régua da validação (E8–E10).",
            "O trabalho decomposto em tarefas pequenas, cada uma com critérios de aceite que são comandos.",
        ],
        "pendente": [
            "Os 5 projetos de teste ainda NÃO estão escritos — o plano promete defini-los na E1.",
            "Os 8 critérios existem só no documento; falta registrá-los no repositório como medição.",
        ],
        "proxima": [
            "Escolher e escrever os 5 projetos de teste (pedido em linguagem natural + o que conta como pronto).",
            "Registrar os 8 critérios no repositório, com o comando/consulta que mede cada um.",
        ],
        "demo": None,
        "marco": None,
    },
    {
        "n": 2, "slug": "E2-fundacao", "nome": "Fundação do sistema",
        "datas": "19/09 – 03/10/2026", "fase": "Desenvolvimento", "versao": "v0.1",
        "entrega": "Os testes rodam sem internet e sem consumir o serviço do modelo.",
        "status": "concluida", "status_txt": "Concluída — entrega aprovada",
        "pacotes": [
            ("2.1", "Ambiente", ["T-001", "T-007"], "projeto com verificação de qualidade em um comando"),
            ("2.2", "Banco e custo", ["T-002", "T-005"], "esquema do banco e contabilidade em duas unidades"),
            ("2.3", "Fronteiras", ["T-003", "T-004"], "fronteira do modelo e da busca, com substitutos de teste"),
            ("2.4", "Cópia de segurança", ["T-006"], "backup e restauração com ida-e-volta provada"),
            ("Entrega", "Marco da etapa", ["T-009"], "a suíte inteira roda sem rede e sem cota"),
        ],
        "requisitos": [
            ("R10", "ok", "tabela `consumos` alimentada a cada resposta; cota e US$ separados"),
            ("R12", "ok", "teste que FALHA se houver tráfego de rede ou chave de acesso no ambiente"),
        ],
        "destaques": [
            "A suíte roda sem internet e sem chave de acesso — e um teste falha se isso deixar de ser verdade (roda em toda verificação, para sempre).",
            "Custo contado em duas unidades (cota e dólar), gravado a cada resposta do modelo.",
            "Fronteiras do modelo e da busca com substitutos para teste: nenhum teste depende do fornecedor.",
            "Verificação num comando, do estágio mais barato ao mais caro: formato → compilar → estilo → testes → tipos → backup.",
        ],
        "pendente": [],
        "proxima": ["Nada pendente nesta etapa — ela segue sendo provada a cada verificação."],
        "demo": "mix test test/fabrica/marco_v01_test.exs",
        "evid_cmd": "marco_v01",
        "marco": "T-009",
    },
    {
        "n": 3, "slug": "E3-agente-e-ferramentas", "nome": "O agente e as ferramentas",
        "datas": "04/10 – 18/10/2026", "fase": "Desenvolvimento", "versao": "v0.2",
        "entrega": "Um agente resolve uma tarefa real com o custo gravado, e trocar de fornecedor não mexe no núcleo.",
        "status": "concluida", "status_txt": "Concluída — entrega aprovada (etapa atual do calendário)",
        "pacotes": [
            ("3.1", "Ferramentas", ["T-010", "T-011", "T-012", "T-013", "T-013a", "T-013b", "T-016"],
             "arquivo e comando (com prazo e morte da árvore de processos), resumo do projeto, registrar resultado"),
            ("3.2", "Confinamento", ["T-012a", "T-014", "T-079", "T-080", "T-081", "T-082", "T-083", "T-090", "T-099"],
             "a ferramenta recusa caminho fora do projeto; o shell do agente roda em sandbox"),
            ("3.3", "Agente supervisionado", ["T-015", "T-017", "T-017a", "T-017b", "T-020a"],
             "o agente como processo supervisionado, com teto de chamadas por papel"),
            ("3.4", "Adaptadores", ["T-003a", "T-018", "T-018a", "T-018b", "T-018c", "T-018d", "T-018e", "T-019"],
             "dois fornecedores atrás da mesma fronteira, com o controle de cada um MEDIDO antes"),
            ("Entrega", "Marco da etapa", ["T-020", "T-020b", "T-100"], "agente real resolve tarefa real, custo por volta gravado"),
            ("Adiado", "Marco 2 (cache)", ["T-020c"], "medir o cache com a API por token — depende de chave de acesso"),
        ],
        "requisitos": [
            ("R11", "ok", "Confinamento recusa absoluto, `..`, link, UNC e dispositivo; fuzz de 7.500 consultas no Linux: 0 fugas. No Windows, 2 testes de link em correção (T-099)"),
            ("R15", "ok", "dois adaptadores (`ClaudeCLI`, `MessagesAPI`) atrás de `Fabrica.Operario`; núcleo intocado"),
        ],
        "destaques": [
            "Agente real resolveu tarefa real: o probe rodou 2× seguidas com PROBE OK — 27.149 e 27.183 tokens, e a soma no banco bate com a soma do laço.",
            "Trocar de fornecedor não mexe no núcleo: dois adaptadores atrás da mesma fronteira.",
            "Medido antes de decidir (risco previsto no plano): o CLI do fornecedor é um agente completo, não só um modelo — virou um desenho novo, a 'família do operário'.",
            "O marco reprovou 3 vezes antes de aprovar, cada vez por um defeito real — um deles com 26 testes verdes: o processo de verificação funcionou.",
            "Confinamento endurecido depois da portabilidade para Linux: link relativo, UNC com barras mistas e o shell do agente em sandbox.",
        ],
        "pendente": [
            "A demonstração do marco NÃO roda hoje nesta máquina: rodada em 07/10, o agente recusou subir porque o shell exige sandbox e o Windows não o oferece (fail-closed, nada gasto — a governança funcionando). Corretiva T-100 na fila: o agente do probe sobe sem shell, que a tarefa dele não precisa.",
            "Primeira bateria no Windows após o endurecimento do confinamento (07/10): 2 testes de link (junção) caem — corretiva T-099 aberta e na fila da fábrica.",
            "Marco 2 (cache medido com a API por token) adiado por decisão: não há chave de acesso nesta máquina (fica para depois do marco final).",
        ],
        "proxima": [
            "Fechar a T-100 antes de 18/10, para a demonstração rodar ao vivo no Windows.",
            "Apresentação do fim da E3 (18/10): demonstrar o agente resolvendo uma tarefa real, com o custo gravado.",
            "Marco 2 só quando houver chave de acesso à API por token.",
        ],
        "demo": "mix run priv/probes/marco_v02_agente.exs   # consome ~27 mil tokens da cota",
        "evid_cmd": "marco_v02_probe",
        "marco": "T-020",
    },
    {
        "n": 4, "slug": "E4-linha-de-producao", "nome": "Linha de produção de tarefas",
        "datas": "19/10 – 02/11/2026", "fase": "Desenvolvimento", "versao": "v0.3",
        "entrega": "Uma tarefa percorre os seis estados, é reprovada de propósito, é refeita e conclui.",
        "status": "concluida", "status_txt": "Construída e provada (adiantada em relação ao calendário)",
        "pacotes": [
            ("4.1", "Seis estados", ["T-021", "T-022", "T-022a"], "máquina de estados; estado, relatório e custo numa transação"),
            ("4.2", "Fila e equipe", ["T-023", "T-024"], "promoção por dependências; especialistas sob demanda"),
            ("4.3", "Critérios de aceite", ["T-025", "T-026", "T-027"], "critérios executados sozinhos, com allowlist"),
            ("4.4", "Os dois portões", ["T-028", "T-075", "T-077", "T-078"], "verificador e revisor; o revisor sem ferramenta de escrita"),
            ("4.5", "Diagnóstico", ["T-029", "T-030", "T-031", "T-032"], "decidir COMO refazer; escada de falha; teto de gasto"),
            ("R1", "Do pedido às tarefas", ["T-068", "T-069"], "planejador: pedido em linguagem natural → grafo de tarefas"),
            ("Entrega", "Marco da etapa", ["T-034"], "seis estados, reprovação de propósito, refeita, concluída"),
        ],
        "requisitos": [
            ("R1", "parcial", "`mix fabrica.planejar` gera as tarefas; falta rodar num pedido real de ponta a ponta"),
            ("R2", "ok", "histórico medido: pronta → execução → teste → execução → teste → revisão → concluída"),
            ("R3", "ok", "dois portões independentes; reprovação por conformidade sem defeito nenhum"),
            ("R4", "ok", "diagnóstico decide como refazer; 2º ciclo sobe de modelo"),
            ("R5", "ok", "escada de 4 degraus; contador no banco"),
            ("R14", "ok", "teto por rodada e por tarefa: impede começar, nunca corta no meio"),
        ],
        "destaques": [
            "O marco é um teste permanente: uma tarefa criada do zero é reprovada de propósito (entrega errada, não comando quebrado), refeita e concluída.",
            "Na reprovação o modelo sobe sozinho: 1º ciclo no modelo padrão, 2º no reforçado — decidido pela escada, não a dedo.",
            "Custo por ciclo consultável separadamente: US$ 0,0257 + US$ 0,0744 = US$ 0,1001 (no teste do marco).",
            "Os critérios de aceite são comandos que o sistema roda sozinho, antes de gastar um agente.",
        ],
        "pendente": ["R1 ainda não foi exercitado de ponta a ponta com um pedido real (isso é o marco final, E7/E8)."],
        "proxima": ["Para a apresentação de 02/11: rodar o marco ao vivo (`mix test test/fabrica/marco_v03_test.exs`)."],
        "demo": "mix test test/fabrica/marco_v03_test.exs",
        "evid_cmd": "marco_v03",
        "marco": "T-034",
    },
    {
        "n": 5, "slug": "E5-paralelismo-e-falhas", "nome": "Paralelismo e tolerância a falhas",
        "datas": "03/11 – 17/11/2026", "fase": "Desenvolvimento", "versao": "v0.4",
        "entrega": "Três tarefas em paralelo; encerrar uma no meio não afeta as outras, e ela volta à fila.",
        "status": "concluida", "status_txt": "Construída e provada (adiantada em relação ao calendário)",
        "pacotes": [
            ("5.1", "Supervisão", ["T-035", "T-036"], "um processo supervisionado por tarefa"),
            ("5.2", "Fila durável", ["T-037"], "fila no banco: enfileirar e mudar estado na mesma transação"),
            ("5.3", "Paralelismo", ["T-038", "T-038a"], "áreas como exclusão mútua; limite pelo perfil de 8 GB"),
            ("5.4", "Limite de uso", ["T-039", "T-039a", "T-087", "T-091"], "reconhecer a parede de cota, dormir e rearmar"),
            ("5.5", "Recuperação", ["T-040"], "recuperar trabalho interrompido pela árvore git"),
            ("Entrega", "Marco da etapa", ["T-041"], "três em paralelo; matar uma não derruba as outras"),
        ],
        "requisitos": [
            ("R6", "ok", "três agentes em voo confirmados pelo Registry, áreas disjuntas"),
            ("R13", "ok", "matar um agente: os outros seguem, o morto volta à fila sem perder consumo"),
        ],
        "destaques": [
            "Três agentes reais em voo; matar um não afeta os outros dois, e o morto volta à fila com o motivo.",
            "Derrubar a aplicação no meio: ao subir, o saneamento commita o trabalho parcial sem dono.",
            "Parede de cota do fornecedor: pausa as filas e agenda o rearme sem cancelar nada.",
            "Marco estável: 5 rodadas seguidas sem uma única falha (a estabilidade era o ponto).",
        ],
        "pendente": [],
        "proxima": ["Para 17/11: rodar o marco ao vivo (`mix test test/fabrica/marco_v04_test.exs`)."],
        "demo": "mix test test/fabrica/marco_v04_test.exs",
        "evid_cmd": "marco_v04",
        "marco": "T-041",
    },
    {
        "n": 6, "slug": "E6-memoria", "nome": "Memória do projeto",
        "datas": "18/11 – 02/12/2026", "fase": "Desenvolvimento", "versao": "v0.5",
        "entrega": "O agente cita a decisão anterior, com a fonte certa, em vez de decidir de novo.",
        "status": "bloqueada", "status_txt": "Peças construídas — marco bloqueado",
        "pacotes": [
            ("6.1", "Medição da busca", ["T-042"], "medir memória e tempo antes de escolher onde a busca roda"),
            ("6.2", "Histórico", ["T-043"], "guardar o histórico a cada commit"),
            ("6.3", "Busca híbrida", ["T-044", "T-065"], "por significado e por termo exato, escolhida por medição"),
            ("6.4", "Contexto com fonte", ["T-046"], "o bloco recuperado com a fonte citada"),
            ("6.5", "Avaliação", ["T-047"], "recall e MRR do conjunto de avaliação"),
            ("Busca local", "Modelo de embedding", ["T-045", "T-059", "T-060", "T-061", "T-062", "T-063", "T-064"],
             "embedding local (Ollama) com dimensão conferida"),
            ("Entrega", "Marco da etapa", ["T-048"], "o agente cita a decisão anterior"),
        ],
        "requisitos": [
            ("R7", "pendente", "busca e bloco com fonte existem, mas o bloco ainda não chega ao prompt do agente"),
            ("R9", "parcial", "busca escolhida por medição; o pico com 3 em paralelo ainda não foi medido"),
        ],
        "destaques": [
            "Decisão por medição, não palpite: o modelo local via Bumblebee/EXLA não tem binário para Windows — a busca local foi para o Ollama.",
            "Busca híbrida (significado + termo exato) com o modo padrão escolhido pela medição local de recall.",
            "Cada commit do projeto vira histórico consultável, e o bloco recuperado traz a fonte citada.",
        ],
        "pendente": [
            "Marco bloqueado: o bloco recuperado ainda não é injetado no prompt do agente (falta a peça que liga a memória ao despacho).",
        ],
        "proxima": [
            "Criar a tarefa que liga `Fabrica.Memoria.Contexto` ao despacho do agente.",
            "Rodar o marco: agente real cita uma decisão anterior com a fonte certa.",
        ],
        "demo": None,
        "marco": "T-048",
    },
    {
        "n": 7, "slug": "E7-painel-e-automacao", "nome": "Painel e automação",
        "datas": "03/12 – 17/12/2026", "fase": "Desenvolvimento", "versao": "v1.0",
        "entrega": "Um projeto inteiro acompanhado na tela, do pedido à entrega, com o custo em tempo real.",
        "status": "em-andamento", "status_txt": "Telas e automação construídas — marco final em andamento",
        "pacotes": [
            ("7.1", "Medidas de execução", ["T-050"], "barramento de eventos e telemetria por despacho"),
            ("7.2", "Quadro e console", ["T-051", "T-052"], "quadro por estado e console do agente, ao vivo, com custo"),
            ("7.3", "Parar e retomar", ["T-053"], "um botão que encerra um processo supervisionado"),
            ("7.4", "Rodadas automáticas", ["T-054", "T-055"], "piloto automático com teto de gasto"),
            ("7.x", "Entregas não-código", ["T-056"], "trilha genérica e escada de prova"),
            ("7.5", "Segredos", ["T-057"], "varredura de segredos antes de publicar"),
            ("Integração", "Agente real de ponta a ponta",
             ["T-066", "T-067", "T-070", "T-071", "T-072", "T-073", "T-074", "T-084", "T-085", "T-086", "T-088", "T-089"],
             "a fila sobe o agente real; custo real bate com o fornecedor"),
            ("Abertas", "Corretivas (rodando hoje)", ["T-092", "T-093", "T-094", "T-095", "T-096", "T-097", "T-098"],
             "prontas para o motor"),
            ("Abertura", "Conferir o plano", ["T-049"], "o que a tela precisa mostrar e a medição final"),
            ("Entrega", "Marco final", ["T-058"], "um projeto inteiro, sem intervenção"),
        ],
        "requisitos": [
            ("R8", "parcial", "quadro, console e custo ao vivo existem; falta o projeto inteiro acompanhado (marco)"),
        ],
        "destaques": [
            "Quadro de tarefas e console do agente ao vivo, com o custo da rodada (capturas de tela nesta pasta).",
            "Piloto automático com teto de gasto e de rodadas; parar/retomar num botão.",
            "Custo real do despacho bate com o do fornecedor (desvio 0,0%) — antes saía de 3,6× a 27× abaixo.",
            "O agente real sobe pela fila, com o shell confinado em sandbox e sem herdar instruções de fora do projeto.",
        ],
        "pendente": [
            "Marco final (projeto inteiro sem intervenção) bloqueado até as corretivas abertas fecharem.",
            "Abertura da etapa (conferir o plano contra o código) ainda não feita.",
        ],
        "proxima": [
            "A fábrica roda hoje as corretivas prontas.",
            "Depois: abertura da E7 e o marco final com teto de gasto autorizado.",
        ],
        "demo": None,
        "marco": "T-058",
        "imagens": ["T-051-quadro.png", "T-052-console.png", "T-055-piloto-tela.png"],
    },
]

PROXIMA_RODADA_GERAL = {
    "nome": "E8 — Testes com projetos reais (próxima fase)",
    "datas": "18/12/2026 – 01/01/2027",
    "itens": [
        ("8.1 Projetos de teste", "escrever os 5 projetos (pendência herdada da E1)"),
        ("8.2 Medição", "instrumentar a medição dos 8 critérios — ainda não há tarefa para isso"),
        ("8.3 Máquina de 8 GB", "medir o pico com 3 tarefas em paralelo"),
        ("8.4 Falhas provocadas", "matar agente e derrubar o banco no meio de uma rodada real"),
    ],
}
