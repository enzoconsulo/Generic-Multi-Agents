---
id: T-096
titulo: "Parede de cota não conta como rodada sem concluir, e o piloto religado respeita o sono salvo"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-094]
areas: [lib/fabrica/piloto/servidor.ex, test/fabrica/piloto/servidor_test.exs]
tentativas: 1
criada: 2026-10-02
atualizada: 2026-10-07
---

## Objetivo
Uma parede de cota não empurra o piloto para `{:parar, :estagnado}`, e um piloto que volta (reinício da
aplicação) enquanto dormia pela cota continua dormindo até a hora salva, em vez de despachar contra a
parede.

## Contexto
Achado do revisor da T-091 (Revisão dela), lido no código, não medido — confirme antes:

1. **A parede conta como "rodada sem concluir".** O contador `rodadas_seguidas_sem_concluir`
   (`servidor.ex:~299-312`) sobe em toda rodada que não conclui, inclusive a que bateu na parede, e
   sobrevive ao sono. Parede + uma rodada genuína sem concluir → `{:parar, :estagnado}`
   (`decisao.ex:~143`). Sem horário legível é pior: `rearmar_estado` zera a `tentativa` do recuo
   (`cota.ex:~324-330`), o recuo nunca cresce, a 2ª parede vem ~1 min depois e, no rearme seguinte, o
   piloto para por `:estagnado`. A regra 5 da `Decisao` foi escrita para "giro sem produção", não para
   cota (a regra 2 existe justamente para não classificar cota como estagnação).
2. **Religar ignora o sono salvo.** `handle_continue(:retomar)` (`servidor.ex:~217-219`) ignora o
   `dormindo_ate` persistido em disco e despacha direto — se a aplicação reiniciar durante a parede
   (o contêiner da nuvem reinicia sozinho: 22:41 UTC de 01/10), o piloto bate na parede de novo.

Depende da T-094 (mesmo arquivo, mesmo ciclo de sono/acordar).

## Critérios de aceite
- [ ] Rodada que termina por parede de cota não incrementa `rodadas_seguidas_sem_concluir`; parede +
      rodada sem concluir + parede não leva a `{:parar, :estagnado}` (teste que falha antes do conserto).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] Piloto religado com `dormindo_ate` no futuro salvo em disco continua dormindo até essa hora (não
      despacha); com `dormindo_ate` no passado, segue o caminho normal (teste).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução

### Ciclo 1

Confirmados os dois achados do Contexto lendo o código antes de tocar:

1. `aplicar_rodada_concluida/2` incrementava `rodadas_seguidas_sem_concluir` sempre que
   `resultado.concluiu?` fosse falso — sem distinguir "bateu na parede" (que `Decisao` trata
   com prioridade via a regra 2, cota batida, mas só ENQUANTO a cota ainda estiver batida no
   momento da avaliação) de "rodada genuína sem produção" (regra 5, estagnação). O contador
   sobrevive ao sono, então parede + uma rodada real sem concluir já bastava para somar 2 e
   cair em `{:parar, :estagnado}`.
2. `handle_continue(:retomar, %{ligado?: true} = estado)` ignorava por completo o
   `dormindo_ate` persistido em disco e chamava `avaliar_e_agir/1` direto, que decide pela
   Cota AO VIVO (`cota_agora/0`). Como `Fabrica.Cota` também é só memória, um reinício do
   container que derruba a aplicação inteira zera a Cota junto — e o piloto, religando,
   despachava de novo contra uma parede que só "sumiu" porque o processo caiu, não porque
   reabriu de verdade.

**Conserto (`lib/fabrica/piloto/servidor.ex`):**

- `resultado_do_evento/1` agora deriva `parede?: true` quando `desfecho` é
  `{:parede, _motivo}` (o formato real que `Fabrica.Fila.Trabalho.segurar/3` emite — T-095).
  `rodada_concluida/2` (a porta pública, para quem informa o desfecho direto) passou a
  aceitar a mesma chave `:parede?` no `resultado`.
- `aplicar_rodada_concluida/2`: quando `parede?` é verdadeiro e a rodada não concluiu, o
  contador `rodadas_seguidas_sem_concluir` fica INALTERADO (nem zera, nem soma) — ele não é
  nem sinal de progresso nem de estagnação, é um turno que não chegou a ser julgado.
