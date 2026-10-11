# -*- coding: utf-8 -*-
"""Conteúdo explicativo dos tickets da E1 (documentos), no mesmo formato de tickets_detalhe.json."""

E1 = {
    "FAB-101": {
        "pt": {"resumo": "Lista do que o sistema precisa fazer (8 requisitos funcionais) e das restrições sob as quais precisa funcionar (7 requisitos não funcionais). Cada requisito diz em que etapa será atendido e como será verificado.",
               "porque": "Sem requisitos com forma objetiva de verificação, nenhuma etapa teria critério de pronto; eles amarram cada entrega do cronograma a algo que pode ser testado.",
               "como": ["R1–R8: do pedido às tarefas, seis estados, dois julgamentos, retrabalho limitado, paralelismo, memória e acompanhamento ao vivo",
                        "R9–R15: 8 GB de memória, custo em duas unidades, confinamento, testes sem internet, isolamento de falhas, teto de gasto, fornecedor trocável",
                        "Cada linha traz a etapa responsável (E2–E7) e o teste que prova o requisito"],
               "exemplo": "R11 — 'nenhum agente escreve fora da pasta do projeto' — é provado na E3 por testes que tentam escapar da pasta e são recusados."},
        "en": {"resumo": "List of what the system must do (8 functional requirements) and the constraints it must work under (7 non-functional ones). Each requirement states the stage that delivers it and how it is verified.",
               "porque": "Without requirements that can be checked objectively, no stage would have a definition of done; they tie each scheduled delivery to something testable.",
               "como": ["R1–R8: request to tasks, six states, two judgements, bounded rework, parallelism, memory and live monitoring",
                        "R9–R15: 8 GB of memory, cost in two units, confinement, offline tests, failure isolation, spending ceiling, swappable provider",
                        "Each row names the owning stage (E2–E7) and the test that proves it"],
               "exemplo": "R11 — 'no agent writes outside the project folder' — is proven in E3 by tests that try to escape the folder and are refused."},
        "verificar": ["docs/planejamento/requisitos.md"], "modulos": []},
    "FAB-102": {
        "pt": {"resumo": "Comparação arquitetural com os sistemas multi-agente que constroem software, com destaque para o mais próximo, e o que este trabalho faz de diferente.",
               "porque": "Delimita a originalidade: a contribuição não é 'usar agentes', e sim mover as regras de governança do texto do pedido para a estrutura do programa.",
               "como": ["Quatro sistemas comparados pela arquitetura, não por recursos: ChatDev, MetaGPT, softwarefabrik.io e este trabalho", "Diferenças centrais: dois portões com perguntas diferentes, autoridade como ausência de ferramenta, escada de resposta à falha"],
               "exemplo": ""},
        "en": {"resumo": "Architectural comparison with multi-agent systems that build software, focusing on the closest one, and what this work does differently.",
               "porque": "It draws the line of originality: the contribution is not 'using agents', it is moving governance rules from the prompt into the program's structure.",
               "como": ["Four systems compared by architecture, not by features: ChatDev, MetaGPT, softwarefabrik.io and this work", "Key differences: two gates asking different questions, authority as the absence of a tool, a failure-response ladder"],
               "exemplo": ""},
        "verificar": ["docs/planejamento/estado-da-arte-resumo.pdf", "docs/planejamento/estado-da-arte-completo.pdf"], "modulos": []},
    "FAB-103": {
        "pt": {"resumo": "Desenho do sistema: quatro camadas (tela, motor, agentes, fronteiras), o ciclo de vida da tarefa em seis estados com dois portões, a escada de resposta à falha e a pilha de tecnologia.",
               "porque": "É a arquitetura que torna as regras estruturais: cada regra tem um lugar no desenho onde ela é imposta, e não pedida.",
               "como": ["Diagramas das camadas e da máquina de estados (Mermaid, renderizados no GitHub)", "Tabela 'a regra × onde ela mora'", "Escolha do Elixir/OTP justificada pela supervisão de processos"],
               "exemplo": ""},
        "en": {"resumo": "System design: four layers (screen, engine, agents, boundaries), the six-state task lifecycle with two gates, the failure-response ladder and the technology stack.",
               "porque": "The architecture is what makes the rules structural: each rule has a place in the design where it is enforced, not requested.",
               "como": ["Diagrams of the layers and the state machine (Mermaid, rendered on GitHub)", "Table 'rule × where it lives'", "Elixir/OTP chosen for process supervision"],
               "exemplo": ""},
        "verificar": ["docs/planejamento/arquitetura.md"], "modulos": []},
    "FAB-104": {
        "pt": {"resumo": "O plano de desenvolvimento (10 etapas em cascata), os 8 critérios de desempenho com limite numérico e o quadro de tarefas de E2 a E7, uma tarefa por pacote do plano.",
               "porque": "Os critérios são a régua da validação (E8–E10) e não mudam; o quadro de tarefas transforma cada etapa em entregas pequenas e verificáveis.",
               "como": ["Plano de desenvolvimento em Word", "8 critérios: constrói sozinho, conclui tarefas, pouco retrabalho, não aprova errado, governa de verdade, aguenta falha, custo sob controle, cabe na máquina", "39 tarefas de código distribuídas de E2 a E7"],
               "exemplo": ""},
        "en": {"resumo": "The development plan (10 waterfall stages), the 8 performance criteria with numeric thresholds and the E2–E7 task board, one task per plan package.",
               "porque": "The criteria are the validation yardstick (E8–E10) and never change; the board turns each stage into small, verifiable deliveries.",
               "como": ["Development plan in Word", "8 criteria: builds alone, completes tasks, little rework, never approves wrongly, really governs, survives failure, cost under control, fits the machine", "39 code tasks across E2–E7"],
               "exemplo": ""},
        "verificar": ["docs/planejamento/plano-de-desenvolvimento.docx", "docs/planejamento/criterios-de-desempenho.md", "docs/tasks/"], "modulos": []},
    "FAB-105": {
        "pt": {"resumo": "Proposta de cinco projetos reais, de tamanhos e tipos diferentes, que a validação vai executar do pedido à entrega sem intervenção humana.",
               "porque": "Os critérios de desempenho são medidos nesses projetos; escolhê-los antes da construção evita ajustar a régua ao sistema.",
               "como": ["P1 lista de tarefas em terminal · P2 API de biblioteca · P3 relatório a partir de planilha · P4 site de portfólio · P5 apresentação a partir de dados", "Cada projeto tem o pedido em linguagem natural e o que conta como entregue"],
               "exemplo": "Pendente: validar a proposta com o orientador."},
        "en": {"resumo": "Proposal of five real projects, of different sizes and kinds, that validation will run from request to delivery with no human intervention.",
               "porque": "The performance criteria are measured on these projects; choosing them before construction keeps the yardstick from being tuned to the system.",
               "como": ["P1 terminal to-do list · P2 library API · P3 report from a spreadsheet · P4 portfolio site · P5 presentation from data", "Each project has a natural-language request and what counts as delivered"],
               "exemplo": "Pending: validate the proposal with the advisor."},
        "verificar": ["docs/planejamento/projetos-de-teste.md"], "modulos": []},
}


