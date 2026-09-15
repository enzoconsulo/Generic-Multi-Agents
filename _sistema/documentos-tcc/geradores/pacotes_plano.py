# -*- coding: utf-8 -*-
"""Os PACOTES DE TRABALHO de cada etapa — a WBS do plano.

Sao a mesma decomposicao que aparece na coluna "O que sera feito" da tabela do
cronograma (o CONTEUDO, em plano_corpo.py), so que em rotulo curto, para caber na
figura em arvore. **Mexeu num, mexa no outro.**

Numeracao: E3.1, E3.2 ... — estende a sigla das etapas, em vez de criar uma nova.
A WBS para no pacote de trabalho; as tarefas ficam abaixo disso, no repositorio.

Limite pratico do rotulo: 21 caracteres. Mais que isso vaza da coluna do cartao na
figura, que a conferencia automatica nao consegue enxergar (figura e imagem).
"""

PACOTES = {
    1: ["Requisitos", "Estado da arte", "Arquitetura", "Tarefas e critérios"],
    2: ["Ambiente", "Banco e custo", "Fronteiras", "Cópia de segurança"],
    3: ["Ferramentas", "Confinamento", "Agente supervisionado", "Adaptadores"],
    4: ["Seis estados", "Fila e equipe", "Critérios de aceite", "Os dois portões",
        "Diagnóstico"],
    5: ["Supervisão", "Fila durável", "Paralelismo", "Limite de uso", "Recuperação"],
    6: ["Medição da busca", "Histórico", "Busca híbrida", "Contexto com fonte",
        "Avaliação"],
    7: ["Medidas de execução", "Quadro e console", "Parar e retomar",
        "Rodadas automáticas", "Segredos"],
    8: ["Projetos de teste", "Medição", "Máquina de 8 GB", "Falhas provocadas"],
    9: ["Correções", "Ajuste de desenho", "Nova medição"],
    10: ["Último ciclo", "Versão congelada", "Medição final", "Documento de entrega"],
}

LARGOS = [(n, r) for n, rs in PACOTES.items() for r in rs if len(r) > 21]
if LARGOS:
    raise SystemExit("Rotulo de pacote longo demais para o cartao da WBS (max 21): %s"
                     % ", ".join("E%d '%s' (%d)" % (n, r, len(r)) for n, r in LARGOS))
