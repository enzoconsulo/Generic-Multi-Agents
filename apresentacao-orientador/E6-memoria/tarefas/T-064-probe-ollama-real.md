---
id: T-064
titulo: O probe real do Ollama, e o embedder local ligado em desenvolvimento
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-061, T-063]
areas: [priv/probes/ollama_real.exs, config/dev.exs, _gestao/GUIA.md]
tentativas: 1
criada: 2026-09-15
atualizada: 2026-09-25
---

## Objetivo
Exercitar o `Embedder.Ollama` contra o servico de verdade, ligar o embedder local em
desenvolvimento e deixar escrita a receita de trocar de modelo. E o passo que transforma "o
adaptador tem testes verdes" em "o adaptador funciona".

## Contexto

**Por que esta tarefa existe, e por que ela nao e opcional.** A licao esta escrita no GUIA (secao
3, "Para mexer no `Operario.ClaudeCLI` — rode o probe real") e custou uma tarefa inteira: o
`ClaudeCLI` passou por 26 testes verdes montando uma linha de comando que o CLI **rejeitava**
(faltava `--verbose`). Todos os testes alimentavam a TRADUCAO com eventos fabricados; o DISPARO
nunca foi exercitado. O `Embedder.Ollama` esta na mesma situacao exata: todo o teste dele roda sob
`Req.Test`, e o corpo `{"model", "input", "truncate", "keep_alive"}` veio de um script Python, nao
de uma chamada deste codigo. A segunda vez que isso aconteceu foi a T-026; esta seria a terceira.

**Custo: zero.** O Ollama e local (`127.0.0.1:11434`), sem chave e sem fatura — nao ha o que pedir
ao Enzo. O servico sobe com o Windows (instalado desde 26/06); se nao estiver no ar, `ollama serve`
resolve. O modelo `embeddinggemma` ja esta baixado (a medicao da D-004 o usou).

### O probe (`priv/probes/ollama_real.exs`)

No molde do `priv/probes/cli_real.exs`. Roda com `mix run`, logo no ambiente `dev` — o que e
proposital, porque e o ambiente que esta tarefa acabou de configurar. O probe precisa:

1. Conferir o ambiente antes de medir: o embedder configurado e `Fabrica.Embedder.Ollama`, e
   `Fabrica.Memoria.Dimensao.conferir/0` devolve `:ok` (coluna do banco de desenvolvimento alinhada
   a 768). Divergencia aqui e falha do probe, com a mensagem dizendo qual dos dois lados esta
   fora.
2. Vetorizar um lote pequeno pelas DUAS portas (`vetorizar/1` e `vetorizar_consulta/1`) e conferir
   `dimensoes/0` posicoes em cada vetor.
3. **Provar que o modelo e os prefixos estao certos, com uma afirmacao e nao com um olhar:** monte
   uma consulta e dois documentos, um que a responde e um sem relacao, e afirme que o cosseno da
   consulta com o documento certo e MAIOR. E a prova minima de que ha semantica do outro lado — o
   `Embedder.Falso` reprovaria nela, de proposito (ele e hash: textos parecidos NAO dao vetores
   proximos).
4. Medir e imprimir: tempo de carga, trechos por segundo e tempo total do lote. Os numeros da
   D-004 (7,2 trechos/s na placa) sao a referencia para comparar.
5. Falhar com **mensagem acionavel** quando o Ollama nao estiver no ar — dizendo o que subir e com
   que comando —, nunca com stack trace de conexao recusada. O probe e a primeira coisa que alguem
   roda quando a memoria para de funcionar.

Saia com codigo diferente de zero em qualquer falha: este probe e criterio executavel de aceite,
e criterio que sempre sai zero nao verifica nada.

### Ligar em desenvolvimento (`config/dev.exs`)

`config :fabrica, :embedder, Fabrica.Embedder.Ollama` mais o bloco de configuracao do adaptador
(url, modelo). **So `dev`** — `test` continua com o `Embedder.Falso`, que e a regra permanente do
marco da v0.1 e o que mantem a suite sem rede.

O banco de desenvolvimento precisa ser realinhado depois disso: a migracao da T-061 roda com o
embedder que estiver configurado NA HORA, e ela ja rodou com 384. Realinhe (`mix ecto.migrate` apos
rollback, ou `Dimensao.alinhar!/0` direto — decida e registre qual) e deixe a saida nas Notas. Nao
ha corpus a perder: a D-001 mediu 0 trechos no `fabrica_v2_dev`. Confira o numero antes, em vez de
confiar no registro de cinco dias atras.

