---
id: T-062
titulo: Embedder.Ollama — o adaptador do modelo local
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-045]
areas: [lib/fabrica/embedder/ollama.ex, test/fabrica/embedder/ollama_test.exs, test/fabrica/marco_v01_test.exs]
tentativas: 1
criada: 2026-09-15
atualizada: 2026-09-25
---

## Objetivo
O adaptador que leva esta fabrica ao modelo de embedding local decidido na D-004
(`embeddinggemma` pelo Ollama), falando o protocolo que o Ollama realmente fala — e nao o formato
proprio que o `Embedder.Servico` inventou.

## Contexto

**Por que um adaptador novo, e nao configurar o `Servico`.** A medicao registrou o motivo
(`_gestao/pesquisas/2026-09-13-ollama-embedding-local.md`, achado 2): "nenhum caminho de codigo
leva a v2 ao Ollama hoje". O `Servico` fala um formato que ELE definiu — `{"textos", "modelo"}` →
`{"vetores"}` — e o Ollama fala `{"model", "input"}` → `{"embeddings"}`. Nao e configuracao, e
protocolo.

**O molde e o `Embedder.Servico`** (`lib/fabrica/embedder/servico.ex`). Leia o `@moduledoc` dele
antes de escrever uma linha: ele ja resolveu, e do jeito que este projeto quer, tres coisas que
voce vai precisar — a conferencia de dimensao em CADA vetor da resposta (com erro nomeado, em vez
de gravar vetor torto que so quebraria depois no indice), a configuracao por OPCAO sobrepondo
`Application.get_env` em `vetorizar/2`, e o teste sem rede com o `:plug` do `Req.Test`. Copie a
forma; nao copie o corpo da requisicao.

**A D-002 continua valendo e esta tarefa nao a viola:** o Ollama e local
(`http://127.0.0.1:11434`), nao tem chave, nao gera fatura. Nao leia `System.get_env` aqui — a
credencial tem dono unico no marco da v0.1, e este adaptador nao tem credencial nenhuma.

### O protocolo, medido (nao inventado)

O script do bench (`_gestao/pesquisas/2026-09-13-ollama-embedding-bench.py`, funcao `embed`) e a
fonte, porque foi ele que produziu os numeros da D-004:

    POST http://127.0.0.1:11434/api/embed
    {"model": "embeddinggemma", "input": [texto, ...], "truncate": true, "keep_alive": "10m"}
    -> {"embeddings": [[float, ...], ...]}

`keep_alive` mantem o modelo carregado entre lotes (descarregar e recarregar custa 16,4 s de carga
medidos na placa). `truncate` evita que um trecho longo derrube a chamada inteira.

### O PREFIXO por tipo de texto — sem ele, a qualidade medida nao se reproduz

`embeddinggemma` foi treinado com prefixo por tipo, e o dicionario `PREFIXOS` do bench tem as
formas EXATAS que produziram o recall@8 de 15/23:

    documento: "title: none | text: "
    consulta:  "task: search result | query: "

O adaptador aplica o prefixo; quem chama nao precisa saber que ele existe. Entregue as duas
portas:

- `vetorizar/1` e `vetorizar/2` (o callback do behaviour) — prefixo de **documento**. E o que a
  ingestao usa, e documento e o caso de longe mais comum.
- `vetorizar_consulta/1` e `vetorizar_consulta/2` — prefixo de **consulta**.

Os dois prefixos sao configuraveis (modelo diferente, prefixo diferente), com as formas acima como
padrao. Ligar a busca ao caminho de consulta e a **T-063**; aqui as funcoes so precisam existir e
estar provadas.

### Configuracao e padroes

`Application.get_env(:fabrica, Fabrica.Embedder.Ollama, [])`, sobreposta por opcao em `/2`:
`:url` (padrao `"http://127.0.0.1:11434"`), `:modelo` (padrao `"embeddinggemma"`), `:dimensoes`
(padrao **768**), `:keep_alive`, `:prefixo_documento`, `:prefixo_consulta`, `:receive_timeout`.

Sobre o tempo: um lote grande na placa leva minutos (2.814 trechos em 6,5 min, 7,2 trechos/s), e o
padrao do `Req` e curto demais para isso. Escolha um `receive_timeout` folgado e configuravel, e
diga no `@moduledoc` de onde veio o numero.

