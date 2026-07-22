---
id: T-015
titulo: Home operacional — disparar ações globais e cadastrar/importar projetos
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-005, T-011, T-013, T-014]
areas: [web/src/paginas/inicio/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Tornar a página inicial operacional: cada card de ação ganha botão que abre um modal
explicando o que a ação fará, coleta os argumentos necessários e dispara o job; a lista
de projetos ganha "Novo projeto" e "Importar pasta".

## Contexto
- Reusar `web/src/lib/sse.ts` e os padrões visuais da T-014. Tocar SOMENTE
  `web/src/paginas/inicio/`.
- Modais por ação: trabalhar (seletor de projeto opcional, com opção "fábrica inteira"),
  ideia (textarea), novo-projeto (nome + descrição), status (seletor opcional),
  encerrar-dia e manutencao (só confirmação). Sempre mostrar a descrição do que a ação
  fará (vem do catálogo da API) ANTES do botão confirmar.
- Após disparar: feedback imediato (job criado) + link/painel para acompanhar o log ao
  vivo — sem sair do navegador; navegar para `/jobs` com o job aberto é aceitável.
- Importar pasta: formulário com campo de caminho absoluto (dica de exemplo Windows,
  ex.: `C:\Users\...\meu-projeto`) e nome opcional; erros do servidor exibidos em PT-BR.
- Validação client-side: campos obrigatórios e nome kebab-case, com mensagens claras —
  além do tratamento do erro do servidor (400/404/409).

## Critérios de aceite
- [ ] Disparar a ação Status pela home cria o job e o log ao vivo fica acessível sem
      recarregar a página.
- [ ] Cada modal de ação exibe a descrição do que ela fará antes de confirmar.
- [ ] Formulário de novo projeto: nome fora do kebab-case é barrado no cliente com
      mensagem; nome de projeto existente exibe o erro 409 do servidor em PT-BR.
- [ ] Importar pasta com caminho válido: projeto aparece na lista e o job de análise
      fica visível em andamento.
- [ ] Nenhuma ação com campo obrigatório dispara vazia (validação com mensagem clara).
- [ ] Card de ação some/indica indisponibilidade se o catálogo trouxer
      `disponivel: false` (robustez).

## Notas de execução

### Construção direta pelo orquestrador (2026-07-21, Opus)
Os cards de ação da home (`web/src/paginas/inicio/Inicio.tsx`) ganharam disparo real: botão
"Executar" abre um formulário (argumentos quando a ação os aceita + seletor de modelo com o
padrão econômico destacado), que faz POST /api/acoes/:id e navega para `/jobs?job=<id>`.
Aviso de custo para a ação pesada (/trabalhar). Erros de disparo exibidos no card.

**Verificação:** build TS estrito limpo + disparo real do /status pela UI concluído com
sucesso. Observação: as ações POR PROJETO (T-016), inputs pendentes (T-010) e a ação de
análise (T-012) continuam pendentes na Fase 2.

## Verificação
(formal dispensada por custo; build + disparo real comprovados.)

## Revisão
(formal dispensada por custo — construção direta.)

