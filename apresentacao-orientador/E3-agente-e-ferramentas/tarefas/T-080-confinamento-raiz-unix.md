---
id: T-080
titulo: "Portabilidade Linux (B): `Confinamento.real/1` preserva a raiz `/` — arquivo novo em diretório novo deixa de ser julgado fora"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: []
areas: [lib/fabrica/ferramentas/confinamento.ex, test/fabrica/ferramentas/confinamento_test.exs]
tentativas: 1
criada: 2026-10-01
atualizada: 2026-10-01
---

## Objetivo
No Linux, `Confinamento.resolver/2` aceita um caminho DENTRO da raiz cujo diretório pai ainda não
existe (o caso normal de `escrever` criando arquivo em pasta nova). Hoje ele devolve
`{:erro, :fora_do_confinamento}` — o agente não consegue criar arquivo nenhum fora de diretório já
existente.

## Contexto
Causa raiz **B** da linha de base da bateria na nuvem
(`_gestao/evidencias/linha-de-base-nuvem-2026-10-01.txt`, 5 das 23 falhas).

Mecanismo (lido no código, `lib/fabrica/ferramentas/confinamento.ex`):
- `real/1` sobe pelos ancestrais EXISTENTES até a raiz do sistema. Em `/`, `Path.dirname("/") == "/"`
  e ele devolve `normalizar("/")` — que é `""`, porque `normalizar/1` faz
  `String.trim_trailing("/")`.
- Na volta, `Path.join("", "home")` dá `"home"`: todo caminho resolvido por ancestral existente
  vira RELATIVO (`home/user/.../raiz`), inclusive `raiz_real` em `dentro?/2`.
- Já um alvo cujo pai NÃO existe sai pelo outro ramo, `normalizar(caminho)`, ABSOLUTO
  (`/home/user/.../raiz/novo/arq`). Relativo contra absoluto: `sob?/2` responde falso.
- No Windows, `normalizar("C:/")` vira `"c:"` e `Path.join("c:", "users")` dá `"c:/users"` — a
  junção acerta por acaso. Por isso nunca apareceu.

O conserto é preservar a raiz (`/` continua `/` depois de normalizar, ou `real/1` trata a raiz do
sistema à parte) — escolha pelo código, sem mudar o que `normalizar/1` devolve para qualquer outro
caminho (ele é usado também por `Fabrica.Fila.Exclusao`). **Não mexa** na semântica de caixa nem
no tratamento de barra invertida: é a T-081, que depende desta.

Falhando hoje por esta causa: `confinamento_test.exs` :46 e :162, `arquivo_test.exs` :33 e :54,
`agente/ferramentas_test.exs` :43.