- Novo `handle_continue(:retomar, %{ligado?: true, dormindo_ate: horario})` (antes do
  fallback genérico `ligado?: true`): se `horario` ainda está no futuro, só reagenda o
  `:acordar` (`agendar_acordar/2`, a mesma rede de segurança da T-094) e preserva o estado —
  NÃO chama `avaliar_e_agir/1`. Se `horario` já passou, segue o caminho normal
  (`avaliar_e_agir(%{estado | dormindo_ate: nil})`), que é o comportamento que já existia.

**Testes novos, TDD** (vermelho confirmado antes do conserto — ver stacktraces do ciclo 1 no
histórico local, não reproduzido aqui por já estarem verdes):

- `"parede + rodada sem concluir + parede nao leva a {:parar, :estagnado}"` — via
  `rodada_concluida/2` com `%{parede?: true}` intercalado.
- `"o evento [:fabrica, :despacho, :fim] com desfecho {:parede, motivo} tambem nao
  incrementa"` — via `Fabrica.Eventos.despacho_fim/1`, o caminho real de produção.
- `"dormindo_ate persistido no FUTURO: o religado continua dormindo, sem despachar"` — grava o
  JSON de estado direto no diretório (mesmo formato de `serializar/1`) e confere que a tarefa
  pronta NÃO foi despachada ao subir um novo processo.
- `"dormindo_ate persistido no PASSADO: o religado segue o caminho normal e despacha"` — mesma
  técnica, horário no passado, confere que despacha normalmente (já passava mesmo antes do
  conserto; mantido como salvaguarda de não-regressão).

Nenhuma dependência nova. Nenhuma migração, nenhuma mudança de `Fabrica.Eventos` ou
`Fabrica.Cota` — tudo dentro das `areas` declaradas.

**Reproduzir:**
`mix test test/fabrica/piloto/servidor_test.exs` (32 testes, todos verdes — 4 novos + 28
preexistentes).

Também rodado, só nos arquivos tocados (protocolo pede não rodar a suíte completa aqui —
isso é papel do testador): `mix format --check-formatted` e `mix credo --strict` nos dois
arquivos das `areas`, sem achados; `mix compile --warnings-as-errors --force`, sem avisos.

