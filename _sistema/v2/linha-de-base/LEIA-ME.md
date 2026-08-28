# Linha de base da v1 — a evidência congelada

**Congelada em 2026-08-28.** 139 arquivos em `jobs-v1/`, 821 KB.

## O que é isto

Cópia dos registros de execução da fábrica v1 — um arquivo por job, com a contabilidade
completa: tokens de entrada, escrita e leitura de cache, saída, custo, modelo, turnos,
desfecho, e o consumo separado por agente e por modelo.

É contra estes números que a v2 vai ser comparada na entrega (`T-008` extrai a linha de
base; `T-058` fecha a comparação). Os quatro números:

1. proporção de despacho desperdiçado
2. custo por tarefa concluída
3. contexto por despacho
4. o que se perde ao matar um agente em voo

## Por que uma cópia, e não o diretório original

O original é `painel/dados/jobs/`, e ele está **fora do git de propósito**: o
`painel/.gitignore` o exclui como "dados operacionais do painel (descartável — jobs, logs,
CI)". Para a operação da v1 isso está certo — os jobs se acumulam e não são fonte de nada.

Mas para o TCC eles deixam de ser descartáveis: **viram evidência.** Um número citado sem o
arquivo de onde saiu vira premissa que ninguém consegue conferir — foi exatamente o que
aconteceu na v1 com os "quatro testadores em fila" de 15/08, que ninguém conseguiu
reencontrar depois.

E há a razão prática: sem esta cópia, **um clone do repositório não consegue rodar a T-008**.
Os jobs simplesmente não estariam lá.

Por isso a cópia é **congelada**: ela não acompanha a v1 daqui para a frente. Se a v1
continuar rodando e a comparação precisar da janela atualizada, recongele — e diga a data
nos dois lugares. É o que a abertura da v1.0 (`T-049`) manda conferir.

## O que NÃO está aqui, e por quê

Os arquivos `*.log.jsonl` do diretório original **ficaram de fora**, e a decisão é de
privacidade, não de tamanho.

Eles são a transcrição completa dos agentes: prompts, conteúdo de arquivo lido, saída de
ferramenta. Ou seja, carregam **o código dos projetos** — e este repositório é público, com
`/projetos/` no `.gitignore` justamente para não publicar isso. Commitar as transcrições
vazaria pela porta dos fundos exatamente o que a porta da frente protege.

**Consequência para quem for medir:** os quatro números são extraíveis dos `.json`
(contabilidade por job, por agente e por modelo). O detalhe por ETAPA — quantas voltas cada
despacho deu, quanto contexto cada um recebeu — vive nos `.log.jsonl` e só existe na máquina
onde a v1 roda. Se a medição precisar desse nível, ela precisa rodar lá, e o resultado
derivado é que vem para cá.

## O que foi conferido antes de publicar

Varredura dos 139 arquivos em 28/08, antes do commit:

| padrão | ocorrências |
|---|---|
| `sk-ant-`, `ANTHROPIC_API_KEY`, `ghp_`, `gho_`, `AKIA` | 0 |
| chave privada (`BEGIN ... PRIVATE KEY`) | 0 |
| `password` | 0 |
| `senha` | 2 — **falso positivo**: pedaço de "rede**senha**da" |
| e-mail do usuário | 0 |

O que **existe** e é intencional: o caminho absoluto do projeto na máquina
(`C:\Users\enzoc\...`) dentro de `params`, e resumos em prosa do que cada rodada fez (~148 KB
no total) — nomes de tarefa, marcos, decisões. Metadado do trabalho, não o trabalho.
