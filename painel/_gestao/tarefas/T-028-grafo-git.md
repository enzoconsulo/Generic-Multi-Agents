---
id: T-028
titulo: Grafo de commits estilo Git Graph, para os projetos e para a própria fábrica
projeto: painel-fabrica
status: em-teste
prioridade: media
dependencias: [T-023]
areas: [servidor/src/fabrica/git.ts, servidor/src/rotas/git.ts, web/src/lib/grafo-git.ts, web/src/componentes/GrafoGit.tsx]
tentativas: 0
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Ver o histórico de commits desenhado — dos projetos e do repositório da própria fábrica.

## Contexto
Pedido do usuário, junto com a conversão do `Local_AI` em submódulo.

O painel já mostrava o **plano** (o que se pretende fazer) e as **tarefas** (o que está em
curso). Faltava o que de fato **aconteceu no código**. Como a fábrica commita uma vez por
tarefa, o histórico é a prova do trabalho: dá para ver cada `T-NNN:` virando commit — e é
exatamente assim que se confirmou, nesta mesma sessão, que o estouro de limite não perdeu
nada.

## Critérios de aceite
- [x] Grafo na página do projeto (repositório do projeto) e na home (repositório da fábrica).
- [x] Desenho com faixas, cores por ramo, nó destacado para merge e curva ao trocar de faixa.
- [x] Assunto, hash curto, autor (no tooltip), data e refs (branch/tag) por commit.
- [x] Paginação: "Carregar mais commits" quando há mais do que o limite.
- [x] Pasta que não é repositório, ou repositório sem commit, explica em vez de quebrar.
- [x] Algoritmo de faixas testado em cada topologia (linear, ramo, merge, raiz, truncado).

## Notas de execução
- `servidor/src/fabrica/git.ts`: `git log --all --date-order` com formato separado por
  caracteres de controle (`\x1f`/`\x1e`) — improváveis numa mensagem de commit, ao
  contrário de `|` ou `;`. **Somente leitura**, nunca escreve. Nunca lança: repo ausente,
  sem commits ou git indisponível devolvem resultado vazio com `aviso`.
- Rota `GET /api/git/:projeto`, com `_fabrica` como nome reservado para o repositório da
  raiz (não colide: `/` é proibido em nome de pasta). Teto de 300 commits — grafo gigante
  não ajuda e pesa o desenho.
- `web/src/lib/grafo-git.ts`: layout em função PURA (8 testes). Percorrendo do commit mais
  novo para o mais antigo, mantém as faixas "abertas", cada uma esperando um hash. Regras
  que fazem o desenho bater com a realidade:
  - o **primeiro pai herda a faixa** do filho — é o que mantém a linha principal reta;
  - pais adicionais (merge) reusam a faixa que já os espera, ou abrem uma nova;
  - faixas que esperavam o MESMO commit convergem nele e se fecham;
  - pai fora do trecho carregado vira aresta com `ate: null`, desenhada até a borda —
    cortar seco daria a impressão de fim de história.
- `GrafoGit.tsx`: SVG puro, sem biblioteca. A altura da linha do SVG e a do item da lista
  são o mesmo valor (30px) — **desalinhar isso quebra o desenho**, está comentado nos dois
  lados.

## Verificação
`npm test` e build limpos. API conferida ao vivo (`/api/git/_fabrica` devolveu branch,
commits e `truncado: true`) e **grafo conferido por captura de tela** na página do projeto:
linha, nós, selo `master`, hashes e datas alinhados com a lista.

**Só exercitado com histórico LINEAR** — os dois repositórios disponíveis não têm merge.
A topologia de merge está coberta por teste unitário, mas não foi vista desenhada.

## Revisão
Pendente da conferida do usuário.
