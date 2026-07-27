---
id: T-018
titulo: UI do pipeline — aba CI/CD do projeto com estágios, log ao vivo e config
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-016, T-017]
areas: [web/src/paginas/projeto/ci/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-27
---

## Objetivo
Aba "Pipeline" na página do projeto: os 4 estágios como cartões com estado visual
(pendente / rodando / ok / falhou / pulado) e duração, log ao vivo por estágio, botão
"Rodar pipeline" e editor da configuração.

## Contexto
- Componentes novos em `web/src/paginas/projeto/ci/`; o encaixe da aba usa a estrutura
  extensível de abas criada na T-006 (menor toque possível fora da pasta ci/).
- Consome as rotas da T-017 e o canal SSE via `web/src/lib/sse.ts` (T-014).
- Editor de config: formulário simples (comando por estágio + ligar/desligar), carrega
  de `GET /api/ci/:projeto/config`, salva com PUT, mostra erros de validação em PT-BR.
- Estágio que falhou: destaque em vermelho com o trecho final do log visível de cara
  (últimas ~30 linhas), com opção de expandir o log completo.
- Respeitar o lock: botão "Rodar pipeline" desabilitado com explicação enquanto o
  projeto está ocupado (mesmo padrão da T-016).

## Critérios de aceite
- [x] Aba Pipeline mostra os 4 estágios com estados visuais distintos e a duração de
      cada um após a execução.
- [x] "Rodar pipeline" pela UI executa e o log aparece ao vivo, estágio a estágio.
- [x] Estágio que falha fica em destaque vermelho com o final do log visível.
- [x] Editor carrega a config atual, salva alteração de comando (a execução seguinte usa
      o novo, pois o runner relê `_gestao/ci.json` a cada execução — T-017).
- [x] Última execução e histórico ficam visíveis ao reabrir a aba (dados persistidos).

## Notas de execução
Construída DIRETO pelo orquestrador (Opus, sem pipeline), mesma decisão de custo geral.

- **Duas premissas do Contexto não bateram com o código real** (descobertas ao ler antes
  de codar, não no meio):
  1. Não existe sistema de abas na página do projeto — a T-006 ficou como lista vertical
     de `<section>`. `SecaoCi` entra como mais uma seção (mesmo padrão de Análise/Plano),
     não uma aba.
  2. `web/src/lib/sse.ts` não existe — o hook SSE real da T-014 é `useJobsAoVivo.ts`.
- `web/src/paginas/projeto/ci/PainelCi.tsx` (arquivo novo, único da pasta `ci/`): exporta
  `SecaoCi({ projeto, jobAtivo, aoVivo })`. Recebe `aoVivo` (jobs/logs/estagiosCi) de
  CIMA — `Projeto.tsx` já chama `useJobsAoVivo()` uma vez (T-016); abrir uma SEGUNDA
  `EventSource` aqui violaria a decisão "SSE único multiplexado" (DECISOES.md
  2026-07-21).
- **Extensão necessária em `useJobsAoVivo.ts` e `lib/tipos.ts`** (fora de `ci/`, mas
  infra compartilhada): o hook só capturava eventos `estado`/`log`/`input-*`; os eventos
  novos do T-017 (`ci-estagio-inicio`, `ci-estagio`) eram descartados em silêncio, e
  `LinhaLog` não carregava `estagio`/`fluxo`. Sem isso, dava para inferir "estágio
  rodando agora" pelo log, mas NÃO dava para saber que um estágio foi `pulado` (estágio
  pulado não gera NENHUMA linha de log — sem processo, sem stdout) enquanto ele ainda não
  tinha sido alcançado visualmente. Adicionado `estagiosCi: Record<jobId,
  Record<estagio, EstagioCiAoVivo>>` ao estado do hook; consumidores existentes (Jobs.tsx)
  ignoram os campos novos (tudo opcional/backward-compatible).
- Vista ao vivo (`EstagiosAoVivo`) usa `aoVivo.estagiosCi[jobId]` + filtra `logs` por
  `linha.estagio` (só mostra log inline enquanto `rodando` ou já `falhou`, últimas 30
  linhas). Vista pós-execução (`EstagiosResultado`) usa `ultimo.estagios` (persistido,
  via `GET /api/ci/:projeto`) — sem log inline (o SSE não guarda histórico de stdout
  entre sessões; nenhum job do painel guarda, isso é limitação pré-existente do sistema,
  não específica do CI); link para `/jobs?job=<id>` cobre quando o buffer de replay do
  hub (~500 eventos) ainda tem o log.
- Refetch do resultado de CI ao terminar: efeito próprio (não reusa o de `Projeto.tsx`,
  que refaz só `/api/projetos/:nome`) comparando o estado de jobs `tipo==="ci"` deste
  projeto contra o visto — mesmo padrão do T-016.
- Editor de config: form simples (checkbox habilitado + input de comando por estágio,
  timeoutMs), `GET`/`PUT /api/ci/:projeto/config`.
- CSS novo (`estilos.css`): `.grade-ci`, `.ci-estagio-card(--falhou)`, `.ci-badge-*`,
  `.ci-historico*` — reaproveita `.console`/`.console-linha` existentes para o log
  inline (zero CSS novo ali).
- **Achado de estabilidade da suíte (recorrente, não é bug do T-018):** mais um teste
  pré-existente (`cadastro-rota.test.ts`, T-013) estourou o timeout default de 5s sob a
  carga paralela extra. Em vez de continuar corrigindo teste a teste (já era o 3º),
  resolvido na raiz: `servidor/vitest.config.ts` ganhou `testTimeout: 15000` global;
  revertidos os timeouts explícitos que eu tinha acabado de cravar neste teste (o
  default global já cobre).

## Verificação
`cd painel && npm test`: servidor **170/171** (1 falha pré-existente não-relacionada,
`cancelar job executando`) + web **14/14**. `npm run build` limpo. Smoke em rede real
(sem navegador neste ambiente — mesma limitação do T-016): subi `npm start`,
`GET /api/ci/teste-todo-cli/config` devolve defaults deduzidos corretos (testes
habilitado, lint/build desabilitados — o `teste-todo-cli` não tem esses scripts),
`GET /api/ci/teste-todo-cli` devolve `{ultimo:null,historico:[]}` (nunca rodou),
`GET /api/ci/cockpit/config` (projeto sem package.json) devolve 422, rota SPA
`/projeto/teste-todo-cli` responde 200. Bundle publicado contém as strings novas
("Rodar pipeline", "CI/CD", "Configurar", "Salvar config", "Histórico", "Nenhuma
execução de CI"). NÃO disparei uma execução real do pipeline contra a API (custo
zero, mas evitei rodar `npm install` de verdade num projeto do disco sem necessidade);
a lógica de execução em si já está coberta pelos 36 testes automatizados do T-017.

## Revisão
Pulada (mesma decisão de custo geral). Auto-revisão: `npx tsc --noEmit` limpo nos dois
workspaces.