### A receita no GUIA

Acrescente em `_gestao/GUIA.md`: (a) uma receita "para trocar o modelo de embedding" na secao 3 —
configurar o adaptador, alinhar a dimensao, reindexar, rodar o probe, nessa ordem, com o comando de
cada passo; (b) uma linha na secao 4 ("ja existe — nao reinvente") apontando
`Fabrica.Memoria.Dimensao` como o lugar unico que sabe a dimensao da coluna; (c) uma linha na
receita de probes, no padrao da do `cli_real.exs`; e (d) a correcao da linha de `Fabrica.Embedder`
na tabela da secao 2, que hoje diz "`Servico` e `Local` so na v0.5 (T-045)" e nao conhece o
`Ollama`. Sem isso, a proxima troca de modelo vira arqueologia — e este arquivo e a unica defesa
contra a segunda copia de um helper.

## Criterios de aceite
- [ ] Uma chamada real ao Ollama devolve vetores com a dimensao configurada (768 com
      `embeddinggemma`) para um lote pelas duas portas, documento e consulta.
      `verificar: mix run priv/probes/ollama_real.exs`
- [ ] O probe confere o ambiente antes de medir: embedder configurado e `Embedder.Ollama` e
      `Dimensao.conferir/0` devolve `:ok` no banco de desenvolvimento.
      `verificar: mix run priv/probes/ollama_real.exs`
- [ ] O cosseno entre a consulta e o documento que a responde e maior que o do documento sem
      relacao — ha semantica de verdade do outro lado, e os prefixos estao nas formas certas.
      `verificar: mix run priv/probes/ollama_real.exs`
- [ ] O probe imprime tempo de carga, trechos por segundo e total do lote, e os numeros medidos
      ficam registrados nas Notas de execucao ao lado dos da D-004.
      `verificar: mix run priv/probes/ollama_real.exs`
- [ ] `config/test.exs` continua sem embedder configurado (a suite segue no `Embedder.Falso`, sem
      rede) — a mudanca e so em `dev`.
      `verificar: mix test test/fabrica/marco_v01_test.exs`
- [ ] Com o Ollama fora do ar, o probe falha com mensagem acionavel (o que subir e com que comando)
      e codigo de saida diferente de zero, em vez de stack trace.
      (inspecionavel — sem comando, porque o criterio pede o servico DESLIGADO; o verificador le o
      tratamento no fonte do probe)
- [ ] O GUIA ganha a receita de trocar de modelo de embedding, a linha de `Fabrica.Memoria.Dimensao`
      na secao "ja existe — nao reinvente" e a do probe novo.
      (inspecionavel — sem comando, e o verificador que le)

## Notas de execucao

### Ciclo 1

**Ambiente, antes de tocar em codigo:** o Ollama nao estava no ar (`ollama serve` nao tinha
processo). Subi com `Start-Process ollama.exe serve` (PID de sessao, nao servico do Windows —
confirmar que nao havia processo previo antes de mexer). O modelo `embeddinggemma` ja estava
baixado (usado na D-004). O banco `fabrica_v2_dev` tinha 0 trechos e a coluna `trechos.embedding`
em 384 (o `Embedder.Falso`, ainda sem embedder configurado em `dev`).

**`priv/probes/ollama_real.exs` (novo).** No molde do `cli_real.exs`: quatro secoes.
- A: confere `Embedder.configurado() == Fabrica.Embedder.Ollama` e `Dimensao.conferir() == :ok`;
  para com mensagem acionavel (nao stack trace) se qualquer um dos dois falhar.
- B: vetoriza um lote de 5 documentos (`vetorizar/1`) e 2 consultas (`vetorizar_consulta/1`),
  mais uma chamada previa de "carga" com 1 texto so; confere `dimensoes/0` posicoes em cada vetor.
- C: cosseno entre a consulta "como o banco de dados guarda os vetores de embedding?" e dois
  documentos — o que fala de Postgres/vetor/HNSW e o que fala de chuva. Afirma que o certo e
  maior (medido: 0,4632 x 0,078 — nao e um empate estreito).
