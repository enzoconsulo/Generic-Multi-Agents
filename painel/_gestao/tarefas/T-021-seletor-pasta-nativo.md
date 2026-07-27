---
id: T-021
titulo: Seletor nativo de pasta na importação (em vez de colar o caminho)
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-013]
areas: [servidor/src/projetos/seletor-pasta.ts, servidor/src/rotas/cadastro.ts, web/src/paginas/inicio/]
tentativas: 0
criada: 2026-07-27
atualizada: 2026-07-27
---

## Objetivo
Ao importar um projeto, poder **navegar pelo PC e escolher a pasta** num diálogo de
verdade, em vez de ter que descobrir e colar o caminho absoluto à mão.

## Contexto
Pedido do usuário. A parte não-óbvia é POR QUE isso não se resolve no navegador:

- `<input type="file" webkitdirectory>` e `showDirectoryPicker()` (File System Access API)
  entregam os ARQUIVOS, mas **escondem o caminho absoluto** por segurança. Viria
  `meu-projeto/src/app.js` sem dizer se está em `C:\dev` ou `D:\trabalho`.
- A importação (T-013) copia a pasta no servidor, então precisa do caminho absoluto.
- Fazer upload de todos os arquivos pelo navegador resolveria, mas mudaria o modelo
  inteiro da importação (e seria lento para repositórios grandes).

O que destrava: **o painel é uma ferramenta local** — o servidor roda na própria máquina do
usuário (127.0.0.1). Então quem abre o diálogo nativo é o BACKEND, e o caminho absoluto é
real.

## Critérios de aceite
- [x] Botão "Escolher…" ao lado do campo de caminho abre o seletor nativo do Windows.
- [x] Pasta escolhida preenche o campo automaticamente; cancelar não apaga o que o
      usuário já tinha digitado.
- [x] O campo de texto continua funcionando (colar caminho) — o botão é atalho, não
      substituto.
- [x] Dois cliques não abrem dois diálogos (409 com mensagem clara).
- [x] Fora do Windows a UI esconde o botão e explica que resta colar o caminho (501).
- [x] O cadeado abre mesmo se o diálogo falhar (senão o botão travaria para sempre).
- [x] `npm test` passa sem abrir janela nenhuma.

## Notas de execução
- `servidor/src/projetos/seletor-pasta.ts`: dispara `powershell.exe -NoProfile -STA` com
  um `FolderBrowserDialog`. Detalhes que custaram atenção:
  - **`-STA` é obrigatório** para diálogos do Windows Forms.
  - **Sem `-NonInteractive`**: começou com essa flag, que é semanticamente o oposto do
    que se quer aqui (o objetivo É interagir com o usuário).
  - **`[Console]::OutputEncoding = UTF8`** no script: sem isso, caminho com acento
    (`C:\Users\...\Documentos\...`) volta corrompido.
  - **Form invisível com `TopMost` como owner**: sem isso o diálogo nasce ATRÁS do
    navegador e parece que o clique não fez nada.
  - **Cadeado liberado em `finally`**, não no callback de sucesso: erro ou cancelamento
    também precisam liberar, senão o botão trava para sempre (coberto por teste).
  - `abrir` e `plataforma` são injetáveis — é o que torna as guardas testáveis sem abrir
    janela de verdade (uma janela esperando clique humano travaria a suíte).
- Rota `POST /api/projetos/escolher-pasta` (POST por ter efeito colateral: abre um modal).
  409 = já tem diálogo aberto; 501 = plataforma sem suporte (a UI esconde o botão).
- UI: `campo-com-botao` no formulário de importação, com dica que muda enquanto o
  seletor está aberto ("procure a janela atrás do navegador").

**Segurança considerada:** uma página maliciosa poderia disparar este POST e fazer um
diálogo aparecer (chateação). Ela NÃO consegue ler a resposta — sem cabeçalhos CORS o
navegador bloqueia — e nenhum caminho vaza sem o usuário escolher a pasta com as próprias
mãos. O servidor já escuta só em 127.0.0.1.

## Verificação
`npm test`: 5 testes novos em `testes/cadastro/seletor-pasta.test.ts` (plataforma,
sucesso, cancelamento→null, concorrência, cadeado liberado após falha) + suíte inteira.
`npx tsc --noEmit` limpo nos dois workspaces; build ok.

**Smoke ao vivo, com o servidor no ar:**
- `POST /api/projetos/escolher-pasta` **abriu o diálogo de verdade** (processo
  `powershell.exe` na sessão Console, vivo, aguardando clique — a requisição fica pendente
  porque ninguém clica nesta sessão automatizada, que é o comportamento correto).
- Com o diálogo aberto, uma segunda chamada devolveu **HTTP 409** com a mensagem certa —
  guarda de concorrência provada sobre HTTP, não só em teste unitário.
- Confirmado antes por PowerShell direto que `FolderBrowserDialog` instancia e um `Form`
  abre nesta sessão gráfica (para distinguir "diálogo não abre" de "ninguém clicou").

**Não verificado:** o clique humano de fato (escolher uma pasta e ver o campo preencher) —
não há navegador nem operador nesta sessão.

## Revisão
Pulada (decisão de custo geral do painel). Auto-revisão: `tsc --noEmit` limpo; um teste
cobre especificamente a regressão mais provável (cadeado preso após falha).
