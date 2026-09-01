---
id: T-020
titulo: MARCO da v0.2: uma tarefa resolvida, e o prefixo escrito uma vez
projeto: fabrica-v2
versao: v0.2
status: em-execucao
prioridade: alta
dependencias: [T-016, T-017, T-018, T-018a, T-019, T-020a]
areas: [_gestao/PROGRESSO.md, priv/probes/marco_v02_agente.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-09-01
---

## Objetivo
Verificar os DOIS marcos da v0.2: um agente resolve uma tarefa real de ponta a ponta com
custo por volta gravado; e o prefixo do projeto e escrito uma vez e lido pelos despachos
seguintes.

## Contexto
Tarefa de verificacao — nada de codigo novo.

**Marco 1.** Escolha uma tarefa real e pequena num projeto de verdade (crie um projeto de
teste com 3 arquivos, se preciso). Despache um agente com `Operario.ClaudeCLI`. Confira:
a tarefa foi resolvida, ha uma linha em `consumos` por volta, e a soma bate com o total.

**Marco 2, e e este que decide se o `MessagesAPI` se justifica.** Rode DOIS despachos
seguidos no mesmo projeto com `Operario.MessagesAPI` e compare:

    despacho 1: cache_creation_input_tokens alto,  cache_read_input_tokens ~zero
    despacho 2: cache_creation_input_tokens ~zero, cache_read_input_tokens alto

Se o segundo despacho tambem escrever o prefixo, ha invalidador silencioso — e o
diagnostico e diffar os bytes do prefixo entre as duas requisicoes ate achar o que mudou.

Este marco CUSTA DINHEIRO de verdade (e o unico ponto do plano que usa chave de API).
Estime antes, declare o teto, e rode com o prefixo menor possivel que ainda passe do minimo
cacheavel. Registre o gasto real em `_gestao/PROGRESSO.md` ao lado do veredito.

Compare tambem contra a linha de base da T-008: a v1 grava ~50% da conta de entrada em
escrita de cache. Se a v2 nao melhorar isso, o `ClaudeCLI` fica como padrao e o
`MessagesAPI` volta para a prateleira — o que e uma resposta legitima, e precisa estar
escrita.

## Criterios de aceite
- [ ] Um agente resolve uma tarefa real e ha uma linha de consumo por volta, com soma batendo com o total.
- [ ] Dois despachos seguidos no mesmo projeto: o segundo LE o prefixo em vez de escrever (numeros registrados).
- [ ] O gasto real do marco 2 esta registrado em `_gestao/PROGRESSO.md`, com o teto declarado antes.
- [ ] O veredito compara com a linha de base da T-008 e diz explicitamente se o `MessagesAPI` se justifica.

## Notas de execucao

### Ciclo 1 — 31/08, aberto e REPROVADO antes de qualquer medicao

O primeiro probe contra o `claude` real devolveu `{:erro, :saida_ininteligivel}`. Causa:
o `Operario.ClaudeCLI` montava uma linha de comando que o CLI REJEITA (faltava `--verbose`).
Quatro defeitos, corrigidos na **T-018a** (concluida). Probe versionado em
`priv/probes/cli_real.exs`.

A revisao da T-018a deixou um achado sem conserto: o `Agente.Laco` nao repassava `estado.raiz`
ao operario, entao o agente conversaria com o `claude` no diretorio de quem chamou e nao no do
projeto. Corrigido na **T-020a** (concluida, commit `991c95d`) — e o dubl e passou a gravar as
opcoes recebidas, para que a proxima opcao esquecida nao seja invisivel para a suite.

### Ciclo 2 — 31/08, marco 1 reaberto

Reaberto so o **marco 1**, que roda o `ClaudeCLI` sob a assinatura: consome cota, **nao gera
fatura**. O marco 2 segue bloqueado por ausencia de `ANTHROPIC_API_KEY` — busca feita em
31/08 nas variaveis de ambiente `User` e `Machine`, em todo `.env` de `Documents`, nos projetos
vizinhos e em `~/.claude`: **a chave nao existe nesta maquina**.

Duas decisoes do orquestrador, registradas porque divergem do padrao:

1. **`areas` ampliada** para incluir `priv/probes/marco_v02_agente.exs`. O marco precisa de um
   instrumento que ainda nao existe, e o CLAUDE.md e explicito: arquivo que o agente vai tocar
   entra nas `areas` ANTES do despacho, ou nao se manda tocar nele.
2. **O marco 1 foi despachado ao `testador` em `sonnet`, e nao no `haiku` do papel.** A regra
   que poe o testador em haiku se apoia no revisor que vem depois; **um marco nao tem revisor
   atras dele**, e este marco especificamente ja produziu um veredito de reprovacao com quatro
   defeitos de diagnostico. Julgamento barato em portao sem rede de seguranca e aprovacao falsa
   — o mesmo argumento que mantem o `conferente` fora do haiku.



### Ciclo 2 — CORTADO pela cota antes de comecar, e nao reprovado

O despacho de 31/08 morreu com `session limit` (HTTP 429), reposta as 01h20 de 01/09. Saneamento
de 01/09: as duas arvores git limpas, `priv/probes/marco_v02_agente.exs` nunca criado, tarefa
ainda `pronta`. **O corte foi antes de qualquer escrita** — o custo foi o despacho, nao trabalho
perdido. `tentativas` fica em 0 de proposito: corte por cota nao e reprovacao e nao gasta ficha.

Licao aplicada no redespacho: o probe passa a ser **escrito e salvo em disco antes** de ser
rodado. Instrumento salvo sobrevive a um corte; instrumento na cabeca do agente, nao.

### Ciclo 3 — 01/09, marco 1 redespachado

## Verificacao

### Ciclo 3

Instrumento escrito e salvo ANTES de rodar, em `priv/probes/marco_v02_agente.exs` (areas da
tarefa). Cria um projeto de mentira (README.md + a.txt + b.txt) em diretorio temporario,
roda `Agente.Laco.rodar/1` com `raiz:` apontando para ele e `Operario.ClaudeCLI` configurado
via `Application.put_env(:fabrica, :operario, ClaudeCLI)`, pede para o modelo escrever um
`resultado.txt` com uma senha unica, e persiste despacho + consumos via
`Tarefas.Transicao.aplicar/3` (ligacao Laco→Transicao que ate onde se sabe nao existe pronta
— feita explicitamente pelo probe, criando `Projeto`/`Tarefa` de mentira so para a medicao).
Rodado de verdade contra o `claude` real (`mix run priv/probes/marco_v02_agente.exs`), duas
vezes: a primeira com prompt multi-linha (achado secundario abaixo), a segunda — a que conta
— com prompt de linha unica.

- **[FALHOU] [executado] Criterio 1: Um agente resolve uma tarefa real e ha uma linha de
  consumo por volta, com soma batendo com o total.**
  Comando: `mix run priv/probes/marco_v02_agente.exs`
  Esperado: as tres afirmacoes do criterio — (1) `resultado.txt` criado no disco com a senha
  pedida; (2) uma linha de `consumos` no BANCO por volta do laco; (3) a soma dessas linhas
  batendo com o total acumulado no estado do laco.
  Obtido: **2 das 3 afirmacoes passam; a que decide o criterio FALHA.**
  - Afirmacao 1 (tarefa resolvida de verdade) **FALHOU**: `File.read(alvo) == {:error, :enoent}`
    — o arquivo nunca foi criado. Isolando a causa FORA do Laco (chamando
    `Fabrica.Ferramentas.Comando.rodar_separado/3` com a mesma linha que
    `ClaudeCLI.linha/1` monta, prompt de uma linha so, diretorio comum sem 8.3): o `claude`
    real devolve, no proprio stream, um evento `tool_result` de `Write` com `is_error: true`
    e a mensagem *"Claude requested permissions to write to ..., which contains a suspicious
    Windows path pattern that requires manual approval"* — e o MESMO nego ocorre num
    diretorio sem forma curta (`priv/probes/_diag_raiz`, caminho longo comum), entao a causa
    nao e o 8.3: e a AUSENCIA de qualquer flag de modo de permissao
    (`--permission-mode`/`--dangerously-skip-permissions`) na linha que
    `Fabrica.Operario.ClaudeCLI.linha/1` monta. Em `--print` headless nao ha quem aprove, a
    aprovacao nunca chega, e a ferramenta de escrita e sempre negada.
  - Afirmacao 2 (uma linha de consumo por volta, no banco) **PASSOU**: 1 volta no laco → 1
    linha em `consumos`, gravada com `volta: 1` via `Transicao.aplicar/3`.
  - Afirmacao 3 (soma bate com o total do estado) **PASSOU**: soma de tokens no
    `resumo.consumos` do laco = 95558; soma das linhas lidas de volta do banco = 95558.
  Reproduzir: 1) `mix run priv/probes/marco_v02_agente.exs`; 2) ver `resumo.desfecho == :erro`
  apos so 1 volta e `afirmacao_1: FALHOU` no relatorio impresso; 3) para ver a negacao de
  permissao isolada (sem o Laco no meio): montar
  `claude --print --verbose --output-format stream-json --model haiku "<pedido de escrever
  arquivo>"` e rodar via `Comando.rodar_separado/3` — o `tool_result` do `Write` volta com
  `is_error: true`, `subtype: "permission_denied"`.

