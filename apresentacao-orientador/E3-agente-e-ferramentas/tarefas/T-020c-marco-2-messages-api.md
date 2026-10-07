---
id: T-020c
titulo: "MARCO 2 da v0.2, adiado para o fim: o prefixo escrito uma vez, medido com a Messages API"
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: baixa
dependencias: [T-058]
areas: [_gestao/PROGRESSO.md, priv/probes/marco_v02_agente.exs]
tentativas: 0
replanejada-de: T-020
criada: 2026-09-13
atualizada: 2026-09-13
---

## Objetivo
Medir o marco 2 da v0.2 — o prefixo do projeto e escrito UMA vez e LIDO pelos despachos
seguintes — com o `Operario.MessagesAPI`, e decidir com o numero se a Messages API se justifica.

## Contexto
**Extraida da T-020 em 2026-09-13, por decisao do Enzo** (`_gestao/DECISOES.md`, D-002): por
enquanto o unico operario suportado e o `Operario.ClaudeCLI`, rodando no plano de assinatura, e
nenhuma `ANTHROPIC_API_KEY` sera criada agora. Tudo o que depende de chave de API foi para o fim
do plano — por isso esta tarefa depende da T-058 (marco da v1.0). O `Operario.MessagesAPI`
(T-019) continua no codigo e na suite, testado sem rede, mas fora de uso.

Os criterios abaixo sao os criterios 2 a 4 da T-020, copiados sem alteracao. O "como fazer"
continua na secao Contexto da T-020 (bloco "Marco 2"): dois despachos seguidos no mesmo projeto,
comparando `cache_creation_input_tokens` e `cache_read_input_tokens`; se o segundo tambem
escrever o prefixo, ha invalidador silencioso, e o diagnostico e diffar os bytes do prefixo
entre as duas requisicoes.

**Custa dinheiro de verdade** — e o unico ponto do plano que usa chave de API. Estime antes,
declare o teto (o de US$ 2 foi autorizado em 01/09; reconfirme com o Enzo antes de rodar) e
registre o gasto real ao lado do veredito.

**Nao despache sem o Enzo confirmar que a chave existe.** O motor promove esta tarefa sozinho
quando a T-058 concluir; sem a chave, o despacho so reproduz o bloqueio e queima uma tentativa.

## Criterios de aceite
- [ ] Dois despachos seguidos no mesmo projeto: o segundo LE o prefixo em vez de escrever (numeros registrados).
- [ ] O gasto real do marco 2 esta registrado em `_gestao/PROGRESSO.md`, com o teto declarado antes.
- [ ] O veredito compara com a linha de base da T-008 e diz explicitamente se o `MessagesAPI` se justifica.

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

