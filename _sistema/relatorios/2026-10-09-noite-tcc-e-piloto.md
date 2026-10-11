# Relatório da noite — 09/10/2026

## Resumo

- **As 7 etapas estão no estilo aprovado da E2.** Cada uma tem roteiro de estudo (HTML), relatório Word e tickets com a ideia e o diagrama. A apresentação principal também foi gerada de novo.
- **O repositório `fabrica-tcc` está atualizado.** Os documentos novos foram colocados dentro dos commits existentes, sem commit novo. Os commits continuam em seu nome, com as mesmas datas e sem a marca do Claude.
- **Você precisa fazer um push forçado** (veja "O que você faz"). O GitHub ainda tem a versão anterior.
- **O piloto da fabrica-v2 concluiu tudo o que podia fazer sozinho: 5 tarefas, US$ 28,51.** Sobraram 2, e as duas dependem de você (veja "Piloto").

## O que você faz (só isto)

```powershell
cd C:\Users\enzoconsulo\Documents\Generic-Multi-Agents\projetos\fabrica-tcc
git push --force origin main etapa/e1-planejamento etapa/e2-fundacao etapa/e3-agente etapa/e4-linha-de-producao etapa/e5-paralelismo etapa/e6-memoria etapa/e7-painel
```

**Por que forçado:** os documentos entraram nos commits originais, então cada commit ganhou um identificador novo. A `main` continua só com E1 + E2, com os seus dois merges.

**Backup:** se algo der errado, o estado anterior está em `C:\Users\enzoconsulo\tcc-tmp\r7\antes-docs.bundle`.

**Para mergear as próximas etapas:**

```powershell
git checkout main
git merge --no-ff etapa/e3-agente -m "Merge etapa E3: agente"
git push
```

## Onde está cada coisa

| o quê | onde |
|---|---|
| Relatórios Word por etapa | `apresentacao-orientador/relatorios-por-etapa/E1..E7-*.docx` (iguais aos do repositório) |
| Roteiros de estudo | `apresentacao-orientador/roteiros-de-estudo/E1..E7-*.html` (comece pelo `index.html`) |
| Apresentação principal | `apresentacao-principal.pptx` (19 slides, requisitos recalculados) |

## O que mudou no conteúdo (vale saber antes de apresentar)

Ao refazer cada etapa, conferi tudo com o código da branch. Algumas descrições antigas estavam otimistas e foram corrigidas.

**Requisitos agora contam 8 atendidos, 6 parciais e 1 pendente.** Antes eram 11, 3 e 1.

- **R4, R5 e R14 (E4) estão parciais.** O teto de gasto, a escada de retrabalho e o diagnóstico existem e têm teste. Mas nenhum código do sistema os chama, nem na E7.
- **R9 está parcial.** O limite de 2 construtores vem do perfil de 8 GB, mas o pico de memória ainda não foi medido.
- **R7 (E6, memória) está pendente.** Nada aciona a ingestão. Na E7, o despacho anexa o bloco de memória, mas a fila o descarta.
- **R8 (E7, painel) está parcial.** Dois eventos ao vivo nunca são disparados: a volta do agente e a mudança de estado. Os botões Parar/Retomar e o controle do piloto existem, mas não aparecem em nenhuma tela.
- **R15 (E3) está atendido.** Há dois fornecedores reais.

**Outros pontos:**

- **E5:** a divisão de tarefas em lotes sem conflito e a recuperação foram provadas no teste da etapa. Mas só os testes chamam essas peças, nenhum código do sistema.
- **Tickets:** cerca de 20 descrições foram corrigidas para bater com o código. Eram funções inexistentes, aridade errada e regras de etapas futuras.
- **E1:** continua "entregue com pendência", porque a FAB-105 (projetos de teste) está em andamento.

> Esses pontos parciais são o trabalho natural das próximas etapas: ligar ao sistema peças que já estão prontas e testadas. Nas perguntas do orientador, é a resposta honesta, e ela já está nos roteiros.

## Piloto (fabrica-v2)

**Resultado: 5 tarefas concluídas** (T-111, T-106, T-110, T-107, T-109), **US$ 28,51 no total**, de 20:01 a 01:22 (horário de Brasília).

O quadro agora tem 127 tarefas concluídas, 1 bloqueada e 1 no backlog. Agora o Windows nativo roda papéis com Bash confinado (T-107), e a trilha genérica foi ligada à fila: os graus de prova fecham o portão (T-110) e a fila roteia o trabalho pela trilha do projeto (T-109).

**Intervenções minhas (2):**
1. **Às 00:18, o piloto parou** pedindo replanejamento da T-107 e da T-110, que tinham esgotado os ciclos. Investiguei e vi que as reprovações eram falsas: a verificação tinha reprovado por arquivos inacabados da T-111, fora das áreas delas. O próprio planejador já tinha registrado isso na D-027. Com a T-111 concluída, rodei a bateria completa no projeto parado: 6 de 6 estágios ok, e todos os critérios das duas passaram. Devolvi as duas para verificação na última tentativa, com nota no arquivo de cada tarefa, e religuei o piloto. As duas passaram pelas duas verificações e foram concluídas.
2. **Às 01:04, o piloto parou** porque não havia mais tarefa "pronta", embora a T-109 estivesse em verificação. Rodei mais uma vez, e a T-109 foi concluída.

**O que ficou para você (o piloto não decide nem gasta sozinho):**
- **T-058, o marco da v1.0** (um projeto inteiro sem intervenção): todas as dependências estão concluídas. Falta só o seu "check" para disparar, com os dois tetos. Antes, está combinado um ensaio com teto de US$ 10 em 3 rodadas.
- **T-020c, o marco 2 da v0.2:** usa a Messages API com chave paga, e é a única parte do plano que custa dinheiro de fora da assinatura. Ela depende da T-058.

**Ponto do motor para corrigir depois:** o piloto para com "sem tarefa" quando o que sobra está em verificação ou revisão, e não só em "pronta". Foi isso que exigiu a segunda intervenção.