- **Achado secundario, mesma corrida — nao decide o veredito sozinho, mas e real e
  reproduzivel.** Na 1a volta o CLI ainda produz uma resposta interpretavel (consumo real:
  entrada=34, cache_leitura=91098, cache_escrita=3701, saida=725), porque o `tool_use` do
  `Write` negado fica registrado no meio do stream. `ClaudeCLI.montar/1` calcula
  `motivo_parada` olhando **todos os blocos do stream inteiro** (nao so do ultimo turno) —
  entao esse `tool_use`, ainda que ja resolvido/negado pelo proprio CLI, faz o adaptador
  devolver `:uso_de_ferramenta` para o `Laco`. O `Laco` tenta entao executar "Write" pelo
  SEU proprio mapa `ferramentas` (vazio no probe, e sem correspondencia possivel de qualquer
  jeito — o `Laco` nao conhece o vocabulario de ferramentas do CLI real: Write, Bash, Edit,
  Read...), grava "ferramenta desconhecida" e chama o operario de novo. Essa 2a chamada, com
  o historico maior (a resposta anterior serializada por `inspect/1` em
  `texto_da_mensagem/1`), devolve stdout e stderr **vazios**, codigo 255 —
  `{:erro, :saida_ininteligivel}` — encerrando o laco. E a mesma classe de defeito que abriu
  a T-018a (linha de comando montada por interpolacao de string, sem escapar o que pode
  quebrar o `.bat` no Windows), so que agora disparada por conteudo GERADO pela propria
  conversa, nao pelo prompt do usuario.

