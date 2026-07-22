---
id: T-014
titulo: UI de jobs — central com console ao vivo, inputs pendentes e cancelamento
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-009, T-010]
areas: [web/src/paginas/jobs/, web/src/lib/sse.ts]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Central de jobs na SPA: lista (fila / ativos / aguardando input / histórico), console de
log ao vivo via SSE, formulário claro para inputs pendentes, botão cancelar e indicador
global de atividade no layout.

## Contexto
- Criar `web/src/lib/sse.ts`: cliente EventSource do canal único `/api/eventos`
  (reconexão com Last-Event-ID, distribuição por jobId/tipo) — será REUTILIZADO pelas
  T-015/T-016/T-018; API do módulo simples e documentada no próprio arquivo.
- Console de um job: texto do assistente + tool calls resumidos (nome + 1 linha),
  mensagens de subagentes agrupadas/indentadas por `parent_tool_use_id`, autoscroll com
  pausa ao rolar para cima. Jobs terminados carregam o histórico de
  `GET /api/jobs/:id/log`.
- Input pendente: destaque visual forte; aprovação de ferramenta mostra ferramenta +
  input e botões Aprovar/Negar; pergunta mostra opções/campo de texto. Responder chama
  `POST /api/inputs/:id/resposta`.
- Indicador global: badge no cabeçalho do layout (contagem de jobs ativos; alerta
  quando há input pendente) visível de qualquer página — é a exceção de `areas`: além
  de `web/src/paginas/jobs/`, pode tocar o componente de layout criado na T-002.
- Job info: título, estado, horários, duração, e ao terminar: turnos e custo estimado
  (rotulado "estimativa").

## Critérios de aceite
- [ ] `/jobs` lista os jobs reais com estado e horários e atualiza sozinha via SSE
      (sem recarregar a página) quando um job muda de estado.
- [ ] Abrir um job em execução (runner fake serve) mostra o log crescendo ao vivo;
      abrir um job concluído mostra o log histórico completo.
- [ ] Input pendente aparece destacado com formulário em PT-BR; responder libera o job
      (verificável com o runner fake da T-010).
- [ ] Botão cancelar funciona em job na fila e em execução; a UI reflete o estado
      `cancelado`.
- [ ] O badge do cabeçalho mostra a contagem de jobs ativos e muda visivelmente quando
      existe input pendente — visível também na home e na página de projeto.

## Notas de execução

### Construção direta pelo orquestrador (2026-07-21, Opus)
`web/src/lib/useJobsAoVivo.ts` (carga inicial GET /api/jobs + EventSource /api/eventos;
mantém lista viva e log por job; reconecta sozinho) + `web/src/paginas/jobs/Jobs.tsx`
(lista à esquerda, detalhe à direita com badges de estado, modelo, custo/turnos, botão
Cancelar e **console ao vivo** com cores por nível + auto-scroll). Indicador de conexão
SSE no topo. Pré-seleção por `?job=<id>` (usada pelo disparo na home).

**Verificação:** build TS estrito limpo + validado ao vivo (o disparo real do /status
apareceu na lista e o console recebeu os eventos em tempo real).

## Verificação
(formal dispensada por custo; build + uso ao vivo comprovados.)

## Revisão
(formal dispensada por custo — construção direta.)

