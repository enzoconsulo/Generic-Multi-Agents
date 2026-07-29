---
id: T-042
titulo: Auditoria de custo e desempenho — esforço por ação, busca duplicada e recálculo por cartão
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: []
areas: [servidor/src/jobs/robustez/guardrails.ts, web/src/lib/useDados.ts, web/src/lib/gestao.ts]
tentativas: 0
criada: 2026-07-29
atualizada: 2026-07-29
---

## Objetivo
Fechar o balanço custo × desempenho com medição, não com impressão: cortar o que é
desperdício puro e deixar registrado o que é gasto legítimo.

## Contexto
Pergunta do usuário: *"o desempenho já está ótimo? o custo já está otimizado? uma balança
equilibrada entre esses 2 setores?"*. Auditei em vez de responder de memória, e achei três
desperdícios — os três introduzidos por mim nas tarefas recentes:

1. **`effort` nunca foi configurado em fluxo nenhum.** Todos rodam no padrão (`high`),
   inclusive os mecânicos. `conferir` e `progresso` são zeladoria — validar frontmatter e
   consolidar um arquivo de texto não exigem o teto de raciocínio.
2. **`/api/fabrica` é buscado 4× na mesma página** e `/api/acoes-projeto` 2×, porque
   `useDados` não deduplica: cada componente que precisa do dado abre a própria requisição.
3. **`ultimoCustoDaAcao` refaz filtro + ordenação da lista INTEIRA de jobs por cartão**
   (T-040). São 9 varreduras por render, e a página re-renderiza a cada evento do SSE.

## Critérios de aceite
- [x] `effort` configurável por ação, na mesma tabela dos outros guardrails.
- [x] Requisições idênticas simultâneas viram UMA só, sem risco de dado velho.
- [x] Custo por ação calculado numa passada, não por cartão.
- [x] Ganho medido, não estimado.
- [x] O que é gasto LEGÍTIMO fica registrado, para não virar alvo de corte na próxima.

## Quarto desperdício, achado na medição (não estava no plano)
4. **A página do projeto abria DUAS conexões SSE.** `App.tsx` assina o canal para o selo
   de atividade do cabeçalho e `Projeto.tsx` assinava de novo — com a regra "uma conexão
   SSE por página" escrita no CLAUDE.md e tida como cumprida. Custava 2 conexões abertas,
   fanout dobrado de TODO evento (a parte cara do console ao vivo) e `/api/jobs` +
   `/api/inputs` em duplicata. Só apareceu porque a medição contou as requisições reais
   do navegador em vez de conferir o código.

## Notas de execução
Conservador de propósito no `effort`: só as ações claramente mecânicas descem para
`medium`. O usuário pediu equilíbrio, não o menor custo possível — e verificar/revisar/
replanejar são exatamente onde economizar sai caro em retrabalho, que o log do dia
2026-07-28 já mediu como o gasto que mais pesa.

Deduplicação só de requisição EM VOO, sem TTL: resolve o caso real (vários componentes
montando juntos) sem introduzir a chance de servir dado velho depois de uma gravação.

## Verificação

**O `effort` estava MORTO em dois pontos — a economia nunca aconteceu.** Achado ao
conferir a opção contra o `sdk.d.ts` da versão pinada, antes de confiar no código:
1. Ia como `outputConfig: { effort }`, e `outputConfig` não existe na API do SDK — `effort`
   é opção de TOPO (`sdk.d.ts:1637`). O spread condicional escapa da checagem de
   propriedade excedente do TS, então compilava e era descartado em silêncio.
2. `lerParams` do runner nem lia a chave `esforco`, então o valor morria antes disso.
Ou seja: tabela configurada, testes passando, e todo fluxo rodando no padrão. Mesma
família do `watchdogMs` da T-019. Corrigido, com teste sobre o objeto `options` que chega
ao SDK (o lado que prova) e validação do valor vindo do disco — `ESFORCOS` virou a fonte
única, com o tipo derivado da lista, para tipo e validação não divergirem.

**Modelo padrão é `sonnet`** (`config.ts`), que suporta `effort` — a alavanca é real.

### Medições (build de produção, navegador de verdade via CDP)
Requisições `/api/` ao abrir a página do projeto:

| caminho | antes | depois |
|---|---|---|
| `/api/fabrica` | 4 | 1 |
| `/api/acoes-projeto` | 2 | 1 |
| `/api/jobs` | 2 | 1 |
| `/api/inputs` | 2 | 1 |
| `/api/eventos` (SSE) | 2 | 1 |
| **total** | **15** | **8** |

Página de Jobs: 3 requisições, sem duplicata. Nenhum caminho aparece mais de uma vez.

Custo por cartão (`custosPorAcao` × 9 chamadas de `ultimoCustoDaAcao`), com conferência
de equivalência de valor em cada tamanho:

| jobs | antes | depois | ganho |
|---|---|---|---|
| 50 | 0,324 ms | 0,049 ms | 6,5× |
| 200 | 1,268 ms | 0,216 ms | 5,9× |
| 500 | 2,991 ms | 0,528 ms | 5,7× |
| 1000 | 6,829 ms | 0,981 ms | 7,0× |

Importa porque a página re-renderiza a cada evento do SSE: durante um fluxo verboso isso
era ~7 ms de CPU por evento, no fio da interface.

### Tela conferida
Capturas da página do projeto e de Jobs após o canal único: tudo carrega, o selo
"● ao vivo" fica verde (conexão de pé) e os custos reais seguem nos cartões — Documentar
~$1,11, Pesquisar ~$1,84, Revisar ~$1,14, Replanejar ~$1,81, Testar ~$0,71. O refactor
não mudou nenhum número exibido.

### Suíte
452 testes passam (355 servidor + 97 web), `tsc` estrito limpo nos dois pacotes.

### O que NÃO foi medido
O ganho do `effort: medium` em si (quanto cai o custo de `/status`, `projeto:conferir` e
`projeto:progresso`) exigiria rodar cada ação duas vezes de verdade, gastando a
assinatura — decisão do usuário, pela regra de custo externo. O que está provado é que o
parâmetro agora CHEGA ao SDK; antes não chegava.

## Revisão