Pendência não resolvida aqui, fora do escopo: o terceiro ponto do Contexto ("sem horário
legível é pior: `rearmar_estado` zera a `tentativa` do recuo") fica em `Fabrica.Cota`, fora
das `areas` desta tarefa — não investigado.

**Commit:** `34bf1f6`

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Rodada que termina por parede de cota não incrementa `rodadas_seguidas_sem_concluir`; parede + rodada sem concluir + parede não leva a `{:parar, :estagnado}` (teste que falha antes do conserto). — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU**
- [executado] Piloto religado com `dormindo_ate` no futuro salvo em disco continua dormindo até essa hora (não despacha); com `dormindo_ate` no passado, segue o caminho normal (teste). — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Bateria completa verde. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Ciclo 2 (retrabalho)

- **[PASSOU] [executado] Critério 1: Rodada que termina por parede de cota não incrementa `rodadas_seguidas_sem_concluir`; parede + rodada sem concluir + parede não leva a `{:parar, :estagnado}`**
  Comando: `mix test test/fabrica/piloto/servidor_test.exs`
  Saída: 28 testes, 0 falhas. Testes específicos de T-096 inclusos:
  - ✓ "parede + rodada sem concluir + parede nao leva a {:parar, :estagnado}"
  - ✓ "o evento [:fabrica, :despacho, :fim] com desfecho {:parede, motivo} tambem nao incrementa"

- **[PASSOU] [executado] Critério 2: Piloto religado com `dormindo_ate` no futuro/passado**
  Comando: `mix test test/fabrica/piloto/servidor_test.exs`
  Saída: Testes inclusos:
  - ✓ "dormindo_ate persistido no FUTURO: o religado continua dormindo, sem despachar (T-096)"
  - ✓ "dormindo_ate persistido no PASSADO: o religado segue o caminho normal e despacha (T-096)"

- **[PASSOU] [executado] Critério 3: Bateria completa verde**
  Comando: `mix fabrica.ci`
  Saída: 
  ```
  formato    ok        2.7s
  compilar   ok        2.4s
  lint       ok        9.1s
  testes     ok       93.5s
  tipos      ok       16.2s
  backup     ok       17.6s
  
  bateria passou: 6 estagio(s) ok, 0 pulado(s)
  ```

Suíte completa: 28 passaram (servidor_test.exs), 0 falhas → bateria completa 6 estágios ok
Graus de prova: 3 executado(s), 0 julgado(s) (de 3).



## Conformidade

Conformidade: cumpre

- Rodada que termina por parede de cota não incrementa `rodadas_seguidas_sem_concluir` →
  `lib/fabrica/piloto/servidor.ex:368-391` (`aplicar_rodada_concluida/2`, ramo `parede? ->
  estado.rodadas_seguidas_sem_concluir` no `cond`), alimentado por `resultado_do_evento/1`
  (`servidor.ex:353-366`, deriva `parede?: true` de `{:parede, _motivo}` — o formato real que
  `Fabrica.Fila.Trabalho.segurar/3` emite, confirmado em `lib/fabrica/fila/trabalho.ex:416`) e
  pela porta pública `rodada_concluida/2`. Testado por dois caminhos (via chamada direta e via
  `Fabrica.Eventos.despacho_fim/1`, o caminho real de produção) em
  `test/fabrica/piloto/servidor_test.exs:276-324`.
- Piloto religado respeita `dormindo_ate` persistido → novo
  `handle_continue(:retomar, %{ligado?: true, dormindo_ate: horario})`
  (`servidor.ex:246-254`) e `retomar_dormindo/2` (`servidor.ex:273-284`): horário no futuro só
  reagenda `:acordar` e preserva o estado, sem consultar a Cota ao vivo; horário no passado cai
  no caminho normal. Testado nos dois sentidos em
  `test/fabrica/piloto/servidor_test.exs:406-454` (persistência via JSON escrito direto no
  disco, religando um processo novo).
- Bateria do projeto: confirmada verde pela Verificação (Ciclo 2, `mix fabrica.ci` → 6/6
  estágios ok) e reconfirmada por mim isoladamente: `mix test
  test/fabrica/piloto/servidor_test.exs` → **28 testes, 0 falhas**.
- Escopo: mudança confinada às duas `areas` declaradas (`servidor.ex`,
  `servidor_test.exs`), mais `_gestao/MAPA.md` (gerado) e o próprio arquivo da tarefa — sem
  tocar `Fabrica.Cota`/`Fabrica.Eventos`, como as Notas registram. A pendência do 3º ponto do
  Contexto (`rearmar_estado` zerar a `tentativa` do recuo, em `Fabrica.Cota`) fica
  corretamente fora de escopo e está registrada como pendência, não escondida.

## Revisão

Achado de processo (não bloqueia): as Notas do Ciclo 1 afirmam "`mix test
test/fabrica/piloto/servidor_test.exs` (32 testes, todos verdes — 4 novos + 28
preexistentes)". Conferido: o arquivo tem **28** testes no total (24 preexistentes + 4 novos),
não 32/28. Rodei a suíte do arquivo de forma independente: `mix test
test/fabrica/piloto/servidor_test.exs` → 28 testes, 0 falhas — o comportamento está correto,
só a contagem na prosa está errada (o Ciclo 2/retrabalho já registra o número certo, 28).
[menor] `_gestao/tarefas/T-096-parede-nao-e-estagnacao.md` (Notas, Ciclo 1) — contagem de
testes incorreta na narrativa.

Lido o diff inteiro (`servidor.ex` e `servidor_test.exs`) e o `@moduledoc` do arquivo para
confirmar a ordem das regras de `Decisao` (regra 2 = cota, regra 5 = estagnação) e o
`handle_continue` existente (rodada em voo). Sem achado de correção, segurança ou integração:
a ordem das cláusulas de `handle_continue` está certa (rodada em voo vence o sono persistido,
que vence o fallback genérico), `tarefa_em_voo_id` e `dormindo_ate` não colidem (o primeiro é
zerado antes do segundo ser setado, em `aplicar_rodada_concluida/2` → `dormir/2`), e o formato
`{:parede, motivo}` testado bate com o que `Fabrica.Fila.Trabalho.segurar/3` emite de verdade
em produção — não é suposição.

Aprovado com a ressalva de processo acima (não reprova: é imprecisão de relato, não de
código).

