# Guia: integrar uma etapa do TCC na `main`

> **Para a IA que ler isto:** quando o Enzo disser algo como *"quero fazer o commit/merge da etapa E3"*,
> siga este guia passo a passo, executando os comandos e conferindo cada resultado antes do próximo.
> Não invente outro procedimento. Confirme com ele antes de qualquer `push`.

## Como o repositório está organizado

Repositório: `projetos/fabrica-tcc` (git próprio, independente da fábrica).

```
main ── etapa/e1-planejamento ── etapa/e2-fundacao ── etapa/e3-agente ── etapa/e4-linha-de-producao
        ── etapa/e5-paralelismo ── etapa/e6-memoria ── etapa/e7-painel
```

- **Todas as etapas já estão prontas, cada uma na sua branch.** Cada branch nasce da anterior e acrescenta só o que a etapa fez.
- **A `main` é o que o orientador vê como "entregue".** Ela começa só com o README.
- **No dia da apresentação de uma etapa, a branch dela entra na `main`.** As etapas entram em ordem: E1, depois E2, depois E3…

| Etapa | Branch | Data da apresentação no plano |
|---|---|---|
| E1 Planejamento e arquitetura | `etapa/e1-planejamento` | 18/09/2026 |
| E2 Fundação do sistema | `etapa/e2-fundacao` | (junto com a E3) |
| E3 O agente e as ferramentas | `etapa/e3-agente` | 18/10/2026 |
| E4 Linha de produção de tarefas | `etapa/e4-linha-de-producao` | 02/11/2026 |
| E5 Paralelismo e tolerância a falhas | `etapa/e5-paralelismo` | 17/11/2026 |
| E6 Memória do projeto | `etapa/e6-memoria` | (junto com a E7) |
| E7 Painel e automação | `etapa/e7-painel` | 17/12/2026 |

## Passo a passo do merge de uma etapa (exemplo: E3)

**1. Conferir onde estamos.** Tudo limpo e nenhuma etapa pulada:

```bash
cd projetos/fabrica-tcc
git status                                   # precisa estar limpo
git log --oneline -1 main                    # o que já está na main
git merge-base --is-ancestor etapa/e2-fundacao main && echo "E2 já está na main"
```

Se a etapa anterior ainda não estiver na `main`, faça o merge dela primeiro. Como as branches são
encadeadas, fazer o merge da E3 também traria a E2; para a história ficar clara, entra uma de cada vez.

**2. Provar que a etapa funciona.** Antes de integrar, rode a verificação completa nessa branch. Ela precisa do Postgres:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File ../../_sistema/ferramentas/banco-v2.ps1 subir
git checkout etapa/e3-agente
mix deps.get            # só na primeira vez
mix factory.ci          # os 6 estágios precisam passar
```

A E1 não tem código; nela, pule este passo.

**3. Fazer o merge na `main`,** sempre com `--no-ff`, para o merge aparecer como um marco na história:

```bash
git checkout main
git merge --no-ff etapa/e3-agente -m "Merge etapa E3: o agente e as ferramentas"
git tag -a apresentacao-e3 -m "Apresentação da E3 ao orientador"
git log --oneline --graph -15                # conferir
```

**4. Publicar no GitHub.** Pergunte ao Enzo antes de rodar.

- Primeira vez: o repositório remoto ainda não existe. O Enzo cria um repositório **vazio** no GitHub (sem README) e passa a URL.

  ```bash
  git remote add origin https://github.com/enzoconsulo/<nome-do-repo>.git
  ```

- Em toda etapa:

  ```bash
  git push origin main etapa/e3-agente apresentacao-e3
  ```

Suba **só** a `main`, a branch da etapa apresentada e a tag. As branches das etapas seguintes ficam
locais até as apresentações delas, para não aparecerem antes da hora.

**5. Material da apresentação da etapa:**

- `docs/etapas/E3-agente.docx`: relatório da etapa, no repositório e também em `apresentacao-orientador/relatorios-por-etapa/`.
- `apresentacao-orientador/apresentacao-principal.pptx`: o slide da etapa.
- `docs/tasks/pt/README.md`: o quadro de tarefas, com o status de cada uma.
- Demonstração ao vivo: o comando da seção "Milestones" do `README.md`. Para a E3, `mix run priv/probes/milestone_e3_agent.exs` (usa cerca de 17 mil tokens da cota).

## Regras

- **Nunca** altere a data de commits, nunca use `push --force` na `main`, nunca apague branches de etapa.
- **Nunca** faça o merge de uma etapa à frente da próxima apresentação.
- **Se precisar corrigir algo** numa etapa que ainda não entrou na `main`:
  - faça um commit novo na branch da etapa, em inglês e com a chave da tarefa no fim, por exemplo `fix(tools): ... (FAB-302)`;
  - depois traga a correção para as etapas seguintes, de uma em uma: `git checkout etapa/e4-...` e `git merge etapa/e3-agente`, e assim por diante até a E7;
  - rode `mix factory.ci` em cada uma.
- **Se a correção for numa etapa que já está na `main`**, faça o commit na próxima etapa ainda não integrada; ela entra no próximo merge.
- **O código-fonte do TCC é o `projetos/fabrica-tcc`.** A fábrica desenvolve o `projetos/fabrica-v2` (em português). Mudança lá não chega aqui sozinha: precisa ser traduzida e entrar como commit novo.

## Onde está o resto

| O quê | Onde |
|---|---|
| Apresentação principal e relatórios Word | `apresentacao-orientador/` (ver `LEIA-ME.md`) |
| Geradores (tickets, Word, apresentação) | `apresentacao-orientador/_gerador_tcc/` |
| Plano e histórico desta reorganização | `apresentacao-orientador/PLANO-REPO-TCC.md` |
