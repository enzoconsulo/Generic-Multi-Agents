---
id: T-031
titulo: Geracao do markdown a partir do banco, e o commit da tarefa
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-016, T-021]
areas: [lib/fabrica/publicacao/markdown.ex, lib/fabrica/publicacao/git.ex, test/fabrica/publicacao/markdown_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Gerar o arquivo markdown da tarefa a partir do banco e commita-lo junto com o trabalho —
para o git do projeto continuar legivel por humano.

## Contexto
Decisao 6.2: o banco e a verdade, o markdown e ARTEFATO GERADO. E o git FICA, inteiro —
esta explicito nos dois documentos do TCC ("reconstroi o mundo lendo o banco E o git";
"tarefa concluida vira um commit proprio").

Gere no formato do protocolo da v1: frontmatter com os campos, e as secoes Objetivo,
Contexto, Criterios, Notas de execucao, Verificacao, Conformidade, Revisao. Um leitor
humano — e o professor — precisa reconhecer o arquivo.

Como e gerado, ele tem de ser DETERMINISTICO: mesma tarefa no banco produz o mesmo arquivo,
byte a byte. Ordene tudo, nao coloque timestamp de geracao.

O commit inclui as `areas` da tarefa MAIS o arquivo markdown dela. Mensagem: `T-NNN: titulo`.

ARMADILHA DA v1, e ela custou trabalho perdido: quando o agente escreve fora das `areas`
declaradas, o commit escopado nao pega esses arquivos e o trabalho fica solto na arvore.
Detecte alteracao fora das `areas` e REPORTE antes de commitar — nao commite `add -A` em
silencio.

## Criterios de aceite
- [ ] O markdown gerado tem o frontmatter e as sete secoes do protocolo.
      `verificar: mix test test/fabrica/publicacao/markdown_test.exs`
- [ ] Duas geracoes da mesma tarefa produzem bytes identicos.
      `verificar: mix test test/fabrica/publicacao/markdown_test.exs`
- [ ] O commit inclui as `areas` mais o arquivo da tarefa, com mensagem `T-NNN: titulo`.
      `verificar: mix test test/fabrica/publicacao/git_test.exs`
- [ ] Alteracao FORA das `areas` e detectada e reportada antes do commit.
      `verificar: mix test test/fabrica/publicacao/git_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

