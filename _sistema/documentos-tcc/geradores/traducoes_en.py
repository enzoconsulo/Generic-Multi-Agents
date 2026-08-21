# -*- coding: utf-8 -*-
"""Traducao PT->EN de todo texto desenhado nas figuras usadas pelos documentos."""

TRAD = {
    # ---------------------------------------------------------------- fig1
    'Pedido': 'Request',
    'uma descrição do que\nse quer construir': 'a description of what\nshould be built',
    'Planejamento': 'Planning',
    'especificação, plano, equipe\ne 8–20 tarefas': 'spec, plan, team\nand 8–20 tasks',
    'Fila': 'Queue',
    'tarefas prontas, ordenadas\npor dependência': 'ready tasks, ordered\nby dependency',
    'Pipeline por tarefa': 'Per-task pipeline',
    'construir → verificar\n→ revisar': 'build → verify\n→ review',
    'Entrega': 'Delivery',
    'artefato pronto\n+ histórico em git': 'finished artifact\n+ git history',
    'PostgreSQL — estado, histórico de execução e índice semântico   ·   git — o artefato e o diff que o revisor julga':
        'PostgreSQL — state, execution history and semantic index   ·   git — the artifact and the diff the reviewer judges',
    'BEAM/OTP — cada tarefa em voo é um processo supervisionado; a queda de um não derruba os outros':
        'BEAM/OTP — every in-flight task is a supervised process; one crashing does not bring down the others',
    'único ponto obrigatório de intervenção humana': 'the only mandatory point of human intervention',

    # ---------------------------------------------------------------- fig2
    'Cada tarefa em voo é um processo com endereço, dono e supervisor — e o estado dela vive no banco, não dentro do processo.':
        'Every in-flight task is a process with an address, an owner and a supervisor — and its state lives in the database, not inside the process.',
    'Fabrica.Supervisor\nstrategy: :one_for_one': 'Factory.Supervisor\nstrategy: :one_for_one',
    'Fabrica.Repo': 'Factory.Repo',
    'Ecto + Postgres\nfonte de verdade': 'Ecto + Postgres\nsource of truth',
    'Oban': 'Oban',
    'filas duráveis:\nplanejar/construir/\nverificar/revisar': 'durable queues:\nplan / build /\nverify / review',
    'Agentes.Sup': 'Agents.Sup',
    'DynamicSupervisor\n+ Registry': 'DynamicSupervisor\n+ Registry',
    'Rag.Servidor': 'Rag.Server',
    'Nx.Serving de\nembeddings (lote)': 'Nx.Serving for\nembeddings (batched)',
    'PainelWeb': 'DashboardWeb',
    'Phoenix Endpoint\n+ LiveView': 'Phoenix Endpoint\n+ LiveView',
    'um processo por tarefa em voo — iniciado sob demanda, morre ao terminar':
        'one process per in-flight task — started on demand, dies when finished',
    'Agente T-012': 'Agent T-012',
    'construtor · opus': 'builder · opus',
    'Agente T-013': 'Agent T-013',
    'construtor · sonnet': 'builder · sonnet',
    'Agente T-009': 'Agent T-009',
    'verificador · haiku': 'verifier · haiku',
    'Agente T-007': 'Agent T-007',
    'revisor · sonnet': 'reviewer · sonnet',
    'O QUE A ÁRVORE DE SUPERVISÃO GARANTE, SEM DEPENDER DE NINGUÉM LEMBRAR':
        'WHAT THE SUPERVISION TREE GUARANTEES, WITHOUT ANYONE HAVING TO REMEMBER',
    '•': '•',
    'um agente é cortado no meio   →   o supervisor percebe e a tarefa volta para a fila: nunca sobra trabalho órfão':
        'an agent is cut off mid-run   →   the supervisor notices and the task returns to the queue: no orphaned work is ever left behind',
    'o teto de custo é atingido   →   quem encerra é o supervisor, e não uma instrução dentro do texto do agente':
        'the spending cap is reached   →   the supervisor is what stops it, not an instruction inside the agent’s text',
    '3 construtores em paralelo   →   três processos isolados; a falha de um não contamina os outros dois':
        '3 builders in parallel   →   three isolated processes; one failing does not contaminate the other two',
    'estado da tarefa   →   vive no Postgres; o processo pode morrer a qualquer instante sem perda':
        'task state   →   lives in Postgres; the process may die at any moment with nothing lost',

    # ---------------------------------------------------------------- fig3
    'INTERFACE': 'INTERFACE',
    'quem dispara': 'who triggers',
    'ORQUESTRAÇÃO': 'ORCHESTRATION',
    'quem decide a ordem': 'who decides the order',
    'AGENTES': 'AGENTS',
    'quem faz o trabalho': 'who does the work',
    'DOUTRINA': 'DOCTRINE',
    'as regras que todos leem': 'the rules everyone reads',
    'ESTADO': 'STATE',
    'a fonte de verdade': 'the source of truth',
    'Painel web (Phoenix LiveView)\nkanban, console ao vivo, botões':
        'Web dashboard (Phoenix LiveView)\nkanban, live console, buttons',
    'CLI (Mix task)\nmix fabrica.trabalhar <projeto>': 'CLI (Mix task)\nmix factory.work <project>',
    'Motor de pipeline (GenServer + Oban)\nmáquina de estados pura, testável, sem modelo':
        'Pipeline engine (GenServer + Oban)\npure state machine, testable, no model involved',
    'Guardas de orçamento\nteto por tarefa e por rodada': 'Budget guards\ncap per task and per run',
    'trilha SOFTWARE\nplanejador · construtor\ntestador · revisor':
        'SOFTWARE track\nplanner · builder\ntester · reviewer',
    'trilha GENÉRICA\nplanejador-gen. · construtor\nconferente · revisor-gen.':
        'GENERIC track\ngeneric planner · builder\nchecker · generic reviewer',
    'COMUNS\ndocumentador\npesquisador': 'SHARED\ndocumenter\nresearcher',
    'Agente = GenServer que roda o laço de tool use  ·  papel + especialista + contexto montado por papel':
        'Agent = a GenServer running the tool-use loop  ·  role + specialist + context assembled per role',
    'regras gerais\ndo sistema': 'general rules\nof the system',
    'protocolo\nde tarefas': 'task\nprotocol',
    'como escolher\na stack': 'how to pick\nthe stack',
    'padrão de\ndocumentação': 'documentation\nstandard',
    'PostgreSQL\ntarefas, execuções,\ncustos, decisões': 'PostgreSQL\ntasks, runs,\ncosts, decisions',
    'pgvector\níndice semântico\ndo projeto': 'pgvector\nsemantic index\nof the project',
    'ETS\ncache quente\nem memória': 'ETS\nhot cache\nin memory',
    'git\num repositório\npor projeto': 'git\none repository\nper project',

    # ---------------------------------------------------------------- fig4
    'O laço de tool use: é aqui que o dinheiro é gasto, uma volta de cada vez.':
        'The tool-use loop: this is where the money is spent, one turn at a time.',
    'Agente\n(GenServer)': 'Agent\n(GenServer)',
    'state: %{tarefa, mensagens, custo, voltas}': 'state: %{task, messages, cost, turns}',
    'POST /v1/messages': 'POST /v1/messages',
    'system + tools + histórico inteiro': 'system + tools + the entire history',
    'resposta + usage': 'response + usage',
    'stop_reason, tokens lidos / escritos': 'stop_reason, tokens read / written',
    'stop_reason == :tool_use ?': 'stop_reason == :tool_use ?',
    'executa as ferramentas\nTask.async_stream (paralelo)': 'runs the tools\nTask.async_stream (parallel)',
    'sim': 'yes',
    'devolve TODOS os\ntool_result numa\nÚNICA mensagem': 'returns ALL\ntool_results in a\nSINGLE message',
    '+1 volta': '+1 turn',
    'termina: grava resultado,\ncusto e commit': 'done: records result,\ncost and commit',
    'não  (:end_turn)': 'no  (:end_turn)',
    'POR QUE O CUSTO É QUADRÁTICO NAS VOLTAS': 'WHY COST GROWS QUADRATICALLY WITH TURNS',
    'cada volta reenvia todo o histórico acumulado até ali. Dobrar as voltas\nmais que dobra o custo do despacho — daí o teto explícito de voltas por papel.':
        'every turn resends the whole history accumulated so far. Doubling the turns\nmore than doubles the cost — hence the explicit per-role turn cap.',

    # ---------------------------------------------------------------- fig5 (cache)
    'A requisição é montada do que nunca muda para o que muda sempre — e essa ordem é o que decide a conta.':
        'The request is assembled from what never changes to what always changes — and that order is what decides the bill.',
    'A ordem é fixada pela API: primeiro as ferramentas, depois as instruções, depois a conversa. Um caractere alterado invalida tudo o que vem depois dele.':
        'The order is fixed by the API: tools first, then instructions, then the conversation. One changed character invalidates everything after it.',
    'definições de ferramentas': 'tool definitions',
    'idênticas para todo agente do sistema': 'identical for every agent in the system',
    'nunca muda': 'never changes',
    '1': '1',
    'as regras e o protocolo de tarefas': 'the rules and the task protocol',
    'o contrato que vale para todos os agentes': 'the contract that applies to every agent',
    '2': '2',
    'índice do projeto': 'project index',
    'regerado a cada commit': 'regenerated on every commit',
    'muda por commit': 'changes per commit',
    '3': '3',
    'histórico da tarefa (ciclos anteriores)': 'task history (previous cycles)',
    'cresce a cada retrabalho': 'grows with every rework',
    'muda por ciclo': 'changes per cycle',
    '4': '4',
    'o pedido desta volta': 'this turn’s request',
    'a tarefa, o diff, a pergunta': 'the task, the diff, the question',
    'muda sempre': 'always changes',
    'onde se marca “guarde até aqui”': 'where you mark “store up to here”',
    '(sem marcação — tudo o que muda sempre fica DEPOIS do último ponto guardado)':
        '(no marker — everything that always changes goes AFTER the last stored point)',
    'O QUE CUSTA O QUÊ': 'WHAT COSTS WHAT',
    'guardar — vale 5 min': 'store — valid 5 min',
    '1,25x': '1.25x',
    '25% a mais, uma vez só': '25% more, just once',
    'guardar — vale 1 hora': 'store — valid 1 hour',
    '2,0x': '2.0x',
    'compensa com 3+ reusos': 'pays off with 3+ reuses',
    'REAPROVEITAR': 'REUSE',
    '0,1x': '0.1x',
    'é aqui que o ganho mora': 'this is where the saving lives',
    'pontos por requisição': 'markers per request',
    'onde marcar é escolha sua': 'where to mark is your call',
    'trecho mínimo': 'minimum span',
    '512 tok': '512 tok',
    'abaixo disso não é guardado': 'below this, nothing is stored',
    'reaproveitar custa 1/10\nde processar de novo': 'reusing costs 1/10 of\nprocessing it again',
    'O erro que zera tudo em silêncio: uma data, um contador ou um número de commit dentro dos blocos 1 a 3.\nNenhum erro é levantado — a economia simplesmente não acontece, e só a contabilidade denuncia.':
        'The mistake that silently cancels everything: a date, a counter or a commit hash inside blocks 1 to 3.\nNo error is raised — the saving simply does not happen, and only the accounting reveals it.',

    # ---------------------------------------------------------------- fig6 (estados)
    'backlog': 'backlog',
    'pronta': 'ready',
    'em-execução': 'in-progress',
    'em-teste': 'in-verification',
    'em-revisão': 'in-review',
    'concluída': 'done',
    'deps concluídas': 'deps完成'.replace('完成', ' met'),
    'construtor assume': 'builder takes it',
    'commit feito': 'commit made',
    'critérios OK': 'criteria pass',
    'conforme e sem bug': 'conforms, no defects',
    'reprovado: não funciona': 'rejected: does not work',
    'reprovado: não é o que foi pedido, ou tem defeito': 'rejected: not what was asked, or has a defect',
    '3 ciclos esgotados': '3 cycles exhausted',
    'REPLANEJADA': 'REPLANNED',
    'o planejador quebra a tarefa\nem duas ou três menores': 'the planner splits the task\ninto two or three smaller ones',
    'as substitutas entram\ncomo tarefas novas': 'the replacements enter\nas brand-new tasks',
    'bloqueada': 'blocked',
    'só quando a tarefa JÁ havia sido': 'only when the task had ALREADY',
    'replanejada uma vez: sai da fila': 'been replanned once: it leaves',
    'e é reportada ao usuário': 'the queue and is reported',
    'Seis estados. Reprovar não é o fim: antes de desistir de uma tarefa, o sistema tenta redimensioná-la uma vez.':
        'Six states. Rejection is not the end: before giving up on a task, the system tries to resize it once.',

    # ---------------------------------------------------------------- fig7 (memoria semantica)
    'O índice gerado responde “o que existe”. O índice por significado responde “isto já foi resolvido aqui?”.':
        'The generated index answers “what exists”. The meaning-based index answers “has this been solved here before?”.',
    'INDEXAÇÃO   (roda ao commitar, fora do caminho do trabalho)':
        'INDEXING   (runs on commit, off the working path)',
    'o material': 'the material',
    'decisões, achados de\nrevisão, tarefas\nconcluídas, o guia': 'decisions, review\nfindings, finished\ntasks, the guide',
    'corte em pedaços': 'split into chunks',
    'por seção e por função,\nnão a cada N letras\n(não parte frase ao meio)':
        'by section and function,\nnot every N characters\n(never mid-sentence)',
    'virar vetores': 'turn into vectors',
    'cada pedaço vira uma\nlista de números, no\npróprio computador': 'each chunk becomes a\nlist of numbers, on\nthis very machine',
    'guardar': 'store',
    'no mesmo banco; acha o\nparecido sem precisar\ncomparar com todos':
        'same database; finds the\nsimilar ones without\ncomparing against all',
    'CONSULTA   (antes de gastar a primeira volta de modelo)':
        'RETRIEVAL   (before spending the first model turn)',
    'a tarefa': 'the task',
    'objetivo, critérios\ne áreas declaradas': 'goal, criteria\nand declared areas',
    'duas buscas juntas': 'two searches at once',
    'por significado (vetor)\n+ por termo exato (texto)': 'by meaning (vector)\n+ by exact term (text)',
    'escolha dos melhores': 'pick the best ones',
    'junta as duas listas\ne fica com os melhores': 'merges both lists\nand keeps the best',
    'vai para o agente': 'goes to the agent',
    'os trechos entram no\nprompt, com a fonte': 'the snippets enter the\nprompt, with their source',
    'OS DOIS ÍNDICES RESPONDEM PERGUNTAS DIFERENTES': 'THE TWO INDEXES ANSWER DIFFERENT QUESTIONS',
    'Índice gerado por script (sem custo de modelo)   →   o que existe e como se chama.   Vai inteiro no prompt, sempre.':
        'Script-generated index (no model cost)   →   what exists and what it is called.   Goes into the prompt in full, always.',
    'Índice por significado (sobre a história do projeto)   →   onde já resolvemos isto e por quê.   Só os melhores trechos, sob demanda.':
        'Meaning-based index (over the project’s history)   →   where we solved this before, and why.   Only the best snippets, on demand.',
    'Um não substitui o outro: o gerado é exato, completo e grátis; o por significado é aproximado e custa transformar a pergunta em vetor.':
        'Neither replaces the other: the generated one is exact, complete and free; the meaning-based one is approximate and costs one embedding per query.',

    # ---------------------------------------------------------------- fig8 (memoria)
    'Cinco memórias, cada uma respondendo a uma pergunta diferente — e nenhuma delas é a conversa.':
        'Five memories, each answering a different question — and none of them is the conversation.',
    'ONDE': 'WHERE',
    'O QUE GUARDA': 'WHAT IT HOLDS',
    'LATÊNCIA': 'LATENCY',
    'CUSTO DE LEITURA': 'COST TO READ',
    'ETS (memória do nó)': 'ETS (node memory)',
    'prefixos montados, contagens de token,\nplano de execução da rodada':
        'assembled prefixes, token counts,\nthe run’s execution plan',
    'microssegundos': 'microseconds',
    'zero': 'zero',
    'PostgreSQL': 'PostgreSQL',
    'tarefas, ciclos, execuções, custo por\ndespacho, decisões, equipe do projeto':
        'tasks, cycles, runs, cost per\ndispatch, decisions, project team',
    'milissegundos': 'milliseconds',
    'pgvector (mesmo banco)': 'pgvector (same database)',
    'o histórico do projeto indexado por\nsignificado — decisões, achados, receitas':
        'the project history indexed by\nmeaning — decisions, findings, recipes',
    'embedding\nda pergunta': 'one embedding\nper query',
    'git (um repo por projeto)': 'git (one repo per project)',
    'o artefato e o diff que o revisor julga;\num commit por tarefa':
        'the artifact and the diff the reviewer\njudges; one commit per task',
    'cache da API (5 min / 1 h)': 'API cache (5 min / 1 h)',
    'o prefixo do prompt, do lado do provedor': 'the prompt prefix, on the provider’s side',
    'na própria\nrequisição': 'within the\nrequest itself',
    '0,1x do preço\nde entrada': '0.1x the input\nprice',
    'A regra que sustenta tudo: se a execução cair agora, a próxima reconstrói o mundo lendo as quatro primeiras linhas desta tabela.':
        'The rule that holds it all together: if this run dies now, the next one rebuilds the world by reading the first four rows of this table.',

    # ---------------------------------------------------------------- fig9 (paralelismo)
    'Paralelismo real: três tarefas independentes, cada uma num processo, cada uma com seu próprio ciclo de vida.':
        'Real parallelism: three independent tasks, each in its own process, each with its own lifecycle.',
    'UMA LINHA SÓ — cada etapa espera a anterior terminar, mesmo quando as tarefas são independentes':
        'A SINGLE LANE — each step waits for the previous one, even when the tasks are independent',
    'T-012 constrói': 'T-012 builds',
    'verifica': 'verifies',
    'revisa': 'reviews',
    'T-013 constrói': 'T-013 builds',
    'linha única': 'single lane',
    'COM PROCESSOS ISOLADOS — três tarefas, três processos, um supervisor acima de todos':
        'WITH ISOLATED PROCESSES — three tasks, three processes, one supervisor above them all',
    'T-012': 'T-012',
    'constrói': 'builds',
    'T-013': 'T-013',
    'T-019': 'T-019',
    'tempo': 'time',
    'A trava que o paralelismo ingênuo ignora: uma entrada de cache só pode ser LIDA depois que a primeira resposta começa a chegar.\nDisparar três despachos idênticos ao mesmo instante faz os três pagarem preço de escrita — o primeiro vai sozinho, os outros seguem atrás.':
        'The catch naive parallelism ignores: a cache entry can only be READ after the first response starts arriving.\nFiring three identical dispatches at once makes all three pay the write price — send the first alone, then the rest.',

    # ---------------------------------------------------------------- fig10 (trilhas)
    'Um campo declarado no projeto escolhe o elenco inteiro — e é a única coisa que o escolhe.':
        'A single field declared in the project picks the entire cast — and it is the only thing that picks it.',
    'domínio declarado no projeto': 'domain declared in the project',
    'software   (o padrão)': 'software   (the default)',
    'planeja': 'plans',
    'planejador': 'planner',
    'construtor (+ reforçado)': 'builder (+ reinforced)',
    'testador': 'tester',
    'revisor': 'reviewer',
    'doutrina: escolha de stack': 'doctrine: choosing the stack',
    'a prova vem de graça: o programa\nroda, e passa ou quebra': 'proof comes for free: the program\nruns, and passes or breaks',
    'qualquer outro domínio': 'any other domain',
    'planejador-genérico': 'generic planner',
    'conferente': 'checker',
    'revisor-genérico': 'generic reviewer',
    'doutrina: artefato + verificador': 'doctrine: artifact + verifier',
    'a prova precisa ser CONSTRUÍDA:\na T-001 instala o verificador':
        'proof must be BUILT:\nthe first task installs the verifier',
    'IDÊNTICO NAS DUAS TRILHAS': 'IDENTICAL IN BOTH TRACKS',
    'máquina de estados · seis estados · dois portões · limite de 3 ciclos · equipe sob demanda · confinamento · estado no banco · árvore de supervisão':
        'state machine · six states · two gates · 3-cycle limit · on-demand team · sandboxing · state in the database · supervision tree',

    # ---------------------------------------------------------------- fig12 (fases)
    'Seis fases. Cada uma termina num marco verificável — e a primeira é a que torna todas as outras testáveis.':
        'Six phases. Each ends on a verifiable milestone — and the first is what makes all the others testable.',
    'F1 · Fundação': 'P1 · Foundation',
    'esqueleto Phoenix,\nEcto e migrações,\nsuíte e CI,\ncliente falso da API':
        'Phoenix skeleton,\nEcto and migrations,\ntest suite and CI,\nfake API client',
    'F2 · Laço de agente': 'P2 · Agent loop',
    'tool use contra a\nMessages API,\ncache_control,\ncusto por volta':
        'tool use against the\nMessages API,\ncache_control,\ncost per turn',
    'F3 · Máquina de estados': 'P3 · State machine',
    'seis estados,\ndois portões,\n3 ciclos, troca\nde modelo': 'six states,\ntwo gates,\n3 cycles, model\nescalation',
    'F4 · Concorrência': 'P4 · Concurrency',
    'supervisão, filas,\nteto de orçamento,\nrecuperação\nde queda': 'supervision, queues,\nbudget caps,\ncrash\nrecovery',
    'F5 · Memória semântica': 'P5 · Semantic memory',
    'ingestão, pgvector,\nbusca híbrida,\navaliação da\nrecuperação': 'ingestion, pgvector,\nhybrid search,\nretrieval\nevaluation',
    'F6 · Painel + genérica': 'P6 · Dashboard + generic',
    'LiveView, telemetria,\nconferente e\nescada de prova': 'LiveView, telemetry,\nchecker and\nproof ladder',
    'a suíte roda\nsem tocar a rede': 'the suite runs\nwithout the network',
    'um agente resolve\numa tarefa real': 'an agent solves\na real task',
    'uma tarefa percorre\nos seis estados': 'a task walks\nall six states',
    'três tarefas em\nparalelo, com teto': 'three tasks in\nparallel, with caps',
    'o agente cita a\ndecisão que já existia': 'the agent cites the\ndecision already made',
    'um projeto inteiro\nsem intervenção': 'a whole project\nwithout intervention',
    'A fase 1 entrega, junto com o esqueleto do sistema, um cliente FALSO da API do modelo.\nSem ele, cada execução da suíte de testes custa dinheiro — e uma suíte que custa dinheiro deixa de ser executada.':
        'Phase 1 ships, along with the system skeleton, a FAKE client for the model API.\nWithout it every test run costs money — and a test suite that costs money stops being run.',

    # ---------------------------------------------------------------- fig13 (agente)
    'Um agente não é um programa: é um papel escrito em texto, mais as ferramentas que ele pode usar e o modelo que o executa.':
        'An agent is not a program: it is a role written in plain text, plus the tools it may use and the model that runs it.',
    'AGENTE  ·  revisor': 'AGENT  ·  reviewer',
    'PAPEL': 'ROLE',
    'o texto que define o que ele faz — e o que\nele nunca faz: aqui, julgar e devolver,\njamais corrigir':
        'the text defining what it does — and what\nit never does: here, judge and send back,\nnever fix',
    'FERRAMENTAS': 'TOOLS',
    'ler arquivo · buscar texto · ver o histórico.\nSem permissão de escrita: não é um pedido,\né uma ausência':
        'read file · search text · view history.\nNo write permission: it is not a request,\nit is an absence',
    'MODELO': 'MODEL',
    'qual capacidade executa este papel —\ne, portanto, quanto custa cada volta':
        'which capability runs this role —\nand therefore what each turn costs',
    'ao ser\nacionado': 'when\ndispatched',
    'EM EXECUÇÃO': 'RUNNING',
    'um trabalho isolado,\ncom prazo, teto de gasto\ne alguém responsável\npor ele':
        'an isolated job,\nwith a deadline, a spending\ncap and someone\naccountable for it',
    'some quando termina': 'disappears when done',
    'Trocar o texto do papel troca o comportamento. É isso que permite ter, no mesmo sistema, quem constrói e quem aprova —\ne garantir que não sejam o mesmo, porque quem aprova sequer tem a ferramenta de escrever.':
        'Changing the role text changes the behaviour. That is what allows builder and approver to coexist in one system —\nand guarantees they are not the same, because the approver does not even have the tool to write.',

    # ---------------------------------------------------------------- fig14 (BEAM)
    'O sistema precisa manter dezenas de trabalhos lentos e falíveis em voo ao mesmo tempo. É esse o problema que a BEAM resolve.':
        'The system must keep dozens of slow, failure-prone jobs in flight at the same time. That is the problem the BEAM solves.',
    'SEM ISOLAMENTO': 'WITHOUT ISOLATION',
    'um processo do sistema operacional carrega todos os trabalhos': 'one operating-system process carries every job',
    'tarefa A': 'task A',
    'tarefa B': 'task B',
    'tarefa C': 'task C',
    'tarefa D': 'task D',
    'erro': 'error',
    'um erro não tratado em B derruba o processo inteiro:\nA, C e D caem junto, e o trabalho delas se perde':
        'an unhandled error in B brings down the whole process:\nA, C and D fall with it, and their work is lost',
    'NA BEAM': 'ON THE BEAM',
    'cada trabalho é um processo próprio, com um supervisor acima': 'each job is its own process, with a supervisor above it',
    'supervisor': 'supervisor',
    'A': 'A',
    'B': 'B',
    'C': 'C',
    'D': 'D',
    'B morre sozinho. O supervisor percebe\ne recoloca a tarefa na fila':
        'B dies alone. The supervisor notices\nand puts the task back in the queue',
    'processo aqui não é o do sistema operacional': 'a process here is not an OS process',
    'pesa poucos KB; criar milhares é rotina': 'it weighs a few KB; thousands are routine',
    'processos não compartilham memória': 'processes share no memory',
    'conversam por mensagem: não há corrida por dado': 'they talk by message: no data races',
    'supervisor é biblioteca, não disciplina': 'a supervisor is a library, not discipline',
    'reinicia o que morreu, sem ninguém pedir': 'it restarts what died, unprompted',

    # ---------------------------------------------------------------- fig15 (tarefa)
    'A tarefa é a unidade de trabalho — e cada campo dela existe para resolver um problema específico.':
        'The task is the unit of work — and every field in it exists to solve a specific problem.',
    'T-014  ·  Tela de propriedades do jogador': 'T-014  ·  Player properties screen',
    'status': 'status',
    'onde ela está agora': 'where it stands right now',
    'prioridade': 'priority',
    'alta': 'high',
    'quem sai da fila primeiro': 'who leaves the queue first',
    'dependências': 'dependencies',
    'T-009, T-011': 'T-009, T-011',
    'só fica pronta quando as duas fecharem': 'only becomes ready once both close',
    'áreas': 'areas',
    'web/propriedades/': 'web/properties/',
    'os arquivos que ela pode tocar': 'the files it is allowed to touch',
    'tentativas': 'attempts',
    'quantas vezes já voltou reprovada': 'how many times it came back rejected',
    'especialista': 'specialist',
    'frontend': 'frontend',
    'quem da equipe a executa': 'who on the team runs it',
    'Objetivo': 'Goal',
    'o que deve existir quando terminar': 'what must exist when it is done',
    'Critérios de aceite': 'Acceptance criteria',
    'comando + resultado esperado, um por linha': 'command + expected result, one per line',
    'Notas de execução': 'Execution notes',
    'escrito por quem constrói': 'written by whoever builds',
    'Verificação / Revisão': 'Verification / Review',
    'escrito pelos portões — nunca por quem constrói': 'written by the gates — never by the builder',
    'resolvem a ORDEM sem\nninguém decidir na hora': 'settle the ORDER without\nanyone deciding on the spot',
    'resolvem o PARALELISMO:\nduas tarefas só rodam juntas\nse não se cruzarem':
        'settle PARALLELISM:\ntwo tasks only run together\nif they do not overlap',
    'resolvem a ESCADA de\nresposta ao fracasso': 'settle the LADDER of\nresponses to failure',
    'seções separadas': 'separate sections',
    'resolvem a SEPARAÇÃO:\nquem constrói não escreve\nonde os portões escrevem':
        'settle SEPARATION:\nthe builder never writes\nwhere the gates write',
    'Tamanho de uma tarefa: de trinta a noventa minutos de trabalho de agente. Maior que isso, o agente se perde;\nmenor, o custo de explicar o contexto para ele passa a dominar a conta.':
        'Task size: thirty to ninety minutes of agent work. Bigger than that and the agent loses the thread;\nsmaller, and the cost of explaining the context starts to dominate the bill.',

    # ---------------------------------------------------------------- fig16 (portoes)
    'Dois portões, duas perguntas diferentes. Nenhum dos dois pode corrigir o que julga.':
        'Two gates, two different questions. Neither of them may fix what it judges.',
    'PORTÃO 1  ·  quem verifica': 'GATE 1  ·  the verifier',
    '“funciona?”': '“does it work?”',
    'o que faz': 'what it does',
    'executa literalmente cada critério\nde aceite e guarda a evidência':
        'literally runs every acceptance\ncriterion and keeps the evidence',
    'o que produz': 'what it produces',
    'PASSOU / FALHOU por critério,\ne como reproduzir a falha': 'PASS / FAIL per criterion,\nand how to reproduce the failure',
    'o que NÃO pode': 'what it CANNOT do',
    'corrigir o que encontrou —\nele reprova e devolve': 'fix what it found —\nit rejects and sends back',
    'PORTÃO 2  ·  quem revisa': 'GATE 2  ·  the reviewer',
    '“é o que foi pedido, e está correto?”': '“is this what was asked, and is it correct?”',
    'mapeia cada critério ao que o cumpre\ne caça defeitos nas mudanças':
        'maps each criterion to what fulfils it\nand hunts defects in the changes',
    'conformidade (cumpre / parcial /\nnão cumpre) + achados com local':
        'conformance (meets / partial /\nfails) + findings with locations',
    'escrever código: a ferramenta\nde escrita não existe para ele': 'write code: the writing tool\ndoes not exist for it',
    'POR QUE DOIS, E NÃO UM SÓ MAIS CAPRICHOSO': 'WHY TWO, INSTEAD OF ONE MORE CAREFUL GATE',
    'As duas perguntas são independentes. Uma entrega pode passar em TODOS os critérios, não ter defeito nenhum — e ainda assim não ser a tarefa.':
        'The two questions are independent. A delivery can pass EVERY criterion, carry no defect at all — and still not be the task.',
    'Isso acontece quando o critério foi mal escrito. Critério frouxo não é licença para entregar outra coisa, e é o portão 2 que pega isso.':
        'That happens when the criterion was written badly. A loose criterion is no licence to deliver something else, and gate 2 is what catches it.',
    'Reprovar por conformidade não exige encontrar nenhum bug — e é por isso que os dois portões não podem ser a mesma pessoa nem o mesmo agente.':
        'Rejecting on conformance requires finding no bug at all — which is why the two gates cannot be the same person or the same agent.',

    # ---------------------------------------------------------------- fig17 (banco)
    'O que o sistema grava. Cada linha nasce dentro de uma transação — ou entra tudo, ou não entra nada.':
        'What the system records. Every row is born inside a transaction — either all of it lands, or none of it does.',
    'projetos': 'projects',
    'nome': 'name',
    'domínio': 'domain',
    'criado_em': 'created_at',
    'tarefas': 'tasks',
    'título · status': 'title · status',
    'dependências · áreas': 'dependencies · areas',
    'especialistas': 'specialists',
    'nome · domínio': 'name · domain',
    'prompt (versionado)': 'prompt (versioned)',
    'trechos': 'snippets',
    'conteúdo': 'content',
    'vetor': 'vector',
    'fonte': 'source',
    'decisões': 'decisions',
    'texto · motivo': 'text · rationale',
    'tarefa de origem': 'originating task',
    'ciclos': 'cycles',
    'número · papel': 'number · role',
    'desfecho': 'outcome',
    'relatório': 'report',
    'execuções': 'runs',
    'modelo · voltas': 'model · turns',
    'tokens (4 tipos)': 'tokens (4 kinds)',
    'custo · duração': 'cost · duration',
    'é aqui que mora o\níndice por significado': 'the meaning\nindex lives here',
    'AS TRÊS PERGUNTAS QUE ESTE ESQUEMA PRECISA RESPONDER SEM REPROCESSAR NADA':
        'THE THREE QUESTIONS THIS SCHEMA MUST ANSWER WITHOUT REPROCESSING ANYTHING',
    '“em que pé está o projeto?”  ·  “por que esta tarefa custou isto, ciclo a ciclo?”  ·  “o que já foi decidido aqui, e por quê?”':
        '“where does the project stand?”  ·  “why did this task cost that, cycle by cycle?”  ·  “what has been decided here, and why?”',
    'Nenhuma delas se responde lendo transcrição de conversa — e é por isso que o estado não mora no processo do agente.':
        'None of them is answered by reading a conversation transcript — which is why state does not live inside the agent’s process.',

    # ---------------------------------------------------------------- fig18 (escada)
    'Fora de software, “verificar” não é uma coisa só. Todo critério fica num de três degraus — e o degrau é declarado.':
        'Outside software, “verifying” is not one single thing. Every criterion sits on one of three rungs — and the rung is declared.',
    '3. JULGADO': '3. JUDGED',
    'avaliação item a item contra uma\nlista de itens objetivos': 'item-by-item assessment against\na list of objective items',
    '“cada seção abre com uma frase-tese”': '“every section opens with a thesis sentence”',
    '2. INSPECIONADO': '2. INSPECTED',
    'um script abre o arquivo entregue\ne afirma fatos sobre ele': 'a script opens the delivered file\nand asserts facts about it',
    'abrir o .pptx e contar: 12 slides': 'open the .pptx and count: 12 slides',
    '1. EXECUTADO': '1. EXECUTED',
    'um comando roda e o resultado\ndele é o veredito': 'a command runs and its output\nis the verdict',
    'rodar os testes: 6 passam': 'run the tests: 6 pass',
    'melhor': 'better',
    'A REGRA, E POR QUE ELA EXISTE': 'THE RULE, AND WHY IT EXISTS',
    'Suba sempre o mais alto possível; descer um degrau é decisão registrada, não conveniência. Quem verifica é obrigado a dizer qual degrau usou.':
        'Always climb as high as possible; stepping down a rung is a recorded decision, not a convenience. The verifier must state which rung it used.',
    'Sem esse rótulo, um projeto pode parecer ter dois portões quando tem um e meio — e ninguém percebe até a entrega sair errada.':
        'Without that label a project can look like it has two gates when it has one and a half — and nobody notices until the delivery comes out wrong.',

    # ---------------------------------------------------------------- fig19 (equipe)
    'A fábrica não tem um programador genérico esperando na fila: a equipe é sintetizada do próprio pedido.':
        'The factory has no generic programmer waiting in the queue: the team is synthesised from the request itself.',
    'o pedido\ndo usuário': 'the user’s\nrequest',
    'lê o pedido e decide de quais domínios\naquele projeto precisa':
        'reads the request and decides which\ndomains that project needs',
    'motor de regras': 'rules engine',
    'server/engine/\nfunções puras, sem I/O': 'server/engine/\npure functions, no I/O',
    'servidor': 'server',
    'server/sockets/\nestado das salas': 'server/sockets/\nroom state',
    'public/\nsem framework, por decisão': 'public/\nno framework, by decision',
    'de 2 a 5 especialistas, com domínio e arquivos próprios': '2 to 5 specialists, each with its own domain and files',
    'T-004': 'T-004',
    '→ motor de regras': '→ rules engine',
    'T-005': 'T-005',
    '→ servidor': '→ server',
    'T-006': 'T-006',
    '→ frontend': '→ frontend',
    'T-007': 'T-007',
    'cada tarefa nasce apontando para quem domina a área que ela toca':
        'every task is born pointing at whoever owns the area it touches',
    'O PROMPT DO ESPECIALISTA É CURTO POR CONSTRUÇÃO': 'THE SPECIALIST PROMPT IS SHORT BY DESIGN',
    'Ele não repete a disciplina de execução (ler a tarefa inteira, corrigir o que foi apontado, commitar) — isso já vem do papel genérico.':
        'It does not repeat the execution discipline (read the whole task, fix what was flagged, commit) — that already comes from the generic role.',
    'Ele carrega só o domínio: quais arquivos são dele, o que já foi decidido e quais armadilhas daquela área já custaram caro.':
        'It carries only the domain: which files are its own, what has already been decided, and which traps in that area have already cost dearly.',

    # ---------------------------------------------------------------- fig20 (contexto)
    'Cada papel recebe um contexto diferente — porque conteúdo que o agente não usa é pior que ausente.':
        'Each role receives a different context — because content the agent never uses is worse than content that is missing.',
    'IGUAL PARA TODOS (e por isso reaproveitável entre despachos)':
        'THE SAME FOR EVERYONE (and therefore reusable across dispatches)',
    'as regras do sistema   ·   o índice do projeto   ·   a tarefa por inteiro':
        'the system rules   ·   the project index   ·   the full task',
    'quem constrói': 'the builder',
    'os arquivos das áreas': 'the files in the areas',
    'que a tarefa declara tocar': 'the task declares it touches',
    'e mais nada do projeto': 'and nothing else',
    'quem verifica': 'the verifier',
    'os critérios de aceite': 'the acceptance criteria',
    'e os comandos para rodá-los': 'and the commands to run them',
    'o resultado da passada': 'plus the mechanical pass',
    'mecânica, já pronto': 'result, already done',
    'quem revisa': 'the reviewer',
    'apenas as mudanças': 'only the changes',
    '(o diff do commit)': '(the commit diff)',
    'nenhum arquivo de fonte': 'no full source file',
    'inteiro': 'at all',
    'POR QUE NÃO MANDAR TUDO PARA TODOS': 'WHY NOT SEND EVERYTHING TO EVERYONE',
    'Porque o contexto é reenviado a cada volta do laço. Um arquivo que o revisor nunca vai abrir não é um desperdício de uma vez:\né um desperdício multiplicado pelo número de voltas daquele despacho.':
        'Because the context is resent on every turn of the loop. A file the reviewer will never open is not wasted once:\nit is wasted once per turn of that dispatch.',

    # ---------------------------------------------------------------- fig21 (projeto)
    'Um projeto de ponta a ponta: o que realmente acontece entre o pedido e a entrega.':
        'A project end to end: what actually happens between the request and the delivery.',
    'pedido': 'request',
    'planejamento': 'planning',
    'plano · equipe · 14 tarefas': 'plan · team · 14 tasks',
    'T-001': 'T-001',
    'fundação': 'foundation',
    'T-002': 'T-002',
    'T-003': 'T-003',
    'REPROVA': 'REJECTS',
    'refaz': 'redoes',
    'três tarefas\nem paralelo': 'three tasks\nin parallel',
    'As três linhas do meio começam juntas porque as áreas que elas declaram tocar não se cruzam — é o que torna o paralelismo seguro.':
        'The three middle lanes start together because the areas they declare do not overlap — that is what makes the parallelism safe.',
    'A barra vermelha é uma reprovação no portão. Ela vira fato registrado, e é ela que autoriza refazer a tarefa com um modelo mais caro.':
        'The red bar is a rejection at the gate. It becomes a recorded fact, and it is what authorises redoing the task with a costlier model.',
    'O QUE O USUÁRIO FAZ NESSE INTERVALO TODO: NADA': 'WHAT THE USER DOES DURING ALL OF THIS: NOTHING',
    'Ele descreve o projeto uma vez, no início, e volta quando o sistema para.':
        'They describe the project once, at the start, and come back when the system stops.',
    'O sistema para sozinho em dois casos: a fila esvaziou, ou o que sobrou depende de uma decisão que ele não pode tomar.':
        'The system stops on its own in two cases: the queue emptied, or what remains depends on a decision it cannot make.',
    'Nos dois casos, o relatório final diz qual é a decisão pendente — nunca “deu erro”.':
        'In both cases the final report names the pending decision — never just “it failed”.',
    'Cada tarefa concluída virou um commit próprio, então o histórico conta o que foi feito e por quê.':
        'Every finished task became its own commit, so the history tells what was done and why.',

    # ---------------------------------------------------------------- fig22 (painel)
    'O painel: uma tela sobre o mesmo banco e o mesmo barramento de eventos que o motor usa.':
        'The dashboard: a screen over the same database and the same event bus the engine uses.',
    'fábrica  ·  banco-imobiliario': 'factory  ·  board-game',
    'gasto da rodada:  US$ 4,18': 'spent this run:  US$ 4.18',
    'backlog  (3)': 'backlog  (3)',
    'T-018  ·  frontend': 'T-018  ·  frontend',
    'T-019  ·  engine': 'T-019  ·  engine',
    'T-020  ·  frontend': 'T-020  ·  frontend',
    'pronta  (2)': 'ready  (2)',
    'T-015  ·  engine': 'T-015  ·  engine',
    'T-016  ·  servidor': 'T-016  ·  server',
    'em execução  (3)': 'in progress  (3)',
    'T-012  ·  engine': 'T-012  ·  engine',
    'T-013  ·  frontend': 'T-013  ·  frontend',
    'T-014  ·  servidor': 'T-014  ·  server',
    'em teste  (1)': 'in verification  (1)',
    'T-011  ·  servidor': 'T-011  ·  server',
    'concluída  (6)': 'done  (6)',
    'T-010  ·  frontend': 'T-010  ·  frontend',
    'T-009  ·  engine': 'T-009  ·  engine',
    'T-008  ·  engine': 'T-008  ·  engine',
    '+ 3 ...': '+ 3 ...',
    'T-013 · construtor · sonnet   volta 7/30   ·   US$ 0,42':
        'T-013 · builder · sonnet   turn 7/30   ·   US$ 0.42',
    '> editando web/propriedades/tabela.ex': '> editing web/properties/table.ex',
    '3 agentes em voo   ·   parar tudo': '3 agents in flight   ·   stop everything',
    'encerra os processos e devolve as tarefas': 'ends the processes and returns the tasks',
    'O PAINEL NÃO É ENFEITE: É O INSTRUMENTO QUE TORNA O CUSTO VISÍVEL ENQUANTO ELE ACONTECE':
        'THE DASHBOARD IS NOT DECORATION: IT IS THE INSTRUMENT THAT MAKES COST VISIBLE AS IT HAPPENS',
    'Listar o que está rodando é consultar o registro de processos, não deduzir de arquivo de log. Parar é encerrar um processo supervisionado,\ne o supervisor devolve a tarefa à fila — não fica trabalho pela metade.':
        'Listing what is running means querying the process registry, not guessing from a log file. Stopping means ending a supervised process,\nand the supervisor returns the task to the queue — no half-finished work is left behind.',
}
