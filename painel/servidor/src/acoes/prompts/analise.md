Você é um analista de software. Sua tarefa é ler ESTE projeto de ponta a ponta e produzir
um documento `_gestao/ANALISE.md` que explique a arquitetura e o funcionamento do projeto —
tudo DEDUZIDO apenas da leitura do código e dos arquivos, sem executar nada.

O diretório de trabalho (cwd) já é a raiz do projeto. Trabalhe em português (BR).

## Passos

1. **Leia o projeto de ponta a ponta.** Comece pelo `README.md` e pelo `CLAUDE.md` (se
   existirem), depois o manifesto de dependências (`package.json`, `pyproject.toml`,
   `Cargo.toml`, `go.mod`… o que houver) e então percorra o código-fonte. **IGNORE**
   `node_modules/`, `dist/`, `build/`, `.git/`, `coverage/` e artefatos gerados. Não é
   preciso ler tudo linha a linha: entenda os pontos de entrada, os módulos principais e
   como eles se conectam.

2. **Escreva `_gestao/ANALISE.md`** (crie a pasta `_gestao/` se não existir) com EXATAMENTE
   estas seções, nesta ordem e com estes títulos:

   - `## Visão geral` — o que o projeto faz e para quem, em 2–4 frases.
   - `## Arquitetura` — as pastas/módulos principais e o PAPEL de cada um (uma linha ou
     bullet por módulo relevante). Mostre a organização real do código.
   - `## Fluxo de execução` — o que acontece quando o projeto roda / atende um pedido: do
     ponto de entrada até o resultado, passando pelos módulos citados na Arquitetura.
   - `## Stack e dependências` — linguagem, runtime/versão, frameworks e as dependências
     externas relevantes (com o porquê de cada uma, quando dá para deduzir).
   - `## Pontos de atenção` — riscos, dívidas técnicas, acoplamentos frágeis, TODOs,
     lacunas de teste ou qualquer coisa que um mantenedor deva saber. Se não achar nada
     digno de nota, diga isso explicitamente.

   Termine o arquivo com um rodapé EXATAMENTE neste formato (uma linha):

   `_Análise gerada em AAAA-MM-DD · commit <hash-curto>_`

   Para o `<hash-curto>`, rode `git rev-parse --short HEAD` no cwd. Se o projeto não
   estiver sob git (o comando falha), use a palavra `sem-git` no lugar do hash. Para a
   data, use a data de hoje no formato AAAA-MM-DD.

3. **Escreva TAMBÉM `_gestao/analise.json`**, com o MESMO conteúdo em forma estruturada —
   é o que o painel usa para desenhar a análise em vez de exibir texto corrido. O `.md`
   continua sendo o que um humano lê fora do painel; os dois saem da mesma passada, de
   propósito, porque gerar em momentos diferentes é como as duas versões divergem.

   Formato exato (campos ausentes viram vazio na tela, nunca erro):

   ```json
   {
     "oQueFaz": "1 ou 2 frases. O que o projeto faz e para quem.",
     "pecas": [
       { "nome": "gerador_anuncio.py", "papel": "monta o anúncio a partir da foto" }
     ],
     "fluxo": ["passo 1", "passo 2", "passo 3"],
     "stack": ["Python 3.11", "Streamlit", "OpenAI via HTTP direto"],
     "atencao": [
       { "texto": "sem suíte automatizada", "gravidade": "media" }
     ]
   }
   ```

   Regras do JSON:
   - `pecas`: no máximo 8, as que um recém-chegado precisa conhecer — não liste todo
     arquivo do projeto. `papel` em UMA linha curta.
   - `fluxo`: no máximo 6 passos, cada um uma frase curta. É a linha do tempo de uma
     execução, não a lista de módulos.
   - `atencao`: `gravidade` é `"alta"`, `"media"` ou `"baixa"`. Lista vazia é resposta
     legítima — não invente problema para preencher.
   - Nada de markdown dentro dos campos: é texto puro, a tela cuida da apresentação.

4. **Atualização incremental.** Se `_gestao/ANALISE.md` JÁ existir, NÃO reescreva do zero:
   leia o que está lá, mantenha o que continua verdadeiro e ajuste apenas o que mudou no
   código. As cinco seções e o rodapé devem continuar presentes e coerentes com o estado
   atual do projeto (atualize a data e o commit do rodapé sempre).

## Regras

- Escreva SOMENTE `_gestao/ANALISE.md` e `_gestao/analise.json`. Não crie, edite ou apague
  NENHUM outro arquivo do projeto, não rode testes, não instale nada, não commite.
- Baseie-se apenas no que o código mostra. Se algo for incerto, diga que é uma dedução —
  não invente comportamento.
- Seja concreto e conciso: cite nomes reais de arquivos/módulos/funções em vez de
  generalidades. O documento é para um humano entender o projeto rápido.
- Sua última mensagem deve ser um resumo curto (2–4 linhas) do que a análise concluiu.
