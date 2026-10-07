---
id: T-077
titulo: "Doutrina do revisor ensina o formato `[conformidade] ...` que ler_conformidade/1 procura"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: media
dependencias: [T-075]
areas: [priv/doutrina/revisor.md]
tentativas: 1
criada: 2026-09-26
atualizada: 2026-10-01
---

## Objetivo
`Fabrica.Portoes.Revisor.ler_conformidade/1` (T-075) extrai o veredito de conformidade de uma
linha no formato `[conformidade] conforme` / `[conformidade] nao-conforme — motivo`, dentro do
relato que o agente revisor escreve via `registrar_resultado`. `priv/doutrina/revisor.md` (quem
instrui o agente real) ainda não sabe disso: pede só "em `resumo`, diga claramente se a entrega é
conforme ou não (e por quê)" — prosa livre. Sem o formato explícito, o agente nunca escreve a
linha que `ler_conformidade/1` procura, a extração cai sempre no fallback tolerante (`:conforme`
por ausência) e o caminho de reprovação por conformidade que a T-075 construiu nunca é exercitado
na prática — só em teste.

## Contexto
Depende de T-075: o formato só existe porque ela o definiu e implementou
(`lib/fabrica/portoes/revisor.ex`, função `ler_conformidade/1`). Esta tarefa NÃO mexe em código —
só na doutrina (prompt) que o agente revisor real lê.

`priv/doutrina/revisor.md` já tem uma seção equivalente para achados, "## O formato dos achados
não é cosmético", que ensina o formato `[gravidade] arquivo:linha — problema` com um exemplo em
bloco de código e a explicação de por que o formato importa (é o que a política de retrabalho lê
para classificar a reprovação). Esta tarefa espelha essa seção para a conformidade: mesmo estilo,
mesmo nível de explicitação, sem inventar campo novo — o formato já está fixado em
`lib/fabrica/portoes/revisor.ex` (comentário/`@doc` de `ler_conformidade/1`); leia-o antes de
escrever a doutrina, não redija de memória.

Pontos que a doutrina precisa cobrir, todos já decididos pela implementação (não é escolha desta
tarefa, é transcrição fiel):
- A linha exata: `[conformidade] conforme` ou `[conformidade] nao-conforme — motivo aqui` (aceita
  `nao-conforme`/`não-conforme`, hífen ou travessão como separador).
- Havendo mais de uma linha, prevalece a última — o agente pode reafirmar o veredito se mudar de
  ideia no meio do relato.
- Ausência da linha, ou linha fora do formato, cai em `:conforme` por tolerância — não é um convite
  a omitir a linha (o objetivo desta tarefa é justamente parar de deixar por implícito), é só a
  garantia de que um relato mal formatado não vira reprovação por acidente de parser.

Não prometa nada que o código não faça — se a doutrina afirmar um comportamento que
`ler_conformidade/1` não tem, a T-065-Ciclo-2 (que documentou o mesmo erro ao contrário: código
que não fazia o que o `@moduledoc` afirmava) é o exemplo do que NÃO fazer aqui.