## Critérios de aceite
- [ ] Os testes de confinamento da causa B (:46 "arquivo que ainda NAO existe" e :162 "link que
      aponta para fora… alvo nao existe") passam no Linux, e há um teste novo que falha antes do
      conserto e afirma que um caminho sob a raiz, com DOIS níveis de diretório inexistentes, é
      aceito e volta absoluto.
      `verificar: mix test test/fabrica/ferramentas/confinamento_test.exs`
- [ ] `arquivo_test.exs` (:33 e :54 na linha de base) passa inteiro, sem alteração no teste.
      `verificar: mix test test/fabrica/ferramentas/arquivo_test.exs`
- [ ] `agente/ferramentas_test.exs:43` deixa de falhar pela causa B: as asserções de `ler`/`escrever`
      (até a linha 54) passam, sem alteração no teste. A falha que resta na linha 56 (`cmd /c echo oi`
      — `cmd` não existe no Linux) é causa C e foi movida para a T-081. (critério corrigido pelo
      orquestrador em 2026-10-01 — ver Notas)
- [ ] `normalizar/1` devolve o mesmo que antes para todo caminho que não seja a raiz do sistema
      (`/`, `C:/`), e nenhum teste de escape (`describe "escape …"`) teve expectativa afrouxada.
      (inspecionável — o revisor confere no diff)

## Notas de execução

### Ciclo 1

Impedimento: o critério 3 exige que `test/fabrica/agente/ferramentas_test.exs:43` passe inteiro SEM alterar o teste, mas na linha 56 ele roda `ferramentas["rodar"].(%{"programa" => "cmd", "args" => ["/c", "echo", "oi"]}, raiz)`, e `cmd` não existe no Linux (`command -v cmd` → código 1; o retorno é `{:erro, {:executavel_ausente, "cmd"}}`). A causa B saiu desse teste: antes ele falhava na linha 54 (`ler "nao/existe"` → `:fora_do_confinamento`); agora falha na 56, por uma 4ª causa que não é a B e não está na T-079 (bit de execução) nem na T-081 (caixa/barra invertida). Sugestão ao planejador: o critério 3 passa a ser "a falha de `:43` deixa de ser na linha 54", e uma tarefa nova (ou a T-081) troca `cmd /c echo oi` por um programa portátil (`echo`/`sh`), ou escolhe o programa pelo SO.

**O que foi feito** (`lib/fabrica/ferramentas/confinamento.ex`):
1. **`normalizar/1` preserva a raiz:** texto não vazio que fica vazio depois de tirar as barras finais era só barra, então volta `"/"` (`preservar_raiz/2`). Todo o resto sai igual a antes: `""`→`""`, `"a/b/"`→`"a/b"`, `"/home/x/"`→`"/home/x"`, e `C:/`→`c:` continua como era. Com isso `real/1` deixa de devolver caminho RELATIVO (`home/user/...`) para qualquer coisa resolvida a partir de `/`.
2. **`real/1` sobe por TODOS os ancestrais, existam ou não.** Antes ele parava no primeiro pai ausente e julgava o TEXTO. Consertar só a raiz deixaria passar, no Linux, uma fuga que já existe no Windows: `atalho-para-fora/novo/arq.txt` está todo dentro da raiz como texto, mas o `mkdir_p` de `escrever` atravessa o link e cria o arquivo FORA. Comprovado: com só o conserto da raiz (restaurando o `or not File.exists?(pai)`), o teste novo :269 falha (o caminho é aceito). Um componente ausente não é link (`read_link_all` falha) e só é anexado; o link mais acima é seguido.
3. **Teto de 40 saltos de link** (`@max_saltos`, o `MAXSYMLINKS` do Linux): com a subida completa, um ciclo `a -> b -> a` no meio do caminho travaria a resolução para sempre (antes ele parava cedo, porque `File.exists?` dá falso num ciclo). Quando o teto estoura, `real/2` faz `throw(:ciclo_de_links)`, `dentro?/2` captura e devolve `{:erro, :fora_do_confinamento}` (não há como provar que fica dentro). De quebra, isso conserta um travamento que já existia em `resolver(raiz, "ciclo-a")` (link cíclico direto).
4. **`sob?/2` com raiz `/`:** `com_barra/1` não duplica a barra (`"/" <> "/"` = `"//"` recusava tudo). Só muda o caso em que a raiz é a própria raiz do sistema; as raízes normalizadas nunca terminam em `/`.

Nenhum teste existente foi alterado, nenhum `describe "escape …"` foi afrouxado, e a semântica de caixa e de barra invertida não foi tocada (T-081).

**Testes novos** (`test/fabrica/ferramentas/confinamento_test.exs`, no FIM do arquivo de propósito: assim :97, :208 e :224 da linha de base da T-081 não mudam de linha):
- :245 dois níveis de diretório inexistentes: aceito, e volta absoluto (`== Path.join([Path.expand(raiz), "nivel1", "nivel2", "arquivo.txt"])`). Falhava antes do conserto.
- :253 `normalizar("/") == "/"` (falhava antes) · :257 `normalizar/1` igual a antes para o que não é raiz.
- `describe "escape 6"`: :269 link para fora + diretórios novos → recusado (é a trava contra o conserto ingênuo) · :281 link para dentro + diretórios novos → aceito (falhava antes) · :289 ciclo de links → recusado em vez de travar (`@tag timeout: 10_000`; antes estourava o tempo).

**Resultados (Linux, nuvem):**
- `mix test test/fabrica/ferramentas/confinamento_test.exs` → 35 testes, 3 falhas: :97, :208 e :224, todas da causa C / T-081, como previsto no despacho. :46 e :162 passam. Antes do conserto: 9 falhas.
- `mix test test/fabrica/ferramentas/arquivo_test.exs` → passa inteiro (:33 e :54 passam).
- `mix test test/fabrica/agente/ferramentas_test.exs` → só falha :43, agora na linha 56 (`cmd`), ver Impedimento.
- `test/fabrica/fila/exclusao_test.exs` (usa `normalizar/1`) → só falha :149, da T-081 e já na linha de base.
- `mix format --check-formatted` e `mix credo --strict` nos 2 arquivos tocados: sem apontamentos.

**Reproduzir:** `cd /home/user/Generic-Multi-Agents/projetos/fabrica-v2 && mix test test/fabrica/ferramentas/confinamento_test.exs test/fabrica/ferramentas/arquivo_test.exs test/fabrica/agente/ferramentas_test.exs` (esperado: só :97/:208/:224 do confinamento, da T-081, e :43 das ferramentas, que falha na linha 56 por causa do `cmd`)

**Fora do commit, de propósito:** `_gestao/MAPA.md` não foi regenerado e `_gestao/DECISOES.md` não foi tocado. O despacho manda commitar só as `areas` e este arquivo, porque a T-079 roda em paralelo. O MAPA não mudaria de conteúdo: nenhum arquivo novo, nenhum símbolo público novo, só `defp`. A decisão "o confinamento sobe por todos os ancestrais, com teto de 40 saltos" está registrada aqui. O orquestrador pode espelhá-la em DECISOES.md no commit de gestão.

**Commit:** `0db6f88`

**Orquestrador (2026-10-01) — impedimento resolvido, sem novo ciclo.** O critério 3 era erro MEU: exigi
`ferramentas_test.exs:43` inteiro, e o teste depende de `cmd` (linha 56) — um teste que assume Windows,
causa C da linha de base, não B. Critério reescrito para o que esta tarefa de fato conserta (a falha sai
das linhas de `ler`/`escrever`); o `cmd` foi para a T-081 (áreas e critério acrescentados lá). A entrega
deste ciclo fica como está → `em-teste`. A sugestão de fuga por link relativo (abaixo) virou a T-082.

**Sugestão de tarefa nova (achado do caminho, NÃO feito):** em `real/1`, o destino RELATIVO de um link é expandido contra o `Path.dirname(caminho)` TEXTUAL, e não contra o diretório real. Se um componente do meio já for link, isso diverge do que o kernel faz. Exemplo: `raiz/d1/d2/atalho -> /tmp` e `/tmp/l -> ../../x`. O texto dá `raiz/d1/x` (dentro), e o acesso real vai a `/x` (fora). É uma fuga que já existia nas duas plataformas, independente da causa B. O conserto provável é expandir contra `real(Path.dirname(caminho))`.

## Verificação

### Ciclo 1

- **[PASSOU] [executado] Critério 1: testes de confinamento :46 e :162 passam, e há teste novo que falha antes e passa depois**
  Comando: `mix test test/fabrica/ferramentas/confinamento_test.exs`
  Saída: 35 testes, 3 falhas (todas da T-081: :97, :208, :224). Testes :46 "arquivo que ainda NAO existe" e :162 "o resolvedor segue link mesmo quando o alvo nao existe" passaram. Novos testes :245 "dois niveis de diretorio inexistentes", :253 "normalizar preserva raiz", :257 "normalizar igual antes", e escape 6 (:269, :281, :289) passaram.

- **[PASSOU] [executado] Critério 2: arquivo_test.exs (:33 e :54) passa inteiro**
  Comando: `mix test test/fabrica/ferramentas/arquivo_test.exs`
  Saída: 30 testes, 0 falhas. Testes :33 e :54 (causas B da linha de base) agora passam.

- **[PASSOU] [executado] Critério 3: agente/ferramentas_test.exs:43 deixa de falhar pela causa B**
  Comando: `mix test test/fabrica/agente/ferramentas_test.exs`
  Saída: 10 testes, 1 falha na linha 56 (`cmd` não existe). Linhas 43-54 (`ler`/`escrever`) passaram com sucesso. Causa B resolvida; causa C (T-081) permanece como esperado.

- **[PASSOU] [julgado] Critério 4: normalizar/1 preserva raiz e não afroxa escapes**
  Comando: Inspeção de código + verificação de testes
  Base: Implementação de `normalizar/1` (lib/fabrica/ferramentas/confinamento.ex) usa `preservar_raiz/2` que retorna `"/"` quando o texto fica vazio após tirar barras finais, mantendo tudo igual para outros caminhos. Todos os 6 blocos de escape (escape 1-6, linhas 64-299 em confinamento_test.exs) têm suas asserções mantidas: nenhum expectativa foi afrouxada. Novos testes de escape 6 e T-080 passam, confirmando que os links são resolvidos integralmente.

Suíte completa: 1192 testes, 5 falhas (todas da T-081) — sem regressão
Graus de prova: 3 executados, 1 julgado

## Conformidade

### Ciclo 1

Conformidade: cumpre

Revisado contra o texto ATUAL dos critérios (critério 3 reescrito pelo orquestrador em `d9a4a7b`). Diff
revisado: `0db6f88` (código + testes) e `2d3b59e` (hash). Os commits da T-079 no meio da faixa não foram
considerados.

- [Critério 1: :46 e :162 passam; teste novo com dois níveis inexistentes, aceito e absoluto] →
  `test/fabrica/ferramentas/confinamento_test.exs:245` (`resolver(raiz, "nivel1/nivel2/arquivo.txt")`,
  `Path.type == :absolute` e igualdade com `Path.join([Path.expand(raiz), ...])`); :46/:162 verdes na
  Verificação. "Falha antes do conserto" conferido pelo mecanismo: com `normalizar("/") == ""` a raiz real
  ficava relativa e o alvo com pai ausente saía absoluto, então `sob?/2` recusava.
- [Critério 2: `arquivo_test.exs` inteiro, sem alteração no teste] → o diff não toca esse arquivo; 30/0 na
  Verificação.
- [Critério 3: `ferramentas_test.exs:43` deixa de falhar pela causa B, sem alteração no teste] → o diff não
  toca o teste; a falha restante é na linha 56 (`cmd`), que foi para a T-081.
- [Critério 4: `normalizar/1` só muda na raiz; nenhum escape afrouxado] → `confinamento.ex`,
  `preservar_raiz/2`: só age quando o texto fica VAZIO depois de tirar as barras finais. Isso acontece
  apenas com entrada feita só de barras (`/`, `//`, `\`), e todas são formas da raiz. `C:/` → `c:` continua
  igual, `""` → `""` também, e há testes em :253/:257. No arquivo de teste o diff é só acréscimo (hunk
  `@@ -237,4 +237,65 @@`): nenhuma asserção de `describe "escape …"` existente foi mexida.
- [Objetivo] → cumprido no espírito: no Linux, `escrever` volta a criar arquivo em pasta nova e não
  abre fuga.
- [Escopo: a subida por todos os ancestrais e o teto de 40 saltos] → **não é sobra fora de escopo, é
  o conserto mínimo SEGURO.** Antes, no Linux, `atalho-para-fora/novo/arq` era recusado POR ACIDENTE,
  porque todo pai ausente caía no próprio bug. Só com o conserto da raiz, esse caminho passaria a ser
  aceito pelo texto e o `mkdir_p` de `escrever` o criaria fora: o conserto pedido, sozinho, abriria uma
  regressão de segurança no Linux. O teste :269 trava isso, e a decisão está no adendo da D-014. As `areas`
  foram respeitadas (só os 2 arquivos declarados e a tarefa). O teto de saltos vem obrigatoriamente da
  subida completa: sem ele, um ciclo de links travaria a resolução.
- [Prova visual] → não se aplica (sem interface).

## Revisão

### Ciclo 1

**Aprovado sem ressalvas** (uma nota `menor`, que não reprova).

O que verifiquei no diff (`git show 0db6f88`), com foco no confinamento:

- **Nenhuma fuga nova.** O comportamento só muda em dois casos. (a) Quando algum ancestral não existe:
  antes o código julgava o TEXTO, agora sobe e segue os links acima. (b) Na raiz `/`. Em (a), a resolução
  passa a seguir o kernel mais de perto, nunca menos. A única divergência que sobra é a do destino
  RELATIVO resolvido contra o `dirname` textual (T-082), e ela já valia igual antes, inclusive para
  caminhos existentes. Casos conferidos à mão no código:
  - link para fora seguido de diretórios novos → o link é seguido até o destino e o caminho é recusado (:269);
  - link para `/` (`atalho -> /`): `atalho/etc/novo/x` resolve para `/etc/novo/x` e é recusado; `atalho`
    sozinho resolve para `/`, e `sob?("/…/raiz", "/")` é falso, então também é recusado;
  - link relativo `..` → `Path.expand("..", dirname)` sai para o pai da raiz → recusado;
  - ciclo (`a -> b -> a` e `a -> a`) → no 41º salto, `throw(:ciclo_de_links)`, que é capturado no `catch`
    de `dentro?/2` e vira `{:erro, :fora_do_confinamento}`. `real/1,2` é `defp` e só é chamado de
    `dentro?/2` (linhas 80-81), então o `throw` não vaza para quem chama. Isso também conserta um
    travamento antigo em `resolver(raiz, "ciclo-a")`.
- **Terminação.** Cada chamada de `real/2` faz no máximo UMA recursão. O passo sem link encurta o caminho
  (`dirname` de caminho absoluto chega a um ponto fixo). O passo com link soma 1 em `saltos`, que tem
  teto de 40. Logo, termina sempre. Todo caminho que chega a `real/2` é absoluto (`juntar/2` e o destino
  de link passam por `Path.expand`).
- **`sob?/2` com a raiz `/`.** `com_barra/1` só muda raiz que já termina em `/`, e entre as raízes
  normalizadas só a própria `/` termina assim. Raiz configurada `/` passar a aceitar todo caminho
  absoluto é a semântica certa; antes ela recusava tudo.
- **Windows (só por inspeção).** `normalizar("C:/")` continua `c:`, porque `preservar_raiz` não age em
  texto não vazio. `com_barra("c:")` dá `c:/`, igual ao antigo `raiz <> "/"`. Tirar o
  `not File.exists?(pai)` só muda o caso de pai ausente: a subida chega a `c:/` e para no mesmo
  `pai == caminho` que já encerrava a subida para pais existentes. A fuga `atalho-para-fora/novo/arq`
  (por junção), que já existia no Windows, passa a ser fechada.
- **`Fabrica.Fila.Exclusao`** usa `normalizar/1` em `MapSet` de `areas` (`exclusao.ex:85-99`). Só muda
  área declarada como a própria raiz, o que não é plausível.
- **Testes de escape:** só acréscimos, nenhuma expectativa afrouxada (ver Conformidade, critério 4).

Fora do diff, abri apenas `confinamento.ex:1-170` (`juntar/2`, `absoluto?/1`, `recusar_unc/1`) e
`confinamento_test.exs:110-165` (`criar_link/2`). Precisei deles para conferir dois pontos: que todo
caminho chega a `real/2` já absoluto e expandido, e como o link é criado no Windows.

- [menor] `test/fabrica/ferramentas/confinamento_test.exs:294` — no Windows, `criar_link(b, a)` cria a
  junção `ciclo-a` para um destino que ainda não existe (`ciclo-b` só nasce na linha seguinte). Daqui
  não dá para confirmar se `mklink /J` aceita essa ordem. Se recusar, o teste falha no `assert :ok`, ou
  seja, falha de forma visível e não passa em vazio, e não há fuga. Vale conferir na próxima bateria
  Windows.

