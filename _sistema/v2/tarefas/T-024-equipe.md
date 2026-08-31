---
id: T-024
titulo: Equipe sob demanda: especialistas versionados e resolucao do construtor
projeto: fabrica-v2
versao: v0.3
status: concluida
prioridade: alta
dependencias: [T-002, T-023]
areas: [lib/fabrica/equipe.ex, lib/fabrica/equipe/resolucao.ex, test/fabrica/equipe/resolucao_test.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-31
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
- [x] A resolucao devolve o especialista quando ele existe, e o generico quando nao existe.
      `verificar: mix test test/fabrica/equipe/resolucao_test.exs`
- [x] Especialista inexistente cai no generico E registra o defeito, em vez de falhar em silencio.
      `verificar: mix test test/fabrica/equipe/resolucao_test.exs`
- [x] Alterar o prompt cria linha nova e marca a anterior inativa; o historico fica consultavel.
      `verificar: mix test test/fabrica/equipe/resolucao_test.exs`
- [x] O prompt do especialista entra em bloco proprio, ao lado do papel generico, no despacho.
      `verificar: mix test test/fabrica/equipe/resolucao_test.exs`

## Notas de execucao

**Dois modulos, pela mesma fronteira das tarefas anteriores.** `Equipe.Resolucao` e pura e se
testa com structs soltas; `Fabrica.Equipe` toca o banco. A separacao paga: a resolucao —
que e a regra — tem 12 testes que rodam sem banco nenhum.

**A resolucao tem duas saidas, e nao tres.** A v1 tem tres passos porque o SDK podia injetar
um subagente pelo nome. Na v2 nao ha a quem oferecer subagente: quem despacha e a maquina de
estados, e ela monta a requisicao inteira. Sobra o passo que a v1 **ja executa em 51 de 51
despachos medidos** — papel generico com o prompt do especialista colado num bloco proprio.

Consequencia de desenho, e ela e o coracao da tarefa: **o especialista SOMA, nunca
substitui.** Nao existe caminho em que ele tome o lugar do papel. A disciplina (commit,
estado, confinamento) vem do papel; um especialista que a substituisse teria de reescreve-la
— que e exatamente o defeito medido na v1, onde os tres especialistas do banco-imobiliario
gastavam ~70% do texto repetindo o construtor. Ha teste afirmando que o papel volta no
resultado inclusive quando ha especialista.

**Onde o bloco entra, e por que isso e decisao de custo.** Na faixa `:doutrina` do
`Prompt.Prefixo` — a faixa 2, que leva ponto de cache. O prompt do especialista e estavel por
projeto e papel, logo pertence a parte que se escreve uma vez e se le muitas. E o outro lado
da moeda dos 70%: texto inchado ali nao e so ruido no prompt, e **escrita de cache paga em
todo despacho**, e a escrita carrega ~50% da conta de entrada.

**Uma decisao que o texto da tarefa nao fecha: a tarefa aponta para uma LINHA, e a linha
envelhece.** `tarefas.especialista_id` referencia uma versao especifica. Se a resolucao usasse
essa linha, uma tarefa planejada ha semanas rodaria com a redacao daquele dia. Resolvi seguir
a referencia ate o **ATIVO de mesmo identificador**: versionar existe para melhorar, e
melhoria que nao alcanca a proxima execucao nao melhorou nada. O historico continua
consultavel em `Equipe.historico/2`, que e o que da sentido a guardar as linhas velhas. Ha
teste nomeando essa escolha.

**"Registra o defeito" foi levado ao pe da letra, e virou teste.** Especialista inexistente
cai no generico com o motivo no valor de retorno **e** um `Logger.warning`. So o retorno nao
bastaria: a fabrica roda sozinha, e defeito que so aparece para quem inspeciona o retorno
some. Ha tres testes — o aviso sai, o texto diz "defeito de planejamento", e a resolucao
BEM-SUCEDIDA nao polui o log (aviso que aparece sempre para de ser lido).

E ha o caso que so o banco revela: **especialista de OUTRO projeto nao atende**. O
`identificador` "banco" pode existir em dois projetos; seguir por id sem conferir o projeto
entregaria o especialista alheio em silencio. E o mesmo defeito que a v1 corrigiu com o nome
qualificado `<projeto>__<id>`.

**As duas escritas de `definir/2` sao uma transacao so.** Entre desativar a anterior e inserir
a nova cabe uma queda, e o estado intermediario e justamente o que o indice parcial proibe.
Pior: a queda depois da desativacao deixaria o projeto **sem especialista ativo nenhum**, e
isso falha em silencio — o despacho seguinte cai no generico e ninguem nota. Ha teste: prompt
invalido devolve erro e a versao anterior continua ativa.

**A regra do `.dialyzer_ignore.exs` rendeu de novo, e de novo o conserto foi trocar a
estrutura.** `definir/2` nasceu com `Ecto.Multi` e trouxe a terceira ocorrencia da opacidade
de `MapSet`. Virou `Repo.transaction(fn -> ... end)`: aqui nao ha o que compor — sao dois
passos fechados —, ao contrario de `Tarefas.Transicao`, que e Multi porque a T-037 vai compor
com ela. A lista de filtros continua com **duas** entradas. A distincao entrou no GUIA:
`Ecto.Multi` quando alguem vai compor; transacao com funcao quando nao.

**Fora do escopo, de proposito:** o escalonamento de modelo por `tentativas` (`-reforcado`).
Esta tarefa responde *quem*, e nao *com quanta forca* — a escada de resposta ao fracasso e a
T-030, e os criterios daqui nao a mencionam.

## Verificacao

**Criterio 1 — a resolucao devolve o especialista quando ele existe, e o generico quando
nao.** `verificar: mix test test/fabrica/equipe/resolucao_test.exs` -> **exit 0**

    22 tests, 0 failures

Sem referencia -> `:generico`; com referencia que existe -> `:especialista`; e o papel volta
no resultado nos tres papeis, sempre.

**Criterio 2 — especialista inexistente cai no generico E registra, em vez de falhar em
silencio.** `verificar: mix test test/fabrica/equipe/resolucao_test.exs` -> **exit 0**

Cinco testes cobrem as cinco formas de nao existir: nao esta entre os ativos, lista vazia,
esta INATIVO (a versao velha nao volta pela porta dos fundos), a linha referenciada sumiu, e e
de outro projeto. E dois testes sobre o registro em si: o aviso sai com o texto certo, e a
resolucao bem-sucedida nao polui o log.

**Criterio 3 — alterar o prompt cria linha nova e marca a anterior inativa; o historico fica
consultavel.** `verificar: mix test test/fabrica/equipe/resolucao_test.exs` -> **exit 0**

Seis testes. O que mais vale prova que **a regra e do ESQUEMA e nao deste modulo**: depois de
tres versoes, inserir uma segunda ativa por fora e recusada pelo indice parcial. E ha o teste
da transacao: prompt invalido nao deixa o projeto sem especialista ativo.

**Criterio 4 — o prompt do especialista entra em bloco proprio, ao lado do papel generico.**
`verificar: mix test test/fabrica/equipe/resolucao_test.exs` -> **exit 0**

Quatro testes: sem especialista sai so `<seu-papel>`; com especialista saem os dois, nesta
ordem (conferida por posicao no texto, nao por presenca); as marcas sao as mesmas da v1, para
o transcript ser comparavel sem tradutor; e o inexistente produz apenas o bloco do papel.

**Bateria completa** — `verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        2.5s
      compilar   ok        2.4s
      lint       ok        5.4s
      testes     ok       22.4s
      tipos      ok       13.6s

    bateria passou: 5 estagio(s) ok, 0 pulado(s)

    2 doctests, 569 tests, 0 failures

Eram 547 antes; a T-024 acrescentou 22.

## Conformidade

Os quatro criterios estao cumpridos. O que a tarefa pediu e que nao e obvio pelos criterios —
**"o prompt do especialista e dominio puro"** — nao e algo que codigo possa impor sozinho, e
por isso esta onde alguem vai ler no momento de escrever um: no `@moduledoc` da `Resolucao`,
com o numero que o justifica (~70% do texto repetido, medido na v1) e com a lista do que
escrever no lugar.

**Uma decisao alem do texto, e ela esta nomeada em teste:** a resolucao segue a referencia da
tarefa ate o especialista **ativo**, e nao ate a linha exata que a tarefa aponta. Se o
comportamento desejado for o oposto — tarefa fixada na versao com que foi planejada — e uma
linha de mudanca, mas mudaria o sentido do versionamento.

**Fora do escopo por decisao, e nao por esquecimento:** escalonamento de modelo por
`tentativas`. E a T-030.

**As `areas` foram ampliadas antes de comecar** para incluir o `GUIA.md`.

## Revisao

Revisao do proprio diff. Achados, todos tratados:

- **Opacidade de `MapSet` via `Ecto.Multi`** em `definir/2` — trocada por transacao com
  funcao, sem crescer a lista de filtros (ver Notas).
- **`Repo.update_all` com retorno descartado** — casado explicitamente
  (`{_desativadas, _} =`), pela mesma regra da T-022a.
- **Um teste meu estava errado:** afirmava erro em `:identificador`, e `unique_constraint/2`
  com lista usa o PRIMEIRO campo como chave, entao o erro cai em `:projeto_id`. Corrigi o
  teste e registrei o motivo nele — a mensagem fala do identificador e o campo e outro, e
  quem for montar formulario a partir disso tropeca.
- **Ruido de log nos testes:** cinco testes disparavam o aviso de defeito e o despejavam na
  saida. Envolvi em `with_log`, e criei o teste dedicado que **verifica** o aviso. Aviso que
  aparece o tempo todo em saida de teste e aviso que ninguem le.

Sem achado de correcao ou seguranca pendente.
