---
id: T-016
titulo: A ferramenta registrar_resultado, e a ausencia da de mudar estado
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-002, T-015]
areas: [lib/fabrica/ferramentas/registrar_resultado.ex, test/fabrica/ferramentas/registrar_resultado_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
A unica forma de um agente reportar o que fez: uma chamada estruturada que o sistema grava
na transacao. E a garantia, testada, de que nao existe ferramenta de mudar status para
agente nenhum.

## Contexto
Esta e a decisao 6.2 de `MIGRACAO_V2.md`, e ela generaliza uma regra que a v1 ja tinha
pago para descobrir: o protocolo da v1 marca `ultima-reprovacao: # NAO ESCREVA. Campo do
MOTOR`. O sistema conta; o agente nao.

`registrar_resultado` recebe: o que foi feito, arquivos alterados, comandos rodados, hash
do commit, e (opcional) impedimento declarado. Grava em `ciclos.relatorio`. **Nao aceita
campo de status, nem de tentativas.** Se o agente mandar, e ignorado com aviso — nunca
aceito em silencio.

O teste que mais importa aqui e NEGATIVO: varrer o catalogo de ferramentas de todo papel e
falhar se qualquer uma permitir escrever em `tarefas.status` ou `tarefas.tentativas`. E o
equivalente, em codigo, da ausencia da ferramenta de escrever no revisor — impossibilidade,
nao regra pedida.

E lembre o motivo economico: hoje o agente gasta VOLTAS lendo o arquivo da tarefa e
reescrevendo secoes dele. Uma chamada estruturada e uma volta. Volta e o termo dominante
da conta.

## Criterios de aceite
- [ ] `registrar_resultado` grava o relatorio no ciclo corrente, dentro de uma transacao.
      `verificar: mix test test/fabrica/ferramentas/registrar_resultado_test.exs`
- [ ] Campo de status ou de tentativas enviado pelo agente e IGNORADO, com aviso registrado.
      `verificar: mix test test/fabrica/ferramentas/registrar_resultado_test.exs`
- [ ] Teste negativo: nenhuma ferramenta de nenhum papel permite escrever status ou tentativas.
      `verificar: mix test test/fabrica/ferramentas/registrar_resultado_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `6b104c3`. 3 arquivos, 21 testes.

**O que foi feito.** `registrar_resultado.ex` (a unica forma de o agente reportar) e
`catalogo.ex` (quais ferramentas cada papel recebe), com 21 testes.

**O `Catalogo` nao estava pedido nesta tarefa, mas o criterio 3 exige varrer "o catalogo de
ferramentas de todo papel"** — e ele nao existia. Criei-o aqui, e ele carrega tambem a
SEGUNDA ausencia, que e a T-028 nascendo junto: `verificador` e `revisor` nao recebem
`escrever` nem `editar`. Um portao que pode consertar o que reprova deixa de ser portao, e a
tentacao de "so ajustar um detalhe para passar" e exatamente o que os dois existem para
impedir. Deixar essa ausencia para a T-028 significaria escrever o catalogo agora com a
ferramenta errada dentro e tirar depois — e o que nasce presente raramente sai.

**O teste negativo tem cinco frentes**, porque uma so seria facil de contornar sem querer:
nenhum papel com ferramenta de poder `:estado`; o poder `:estado` nao existindo no catalogo
inteiro; nenhuma ferramenta com NOME de mudanca de estado; nenhum modulo de ferramenta
alcancando o schema de `Tarefa`; e a **contraprova** de que o construtor RECEBE escrita — sem
ela, `pode_escrever?` podendo devolver sempre `false` faria os dois testes de ausencia
passarem por vazio.

**Campo do sistema e ignorado COM AVISO, na mesma resposta.** Ignorar em silencio seria pior
que aceitar: o agente seguiria acreditando que mudou o estado, e a divergencia so apareceria
muito depois, sem rastro de onde nasceu. O aviso explica **de quem e o campo**, e nao so que
foi recusado — "o estado e consequencia disso, e nao declaracao sua".

**A lista de campos aceitos e uma ALLOWLIST**, e nao uma lista de proibidos: allowlist recusa
o que ninguem previu; denylist so recusa o que alguem lembrou de proibir. Mas so vira AVISO o
que e sabidamente do sistema — avisar sobre todo campo desconhecido viraria ruido, e ruido
ensina a ignorar aviso.

**`to_existing_atom` e nao `to_atom`** na conversao de chave em string. A tabela de atomos do
runtime nao e coletada: um agente que mandasse mil chaves inventadas derrubaria o no. Ha
teste.

**As secoes do relatorio saem em ordem estavel** porque ele vira markdown COMMITADO (T-032).
Ordem instavel geraria diff onde nada mudou, e diff falso e ruido que ensina a ignorar diff.

**UM DETECTOR MEU ACUSOU O INOCENTE, pela segunda vez nesta versao.** A primeira versao do
teste de fonte procurava a string `tarefas.status` e reprovou o proprio `catalogo.ex` — cujo
`@moduledoc` **enuncia a proibicao**. Um detector que nao distingue codigo de prosa acusa
justamente quem documenta a regra direito. Troquei por uma invariante de codigo mais forte:
**modulo de ferramenta que nunca referencia o schema de `Tarefa` nao tem como escrever status**,
escreva o que escrever na documentacao. E acrescentei o teste do detector, que prova que ele
enxerga a referencia real e ignora a mencao em docstring.

## Verificacao

**Criterio 1 — `registrar_resultado` grava o relatorio no ciclo corrente, dentro de uma
transacao.** `verificar: mix test test/fabrica/ferramentas/registrar_resultado_test.exs` →
**exit 0**

    21 tests, 0 failures

O teste grava resumo, arquivos, comandos e commit, e le de volta do banco. A transacao
(`Ecto.Multi`) existe porque na v0.3 esta gravacao acontece JUNTO com a transicao de estado e
o custo (T-022): fora dela haveria a janela em que o relatorio existe e a transicao nao.

**Criterio 2 — campo de status ou de tentativas enviado pelo agente e IGNORADO, com aviso
registrado.** Sete testes no bloco. `status` e `tentativas` cada um com o seu; o aviso
explicando de quem e o campo; varios campos do sistema gerando um aviso cada; o retorno
trazendo `gravado: true` **e** os avisos juntos; campo desconhecido ignorado sem aviso; e
chave em string funcionando igual a chave em atomo.

**Criterio 3 — teste negativo: nenhuma ferramenta de nenhum papel permite escrever status ou
tentativas.** As cinco frentes descritas nas Notas, mais o teste de que todo papel recebe
`registrar_resultado` (um papel sem ela nao teria como devolver nada) e o de que papel
desconhecido devolve erro em vez de lista vazia — lista vazia seria um agente sem ferramenta
nenhuma rodando em silencio ate estourar o teto de voltas, pelo mesmo custo de um despacho
util.

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    396 mods/funs, found no issues.
    337 tests, 0 failures

## Conformidade


## Revisao
