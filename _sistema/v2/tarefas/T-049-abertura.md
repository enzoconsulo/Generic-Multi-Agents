---
id: T-049
titulo: ABERTURA da v1.0: o que a tela precisa mostrar, e a medicao final
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-048]
areas: [_gestao/PROGRESSO.md, _sistema/v2/tarefas]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Antes de construir o painel e a trilha generica, decidir o que a tela precisa mostrar a
partir do que o sistema REALMENTE grava — e preparar a comparacao final com a linha de base.
Nenhum codigo de producao.

## Contexto
Esta e a ultima versao, e ela e a entrega do TCC. O planejamento dela foi escrito antes de
existir qualquer dado; agora existem cinco versoes de dados reais.

**Releia:** `_sistema/PLANO_V2.md` (bloco da v1.0), `_sistema/MIGRACAO_V2.md` secao 7 (o que
a v1 acrescenta a esta versao), e `priv/linha-de-base/LINHA_DE_BASE.md` (T-008).

**Confira e ajuste:**

  1. **O que o sistema grava de verdade** contra o que as tarefas de painel assumem. A tela
     nao pode prometer um numero que o banco nao tem. Liste as colunas reais de `consumos`,
     `despachos` e `ciclos` e confronte com o que T-047 e T-048 desenham.
  2. **A versao atual do Phoenix/LiveView** e a API dela. O scaffold foi criado na v0.1, ha
     meses; confira se ha mudanca relevante antes de escrever a primeira tela.
  3. **Existe um projeto real para o teste da trilha generica?** O marco pede um artefato
     nao-software entregue de ponta a ponta. Escolha qual AGORA — um documento, um deck —
     e confira que ele tem verificador possivel. Sem isso o marco vira demonstracao vazia.
  4. **A LINHA_DE_BASE.md ainda e comparavel?** Ela foi extraida dos jobs da v1 na T-008. Se
     a v1 continuou rodando desde entao, ha mais jobs — reextraia, para a comparacao usar a
     mesma janela. E confirme que os quatro numeros da v2 sao mensuraveis com o que o sistema
     grava hoje; se algum nao for, ESTA e a hora de acrescentar a instrumentacao, nao no fim.
  5. **Escolha o projeto pequeno do marco final.** 8 a 12 tarefas, novo, nao um dos tres
     projetos vivos da v1 — migrar projeto em voo nunca foi o plano.

**Registre em `_gestao/PROGRESSO.md`** as escolhas dos itens 3 e 5, e o que foi ajustado.

## Criterios de aceite
- [ ] As colunas reais do banco foram confrontadas com o que as tarefas de painel assumem.
- [ ] O projeto da trilha generica foi escolhido e tem verificador possivel (registrado).
- [ ] A linha de base foi reextraida se a v1 continuou rodando, e os quatro numeros sao mensuraveis hoje.
- [ ] O projeto pequeno do marco final foi escolhido e registrado.

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