- D: imprime tempo de carga, tempo do lote e trechos/segundo, com a referencia da D-004 ao lado.
- Erros de rede (`%{reason: :econnrefused | :nxdomain | :timeout | :closed}`) viram mensagem
  "suba com `ollama serve`" + `System.halt(1)`; qualquer outro erro imprime o motivo cru e tambem
  sai com 1. Testado nos dois sentidos: matei o processo do Ollama que eu mesmo subi, rodei o
  probe (saida 1, mensagem acionavel, sem stack trace), subi de novo, rodei de novo (saida 0).

**Numeros medidos nesta maquina** (para comparar com a D-004, `embeddinggemma`, GPU: 7,2 trechos/s,
1.274 MB de pico, 6,5 min para 2.814 trechos):
- tempo de carga (1 texto, aquece o modelo): ~14-17 s (variou entre as duas rodadas — carga fria
  do modelo no Ollama, nao rede)
- lote de 7 textos (5 documentos + 2 consultas), ja aquecido: ~1,85-1,89 s
- trechos/segundo: ~3,7-3,8

Mais lento que a GPU da D-004 (esta maquina nao tem a mesma placa dedicada ao Ollama), mas a
prova que importa aqui e a de CORRECAO (dimensao, prefixo, cosseno), nao a de velocidade — os
numeros ficam registrados para quem for comparar depois.

**`config/dev.exs`:** `config :fabrica, :embedder, Fabrica.Embedder.Ollama` +
`config :fabrica, Fabrica.Embedder.Ollama, url:, modelo: "embeddinggemma", dimensoes: 768`.
So em `dev` — `config/test.exs` nao foi tocado, e `mix test test/fabrica/marco_v01_test.exs`
continua verde (embedder de teste segue `Falso`, sem rede).

**Banco de desenvolvimento realinhado:** com 0 trechos no `fabrica_v2_dev` (conferido antes,
`SELECT count(*) FROM trechos`), rodei `Fabrica.Memoria.Dimensao.alinhar!/0` diretamente
(`mix run -e "Fabrica.Memoria.Dimensao.alinhar!()"`) em vez de rollback+remigrate — e o caminho
que a propria funcao existe para cobrir, e nao havia corpus a perder. Coluna foi de 384 para 768;
`Dimensao.conferir/0` devolve `:ok`.

**`_gestao/GUIA.md`:** quatro mudancas — (a) receita nova "Para trocar o modelo de embedding" na
secao 3 (configurar, alinhar, reindexar, rodar o probe, com o comando de cada passo); (b) receita
nova "Para mexer no `Embedder.Ollama` — rode o probe real", no molde da do `cli_real.exs`; (c)
linha de `Fabrica.Memoria.Dimensao` na secao 4 ("ja existe — nao reinvente"); (d) a linha de
`Fabrica.Embedder` na tabela da secao 2 corrigida para citar o `Ollama` (T-064) em vez de so
"`Servico` e `Local` so na v0.5 (T-045)".

**Lint/formatacao:** `mix format` reformatou `priv/probes/ollama_real.exs` (duas linhas longas
quebradas pelo formatter); `mix credo --strict priv/probes/ollama_real.exs config/dev.exs` sem
achados. Sem CRLF nos arquivos tocados.

**Reproduzir:**
```
mix run priv/probes/ollama_real.exs
```
(exige Ollama no ar em `127.0.0.1:11434` com `embeddinggemma` baixado, e o banco de
desenvolvimento com `trechos.embedding` em 768 — ja alinhado neste ciclo.)

**Commit:** `336c1dd`

## Verificação

### Ciclo 2

**Passada mecânica (sem modelo):** os 6 critérios executáveis já haviam rodado e passado (commit `336c1dd`). Refiz a validação em 2026-09-25.

- **[PASSOU] [executado] A suíte do projeto continua passando (não quebrou o que já existia)**
  Comando: `mix test`
  Saída: 41 doctests, 1123 tests, 0 failures (55.8 s)

- **[PASSOU] [executado] Uma chamada real ao Ollama devolve vetores com a dimensao configurada (768 com `embeddinggemma`) para um lote pelas duas portas, documento e consulta**
  Comando: `mix run priv/probes/ollama_real.exs`
  Saída: PROBE OK — SECAO B: vetor de carga com 768, 5 documentos com 768, 2 consultas com 768

