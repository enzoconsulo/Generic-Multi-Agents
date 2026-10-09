# Modelo do roteiro de estudo de uma etapa

Escreva o roteiro da etapa **em português**, em Markdown, seguindo EXATAMENTE as seções abaixo (os
títulos `##` iguais, na mesma ordem). Ele é o material de estudo do autor do TCC: ele vai ler tudo
antes da reunião para entender a fundo o que existe na etapa, por que foi feito assim e como
apresentar. Profundidade é bem-vinda; enrolação não. Frases curtas, exemplos concretos, nomes reais
de módulos, funções, tabelas e arquivos.

**Fontes (somente leitura):** o repositório `C:\Users\enzoconsulo\Documents\Generic-Multi-Agents\projetos\fabrica-tcc`.
Leia SEMPRE pela branch da etapa, sem fazer checkout: `git -C <repo> ls-tree -r --name-only etapa/<branch>`
e `git -C <repo> show etapa/<branch>:<caminho>`. Também: `docs/planejamento/*.md` (requisitos,
arquitetura, critérios), `docs/tasks/pt/` da branch (tickets FAB da etapa) e
`git -C <repo> log --format="%h %s" etapa/<anterior>..etapa/<branch>` (commits da etapa).

**Regras de conteúdo:**
- Descreva o SISTEMA e o trabalho feito nele. Nunca mencione como o código foi produzido, ferramentas
  de geração, custos de desenvolvimento, ou "versões anteriores" do projeto.
- Todo trecho de código citado é REAL, copiado da branch da etapa (5 a 20 linhas, o essencial), com o
  caminho do arquivo acima do bloco.
- Diagramas em Mermaid (```mermaid) — eles são renderizados na página. Use `flowchart`, `sequenceDiagram`,
  `erDiagram`, `stateDiagram-v2` ou `classDiagram`. Mantenha-os simples e com rótulos em português.
  Evite parênteses e acentos dentro de IDs de nós (use rótulos entre aspas: `A["Rótulo (x)"]`).
- Números (testes, módulos, linhas) só se você os medir; diga como mediu.
- Use as caixas especiais quando ajudarem (são renderizadas como destaques coloridos):
  `> [!IDEIA] texto` (a ideia-chave), `> [!DICA] texto` (dica para a apresentação),
  `> [!ATENCAO] texto` (limitação/pegadinha), `> [!FALA] texto` (frase pronta para dizer).

## Seções (nesta ordem)

```
# E<n> — <nome da etapa>

## Em 30 segundos
(5 linhas: o que a etapa entrega, por que importa para a tese, e qual é a prova.)

## Onde esta etapa está no plano
(posição na cascata, datas planejadas, entrega combinada, o que a etapa anterior deixou pronto e o que
esta deixa para a próxima; requisitos R* que ela atende — com o texto do requisito.)

## Planejado × entregue
(tabela: pacote do plano | o que o plano pedia | o que foi entregue | tarefa FAB | situação)

## A arquitetura da etapa
(1 ou 2 diagramas Mermaid mostrando as peças desta etapa e como se ligam; parágrafo explicando o desenho.)

## Tarefa por tarefa, a fundo
(uma subseção ### por tarefa FAB da etapa: O que é · Por que existe · Como funciona (passo a passo,
módulos e funções com assinatura) · Trecho de código real · Como é testado (arquivo de teste, o que os
testes afirmam) · Decisões e alternativas descartadas.)

## O marco da etapa
(o que prova; o teste/probe linha a linha; como rodar ao vivo; a saída esperada; o que fazer se falhar.
Se o marco não foi atingido, explique exatamente o que falta e por quê.)

## Decisões técnicas e porquês
(tabela: decisão | alternativa considerada | por que esta)

## Números da etapa
(medidos na branch: arquivos e módulos em lib/, testes (conte `test "` nos arquivos de teste),
commits da etapa; diga o comando que usou.)

## Roteiro da apresentação (10 minutos)
(minuto a minuto: o que dizer, o que mostrar na tela — arquivo, slide, comando. Inclua caixas [!FALA].)

## Perguntas prováveis do orientador
(8 a 12 perguntas difíceis e realistas, cada uma com uma resposta curta e correta.)

## Limitações conhecidas e o que vem depois
## Glossário
(termos técnicos da etapa, 1 linha cada.)
## Cola de comandos
(os comandos úteis da etapa num bloco, com 1 comentário cada.)
```
