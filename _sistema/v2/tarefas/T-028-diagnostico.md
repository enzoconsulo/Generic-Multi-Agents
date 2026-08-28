---
id: T-028
titulo: Diagnostico de reprovacao: decidir COMO refazer, nao so que refazer
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-025, T-027]
areas: [lib/fabrica/retrabalho/diagnostico.ex, lib/fabrica/retrabalho/politica.ex, test/fabrica/retrabalho/diagnostico_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Ler a reprovacao, classificar a natureza da falha e derivar a POLITICA do proximo despacho:
qual modelo, quantas voltas, que escopo, e com que foco.

## Contexto
E o mecanismo em que a v1 e mais rica que a documentacao do TCC. A doc descreve a escada
(sobe modelo -> troca especialista -> replaneja -> bloqueia); a v1 tem, alem dela, um
modulo que decide o TAMANHO do retrabalho. Ver `MIGRACAO_V2.md`, secao 3.

Entrada: qual portao reprovou, o veredito de conformidade, os achados com gravidade, e o
impedimento declarado pelo construtor (se houver).

Saida (`Politica`):
  - `modelo` — o do disparo na 1a tentativa; o reforcado da 2a em diante
  - `voltas` — teto ESTREITO para conserto pontual, medio para defeito grave ou falha
    funcional. Um conserto de uma linha nao precisa de 40 voltas
  - `escopo` — so os arquivos apontados, ou a tarefa inteira
  - `foco` — os achados nomeados, em ordem de gravidade, como bloco no despacho

Natureza da falha: `:pontual` (achado de baixa gravidade, arquivo e linha nomeados),
`:funcional` (criterio executavel reprovou), `:conformidade` (entregou outra coisa),
`:impedimento` (o construtor declarou que nao consegue).

`:conformidade` e o caso especial: NAO adianta dar mais voltas nem modelo melhor se a
tarefa entregue e outra. Ele vai direto para escopo inteiro com o objetivo recolocado no
foco.

Modulo PURO. Todo o julgamento mora aqui, e por isso e aqui que os testes sao exaustivos.

## Criterios de aceite
- [ ] Cada natureza de falha produz a politica esperada (um teste por natureza).
      `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs`
- [ ] Achado pontual gera teto de voltas ESTREITO; falha funcional gera teto medio.
      `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs`
- [ ] Reprovacao por conformidade vai para escopo inteiro, com o objetivo no bloco de foco.
      `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs`
- [ ] O bloco de foco lista os achados em ordem de gravidade.
      `verificar: mix test test/fabrica/retrabalho/diagnostico_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

