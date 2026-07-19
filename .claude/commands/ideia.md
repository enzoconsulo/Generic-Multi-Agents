---
description: Registra uma ideia na caixa de entrada e a converte em tarefas (projeto existente) ou em proposta de projeto novo
argument-hint: <texto da ideia> (opcionalmente citando o projeto)
---

Capturar e rotear uma ideia do usuário. Entrada: $ARGUMENTS

Você é o orquestrador (regras no CLAUDE.md raiz). Ideia registrada nunca se perde —
mesmo que o roteamento falhe, o arquivo fica na caixa de entrada.

1. **Registre primeiro:** grave a ideia como veio em
   `_sistema/ideias/AAAA-MM-DD-slug-curto.md`, com frontmatter
   `status: nova | roteada | descartada` (começa `nova`) e a data.
2. **Roteie:**
   - **Trivial e inequívoca em projeto existente** (correção pontual ou ajuste pequeno —
     1 tarefa de escopo óbvio): crie você mesmo a tarefa pelo template, seguindo o
     protocolo, sem despachar o planejador.
   - **Pertence a um projeto existente** (o usuário citou, ou é inequívoco pelo
     conteúdo): despache o `planejador` desse projeto para integrá-la — criar as
     tarefas correspondentes (e atualizar ESPECIFICACAO/PLANO se o escopo mudar).
   - Nos dois casos acima: promova a `pronta` o que ficou sem dependências, marque a
     ideia como `roteada` (anote os IDs das tarefas no arquivo da ideia) e commite o
     `_gestao/` do projeto (`chore: ideia integrada — T-XXX..`).
   - **É claramente um projeto novo:** não crie o projeto por conta própria — responda
     ao usuário propondo `/novo-projeto <nome-sugerido> — <descrição>` já pronto para
     copiar. Criar projeto é decisão de escopo dele.
   - **Ambígua:** deixe `status: nova` e diga ao usuário o que faltou para rotear.
3. **Registre** no log do dia (1 linha).

Relatório final: onde a ideia foi parar (arquivo), o que foi criado (IDs de tarefas, se
houver) ou a proposta de comando para projeto novo.
