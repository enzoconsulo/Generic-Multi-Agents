---
id: T-020b
titulo: O probe do marco 1 roda verde de ponta a ponta, com prompt de tarefa real
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-018d, T-018e, T-012a, T-017a, T-017b]
areas: [priv/probes/marco_v02_agente.exs, _gestao/PROGRESSO.md, _gestao/GUIA.md]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
---

## Objetivo
Ajustar o probe do marco 1 ao desenho das duas familias de operario, roda-lo verde contra o
`claude` real com um prompt de tarefa REAL, e registrar o desenho novo no `PROGRESSO.md` e no
`GUIA.md`.

## Contexto

**Esforco estimado: 45 a 60 min.** E a tarefa de fechamento do replanejamento: ela deixa o marco
pronto para ser REVERIFICADO. **O veredito do marco continua sendo da T-020**, que segue aberta
— esta tarefa nao a fecha e nao mexe no status dela.

**O que o probe faz hoje** (`priv/probes/marco_v02_agente.exs`, escrito no ciclo 3 do marco):
cria um projeto de mentira em diretorio temporario com README.md + a.txt + b.txt, roda
`Agente.Laco.rodar/1` com `raiz:` apontando para la e `Operario.ClaudeCLI` configurado via
`Application.put_env/3`, pede um `resultado.txt` com uma senha unica, e persiste despacho e
consumos por `Tarefas.Transicao.aplicar/3`. Ele afirma tres coisas, independentes:

1. a tarefa foi resolvida de verdade (o arquivo existe no disco com a senha);
2. ha uma linha em `consumos`, no BANCO, por volta do laco;
3. a soma das linhas gravadas bate com o total acumulado no estado do laco.

Na medicao de 01/09 as afirmacoes **2 e 3 passaram** (1 volta, 95558 = 95558) e a **1 falhou** —
o arquivo nunca foi criado, porque toda escrita era negada por falta de flag de permissao.

**Duas coisas precisam mudar no probe:**

1. **O prompt de uma linha era contorno, e sai.** O comentario dele diz isso: linha unica de
   proposito, porque multi-linha quebrava o `.bat`. A T-018d consertou a causa. O probe passa a
   usar um pedido de tarefa REAL — varias linhas, com aspas duplas e algum `&` —, porque e isso
   que o marco enuncia (*"um agente resolve uma tarefa real"*) e porque um probe que so aguenta
   uma linha esconde de novo o defeito que acabou de ser consertado.
2. **A afirmacao 2 mudou de significado, e o probe tem de dizer isso na cara.** Sob a familia
   `:agente_completo`, uma volta do laco e uma SESSAO inteira do CLI: "uma linha por volta" e
   verdade com N=1. Imprima o numero de voltas do laco AO LADO do numero de turnos internos que
   a sessao teve (contavel pelos blocos e pelos eventos do stream), para que quem le o relatorio
   veja a diferenca em vez de deduzi-la. **Nao mude a afirmacao** — a redacao do marco e
   proposta ao Enzo no `PLANO_V2.md` e a decisao e dele.

**O que registrar, e nao e opcional:**

- **`_gestao/PROGRESSO.md`**, secao da v0.2: as tres causas raiz, o desenho das duas familias, o
  que a governanca do CLI ganhou (permissao, vocabulario por papel, teto, auditoria de caminho)
  e **a lacuna do comando de shell** que a T-012a levantou. Um ajuste sem justificativa
  registrada e indistinguivel de um desvio do plano;
- **`_gestao/GUIA.md`**: a receita *"para acrescentar um adaptador"* precisa passar a mencionar a
  declaracao de familia; a tabela *"ja existe — nao reinvente"* ganha as linhas de
  `Operario.familia/1`, da auditoria de confinamento do stream e da opcao `entrada:` do
  `Comando`. E o unico mecanismo do projeto contra a segunda copia de um helper, e tres helpers
  novos entraram neste lote.

**Nao mexa em `lib/`.** Se o probe falhar por defeito de producao, o conserto e da tarefa dona
do arquivo: anote nas Notas com a evidencia e declare `Impedimento:` se a tarefa dona ja estiver
concluida.

**Consome cota da assinatura; nao gera fatura.** O marco 2 (`MessagesAPI`, cache) nao faz parte
desta tarefa e continua bloqueado por ausencia de chave — nao o tente.

## Criterios de aceite
- [ ] O probe roda de ponta a ponta e imprime `PROBE OK`, com as tres afirmacoes marcadas `ok`.
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] A afirmacao 1 passa com um prompt MULTI-LINHA, com aspas duplas e `&` — e o conteudo do arquivo e conferido por `File.read`, nao pela resposta do modelo.
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] O relatorio impresso mostra, lado a lado, as voltas do laco e os turnos internos da sessao do CLI, para que "uma linha por volta" nao seja lido como mais forte do que e.
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] O probe termina com codigo de saida diferente de zero quando qualquer afirmacao falha (o `System.halt(1)` atual continua valendo apos as mudancas).
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] `_gestao/PROGRESSO.md` registra as tres causas, o desenho das duas familias e a lacuna do comando de shell.
- [ ] `_gestao/GUIA.md` registra a declaracao de familia na receita de adaptador e as tres entradas novas em "ja existe — nao reinvente".
- [ ] Nenhum arquivo de `lib/` foi alterado (saida vazia).
      `verificar: git diff --stat HEAD~1 -- lib`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao
