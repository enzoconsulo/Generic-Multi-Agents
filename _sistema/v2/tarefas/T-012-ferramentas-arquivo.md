---
id: T-012
titulo: Ferramentas de arquivo com confinamento
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-001]
areas: [lib/fabrica/ferramentas/arquivo.ex, lib/fabrica/ferramentas/confinamento.ex, test/fabrica/ferramentas/confinamento_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
As ferramentas `ler`, `escrever`, `editar`, `listar` e `buscar`, todas confinadas ao
diretorio do projeto — e o confinamento como propriedade do codigo, nunca como frase no
prompt.

## Contexto
A tese do TCC em uma tarefa: "uma regra que o sistema pede e uma regra opcional; uma regra
que a estrutura garante e uma propriedade". Na v1 o confinamento era uma linha no despacho
("nao toque em NADA fora de..."). Aqui ele e uma funcao que RECUSA.

`Confinamento.resolver(raiz, caminho)` devolve `{:ok, absoluto}` ou `{:erro, :fora_do_confinamento}`.
Ela precisa barrar, com teste para cada caso:

- caminho absoluto para fora (`C:\Windows\System32\...`)
- travessia (`../../..`), inclusive travessia que so aparece depois de normalizar
- link simbolico que aponta para fora (resolva o caminho REAL com
  `:file.read_link_all/1` antes de comparar)
- no Windows: caminho UNC (`\\servidor\share`) e nome de dispositivo (`CON`, `NUL`, `COM1`)

Compare sempre os caminhos NORMALIZADOS e em minusculas no Windows (o sistema de arquivos
e case-insensitive, e uma comparacao case-sensitive deixa passar `..\PROJETO`).

`editar` e substituicao exata de string, com erro se a string aparecer zero ou mais de uma
vez — a mesma disciplina da ferramenta que voce esta usando agora. Isso evita a edicao que
"quase" acerta e corrompe o arquivo em silencio.

## Criterios de aceite
- [ ] Cada forma de escapar do confinamento e barrada, uma por teste (absoluto, travessia, link, UNC, dispositivo).
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] A comparacao de caminhos e case-insensitive no Windows (teste com `..\PROJETO` em maiusculas).
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] `editar` recusa quando a string alvo aparece zero ou mais de uma vez, com erro nomeado.
      `verificar: mix test test/fabrica/ferramentas/arquivo_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

