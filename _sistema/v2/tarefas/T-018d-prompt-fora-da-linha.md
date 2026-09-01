---
id: T-018d
titulo: O prompt do ClaudeCLI sai da linha de comando
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-013a, T-018c]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, priv/probes/cli_real.exs]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
---

## Objetivo
Fazer o texto da conversa viajar ate o `claude` por `stdin`, a partir de um arquivo, em vez de
ser interpolado na linha de comando — para que um prompt de tarefa real, com quebras de linha e
pontuacao de shell, chegue integro.

## Codigo de bloqueio
Sem esta tarefa o `ClaudeCLI` so aguenta pedido de uma linha. O marco 1 pede um agente
resolvendo uma tarefa REAL, e o despacho de uma tarefa real e multi-linha por construcao.

## Contexto

**Esforco estimado: 45 a 60 min.** Consome a opcao `entrada:` que a T-013a acrescentou ao
`Comando`; sem ela esta tarefa nao tem como ser feita.

**O que foi medido (T-020, ciclo 3).** Duas corridas contra o `claude` real: a primeira com
prompt multi-linha devolveu exit 255, stdout e stderr **vazios**, `{:erro,
:saida_ininteligivel}`; a segunda, com prompt de uma linha, funcionou. A causa esta em
`ClaudeCLI.linha/1`, que monta

    <executavel> --print --verbose --output-format stream-json --model <m> "<prompt>"

por interpolacao de string, depois de um `escapar/1` que troca `"` por `'`. Duas coisas erradas
ao mesmo tempo: a quebra de linha desmonta o `.bat` gerado por `Comando.escrever_script/4`, e o
`escapar/1` **corrompe o pedido em silencio** — trocar aspas altera o texto que o modelo le, e
ninguem fica sabendo. Na segunda volta do laco o defeito reapareceu sozinho, disparado pelo
historico serializado por `inspect/1`: conteudo que ninguem digitou.

### O desenho

1. `ClaudeCLI` escreve o texto da conversa num arquivo temporario (mesma disciplina de
   temporario que o `Comando` ja usa: nome unico por `System.unique_integer/1`, apagado depois).
2. A linha passa a ser **constante em relacao ao conteudo da conversa** — so executavel, flags e
   modelo. Nenhum pedaco do prompt aparece nela.
3. A chamada usa `entrada: {:arquivo, caminho}` de `Comando.rodar_separado/3`.
4. `escapar/1` **desaparece**. Nao ha mais o que escapar, e mante-lo seria manter a corrupcao.
5. O temporario e apagado mesmo quando a chamada falha.

**A T-018b (secao 7) mediu** se o `claude` aceita o pedido por `stdin` e com qual grafia. Copie
dali. Se a medicao tiver dito que nao aceita, **declare `Impedimento:` nas Notas** em vez de
inventar um contorno — a tarefa muda de desenho e quem decide isso e o planejador.

**Fora de escopo:** mudar `texto_da_mensagem/1` para um formato de historico melhor (o
`inspect/1` de bloco estruturado e feio, mas e outro problema, e mexer nele aqui mistura duas
mudancas num diff so), tocar em `Comando` (a T-013a ja fez o que era preciso) e qualquer flag
nova. Se achar que falta, ANOTE.

**Prove contra o real.** `priv/probes/cli_real.exs` e o probe do adaptador — estenda-o com um
caso de prompt multi-linha contendo aspas duplas e `&`, que e exatamente o que quebrava. Ele
consome cota da assinatura e nao gera fatura.

## Criterios de aceite
- [ ] A linha montada por `ClaudeCLI` nao contem nenhum pedaco do texto da conversa: dois prompts completamente diferentes produzem a MESMA linha.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Um prompt com quebras de linha, aspas duplas e `&` chega integro — o teste compara o conteudo do arquivo de entrada com o texto pedido, byte a byte.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Uma sessao REAL com prompt multi-linha (o caso que devolvia exit 255 com stdout e stderr vazios) devolve `{:ok, %Resposta{}}` com consumo preenchido.
      `verificar: mix run priv/probes/cli_real.exs`
- [ ] `escapar/1` nao existe mais em `lib/`, e nenhuma outra funcao substitui aspas do prompt.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] O arquivo temporario e apagado tambem quando a chamada falha (teste com executavel inexistente ou prazo estourado).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao
