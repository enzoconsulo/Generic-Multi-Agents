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
        "resumo": "As regras da linha de produção estão prontas e provadas: uma tarefa é reprovada de propósito, sobe de modelo, é refeita e conclui — cada passo gravado numa transação.",
        "como": [
            "Máquina de estados pura + transição transacional: estado, relatório e custo numa única transação (R2).",
            "Fila por dependências, desempate pela tarefa que destrava mais; especialista soma ao papel.",
            "Critérios de aceite são comandos rodados pelo sistema, com lista de binários permitidos.",
            "Dois portões independentes; o revisor não recebe ferramenta de escrita (R3).",
            "Escada de resposta: modelo mais forte, outro especialista, replanejar, humano (R4, R5); teto de gasto que nunca corta no meio (R14).",
        ],
        "prova": "mix test test/factory/milestone_e4_test.exs — histórico pronta → execução → teste → execução → teste → revisão → concluída, reprovação por entrega errada, modelo sobe no 2º ciclo, custo por ciclo separado.",
        "pendente": ["R1 (pedido → tarefas) está implementado; o teste com um pedido real de ponta a ponta acontece na validação (E8).",
                     "Escada de resposta, diagnóstico e teto de gasto são regras puras, prontas e testadas; nesta etapa nenhum laço automático ainda as chama — quem as encadeia é o teste do marco."],
        "proxima": "E5 — paralelismo e tolerância a falhas.",
    },
    5: {
        "resumo": "Três tarefas rodam em paralelo; matar uma no meio não afeta as outras, e ela volta à fila sem perder trabalho.",
        "como": [
            "Um processo supervisionado por tarefa, com registro dos agentes em voo (R13).",
            "Fila durável no banco (Oban): enfileirar e mudar o estado da tarefa na mesma transação.",
            "As áreas de cada tarefa são exclusão mútua; o número em voo segue o perfil de 8 GB (R6, R9).",
            "Parede de cota do fornecedor reconhecida: o sistema dorme até a reabertura e rearma sozinho.",
            "Depois de uma queda, o saneamento devolve o estado das tarefas órfãs e commita o trabalho parcial em nome da tarefa certa (R13).",
        ],
        "prova": "mix test test/factory/milestone_e5_test.exs — três agentes reais em voo, um é morto, os outros seguem e o morto volta à fila.",
        "pendente": ["Nesta etapa o lote e o saneamento são chamados pelo teste do marco; quem monta a rodada e enfileira sozinho é o piloto automático (E7).",
                     "O saneamento roda quando chamado, ainda não automaticamente na subida do sistema.",
                     "Medir o pico de memória com agentes em paralelo na máquina de 8 GB (R9)."],
        "proxima": "E6 — memória do projeto.",
    },
    6: {
        "resumo": "As peças da memória estão construídas e testadas; a entrega da etapa (o agente citar a decisão anterior) ainda não foi demonstrada.",
        "como": [
            "Medição antes da escolha: o modelo de embedding local escolhido por desempenho medido (R9).",
            "O histórico do projeto vira trechos por seção, com embedding; reingerir o mesmo conteúdo não duplica nada.",
            "Busca híbrida (significado + termo exato) com fusão de postos, filtrada por projeto.",
            "Bloco de contexto com a fonte de cada trecho, fora da faixa cacheada do prompt (R7).",
            "Avaliação com recall@8, recall@1 e MRR; busca abaixo da linha de base desliga o bloco.",
        ],
        "prova": "mix test test/factory/memory/ — ingestão, busca, bloco e avaliação  ·  mix run priv/probes/ollama_real.exs — o embedder real, sem custo",
        "pendente": ["Marco bloqueado: nesta etapa a memória ainda não está ligada ao despacho; na E7 o despacho passa a anexar o bloco, mas a fila ainda o descarta ao montar a mensagem (ajuste pequeno, já localizado).",
                     "A ingestão ainda não é disparada sozinha a cada mudança do histórico; nesta etapa quem a chama são os testes.",
                     "Medir o pico de memória com agentes em paralelo na máquina de 8 GB (R9)."],
        "proxima": "E7 — painel ao vivo e piloto automático; o despacho passa a anexar a memória (falta a fila entregá-la ao agente).",
    },
    7: {
        "resumo": "Telas ao vivo, parar/retomar, piloto com dois freios, trilha genérica, busca de segredos e o agente real na fila estão prontos e testados; parte ainda não está ligada ao sistema em execução, e o projeto inteiro ainda não foi executado.",
        "como": [
            "Barramento de eventos: o motor avisa início e fim de despacho e a parede de cota; telas e piloto escutam sem tocar no motor.",
            "Quadro de tarefas por estado, com o custo de cada tarefa, e console com os agentes em execução e a cota (R8).",
            "Piloto automático: decisão como função pura em ordem fixa, dois freios obrigatórios, dorme na cota em vez de parar.",
            "Trilha para entregas que não são código, com grau de prova obrigatório em cada critério; busca de segredos que recusa publicar.",
            "O agente real na fila: mensagem montada da tarefa e da doutrina do papel, ferramentas presas às áreas, portão por papel.",
        ],
        "prova": "mix test test/factory/autopilot/ test/factory_web/ test/factory/queue/; mix phx.server → /board e /console.",
        "pendente": [
            "Ligar os eventos de mudança de estado e de volta: o motor ainda não os emite, então a tela os recebe só nos testes.",
            "Colocar numa página os componentes de Parar/Retomar e do piloto (prontos e testados, sem tela que os use).",
            "Chamar no caminho real a trilha genérica, os graus de prova e a busca de segredos (prontos e testados, sem chamador).",
            "A fila enviar o bloco de memória ao agente (destrava o marco da E6).",
            "Executar o marco: um projeto inteiro sem intervenção, com teto de gasto autorizado.",
        ],
        "proxima": "E8 — validação com os cinco projetos de teste e a primeira medição dos 8 critérios.",
    },
}
