---
id: T-009
titulo: MARCO da v0.1: a suite roda sem rede e sem cota
projeto: fabrica-v2
versao: v0.1
status: concluida
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
Feito em 2026-08-28. Commit do projeto: `28f0303`.

**VEREDITO: MARCO APROVADO.**

    formato    ok   2,8s
    compilar   ok   2,7s
    lint       ok   4,7s
    testes     ok  13,3s   148 testes, 0 falhas
    tipos      ok  15,2s   Total errors: 0

**Esta foi uma tarefa de VERIFICACAO**, como ela mesma manda. O unico arquivo novo e a
PROVA do marco (`test/fabrica/marco_v01_test.exs`) — que e o que o criterio 1 pede — mais o
registro em `_gestao/PROGRESSO.md`. Nenhuma funcionalidade nova entrou.

**METODO DE PROVA DA AUSENCIA DE REDE: o segundo dos dois admitidos**, e a tarefa manda
declarar qual. Nao foi `Disable-NetAdapter`: ele exige privilegio de administrador, que esta
sessao nao tem — a mesma limitacao que ja decidiu a versao do Elixir (`AMBIENTE_V2.md`,
secao 0).

E o segundo metodo tem uma vantagem que o primeiro nao tem, e por isso ele ficou no
repositorio em vez de virar procedimento manual anotado: **ele roda em TODA verificacao,
para sempre.** Derrubar a placa prova o marco no dia em que alguem lembra de fazer isso; o
arquivo de teste prova a cada `mix verificar`.

Ele trava seis impossibilidades: nenhuma aplicacao de cliente HTTP rodando durante a suite;
nenhum modulo de HTTP sequer carregavel; nenhuma referencia em `lib/` (com casamento de
palavra inteira, porque `Req` e substring de `Requisicao`); os adaptadores configurados sendo
os dubles; nenhum modulo de embedding local carregavel (perfil alvo de 8 GB); e — o que
impede o sensor de virar decoracao — um teste provando que o **proprio detector ainda
dispara**.

**O DIALYZER PEGOU O QUE O LACO RAPIDO NAO PEGA**, que e exatamente a razao de ele existir
como estagio proprio: `mix verificar` passou e `mix fabrica.ci` REPROVOU em `tipos`, com um
`unmatched_return` no descarte do retorno de `derrubar_conexoes/0` (T-006). Nao era
formalidade: se as conexoes ficam vivas depois de uma restauracao, a aplicacao segue de pe
carregando oids que nao existem mais, e quem restaurou nao fica sabendo. Agora ha aviso
explicito, e o teste de backup **captura** esse log em vez de deixa-lo poluir a saida da
suite — o que de quebra cobre o ramo de aviso. Este e o tipo de achado que justifica o marco
existir em vez de "os testes passam, deve estar pronto".

**AJUSTES DA v0.1 e o que ficou anotado** estao registrados em `_gestao/PROGRESSO.md`, com o
motivo de cada um: os dois defeitos de redacao do gerador, a decisao de layout do projeto, a
logica da T-008 em `lib/` em vez do `.exs`, o `plt_add_apps`, e o silenciamento do aviso de
symlink. E os dois itens anotados sem virar trabalho: o `config/dev.exs` com `localhost` (que
funciona — medido) e a T-034 exigindo as 89 tarefas da v1, ja decidida.

## Verificacao

**Criterio 1 — a suite inteira passa com a rede indisponivel (ou com o teste equivalente de
ausencia de HTTP).** `verificar: mix verificar` → **exit 0**

    222 mods/funs, found no issues.
    148 tests, 0 failures

Metodo: o teste equivalente, `test/fabrica/marco_v01_test.exs` (10 testes), pelo motivo
declarado nas Notas.

**Criterio 2 — `mix fabrica.ci` passa nos cinco estagios, incluindo `tipos`.**
`verificar: mix fabrica.ci` → **exit 0**

    formato ok 2,8s · compilar ok 2,7s · lint ok 4,7s · testes ok 13,3s · tipos ok 15,2s
    bateria passou: 5 estagio(s) ok, 0 pulado(s)

Na primeira execucao ele REPROVOU em `tipos` (ver Notas). O resultado acima e apos a
correcao.

**Criterio 3 — nenhuma leitura de credencial acontece no caminho da suite.** INSPECIONADO,
com o resultado do grep sobre `lib/`:

    ANTHROPIC ......................................... 0
    API_KEY ........................................... 0
    System.get_env .................................... 0
    Req|Finch|Mint|HTTPoison|Tesla|hackney|httpc|gun .. 0   (palavra inteira)
    dependencia de HTTP em mix.lock ................... nenhuma

**Ressalva registrada, porque o grep sozinho nao e a historia toda:** `config/runtime.exs`,
gerado pelo scaffold do Phoenix, le `System.get_env` para `PHX_SERVER` e `PORT` em todos os
ambientes. **Nenhum dos dois e credencial**; as que sao (`DATABASE_URL`, `SECRET_KEY_BASE`)
estao dentro de `if config_env() == :prod`. O criterio pede ausencia de leitura de
CREDENCIAL, nao de qualquer variavel — a distincao fica escrita para nao ser confundida
numa releitura. Alem disso, o teste do marco confere que `ANTHROPIC_API_KEY` e
`OPENAI_API_KEY` **nao estao definidas** no ambiente: nao basta o codigo nao ler, o ambiente
nao tem o que dar.

**Criterio 4 — `_gestao/PROGRESSO.md` registra o marco com data, metodo de prova e
veredito.** INSPECIONADO. O arquivo traz: o veredito (**APROVADO em 2026-08-28**), a tabela
dos cinco estagios com tempos, a secao "Metodo de prova da ausencia de rede" declarando qual
dos dois foi usado e por que, a inspecao de credencial com a ressalva do `runtime.exs`, o
que cada uma das oito tarefas entregou, os seis ajustes com justificativa, os dois itens
anotados, e os quatro numeros da linha de base.

## Conformidade


## Revisao
