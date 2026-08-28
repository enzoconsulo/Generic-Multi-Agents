---
id: T-023
titulo: Equipe sob demanda: especialistas versionados e resolucao do construtor
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-002, T-022]
areas: [lib/fabrica/equipe.ex, lib/fabrica/equipe/resolucao.ex, test/fabrica/equipe/resolucao_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Os especialistas do projeto como dado versionado no banco, e a resolucao deterministica de
QUEM executa cada tarefa.

## Contexto
A v1 chama isto de "provavelmente o coracao do sistema": a fabrica nao tem um programador
generico esperando na fila — o planejador sintetiza 2 a 5 especialistas a partir do proprio
pedido, e cada tarefa nasce apontando para o da area que ela toca.

Resolucao, em ordem: especialista da tarefa -> generico do papel. Como na v2 nao existe
mecanismo de subagente (o despacho e montado pela maquina de estados), o prompt do
especialista entra num bloco proprio ao lado do papel generico — que e exatamente o que a
v1 faz, e o unico caminho que ela executa de fato.

O PROMPT DO ESPECIALISTA E DOMINIO PURO. Nao repete commit, status, confinamento nem "leia
o protocolo" — isso ja vem do papel generico. Medido na v1: os especialistas gastavam ~70%
do texto repetindo o construtor. Escreva so o que o generico nao teria como saber: arquivos
da area, invariantes, o comando que prova um criterio dela, e as armadilhas ja pagas.

VERSIONADO: alterar o prompt cria linha nova em `especialistas`, com o anterior marcado
inativo. E isso que permite comparar o desempenho do mesmo especialista antes e depois.

Especialista referenciado que nao existe: use o generico E REGISTRE — apontar para
especialista inexistente e defeito de planejamento que so aparece se alguem escrever.

## Criterios de aceite
- [ ] A resolucao devolve o especialista quando ele existe, e o generico quando nao existe.
      `verificar: mix test test/fabrica/equipe/resolucao_test.exs`
- [ ] Especialista inexistente cai no generico E registra o defeito, em vez de falhar em silencio.
      `verificar: mix test test/fabrica/equipe/resolucao_test.exs`
- [ ] Alterar o prompt cria linha nova e marca a anterior inativa; o historico fica consultavel.
      `verificar: mix test test/fabrica/equipe/resolucao_test.exs`
- [ ] O prompt do especialista entra em bloco proprio, ao lado do papel generico, no despacho.
      `verificar: mix test test/fabrica/equipe/resolucao_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