# "A ideia" (pt/en) e a visão geral (Mermaid) de cada ticket, no mesmo formato dos tickets de E2–E7.
_IDEIA = {
    "FAB-101": ("Escrever, antes de programar, o que o sistema precisa fazer e sob que restrições — e, para cada item, qual etapa o entrega e como se prova. Sem isso, \"pronto\" seria opinião.",
                "Write down, before any code, what the system must do and under which constraints — and, for each item, which stage delivers it and how it is proven. Without this, \"done\" would be an opinion."),
    "FAB-102": ("Comparar este trabalho com os sistemas multi-agente que já constroem software, olhando a arquitetura e não a lista de recursos, para deixar claro onde está a contribuição.",
                "Compare this work with the multi-agent systems that already build software, looking at architecture rather than feature lists, to make the contribution clear."),
    "FAB-103": ("Desenhar o sistema de forma que cada regra de governança tenha um lugar no programa onde é imposta: a ação proibida não existe para o agente, em vez de ser só pedida no texto.",
                "Design the system so that every governance rule has a place in the program where it is enforced: the forbidden action does not exist for the agent, instead of merely being requested in the prompt."),
    "FAB-104": ("Transformar o desenho em um plano executável: etapas com entrega demonstrável, tarefas pequenas com critérios que são comandos, e uma régua numérica fixa para a validação.",
                "Turn the design into an executable plan: stages with a demonstrable delivery, small tasks whose criteria are commands, and a fixed numeric yardstick for validation."),
    "FAB-105": ("Escolher, antes de construir, os projetos reais em que o sistema será julgado — assim a régua não pode ser ajustada ao que o sistema consegue fazer.",
                "Choose, before building, the real projects on which the system will be judged — so the yardstick cannot be tuned to what the system can do."),
}
_DIAGRAMA = {
    "FAB-101": '''flowchart LR
  F["R1–R8<br/>o que o sistema faz"] --> E["cada um com<br/>etapa responsável"]
  S["R9–R15<br/>restrições"] --> E
  E --> V["e forma<br/>de verificar"]''',
    "FAB-102": '''flowchart LR
  A["softwarefabrik.io<br/>pessoa aprova cada passo"] --- X{{"comparação<br/>arquitetural"}}
  B["Este trabalho<br/>código fecha o laço"] --- X
  C["ChatDev · MetaGPT<br/>estado dentro da execução"] -.- X''',
    "FAB-103": '''flowchart TB
  UI["Tela"] --> ENG["Motor<br/>estados, portões, escada de falha"]
  ENG --> AG["Agentes<br/>ferramentas confinadas"]
  AG --> B["Fronteiras<br/>Provider · Embedder"]
  ENG --> DB[("PostgreSQL")]''',
    "FAB-104": '''flowchart LR
  P["E1<br/>planejamento"] --> C["E2–E7<br/>construção<br/>39 tarefas"] --> V["E8–E10<br/>validação"]
  V -- "8 critérios atingidos?<br/>não" --> V''',
    "FAB-105": '''flowchart LR
  P1["P1 terminal"] --- V{{"validação<br/>E8–E10"}}
  P2["P2 API"] --- V
  P3["P3 planilha"] --- V
  P4["P4 site"] --- V
  P5["P5 apresentação"] --- V''',
}
for _k, (_pt, _en) in _IDEIA.items():
    E1[_k]["pt"]["ideia"] = _pt
    E1[_k]["en"]["ideia"] = _en
    E1[_k]["diagrama"] = _DIAGRAMA[_k]