- Criterios 2, 3 e 4 (marco 2, `MessagesAPI`): **bloqueados, nao tentados**, por instrucao
  explicita do despacho — nao existe `ANTHROPIC_API_KEY` nesta maquina (busca ja registrada
  nas Notas de execucao do Ciclo 2, refeita aqui: sem novidade). Nao procurei a chave, nao a
  defini, nao chamei a API da Anthropic, nao escrevi o probe do marco 2. Ficam sem marca
  PASSOU/FALHOU — sao trabalho fora do escopo desta verificacao, nao criterios reprovados.

**Causa raiz do Criterio 1: MULTIPLA, tres causas independentes** (a distincao que decide o
proximo passo):
  1. `Operario.ClaudeCLI` nunca configura modo de permissao para operacao headless — bloqueia
     QUALQUER tarefa real que precise escrever arquivo ou rodar comando via `claude --print`,
     nao so esta.
  2. O modelo de ferramentas do `Agente.Laco` (dispatch por nome, num mapa que o CHAMADOR
     registra) e estruturalmente incompativel com `Operario.ClaudeCLI`: o vocabulario real de
     `tool_use` vem de DENTRO do CLI (Write, Bash, Edit, Read...), nao do que o `Laco`
     conhece. Mesmo corrigindo (1), o `Laco` ainda tentaria "executar de novo" ferramentas que
     o proprio CLI ja executou ou tentou executar sozinho.
  3. Dentro de (2): `ClaudeCLI.montar/1` calcula `motivo_parada` a partir de TODOS os blocos
     do stream inteiro da chamada, e nao so do ultimo turno — um `tool_use` ja resolvido pelo
     proprio CLI ainda aparece para o `Laco` como "ha ferramenta pendente".

Nao consertei nenhum dos tres: sao codigo de producao (`lib/fabrica/operario/claude_cli.ex`,
`lib/fabrica/agente/laco.ex`), fora do meu mandato.

Suíte completa: `mix fabrica.ci` — 5 estagios (formato, compilar, lint, testes, tipos), todos
ok. O probe novo (`priv/probes/marco_v02_agente.exs`) nao quebra formato nem lint.
Captura: não aplicável — marco de backend/CLI, sem interface.
Graus de prova: 1 executado (criterio 1, com isolamento adicional executado fora do Laco
para achar a causa raiz), 3 bloqueados/nao tentados por decisao do despacho (criterios 2-4).

## Conformidade


## Revisao

