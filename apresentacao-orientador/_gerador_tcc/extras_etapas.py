# -*- coding: utf-8 -*-
"""Páginas extras por etapa no documento de apresentação: conceitos e figuras explicativas.

Cada figura: (título, subtítulo, arquivo em figs/, altura máxima em cm, [frases curtas]).
Etapas sem entrada aqui saem sem as páginas extras.
"""

EXTRAS = {
    2: {
        "conceitos": [
            ("Behaviour (interface)", "Lista de funções que um módulo promete implementar — como uma interface em Java. O núcleo depende dela, nunca de um fornecedor específico."),
            ("Substituto falso", "Implementação simples e previsível da interface, sem rede e sem custo, usada nos testes. Diferente de um mock, ela funciona de verdade."),
            ("Embedder", "Transforma texto em um vetor de números para buscar textos parecidos por significado. Será usado pela memória do projeto (E6)."),
            ("Token e cota", "O modelo de IA cobra por token (pedaço de texto). Sob assinatura, o limite é a cota de uso; por isso o custo é contado nas duas unidades."),
            ("Migração", "Script versionado que cria as tabelas. Rodar as migrações em ordem reconstrói o banco do zero."),
            ("pg_dump / pg_restore", "Ferramentas do PostgreSQL: a primeira copia o banco inteiro para um arquivo; a segunda reconstrói o banco a partir dele."),
            ("Teste do marco", "Arquivo de testes automáticos que prova a entrega combinada da etapa e roda em toda verificação."),
        ],
        "figuras": [
            ("O banco de dados", "As 9 tabelas. O custo é gravado em usages, uma linha por volta do modelo.", "E2-er-simples.png", 9.5,
             ["usages guarda, por volta: tokens de entrada, lidos do cache, escritos no cache, de saída, custo em dólar e em cota.",
              "tasks guarda código, status (só os estados válidos — o banco recusa valor inventado) e tentativas.",
              "Cada retrabalho vira um ciclo novo em cycles: o custo de cada tentativa fica separado."]),
            ("Do trabalho ao custo", "Tarefa → ciclos → chamadas ao modelo → voltas. Somando as voltas, sai o custo de tudo acima.", "E2-hierarquia.png", 7.5,
             ["Custo de cada volta em dólar (tokens × preço; leitura de cache custa 10%) e em cota (1 unidade = mil tokens do modelo mais barato).",
              "Modelo sem preço cadastrado gera erro — nunca um zero silencioso."]),
            ("A tomada: fronteiras com o modelo", "O núcleo conhece só a interface. Atrás dela, nos testes, fica o substituto falso; na E3, os fornecedores reais.", "E2-tomada.png", 7.5,
             ["Provider: conversa com o modelo de IA. Embedder: transforma texto em números para a memória (E6).",
              "Por que falsos: o modelo real custa, depende da internet e responde diferente a cada vez; o falso é grátis, local e previsível."]),
            ("Cópia de segurança", "pg_dump copia o banco para um arquivo datado; pg_restore reconstrói o banco a partir dele.", "E2-backup.png", 4.0,
             ["O teste grava uma tarefa, faz o backup, apaga tudo, restaura e confere que voltou idêntica — duas vezes seguidas.",
              "Roda separado dos outros testes porque restaurar apaga e recria as tabelas."]),
        ],
        "req_override": {"R15": ("parcial", "fronteira pronta; a troca real de fornecedor se prova na E3")},
        "marco_passos": [
            "Algo sai da máquina? Toda requisição HTTP passa por um porteiro que explode nos testes — o teste tenta chamar a API real e confere a explosão. Nenhuma outra biblioteca de rede está carregada e nenhum código abre conexão por baixo.",
            "Dá para gastar cota ou existe senha? Nenhum código lê variáveis de ambiente nem cita o nome da chave; nenhum arquivo contém algo com formato de chave; as variáveis de chave nem existem no ambiente dos testes.",
            "Os testes usam os substitutos? O Provider e o Embedder configurados são os falsos, e nenhuma biblioteca de modelo de IA local está carregada.",
        ],
        "marco_fig": ("E2-marco.png", 3.6,
                      "O arquivo test/factory/milestone_e2_test.exs é um teste automático cuja missão é provar a entrega da etapa. "
                      "Ele faz três perguntas e roda em toda verificação: se alguém abrir caminho para a internet ou para uma senha, ele quebra."),
    },
}
