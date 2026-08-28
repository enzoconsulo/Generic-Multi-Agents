---
id: T-042
titulo: ABERTURA da v0.5: decidir o embedding com medicao, nao com palpite
projeto: fabrica-v2
versao: v0.5
status: backlog
prioridade: alta
dependencias: [T-041]
areas: [_gestao/PROGRESSO.md, _gestao/DECISOES.md, _sistema/v2/tarefas]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Antes de construir a memoria semantica, tomar a unica decisao de ambiente que ficou em
aberto — embedding local ou por servico — com medicao na maquina real. Nenhum codigo de
producao.

## Contexto
A v0.5 esta no ESCOPO FIRME da entrega (decisao do Enzo, 28/08/2026). O que continua aberto
e COMO o embedding roda, e essa e a unica peca pesada do desenho inteiro: o perfil alvo
declarado da v2 e 8 GB de RAM.

**Releia:** `_sistema/PLANO_V2.md` secao 2 (o requisito de maquina), `_sistema/AMBIENTE_V2.md`
secao 4 (o que ja foi medido de pgvector), e `_sistema/MIGRACAO_V2.md` secao 5.

**Confira e decida:**

  1. **O pgvector ainda esta de pe nesta maquina?** Rode
     `_sistema/ferramentas/banco-v2.ps1 conferir`. Se for uma maquina nova, monte o ambiente
     antes — `AMBIENTE_V2.md`, secao "Ordem no PC novo".
  2. **MECA o modelo local antes de escolher.** Baixe o modelo de 384 dimensoes candidato,
     carregue com Bumblebee, e anote: tamanho em disco, memoria residente, e tempo para
     vetorizar 1.000 trechos em lote. Um MiniLM de 384 dim costuma caber com folga em 8 GB —
     mas "costuma" nao e medicao. **Se couber, `Embedder.Local` e o padrao**: e gratis,
     offline, e nao manda o conteudo do projeto para fora.
  3. **Se nao couber, `Embedder.Servico` vira o padrao** — e ai ha custo externo por chamada,
     que precisa ser dito ao Enzo ANTES de comecar, nao depois.
  4. **Ha corpus suficiente para indexar?** A T-033 importou as 89 tarefas da v1. Confira
     quantos trechos isso gera de verdade. Se forem poucas centenas, a avaliacao de
     recuperacao (T-044) precisa de um conjunto de perguntas menor e mais honesto — e vale
     dizer isso em vez de fabricar um numero bonito.
  5. **Releia o risco declarado:** recuperacao que traz trecho inutil piora a resposta em vez
     de melhorar. A regra ja esta na T-044 e nao se negocia: **recuperacao abaixo da linha de
     base DESLIGA o bloco de contexto**, nao apenas avisa.

**Registre a decisao em `_gestao/DECISOES.md`** com os numeros medidos — e nao so a escolha.
Decisao sem o numero que a motivou vira palpite na leitura seguinte.

## Criterios de aceite
- [ ] `banco-v2.ps1 conferir` imprime `pgvector operante` nesta maquina.
- [ ] O modelo local foi MEDIDO (disco, memoria residente, tempo por 1.000 trechos) e os numeros estao registrados.
- [ ] A escolha local vs. servico esta em `_gestao/DECISOES.md` com os numeros que a motivaram.
- [ ] O tamanho real do corpus importado foi contado, e a T-044 ajustada se ele for pequeno.

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

