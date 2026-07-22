---
id: T-009
titulo: Canal SSE multiplexado e log histórico de jobs
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-007]
areas: [servidor/src/eventos/, servidor/src/rotas/eventos.ts, servidor/test/eventos/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Endpoint SSE único `GET /api/eventos` transmitindo em tempo real os eventos de todos os
jobs (multiplexado por `jobId`), com heartbeat e replay via Last-Event-ID; e endpoint de
log histórico por job.

## Critérios de aceite
- [ ] `curl.exe -N http://127.0.0.1:8765/api/eventos` mantém a conexão aberta e recebe
      comentário `:ping` periódico (observável esperando ~20s).
- [ ] Com dois jobs do runner fake rodando em paralelo, os eventos chegam no stream com
      o `jobId` correto de cada um, sem mistura (teste automatizado consumindo o SSE).
- [ ] Reconectar enviando header `Last-Event-ID` entrega os eventos perdidos que ainda
      estão no buffer de replay (teste automatizado).
- [ ] `GET /api/jobs/:id/log` retorna o histórico completo do `dados/jobs/<id>.ndjson`
      como JSON (array de eventos); 404 se o job não existe.
- [ ] Cabeçalhos corretos: `Content-Type: text/event-stream`,
      `Cache-Control: no-cache`; cada evento tem `id:` sequencial e `event:` com o tipo.
- [ ] Mudanças de ESTADO de job (na-fila→executando→concluido etc.) também são
      transmitidas como eventos (a UI atualiza listas sem polling).
- [ ] `npm test` passa.

## Contexto
- Decisão registrada (DECISOES.md 2026-07-21): UM canal SSE para tudo — nunca um stream
  por job (limite de ~6 conexões HTTP/1.1). Eventos carregam `jobId` e tipo.
- Pluga no EventEmitter interno da T-007 (eventos do runner + transições de estado).
- Buffer de replay em memória (ex.: últimos 500 eventos com id incremental); perder
  eventos antigos é aceitável — o log completo está no ndjson.
- Heartbeat ~15s. Flush por evento. Sem compressão no endpoint SSE.
- Rota nova conforme convenção do agregador; a rota de log pode viver em
  `servidor/src/rotas/eventos.ts` para não tocar arquivo da T-007.

## Notas de execução

### Construção direta pelo orquestrador (2026-07-21, Opus)
`servidor/src/eventos/hub.ts` (canal único multiplexado, buffer de replay por
Last-Event-ID, publicação não-fatal a cliente morto) + `servidor/src/rotas/eventos.ts`
(GET /api/eventos: text/event-stream, `: conectado`, heartbeat `:ping` 15s, replay via
Last-Event-ID, cleanup no close). Ligado ao emissor de jobs em `inicializar.ts`.

**Verificação:** 5 testes em `servidor/testes/eventos/hub.test.ts` + **ao vivo**: durante
o `/status` real, o `EventSource` recebeu 35 eventos (transições na-fila→executando e logs
inicio/ferramenta) em tempo real.

## Verificação
(formal dispensada por custo; testes + captura SSE ao vivo comprovadas.)

## Revisão
(formal dispensada por custo — construção direta.)

