---
id: T-009
titulo: MARCO da v0.1: a suite roda sem rede e sem cota
projeto: fabrica-v2
versao: v0.1
status: backlog
prioridade: alta
dependencias: [T-002, T-003, T-004, T-005, T-006, T-007, T-008]
areas: [_gestao/PROGRESSO.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Verificar, de ponta a ponta, que o marco da v0.1 foi atingido: a suite inteira roda sem
tocar a rede, sem consumir cota e sem chave de API. Registrar o veredito.

## Contexto
Esta e uma tarefa de VERIFICACAO, nao de construcao. Nada de codigo novo — se algo faltar,
abra tarefa corretiva em vez de consertar aqui.

A prova precisa ser adversarial, nao complacente. Tres checagens:

1. **Rode a suite com a rede desligada.** No Windows:
   `Disable-NetAdapter -Name <adaptador> -Confirm:$false`, rode `mix verificar`, reative.
   Se preferir nao mexer na rede, um teste que falha se qualquer modulo HTTP for
   carregado durante a suite serve como equivalente — declare qual dos dois foi usado.
2. **Confirme que nenhuma variavel de ambiente de credencial e lida.** `grep` por
   `ANTHROPIC`, `API_KEY` e `System.get_env` no codigo de producao; toda ocorrencia tem de
   estar atras do adaptador real, nunca no caminho da suite.
3. **Confirme que os cinco estagios de `mix fabrica.ci` passam** na maquina limpa.

Registre em `_gestao/PROGRESSO.md`: a data, qual metodo de prova de rede foi usado, e o
veredito. Se reprovado, liste as causas raiz — uma tarefa corretiva por causa.

## Criterios de aceite
- [ ] A suite inteira passa com a rede indisponivel (ou com o teste equivalente de ausencia de HTTP).
      `verificar: mix verificar`
- [ ] `mix fabrica.ci` passa nos cinco estagios, incluindo `tipos`.
      `verificar: mix fabrica.ci`
- [ ] Nenhuma leitura de credencial acontece no caminho da suite (inspecao do resultado do grep, registrada nas notas).
- [ ] `_gestao/PROGRESSO.md` registra o marco com data, metodo de prova e veredito (inspecionavel).

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

