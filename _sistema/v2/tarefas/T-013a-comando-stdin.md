---
id: T-013a
titulo: O Comando sabe alimentar stdin a partir de um arquivo, sem interpolar nada
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-018b]
areas: [lib/fabrica/ferramentas/comando.ex, test/fabrica/ferramentas/comando_test.exs]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
---

## Objetivo
Dar a `Comando.rodar_separado/3` a opcao de alimentar o `stdin` do processo a partir de um
arquivo, preservando o padrao atual (entrada vinda do vazio) para todo comando que nao pedir
nada.

## Contexto

**Esforco estimado: 30 a 45 min.** Tarefa pequena e de fundacao: ela existe para a T-018d, que
tira o prompt da linha de comando do `ClaudeCLI`. Sem ela, nenhuma tarefa REAL cabe num
despacho — e isso e o marco 1 inteiro.

**O que foi medido (T-020, ciclo 3).** `ClaudeCLI.linha/1` monta a linha por interpolacao de
string e o prompt vai como argumento entre aspas, depois de um `escapar/1` que troca `"` por
`'`. `Comando.escrever_script/4` grava essa linha num `.bat` (Windows) ou `.sh`. Resultado
medido: **prompt multi-linha quebra o script** — exit 255, stdout e stderr vazios,
`{:erro, :saida_ininteligivel}`. O probe do marco so passou porque usou prompt de uma linha, de
proposito; e na segunda volta o texto GERADO pela propria conversa (serializado por `inspect/1`)
quebrou a linha de novo. E a mesma classe de defeito que abriu a T-018a, agora disparada por
conteudo que ninguem digitou.

Um prompt de tarefa real tem quebra de linha, aspas, `&`, `|`, crase e `%VAR%`. Nenhuma
quantidade de escape resolve isso de forma confiavel em dois shells diferentes. **O caminho e
nao interpolar:** o texto vai para um arquivo e o processo o le em `stdin`.

**O que NAO pode regredir.** `escrever_script/4` hoje redireciona `stdin` do vazio (`< nul` no
`.bat`, `< /dev/null` no `.sh`) e isso e deliberado: sem ele o `claude` perde **3 segundos por
chamada** esperando entrada que nunca vem e ainda suja o `stderr` com um aviso — que e
justamente o fluxo que a classificacao de falha da T-026 le. A economia foi medida na T-018a e
esta escrita no proprio `escrever_script/4`. Portanto: **a opcao nova tem padrao `:vazio`**, e o
comportamento de quem nao a usa fica identico.

### O desenho

Uma opcao em `rodar_separado/3`, com dois valores e nada alem:

    entrada: :vazio | {:arquivo, caminho}

`:vazio` e o padrao e mantem `< nul` / `< /dev/null`. `{:arquivo, caminho}` redireciona daquele
arquivo. O caminho passa pelo mesmo tratamento de separador que ja existe para os arquivos de
saida (`para_o_shell/1`) — a armadilha do `cmd` com barra normal esta medida e comentada no
proprio modulo, nao a redescubra.

**Fora de escopo:** `{:texto, ...}` (quem tem o texto que escreva o arquivo — inventar um
segundo caminho aqui e criar duas formas de fazer a mesma coisa), `stdin` por pipe sem arquivo,
e qualquer mudanca em `rodar/4`. Se achar que falta, ANOTE nas Notas e nao mexa.

**A T-018b mediu** se o `claude` aceita o pedido por `stdin` (secao 7 do probe de governanca).
Confira o resultado antes de comecar: se a resposta tiver sido "nao aceita", esta tarefa muda de
justificativa — a opcao continua util, mas quem consome vira outro, e o caso deve ser levantado
como impedimento em vez de resolvido por conta propria.

## Criterios de aceite
- [ ] Um texto com quebras de linha, aspas duplas, `&`, `|`, crase e `%VAR%` chega INTEGRO ao processo pelo `stdin` — byte a byte igual ao arquivo de origem.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] O padrao e `:vazio`: um comando chamado sem a opcao continua com `stdin` vindo do vazio, e ha teste que falha se o redirecionamento sumir.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] `stdout` e `stderr` continuam voltando SEPARADOS quando ha entrada — a garantia da T-013 nao pode ser efeito colateral da opcao nova.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] Arquivo de entrada inexistente devolve erro nomeado, e nao um comando que roda com entrada vazia em silencio.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao
