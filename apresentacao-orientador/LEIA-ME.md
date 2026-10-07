# Apresentação ao orientador — Fábrica de Software Multi-Agente

O projeto dividido **por etapa do plano de desenvolvimento** (E1–E10), até onde está
desenvolvido. Cada pasta é uma etapa completa: o que foi combinado, o que existe no código,
os números reais, a prova, o que falta e a próxima rodada.

## Como abrir

- **Deck completo:** `apresentacao.html` (duplo clique → abre no navegador).
  `←` `→` ou espaço navegam · `F` tela cheia · `T` troca claro/escuro · `Ctrl+P` exporta PDF.
- **Uma etapa só:** `E<n>-.../slides.html`.
- **Para estudar antes:** `E<n>-.../NOTAS.md` — o texto completo de cada etapa.

## O mapa das pastas

| pasta | etapa do plano | situação |
|---|---|---|
| `E1-planejamento/` | E1 · Planejamento e arquitetura | entregue · **falta: os 5 projetos de teste** |
| `E2-fundacao/` | E2 · Fundação do sistema | concluída · entrega aprovada |
| `E3-agente-e-ferramentas/` | E3 · O agente e as ferramentas — **etapa atual do calendário** | concluída · entrega aprovada |
| `E4-linha-de-producao/` | E4 · Linha de produção de tarefas | construída e provada |
| `E5-paralelismo-e-falhas/` | E5 · Paralelismo e tolerância a falhas | construída e provada |
| `E6-memoria/` | E6 · Memória do projeto | peças prontas · **entrega bloqueada** |
| `E7-painel-e-automacao/` | E7 · Painel e automação | telas prontas · **marco final em andamento** |

Dentro de cada pasta de etapa:

| item | o que é |
|---|---|
| `slides.html` | a apresentação da etapa |
| `NOTAS.md` | combinado × feito, números, tarefas, requisitos, pendências, próxima rodada, como demonstrar |
| `dados.json` | os números da etapa (para quem quiser conferir) |
| `tarefas/` | os arquivos de tarefa da etapa — objetivo, critérios de aceite, verificação e revisão de cada uma |
| `arquivos/` | **o código e os testes da etapa**, copiados no estado do commit que fechou a etapa |
| `evidencia-marco.txt` | saída real do teste do marco, rodado nesta máquina (E2, E4, E5) |
| `evidencias/` | capturas de tela (E7) |
| `documentos/` | os documentos do planejamento (E1) |

> **O código de verdade continua em `projetos/fabrica-v2/`.** As pastas aqui são CÓPIAS
> organizadas por etapa — mover os arquivos do projeto quebraria a compilação e a fábrica,
> que está trabalhando nele. As cópias são regeradas a qualquer momento (abaixo).

## Roteiro sugerido (≈ 10 min, foco na etapa atual)

O plano marca a próxima apresentação para **18/10, fim da E3**: *"um agente resolvendo uma
tarefa real, com o custo gravado"*.

| tempo | slides | o que dizer |
|---|---|---|
| 1 min | abertura (1–4) | a tese, e onde estamos: calendário na E3; código com E2–E5 provadas |
| 1 min | E1 | requisitos, arquitetura e critérios entregues; **assumir a pendência dos 5 projetos de teste** |
| 2 min | E2 | a suíte roda sem internet e sem cota — e um teste falha se isso mudar; demo de 1 s |
| 4 min | E3 | o agente real resolvendo uma tarefa; custo por volta no banco; dois fornecedores atrás da mesma fronteira; o marco reprovou 3× por defeitos reais antes de aprovar |
| 1 min | E4–E7 | rápido: o que já está pronto à frente do calendário, e o que está bloqueado (E6) |
| 1 min | fechamento | próxima rodada (E8) e os 8 critérios que serão medidos |

Versão longa (≈ 25 min): o deck inteiro, na ordem.

### Demonstrações ao vivo (na pasta `projetos/fabrica-v2`, com o Postgres de pé)

```bash
mix test test/fabrica/marco_v01_test.exs   # E2 — 1 s, sem rede e sem cota
mix run priv/probes/marco_v02_agente.exs   # E3 — agente REAL, ~27 mil tokens da cota
mix test test/fabrica/marco_v03_test.exs   # E4 — seis estados, reprova, refaz, conclui
mix test test/fabrica/marco_v04_test.exs   # E5 — três em paralelo, matar um
mix fabrica.ci                             # a verificação inteira, 6 estágios
```

Para subir o banco: `powershell -File _sistema/ferramentas/banco-v2.ps1 subir` (na raiz da fábrica).

## De onde vêm os números

Nada é digitado à mão. `_gerador/gerar.py` lê:

- os arquivos de tarefa (`projetos/fabrica-v2/_gestao/tarefas/`) — status, execuções, áreas;
- o `git log` do projeto — commits por tarefa e o commit que fechou cada etapa;
- os jobs do painel (`painel/dados/jobs/`) — o custo medido das rodadas (dólar-equivalente da
  cota da assinatura, não fatura; tarefas feitas no chat não entram nessa soma);
- as saídas reais dos testes em `_evidencias-brutas/` (rodados nesta máquina na geração).

O texto (destaques, pendências, próxima rodada, ligação pacote → tarefas) está em
`_gerador/conteudo.py`.

## Regerar (depois de a fábrica rodar mais)

```bash
python apresentacao-orientador/_gerador/gerar.py
```

Para atualizar também a evidência dos testes, rode os testes de marco e copie a saída para
`_evidencias-brutas/marco_v01.txt`, `marco_v03.txt`, `marco_v04.txt` e `suite.txt`.

## Fora da apresentação

Seguindo o mapa `_editar-plano-tcc/ETAPAS-x-PLANO-ORIGINAL.md`, quatro tarefas do repositório
não aparecem nos slides (tratam de importação de dados de outro sistema, que o plano não
menciona): T-008, T-033, T-034b, T-076.