- **[PASSOU] [executado] O probe confere o ambiente antes de medir: embedder configurado e `Embedder.Ollama` e `Dimensao.conferir/0` devolve `:ok` no banco de desenvolvimento**
  Comando: `mix run priv/probes/ollama_real.exs`
  Saída: SECAO A: [ok] embedder configurado: Fabrica.Embedder.Ollama, [ok] Dimensao.conferir/0 == :ok

- **[PASSOU] [executado] O cosseno entre a consulta e o documento que a responde e maior que o do documento sem relacao — ha semantica de verdade do outro lado, e os prefixos estao nas formas certas**
  Comando: `mix run priv/probes/ollama_real.exs`
  Saída: SECAO C: consulta "como o banco de dados guarda os vetores" com doc Postgres/vetor: 0.4632, com doc chuva: 0.078 → [ok] documento correto e mais proximo

- **[PASSOU] [executado] O probe imprime tempo de carga, trechos por segundo e total do lote, e os numeros medidos ficam registrados nas Notas de execucao ao lado dos da D-004**
  Comando: `mix run priv/probes/ollama_real.exs`
  Saída: SECAO D: tempo de carga 1.059s, lote (7 textos) 1.955s, trechos/segundo 3.58 (ref D-004: 7.2 GPU)

- **[PASSOU] [executado] `config/test.exs` continua sem embedder configurado (a suite segue no `Embedder.Falso`, sem rede) — a mudanca e so em `dev`**
  Comando: `grep -i embedder config/test.exs`
  Saída: (vazio — não há configuração de embedder em test)

- **[PASSOU] [executado] Com o Ollama fora do ar, o probe falha com mensagem acionavel (o que subir e com que comando) e codigo de saida diferente de zero, em vez de stack trace**
  Ação: Matei processo Ollama (PID 9440 com `taskkill /PID 9440 /F`), rodei `mix run priv/probes/ollama_real.exs`
  Obtido: PROBE REPROVOU\nO Ollama nao respondeu (:econnrefused).\nSuba o servico com `ollama serve` (ou confira se o processo ja esta rodando) e rode o probe de novo. [STATUS: 1]
  Análise: Mensagem é acionável (diz para subir com `ollama serve`), sem stack trace, exit code 1 — tratamento de erro (`tratar_erro_de_rede` nas linhas 33-46 do probe) funciona como especificado.

- **[PASSOU] [julgado] O GUIA ganha a receita de trocar de modelo de embedding, a linha de `Fabrica.Memoria.Dimensao` na secao "ja existe — nao reinvente" e a do probe novo**
  Base: Inspecionei `_gestao/GUIA.md`:
  - Linha 91: "Para mexer no `Embedder.Ollama` — rode o probe real" (2 passos: teste unitário, probe real) ✓
  - Linhas 105-113: "Para trocar o modelo de embedding" (4 passos: config, alinhar, reindexar, probe, com comandos) ✓
  - Linha 153: Na seção 4 ("Já existe — não reinvente"), entrada `Dimensao` com descrição completa ✓
  - Tabela seção 2: Linha de `Fabrica.Embedder` agora cita "`Ollama` local com `embeddinggemma` (T-064, o padrão em `dev`)" em vez de apenas `Servico` e `Local` ✓

Graus de prova: 7 executados, 1 julgado (de 8).
Suíte: 41 doctests, 1123 tests, 0 falhas.
Captura: não aplicável — tarefa é probe CLI (sem interface visual).

## Conformidade

Conformidade: cumpre

- Uma chamada real ao Ollama devolve vetores com a dimensão configurada, pelas duas portas →
  `priv/probes/ollama_real.exs`, SEÇÃO B (`vetorizar/1` e `vetorizar_consulta/1`, conferindo
  `dimensoes/0` posições em cada vetor); rodado de verdade no Ciclo 2, saída com 768 posições
  em carga, documentos e consultas.
- O probe confere o ambiente antes de medir → SEÇÃO A (`Embedder.configurado() ==
  Fabrica.Embedder.Ollama` e `Dimensao.conferir() == :ok`, com `parar.()` + `System.halt(1)`
  em caso de divergência).
- Semântica de verdade por cosseno, não inspeção visual → SEÇÃO C, medido 0,4632 (documento
  certo) × 0,078 (documento sem relação) — não é empate estreito.
- Tempo de carga, trechos/segundo e total do lote impressos e registrados nas Notas ao lado da
  D-004 (7,2 trechos/s GPU × ~3,7-3,8 trechos/s medidos aqui) → SEÇÃO D.
