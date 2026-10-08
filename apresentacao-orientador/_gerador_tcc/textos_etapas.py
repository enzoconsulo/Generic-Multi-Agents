# -*- coding: utf-8 -*-
"""Texto curado de cada etapa para o documento Word e a apresentação principal (PT).

Regra: objetivo e realista. "como" = decisões técnicas em uma linha cada; "prova" = como a
entrega se demonstra; "pendente" = o que de fato não está pronto; "proxima" = o que vem a seguir.
"""

TEXTOS = {
    1: {
        "resumo": "Requisitos, arquitetura, divisão do trabalho e critérios de desempenho definidos. Os cinco projetos de teste estão propostos e aguardam validação.",
        "como": [
            "15 requisitos: 8 funcionais (R1–R8) e 7 restrições (R9–R15), cada um com etapa e forma de verificar.",
            "Arquitetura em 4 camadas (tela, motor, agentes, fronteiras) sobre um único banco PostgreSQL.",
            "Ciclo de vida da tarefa com 6 estados e 2 portões independentes; escada de 4 degraus para falhas.",
            "Pilha Elixir/OTP escolhida pela supervisão de processos: cada agente é um processo isolado.",
            "Trabalho de E2–E7 decomposto em 39 tarefas, uma por pacote do plano, com critérios executáveis.",
        ],
        "prova": "Documentos em docs/planejamento/ e o quadro de tarefas em docs/tasks/.",
        "pendente": ["Validar com o orientador a proposta dos cinco projetos de teste (FAB-105)."],
        "proxima": "E2 — montar a fundação: ambiente, banco, custo, fronteiras e cópia de segurança.",
    },
    2: {
        "resumo": "A fundação está de pé e se prova sozinha: a suíte inteira roda sem internet e sem consumir o serviço do modelo.",
        "como": [
            "Projeto Phoenix com verificação em um comando (mix factory.ci), do estágio mais barato ao mais caro.",
            "Esquema do banco com projetos, tarefas, ciclos, despachos e consumos, criado por migrações.",
            "Custo contado em duas unidades — cota da assinatura e dólar — a cada resposta do modelo (R10).",
            "Duas fronteiras (Provider e Embedder), cada uma com um adaptador falso que é o padrão nos testes (R12).",
            "Backup e restauração do banco com ida e volta provada em estágio próprio da verificação.",
        ],
        "prova": "mix test test/factory/milestone_e2_test.exs — falha se houver tráfego de rede, cliente HTTP ou chave de acesso no ambiente.",
        "pendente": [],
        "proxima": "E3 — o agente e as ferramentas, com confinamento.",
    },
    3: {
        "resumo": "Um agente real resolve uma tarefa real com o custo gravado por volta, e o fornecedor do modelo é trocável sem tocar o núcleo.",
        "como": [
            "Ferramentas de arquivo e de comando; comando com prazo mata a árvore de processos inteira.",
            "Confinamento resolvendo o caminho REAL (links, junções, UNC, dispositivos) antes de tocar o disco (R11).",
            "O shell do agente roda em sandbox do sistema operacional; sem sandbox, o agente com shell não sobe.",
            "O agente é um processo OTP supervisionado, com teto de chamadas por papel imposto pelo sistema.",
            "Dois adaptadores atrás da mesma fronteira (CLI do fornecedor e API por token); a governança do CLI foi medida antes de decidir (R15).",
        ],
        "prova": "mix run priv/probes/milestone_e3_agent.exs — contra o modelo real: arquivo escrito, uma linha de consumo por volta, soma igual no banco.",
        "pendente": ["A medição do cache com a API por token depende de uma chave de acesso e foi deixada para depois do marco final."],
        "proxima": "E4 — a linha de produção: estados, fila, critérios, portões e escada de falha.",
    },
    4: {
        "resumo": "A linha de produção funciona de ponta a ponta: uma tarefa criada do zero é reprovada de propósito, sobe de modelo, é refeita e conclui.",
        "como": [
            "Máquina de estados pura + transição transacional: estado, relatório e custo numa única transação (R2).",
            "Fila por dependências, desempate pela tarefa que destrava mais; especialista soma ao papel.",
            "Critérios de aceite são comandos rodados pelo sistema, com lista de binários permitidos.",
            "Dois portões independentes; o revisor não recebe ferramenta de escrita (R3).",
            "Escada de resposta: modelo mais forte, outro especialista, replanejar, humano (R4, R5); teto de gasto que nunca corta no meio (R14).",
        ],
        "prova": "mix test test/factory/milestone_e4_test.exs — histórico com os seis estados, reprovação por entrega errada, modelo sobe no 2º ciclo, custo por ciclo separado.",
        "pendente": ["R1 (pedido → tarefas) está implementado; o teste com um pedido real de ponta a ponta acontece na validação (E8)."],
        "proxima": "E5 — paralelismo e tolerância a falhas.",
    },
    5: {
        "resumo": "Três tarefas rodam em paralelo; matar uma no meio não afeta as outras, e ela volta à fila sem perder trabalho.",
        "como": [
            "Um processo supervisionado por tarefa, com registro dos agentes em voo (R13).",
            "Fila durável no banco (Oban): enfileirar e mudar o estado da tarefa na mesma transação.",
            "As áreas de cada tarefa são exclusão mútua; o número em voo segue o perfil de 8 GB (R6, R9).",
            "Parede de cota do fornecedor reconhecida: o sistema dorme até a reabertura e rearma sozinho.",
            "Na subida após uma queda, o trabalho parcial é commitado em nome da tarefa certa.",
        ],
        "prova": "mix test test/factory/milestone_e5_test.exs — três agentes reais em voo, um é morto, os outros seguem e o morto volta à fila.",
        "pendente": [],
        "proxima": "E6 — memória do projeto.",
    },
    6: {
        "resumo": "As peças da memória estão construídas e testadas; a entrega da etapa (o agente citar a decisão anterior) ainda não foi demonstrada.",
        "como": [
            "Medição antes da escolha: o modelo de embedding local escolhido por desempenho medido (R9).",
            "Cada commit do projeto vira trechos com embedding, sem duplicar em reingestão.",
            "Busca híbrida (significado + termo exato) com fusão de postos, filtrada por projeto.",
            "Bloco de contexto com a fonte de cada trecho, fora da faixa cacheada do prompt (R7).",
            "Avaliação com recall@8, recall@1 e MRR; busca abaixo da linha de base desliga o bloco.",
        ],
        "prova": "mix test test/factory/memory/ — busca, contexto, ingestão e avaliação.",
        "pendente": ["Marco bloqueado: a fila ainda monta a mensagem do agente sem o bloco de memória (ajuste pequeno, já diagnosticado)."],
        "proxima": "Fechar o ajuste da fila e demonstrar o agente real citando a decisão anterior.",
    },
    7: {
        "resumo": "Tela ao vivo, parar/retomar, piloto automático com teto de gasto e o agente real ligado à fila estão prontos; o projeto inteiro sem intervenção ainda não foi executado.",
        "como": [
            "Barramento de eventos e telemetria por despacho; a tela lê os mesmos eventos do motor.",
            "Quadro de tarefas por estado e console do agente ao vivo, com o custo acumulado (R8).",
            "Piloto automático: decisão como função pura, tetos obrigatórios, dorme na cota em vez de parar.",
            "Trilha para entregas que não são código, com grau de prova obrigatório em cada critério.",
            "Varredura de segredos antes de publicar; doutrina própria para construtor, verificador e revisor.",
        ],
        "prova": "mix phx.server → /board e /console; testes em test/factory_web/ e test/factory/autopilot/.",
        "pendente": ["Marco final (um projeto inteiro sem intervenção) depende do ajuste da E6 e da autorização do teto de gasto."],
        "proxima": "E8 — validação com os cinco projetos de teste e a primeira medição dos 8 critérios.",
    },
}
