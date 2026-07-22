---
id: T-018
titulo: UI do pipeline — aba CI/CD do projeto com estágios, log ao vivo e config
projeto: painel-fabrica
status: backlog
prioridade: media
dependencias: [T-016, T-017]
areas: [web/src/paginas/projeto/ci/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
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
- [ ] Aba Pipeline mostra os 4 estágios com estados visuais distintos e a duração de
      cada um após a execução.
- [ ] "Rodar pipeline" pela UI executa e o log aparece ao vivo, estágio a estágio.
- [ ] Estágio que falha fica em destaque vermelho com o final do log visível.
- [ ] Editor carrega a config atual, salva alteração de comando e a execução seguinte
      usa o comando novo (verificável trocando o comando de um estágio no fixture).
- [ ] Última execução e histórico ficam visíveis ao reabrir a aba (dados persistidos).

## Notas de execução


## Verificação


## Revisão