## Critérios de aceite
- [ ] `priv/doutrina/revisor.md` tem uma seção nova (espelhando "O formato dos achados não é
      cosmético") que mostra a linha `[conformidade] conforme` / `[conformidade] nao-conforme —
      motivo` em bloco de código, igual ao formato real de `Revisor.ler_conformidade/1`. A
      literal `[conformidade]` aparece no arquivo (necessário, não suficiente — a fidelidade ao
      formato real é o revisor humano-de-doutrina quem confere, comparando com
      `lib/fabrica/portoes/revisor.ex` linha a linha).
      `verificar: grep -Fc [conformidade] priv/doutrina/revisor.md`
- [ ] A doutrina deixa claro que a linha de conformidade é OBRIGATÓRIA no relato (não opcional
      como hoje), sem prometer nenhum comportamento que `ler_conformidade/1` não implemente —
      compare a explicação da doutrina sobre "ausência da linha" com o comportamento real de
      fallback tolerante.
      (inspecionável — mesma comparação acima)
- [ ] O restante da doutrina do revisor (seções de achados, ferramentas, `registrar_resultado`)
      continua íntegro — o arquivo cresce, não é reescrito.
      (inspecionável — `git diff priv/doutrina/revisor.md` deve mostrar só adição de linhas nas
      seções existentes, nenhuma seção antiga removida ou reescrita; é o revisor quem confere)

## Notas de execução

### Ciclo 1

**O que fiz.** Acrescentei a `priv/doutrina/revisor.md` a seção "## A linha de conformidade
também não é cosmética — e é obrigatória", entre "O formato dos achados não é cosmético" e
"`registrar_resultado` é o ÚNICO canal". Só inserção: `git diff --numstat` → `42 0` (42 linhas
adicionadas, nenhuma removida); nenhuma seção antiga foi tocada.

Conteúdo, transcrito de `lib/fabrica/portoes/revisor.ex` (`ler_conformidade/1`, regexes
`@padrao_nao_conforme`/`@padrao_conforme`, linhas 202-245) e de `lib/fabrica/fila/trabalho.ex`
(`julgar(:revisor, ...)`, linhas 377-392) — não de memória:
- bloco de código com `[conformidade] conforme` / `[conformidade] nao-conforme — motivo`;
- a linha é OBRIGATÓRIA ("uma das duas, sempre — nunca nenhuma");
- ONDE escrever: dentro de `registrar_resultado` (em `resumo`). Fato do código: a conformidade é
  lida só de `resumo.relatos` via `RegistrarResultado.formatar_relatos/1`; a linha escrita só no
  texto da conversa não chega ao portão;
- as regras do regex que são armadilha para o agente: nada antes de `[conformidade]` na linha
  (só espaço ou marcador `-`/`*`); `nao-conforme`/`não-conforme` com hífen (com espaço não é
  lido); separador travessão ou hífen e motivo obrigatório (`nao-conforme` sozinho não é lido);
  `conforme` termina a linha (`conforme — porque...` não é lido); vale a última linha válida;
- o fallback tolerante descrito como ele é (linha fora do formato é ignorada; sem linha válida
  → `conforme`) e por que isso NÃO autoriza omitir: um `nao-conforme` mal escrito vira aprovação
  em silêncio.

Não citei tolerâncias que não importam ao agente (maiúsculas, `:` opcional, `nao_conforme` com
sublinhado) — nada prometido além do que o código faz.

**Prova.** TDD não se aplica a texto de doutrina, mas a fidelidade é verificável por programa: o
comando abaixo extrai do próprio `revisor.md` as linhas do bloco e as passa por
`ler_conformidade/1`, e confere contra o código cada regra que a seção afirma (11 casos, incluindo
o caminho real `formatar_relatos` → `ler_conformidade` com 1 e 2 chamadas). Rodado ANTES da
edição: vermelho (`bloco da doutrina: []`, MatchError). Depois: `PROVA OK: 2 linhas do bloco + 11
regras conferidas contra ler_conformidade/1`.

**Reproduzir:**
```
cd /home/user/Generic-Multi-Agents/projetos/fabrica-v2 && grep -Fc [conformidade] priv/doutrina/revisor.md && git diff --numstat 801671f~1 801671f -- priv/doutrina/revisor.md && MIX_ENV=test mix run --no-start -e 'alias Fabrica.Portoes.Revisor, as: R; alias Fabrica.Ferramentas.RegistrarResultado, as: RR; d = File.read!("priv/doutrina/revisor.md"); b = List.flatten(Regex.scan(~r/^\[conformidade\][^\n]*$/m, d)); IO.inspect(Enum.map(b, &{&1, R.ler_conformidade(&1)}), label: "bloco da doutrina"); true = length(b) >= 2 and Enum.any?(b, &(R.ler_conformidade(&1) == :conforme)) and Enum.any?(b, &match?({:nao_conforme, _}, R.ler_conformidade(&1))); casos = [{"[conformidade] não-conforme - pediu X, veio Y", {:nao_conforme, "pediu X, veio Y"}}, {"- [conformidade] nao-conforme — m", {:nao_conforme, "m"}}, {"Veredito: [conformidade] nao-conforme — m", :conforme}, {"[conformidade] não conforme — m", :conforme}, {"[conformidade] nao-conforme", :conforme}, {"[conformidade] nao-conforme — m\n[conformidade] conforme — porque sim", {:nao_conforme, "m"}}, {"[conformidade] nao-conforme — m\n[conformidade] conforme", :conforme}, {"a entrega não é o que foi pedido", :conforme}, {"", :conforme}]; for {t, esp} <- casos, do: (^esp = R.ler_conformidade(t)); {:nao_conforme, "m"} = R.ler_conformidade(RR.formatar_relatos([%{resumo: "texto\n[conformidade] nao-conforme — m", arquivos: ["a.ex"]}])); :conforme = R.ler_conformidade(RR.formatar_relatos([%{resumo: "[conformidade] nao-conforme — m"}, %{resumo: "[conformidade] conforme"}])); IO.puts("PROVA OK: #{length(b)} linhas do bloco + #{length(casos) + 2} regras conferidas contra ler_conformidade/1")'
```
(o `git diff --numstat` compara o commit desta tarefa com o pai dele — deve dar
`42 0 priv/doutrina/revisor.md`.)

Resultados nesta máquina: `grep -Fc [conformidade]` → **7**; prova → **OK**; testes que carregam
a doutrina / o portão: `mix test test/fabrica/despacho_test.exs test/fabrica/prompt/prefixo_test.exs
test/fabrica/fila/trabalho_test.exs test/fabrica/portoes/revisor_test.exs` → **61 testes, 0
falhas** (os avisos de "prefixo abaixo do mínimo cacheável" são das fixtures, pré-existentes).
Não rodei `mix dialyzer` nem `mix fabrica.ci` (instrução do despacho: PLT em construção por outro
processo; a bateria é do testador).

**Arquivos:** `priv/doutrina/revisor.md` (seção nova); este arquivo de tarefa; `_gestao/MAPA.md`
(regenerado).

**Sugestão para o orquestrador (achado fora das `areas`, não corrigido):** a seção EXISTENTE
"`registrar_resultado` é o ÚNICO canal" manda o revisor listar os achados "em `resumo`", mas
`Trabalho.julgar(:revisor, ...)` (`lib/fabrica/fila/trabalho.ex:390`) lê os achados de
`relatorio_do_agente/1`, que só junta blocos `:texto` das mensagens do assistente — a chamada de
ferramenta é bloco `:uso_de_ferramenta` (`lib/fabrica/operario/claude_cli.ex:497`). Achado escrito
SÓ no `resumo` do `registrar_resultado` não chega a `ler_achados/1`. Não mexi (o critério 3 desta
tarefa proíbe reescrever seção existente, e o conserto certo provavelmente é no código —
`ler_achados` passar a ler também os relatos, como a conformidade já faz). Candidata a tarefa
própria, com `areas: [lib/fabrica/fila/trabalho.ex, test/fabrica/fila/trabalho_test.exs]`.

**Commit:** `801671f`

## Verificação

### Ciclo 2

- **[PASSOU] [executado] Critério 1: `priv/doutrina/revisor.md` tem uma seção nova com `[conformidade]` em bloco de código**
  Comando: `grep -Fc "[conformidade]" priv/doutrina/revisor.md`
  Saída: `7` (esperado mínimo 2)

- **[PASSOU] [executado] Critério 2: A doutrina deixa claro que a linha é OBRIGATÓRIA, sem prometer comportamento não implementado**
  Comando: inspeção manual de `priv/doutrina/revisor.md` linhas 38-79 vs. `lib/fabrica/portoes/revisor.ex` linhas 202-245
  Base: doutrina afirma "Uma das duas, sempre — nunca nenhuma" (obrigatória); descreve fallback tolerante como defeito, não aprovação; matcheia exatamente ao código (nenhuma promessa falsa)

- **[PASSOU] [executado] Critério 3: O restante da doutrina continua íntegro (só adição, nenhuma reescrita)**
  Comando: `git diff --numstat 801671f~1 801671f -- priv/doutrina/revisor.md`
  Saída: `42	0` (42 adições, 0 remoções)

- **[PASSOU] [executado] Prova de conformidade: 2 linhas do bloco + 11 regras conferidas contra ler_conformidade/1**
  Comando: `MIX_ENV=test mix run --no-start -e '...' (comando completo em linhas 106-108 do Ciclo 1)`
  Saída: `PROVA OK: 2 linhas do bloco + 11 regras conferidas contra ler_conformidade/1`

Suíte completa: 1182 testes + 41 doctests, **23 falhas** (todas pré-existentes conforme linha de base 2026-10-01); dialyzer passou; backup tests: 11 testes, 0 falhas — **sem regressão**.

Graus de prova: 4 executados, 1 inspecionado

## Conformidade

### Ciclo 1

Conformidade: cumpre

Diff revisado: `801671f` (`git show 801671f`). Só `priv/doutrina/revisor.md` (+42/-0), o próprio
arquivo da tarefa e o cabeçalho do `_gestao/MAPA.md`, tudo dentro das `areas` mais a gestão.

- [Critério 1 — seção nova espelhando "O formato dos achados", linha em bloco de código, igual ao
  formato real] → `priv/doutrina/revisor.md:38-79`, seção "## A linha de conformidade também não é
  cosmética — e é obrigatória", com o bloco de código em `:43-46` (`[conformidade] conforme` /
  `[conformidade] nao-conforme — motivo`). Mesma estrutura da seção de achados (linha exata em
  bloco + por que o formato importa). Comparação com `lib/fabrica/portoes/revisor.ex:202-245`
  linha a linha, como o critério manda:
  - "começa com `[conformidade]`, no máximo precedida de espaços ou de `-`/`*`" (`:61-63`) ↔
    `^\s*[-*]?\s*\[conformidade\]` nos dois regexes (`:231-232`). Fiel.
  - "`nao-conforme`/`não-conforme` com hífen; com espaço não é lido" (`:64-65`) ↔
    `n[ãa]o[-_]?conforme`: com espaço nenhum dos dois padrões casa. Fiel (a doutrina prescreve o
    hífen; não promete que `naoconforme`/`nao_conforme` falham, só não os ensina — correto).
  - "travessão ou hífen, motivo obrigatório; `nao-conforme` sozinho não é lido" (`:66-67`) ↔
    `\s*[—-]\s*(.+?)\s*$`. Fiel.
  - "`[conformidade] conforme` termina ali; `conforme — porque ...` não é lido" (`:68-69`) ↔
    `conforme\s*$` em `@padrao_conforme`, e `@padrao_nao_conforme` exige `n` antes de `conforme`.
    Fiel.
  - "vale a ÚLTIMA linha válida" (`:70-71`) ↔ `Enum.reduce` que só troca o acumulador em linha
    reconhecida (`:219-229`). Fiel.
- [Critério 2 — linha OBRIGATÓRIA, sem prometer o que o código não faz; "ausência" × fallback
  real] → `revisor.md:48` ("Uma das duas, sempre — nunca nenhuma") e `:73-79`. A descrição do
  fallback — "linha fora do formato é ignorada como se não existisse, e relato sem nenhuma linha
  válida é lido como `conforme`" — é exatamente o `reduce` com acumulador inicial `:conforme` e
  `nil -> atual`, e a justificativa ("erro de digitação não vira reprovação por acidente de
  parser") é a do `@doc` de `ler_conformidade/1`. Nada prometido além do código. A instrução "Onde
  escrever: dentro do `registrar_resultado`, em `resumo`" (`:55-57`) também confere com o código:
  `Trabalho.julgar(:revisor, ...)` (`lib/fabrica/fila/trabalho.ex:385-388`) lê a conformidade SÓ de
  `resumo.relatos` via `formatar_relatos/1`, e `formatar/1`
  (`lib/fabrica/ferramentas/registrar_resultado.ex:186-190`) põe o rótulo `## resumo` em linha
  própria — então a linha `[conformidade]` escrita logo na 1ª linha do `resumo` é lida (conferi
  porque a prova do executor só exercitou a linha na 2ª posição do `resumo`).
- [Critério 3 — restante íntegro, arquivo cresce] → `git show --stat 801671f`:
  `priv/doutrina/revisor.md | 42 ++++`, diff só com linhas `+`, inseridas entre o fim de "O formato
  dos achados" e "`registrar_resultado` é o ÚNICO canal"; nenhuma seção antiga tocada.
- Objetivo (no espírito): o agente revisor real passa a saber o formato exato, que ele é
  obrigatório e ONDE escrevê-lo para chegar ao portão — o caminho de reprovação por conformidade
  da T-075 deixa de depender de o agente adivinhar a linha. Cumpre.
- Escopo: nada além do pedido; a seção "Onde escrever" não é sobra — sem ela a linha escrita no
  texto da conversa cairia no mesmo fallback que a tarefa existe para evitar.
- Decisões (`DECISOES.md` D-013, decisão 3): é exatamente a T-077 que ela previu, nas `areas`
  previstas. Sem UI — prova visual não se aplica.

## Revisão

### Ciclo 1

Aprovado sem achados `critica`/`importante`. Commit `801671f` registrado corretamente nas Notas.

Pontos além do diff que precisei abrir, e por quê: `lib/fabrica/portoes/revisor.ex:202-245`
(o critério 2 exige a comparação linha a linha); `lib/fabrica/fila/trabalho.ex:376-418` e
`lib/fabrica/ferramentas/registrar_resultado.ex:123-190` (conferir a afirmação "Onde escrever" e
se o rótulo de seção do `formatar_relatos` não impede a leitura da 1ª linha do `resumo`).
Não rodei `mix test` (instrução do despacho; doutrina é texto, a bateria já rodou no testador).

Notas (nenhuma reprova):

- [menor] priv/doutrina/revisor.md:61-63 — a regra "texto antes de `[conformidade]` faz a linha
  não ser lida" não nomeia marcação Markdown, que é o que um modelo mais tende a acrescentar.
  Cenário: o agente escreve `**[conformidade] nao-conforme — X**` (ou entre crases) → o 1º `*`
  consome o marcador opcional `[-*]?`, o 2º falha em `\[` → linha ignorada → `:conforme` →
  aprovação silenciosa, justamente o modo de falha que a seção alerta. A letra da doutrina já
  cobre ("exatamente assim, sozinha na linha"), então não é promessa falsa; reforço sugerido para
  uma próxima edição da doutrina: "sem negrito, crase ou citação em volta".
- [menor] (pré-existente, FORA do diff — confirmo a sugestão do executor) priv/doutrina/revisor.md:80-88
  + lib/fabrica/fila/trabalho.ex:390,412-418 — a seção antiga "`registrar_resultado` é o ÚNICO
  canal" manda listar os achados "em `resumo`", mas `ler_achados/1` recebe
  `relatorio_do_agente/1`, que só junta blocos `:texto` das mensagens do assistente. Cenário: o
  revisor real segue a doutrina e escreve `[alto] lib/x.ex:10 — ...` só no `resumo` do
  `registrar_resultado` → `ler_achados` não vê a linha → zero achados → aprova por achados. A
  seção nova deixa a assimetria mais visível (para conformidade, "texto da conversa não chega ao
  portão"; para achados, é o contrário). Não é defeito desta tarefa (critério 3 proíbe reescrever a
  seção antiga, e o conserto certo é no código: `ler_achados` ler também `resumo.relatos`, como a
  conformidade já faz). **Candidata a tarefa própria**, `areas: [lib/fabrica/fila/trabalho.ex,
  test/fabrica/fila/trabalho_test.exs]` — decisão do orquestrador.
- [menor] processo — a Verificação foi aberta como `### Ciclo 2` com `tentativas: 1` e Notas em
  `### Ciclo 1` (numeração divergente do testador); e o critério 2, que é inspeção, saiu rotulado
  `[executado]`. Não muda o veredito.