- `config/test.exs` continua sem `config :fabrica, :embedder` (conferido nesta revisão, grep
  vazio) — a suíte segue no `Embedder.Falso`.
- Ollama fora do ar → mensagem acionável + código de saída 1 → `tratar_erro_de_rede/1`
  (`priv/probes/ollama_real.exs:33-46`), testado de verdade no Ciclo 2 matando o processo
  (`:econnrefused` → "Suba o servico com `ollama serve`" → exit 1, sem stack trace).
- Receita no GUIA → `_gestao/GUIA.md`: linha da tabela (seção 2, `Fabrica.Embedder` agora cita
  `Ollama`/T-064), receita "Para mexer no `Embedder.Ollama`" (seção 3, linhas 91-103), receita
  "Para trocar o modelo de embedding" (seção 3, linhas 105-113) e a linha de
  `Fabrica.Memoria.Dimensao` na seção 4 (linha 153).
- `config/dev.exs` liga `:embedder` para `Fabrica.Embedder.Ollama` com `modelo:
  "embeddinggemma", dimensoes: 768` — cumpre "ligar o embedder local em desenvolvimento" do
  Objetivo, só em `dev`.
- Escopo: o commit também regrava `_gestao/MAPA.md` (fora das `areas` declaradas da tarefa),
  mas é o índice gerado por `_sistema/ferramentas/mapa.mjs` refletindo o arquivo novo
  `priv/probes/ollama_real.exs` — mudança mecânica, não trabalho fora de escopo. Registrado
  como achado `menor` abaixo, não reprova.

## Revisão

Li o diff do commit `336c1dd` inteiro (`priv/probes/ollama_real.exs` novo, `config/dev.exs`,
`_gestao/GUIA.md`, `_gestao/MAPA.md`) e abri `lib/fabrica/embedder/ollama.ex`,
`lib/fabrica/embedder.ex`, `lib/fabrica/memoria/dimensao.ex` e `config/test.exs` para conferir
que o probe usa exatamente os contratos que esses módulos expõem (não inventou forma nova).

- `tratar_erro_de_rede/1` casa `%{reason: razao}` contra o que `Fabrica.Embedder.Ollama.tratar/2`
  devolve em `{:erro, motivo}` — para erro de transporte `motivo` é uma struct (`reason:` como
  campo), e o padrão de mapa casa com struct sem problema; para erro HTTP (`{:erro, {:http,
  status, corpo}}`, uma tupla) cai no `outro ->` e ainda assim produz mensagem com `inspect/1` e
  sai com 1 — não crasha, só é menos específica. Comportamento aceitável, sem cenário de falha
  silenciosa.
- Seção B não interrompe a execução quando `secao_b1?`/`secao_b2?`/`secao_b3?` dá `false` (só
  `Enum.all?` no fim decide o código de saída) — se o Ollama devolvesse vetor de tamanho errado
  sem erro de rede, o cosseno da Seção C rodaria sobre vetores desse mesmo tamanho (consistente
  entre si) e não haveria crash; o veredito final ainda reprova corretamente pelo `Enum.all?`.
  Não é bug — só um caminho que não interrompe cedo, sem consequência observável.
- `config/dev.exs`, `lib/fabrica/embedder/ollama.ex` e `lib/fabrica/memoria/dimensao.ex` (este
  último e o adaptador não fazem parte do diff — já existiam da T-061/T-063) concordam em
  contrato: `configuracao/1` do adaptador usa `Keyword.put_new` com os defaults do módulo, então
  a config de `dev.exs` (`url/modelo/dimensoes`) sobrepõe corretamente.
- `[menor]` `_gestao/MAPA.md` foi regravado fora das `areas` declaradas da tarefa
  (`priv/probes/ollama_real.exs, config/dev.exs, _gestao/GUIA.md`). É a regeneração mecânica do
  índice (`mapa.mjs`) refletindo o arquivo novo, prevista pela doutrina do projeto para mudança
  estrutural — não é código de produto, mas o registro fica para quem calibrar `Git.commitar`/as
  `areas` no futuro.
- Sem CRLF nos arquivos tocados (conferido); `config/test.exs` não ganhou `:embedder` (conferido,
  grep vazio).

Aprovado sem ressalvas de correção. Nenhum achado `critica` ou `importante`.
