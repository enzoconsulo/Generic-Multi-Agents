---
id: T-013
titulo: Ferramenta de comando, com prazo e morte da ARVORE de processos
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-012]
areas: [lib/fabrica/ferramentas/comando.ex, lib/fabrica/ferramentas/arvore_processos.ex, test/fabrica/ferramentas/comando_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Executar um comando externo no diretorio do projeto, com prazo, captura de saida e —
o ponto dificil — encerramento da ARVORE de processos, nao so do processo lancado.

## Contexto
ARMADILHA MEDIDA NA v1: matar o processo lancado nao mata os filhos dele. A suite de um
projeto Node deixou OITO `node.exe` orfaos por estouro de prazo, numa maquina com 1,3 GB
livres. A v1 resolveu isso com `encerrarArvore(pid)`; a v2 precisa do equivalente.

No Windows: `taskkill /PID <pid> /T /F` (o `/T` e a arvore). No Unix: matar o grupo de
processos (`:erlang.open_port` com `:spawn_executable` e um wrapper `setsid`). Detecte a
plataforma e teste a que a maquina atual roda; a outra fica com teste marcado para pular.

Capture stdout e stderr SEPARADOS. Juntar os dois e o que faz o diagnostico da v0.3 nao
conseguir distinguir "o comando esta quebrado" de "a entrega falhou".

O resultado devolvido carrega: codigo de saida, stdout, stderr, duracao, e o motivo do
encerramento (`:normal` | `:prazo` | `:cancelado`). O motivo importa: prazo estourado NAO
e a mesma coisa que teste reprovado, e a v0.3 depende dessa distincao.

Prazo padrao de 2 minutos por comando, configuravel por chamada.

## Criterios de aceite
- [ ] Um comando que passa do prazo e encerrado e devolve motivo `:prazo`, nao `:normal`.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] stdout e stderr voltam SEPARADOS (teste com comando que escreve nos dois).
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] Encerrar um comando que lancou um filho mata TAMBEM o filho (teste que confere o pid do neto).
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`
- [ ] O comando roda com o diretorio de trabalho no projeto, nunca na raiz da fabrica.
      `verificar: mix test test/fabrica/ferramentas/comando_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