### A prova do marco da v0.1 MUDA de novo — e isso ja custou ciclos aqui

`test/fabrica/marco_v01_test.exs` afirma que so os `@donos_da_rede` referenciam `Req`. No instante
em que `ollama.ex` citar `Req`, a suite fica vermelha — foi exatamente isso que travou a T-045 por
tres ciclos. Acrescente `"lib/fabrica/embedder/ollama.ex"` a `@donos_da_rede` e documente a
mudanca no `@moduledoc` do arquivo, no mesmo padrao das anteriores ("A PROVA MUDOU NA T-019", "A
PROVA MUDOU DE NOVO NA T-045"): a prova fica mais especifica, nao mais fraca — quem FALA HTTP e
lista, quem LE CREDENCIAL segue sendo um so, e o Ollama nao le credencial nenhuma.

**Nenhum teste desta tarefa pode tocar `127.0.0.1:11434`.** Tudo pelo `:plug` do `Req.Test`, como
`servico_test.exs`. O contato com o servico real e a T-064, fora da suite.

**Stack:** `Req` (ja no projeto, e ja e o cliente HTTP do `Servico`). Nenhuma dependencia nova.
Antes de fechar: `mix format`, conferir LF (GUIA, Armadilhas) e `mix fabrica.ci` completo.

## Criterios de aceite
- [ ] `Ollama.vetorizar/2` faz UM `POST` em `/api/embed` com o lote inteiro em `"input"`, mais
      `"model"`, `"truncate"` e `"keep_alive"`, e le `"embeddings"` na mesma ordem da entrada.
      `verificar: mix test test/fabrica/embedder/ollama_test.exs`
- [ ] Cada texto sai com o prefixo do seu TIPO, nas formas exatas do bench: `vetorizar/2` manda
      `"title: none | text: "` e `vetorizar_consulta/2` manda `"task: search result | query: "`.
      `verificar: mix test test/fabrica/embedder/ollama_test.exs`
- [ ] Vetor com tamanho diferente de `dimensoes/0` vira `{:erro, {:dimensao_invalida, esperado,
      tamanhos}}` — nunca `{:ok, _}` com vetor torto.
      `verificar: mix test test/fabrica/embedder/ollama_test.exs`
- [ ] Sem configuracao nenhuma, `dimensoes/0` e 768, a url e `http://127.0.0.1:11434` e o modelo e
      `embeddinggemma`; configuracao e opcao sobrepoem os tres.
      `verificar: mix test test/fabrica/embedder/ollama_test.exs`
- [ ] Resposta fora do formato, status diferente de 200 e erro de transporte viram erro nomeado,
      nao excecao.
      `verificar: mix test test/fabrica/embedder/ollama_test.exs`
- [ ] O marco da v0.1 fica verde com o terceiro dono da rede declarado, e nenhum teste da suite
      chama a rede.
      `verificar: mix test test/fabrica/marco_v01_test.exs`
- [ ] Lint estrito limpo no modulo novo.
      `verificar: mix credo --strict`

## Notas de execucao

### Ciclo 1 (2026-09-24)

Criado `lib/fabrica/embedder/ollama.ex` — molde de `Embedder.Servico`, protocolo do Ollama
(`POST /api/embed`, corpo `{"model", "input", "truncate", "keep_alive"}`, resposta
`{"embeddings"}`). Teste escrito ANTES da implementacao, visto vermelho antes de cada ajuste.

- `vetorizar/1` e `vetorizar/2` aplicam o prefixo de documento (`"title: none | text: "`);
  `vetorizar_consulta/1` e `vetorizar_consulta/2` aplicam o de consulta
  (`"task: search result | query: "`). Ambos configuraveis por opcao
  (`:prefixo_documento`/`:prefixo_consulta`).
- Padroes sem configuracao: `:url` = `http://127.0.0.1:11434`, `:modelo` = `embeddinggemma`,
  `:dimensoes` = 768, `:keep_alive` = `"10m"`, `:receive_timeout` = 300.000 ms (5 min — de onde
  veio o numero, ver `@moduledoc`: 2.814 trechos em 6,5 min medidos na D-004). Todos sobrepostos
  por `Application.get_env(:fabrica, Fabrica.Embedder.Ollama, [])` e depois por opcao em `/2`.
  `:dimensoes` e configuravel (diferente de `Servico`, que a tem fixa) porque o criterio exige
  `dimensoes/0` responder a configuracao.
- Vetor com tamanho != `dimensoes` configurado vira `{:erro, {:dimensao_invalida, esperado,
  tamanhos}}`; resposta fora do formato vira `{:erro, :resposta_invalida}`; status != 200 vira
  `{:erro, {:http, status, corpo}}`; erro de transporte devolve o `%Req.TransportError{}` (mesmo
  padrao do `Servico`).
- Nao le `System.get_env` em nenhum ponto — Ollama nao tem credencial (D-002 preservada).

`test/fabrica/marco_v01_test.exs`: `"lib/fabrica/embedder/ollama.ex"` acrescentado a
`@donos_da_rede` (terceiro dono, ao lado de `MessagesAPI` e `Servico`), com uma nova secao no
`@moduledoc` ("A PROVA MUDOU DE NOVO NA T-062") documentando a mudanca no mesmo padrao das
anteriores. `@dono_da_rede` (quem le credencial) nao mudou.

Nenhuma dependencia nova: `Req` ja estava no projeto (T-019) e ja e o cliente HTTP do `Servico`.

**Reproduzir:**
`mix test test/fabrica/embedder/ollama_test.exs test/fabrica/marco_v01_test.exs`

**Verificado tambem:**
- `mix credo --strict lib/fabrica/embedder/ollama.ex` → limpo.
- `mix fabrica.ci` completo (formato, compilar, lint, testes, tipos) → 5/5 estagios ok.

**Commit:** `e579b49`

**2026-09-15 — promovida a `pronta` pelo orquestrador**: todas as dependencias estao `concluida`.
As tres primeiras da linhagem da D-004 (T-059, T-060, T-062) tem `areas` disjuntas entre si e podem
ir em paralelo, ate o limite de 3 construtores do CLAUDE.md.

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `Ollama.vetorizar/2` faz UM `POST` em `/api/embed` com o lote inteiro em `"input"`, mais `"model"`, `"truncate"` e `"keep_alive"`, e le `"embeddings"` na mesma ordem da entrada. — `mix test test/fabrica/embedder/ollama_test.exs` → **PASSOU**
- [executado] Cada texto sai com o prefixo do seu TIPO, nas formas exatas do bench: `vetorizar/2` manda `"title: none | text: "` e `vetorizar_consulta/2` manda `"task: search result | query: "`. — `mix test test/fabrica/embedder/ollama_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Vetor com tamanho diferente de `dimensoes/0` vira `{:erro, {:dimensao_invalida, esperado, tamanhos}}` — nunca `{:ok, _}` com vetor torto. — `mix test test/fabrica/embedder/ollama_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Sem configuracao nenhuma, `dimensoes/0` e 768, a url e `http://127.0.0.1:11434` e o modelo e `embeddinggemma`; configuracao e opcao sobrepoem os tres. — `mix test test/fabrica/embedder/ollama_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Resposta fora do formato, status diferente de 200 e erro de transporte viram erro nomeado, nao excecao. — `mix test test/fabrica/embedder/ollama_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O marco da v0.1 fica verde com o terceiro dono da rede declarado, e nenhum teste da suite chama a rede. — `mix test test/fabrica/marco_v01_test.exs` → **PASSOU**
- [executado] Lint estrito limpo no modulo novo. — `mix credo --strict` → **PASSOU**

Graus de prova: 8 executado(s), 0 para julgamento (de 8).

## Conformidade

### Ciclo 1 (2026-09-25)

Conformidade: cumpre

- Protocolo `POST /api/embed`, corpo `{"model","input","truncate","keep_alive"}`, leitura de
  `"embeddings"` na ordem de entrada → `lib/fabrica/embedder/ollama.ex:154-166` (`pedir/4`,
  `tratar/2`), provado por `test/fabrica/embedder/ollama_test.exs:15-38`.
- Prefixo exato por tipo de texto (`"title: none | text: "` / `"task: search result | query: "`)
  aplicado em `vetorizar/2` e `vetorizar_consulta/2`, configurável por opção →
  `lib/fabrica/embedder/ollama.ex:78-97,132-141`, provado em
  `test/fabrica/embedder/ollama_test.exs:56-90`.
- Dimensão errada vira `{:erro, {:dimensao_invalida, esperado, tamanhos}}`, nunca `{:ok, _}` torto
  → `lib/fabrica/embedder/ollama.ex:168-177`, provado em
  `test/fabrica/embedder/ollama_test.exs:93-105`.
- Padrões sem configuração (`dimensoes/0` = 768, url `http://127.0.0.1:11434`, modelo
  `embeddinggemma`) e sobreposição por config de app + opção → `lib/fabrica/embedder/ollama.ex:
  123-131` (`configuracao/1`, `Application.get_env` → `Keyword.merge(opcoes)` → `put_new`),
  provado em `test/fabrica/embedder/ollama_test.exs:109-166` (inclusive o teste que confirma o
  padrão de url batendo `Fabrica.SemRede`, já que `config/test.exs` fixa esse plug global).
- Resposta fora do formato, status != 200 e erro de transporte viram erro nomeado, não exceção →
  `lib/fabrica/embedder/ollama.ex:168-183`, provado em
  `test/fabrica/embedder/ollama_test.exs:169-197`.
- Terceiro dono da rede declarado e documentado, marco da v0.1 verde →
  `test/fabrica/marco_v01_test.exs:52-58,89-95` (`@donos_da_rede` com
  `"lib/fabrica/embedder/ollama.ex"` e a seção nova do `@moduledoc`), commit `a61674d` registra
  15 testes + 2 doctests passando.
- Lint estrito limpo: registrado no commit `a61674d` ("1473 mods/funs, found no issues") — não
  reexecutei, aceito como comprovação mecânica já rodada pelo testador.
- Escopo: só toca as três `areas` declaradas, mais os dois arquivos de bookkeeping de sempre
  (`_gestao/MAPA.md` regenerado, o próprio arquivo da tarefa). Nenhuma dependência nova — `Req`
  já era o cliente HTTP do `Servico` (T-019/T-045). Nenhuma configuração de `System.get_env`
  introduzida (D-002 preservada). Nenhuma sobra fora do que o Objetivo pediu: `vetorizar_consulta`
  existe e está provada, mas não é ligada à busca (a própria tarefa reserva isso para a T-063).

## Revisão

### Ciclo 1 (2026-09-25)

Aprovado sem ressalvas. Verifiquei, lendo o diff do commit `e579b49` inteiro (`ollama.ex` novo,
`ollama_test.exs` novo, `marco_v01_test.exs` alterado):

- **Correção:** `configuracao/1` faz `Application.get_env → Keyword.merge(opcoes) → put_new`
  default — ordem certa (opção sobrepõe app, app sobrepõe embutido). Lista vazia sai antes de
  qualquer validação (`fazer([], ...)`), evitando POST com lote vazio. Erro de transporte,
  status != 200 e corpo fora do formato têm ramo próprio em `tratar/2`/`extrair/2`, sem deixar
  nada cair em exceção não tratada nos casos que os critérios cobrem.
- **Fidelidade ao molde:** segue a forma do `Servico` (mesmo padrão de `configuracao/1`,
  `pedir/4`, `tratar/2`, teste com `:plug` do `Req.Test`) sem copiar o corpo da requisição —
  exatamente o que o Contexto da tarefa pediu.
- **Contrato de rede:** `lib/fabrica/embedder/ollama.ex` não lê `System.get_env` em nenhum ponto
  — conferido por leitura direta do arquivo — preservando a D-002 e a exclusividade de
  `@dono_da_rede` (quem lê credencial) declarada em `marco_v01_test.exs`.
- **Caso de borda não coberto pelos testes, mas herdado do molde e não um defeito novo:** se
  `"embeddings"` vier como lista cujo elemento não é lista (ex.: número), `Enum.map(vetores,
  &length/1)` em `extrair/2` (`lib/fabrica/embedder/ollama.ex:170`) levanta `ArgumentError` em
  vez de devolver erro nomeado. O mesmo padrão já existe, idêntico, em
  `lib/fabrica/embedder/servico.ex` — reproduzido fielmente por instrução do Contexto ("copie a
  forma"), então não é regressão introduzida por esta tarefa. Nota `menor`: se um dia a T-064
  expuser esse caso contra o Ollama real, vale endurecer os dois adaptadores juntos.
- **Processo:** commit gravado corretamente no campo `Commit:` desde o Ciclo 1 — sem achado de
  processo a registrar aqui.

Nenhum achado `critica` ou `importante`.
