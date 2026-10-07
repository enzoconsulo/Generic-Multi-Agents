---
id: T-099
titulo: "Windows: os dois testes de link do confinamento caem na máquina de origem — diagnosticar (fuga real ou teste frágil) e consertar"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: alta
dependencias: []
areas: [test/fabrica/ferramentas/confinamento_test.exs, lib/fabrica/ferramentas/confinamento.ex]
tentativas: 0
criada: 2026-10-07
atualizada: 2026-10-07
---

## Objetivo
A suíte volta a passar no Windows (a máquina de origem, onde o painel roda o pipeline) sem
afrouxar nenhuma garantia do confinamento: os testes de link provam o que dizem provar, ou o
código é consertado se a falha for uma fuga real.

## Contexto
Primeira bateria no Windows desde as tarefas de portabilidade e confinamento feitas na nuvem
(T-079/T-080/T-081/T-082/T-083, que o PROGRESSO já avisava: "a próxima bateria naquela máquina é a
primeira prova deles"). Rodada pelo orquestrador em 2026-10-07, HEAD `88c92aa`:
`mix test` → **1293 testes, 2 falhas, 5 skipped**, as duas em `confinamento_test.exs`:

1. `:300` — "ciclo de links e recusado, sem travar a resolucao" (describe "escape 6", T-080):
   `Confinamento.resolver(raiz, "ciclo-a/x/y.txt")` devolveu `{:ok, ".../ciclo-a/x/y.txt"}` em vez de
   `{:erro, :fora_do_confinamento}`. No Windows, `criar_link/2` usa `mklink /J` (junção). Ou as
   junções do ciclo foram criadas e `real/1` NÃO as segue no Windows (então junção não é tratada
   como link — **possível fuga real**: uma junção para fora seria aceita), ou a criação falhou e o
   teste não percebeu.
2. `:141` — "recusa link cujo DESTINO esta fora" (describe "escape 3"): `criar_link(fora, atalho)`
   devolveu `{:error, :sem_link}` — o `mklink /J` saiu ≠ 0 nesta máquina.

**Diagnostique antes de mexer** (rode o arquivo isolado; reproduza à mão com `mklink /J` num diretório
temporário; confira o que `File.read_link/1` e `File.lstat/1` devolvem para uma junção no OTP 28).
Registre nas Notas qual dos casos é. Se junção não é seguida por `real/1`, o conserto é em
`confinamento.ex` (junção é link para efeito de confinamento) e vem com teste que FALHA sem ele. Se é
só o ambiente sem permissão, o teste pula com sonda explícita (mesmo padrão do `@sem_link_relativo`
já existente no arquivo, linha ~352) — nunca passa em silêncio sem ter criado o link.

Por que é alta: no Windows o estágio `testes` da bateria cai em TODA tarefa enquanto isso existir, e
o motor lê isso como entrega reprovada — reprovação falsa, o desperdício mais caro do sistema.
Não regredir o Linux: os ramos unix dos testes continuam rodando lá.

## Critérios de aceite
- [ ] O arquivo de testes do confinamento passa no Windows, e as Notas dizem qual foi a causa
      (junção não seguida pelo código, ou criação de link falhando no ambiente) com a evidência.
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] Se a causa for no código: um teste novo cria uma junção para FORA da raiz e afirma
      `{:erro, :fora_do_confinamento}`; ele falha sem o conserto (mutação registrada nas Notas).
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] Bateria completa verde nesta máquina.
      `verificar: mix fabrica.ci`

## Notas de execução


## Verificação


## Conformidade


## Revisão
