---
id: T-032
titulo: Aba Ajustes — estado das contas do Claude e do GitHub e configuração do painel
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-030]
areas: [servidor/src/fabrica/ajustes.ts, servidor/src/rotas/ajustes.ts, web/src/paginas/ajustes/]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Uma aba onde se vê e se configura a ligação do painel com as duas contas de que a fábrica
depende: a do Claude, que EXECUTA os fluxos, e a do GitHub, que RECEBE o que é publicado.

## Contexto
Pedido do usuário. Até aqui não havia nenhuma tela de configuração: descobrir por que um
push pedia senha, ou se o login do Claude ainda valia, exigia terminal.

## Critérios de aceite
- [x] Estado da conta do Claude: login presente, CLI encontrado, o que fazer se faltar.
- [x] Estado da conta do GitHub: meio de autenticação, chaves SSH, `gh`, identidade.
- [x] Identidade dos commits editável pela web.
- [x] Configuração efetiva do painel (porta, raiz, dados, teto de jobs, estratégias).
- [x] Nunca mostrar conteúdo de credencial nem de chave privada.

## Notas de execução
**Limite honesto, e é a decisão principal desta tarefa: não existe "conectar conta"
aqui.** Os dois logins são fluxos interativos que vivem fora de uma página local — o do
Claude é o CLI mais o navegador; o do GitHub é o Credential Manager, uma chave SSH ou o
`gh`. Um botão "Conectar" que só abrisse instruções seria teatro. A tela DIAGNOSTICA com
precisão e mostra o comando exato que resolve; a única coisa que ela escreve de fato é a
identidade dos commits (`git config --global`), que é editável.

- **`credential.helper` é lido sem `--global`**: no Windows ele vem do gitconfig do
  SISTEMA (instalação do Git para Windows). Com `--global` a leitura voltaria vazia e a
  tela diria "não conectado" para uma máquina que publica normalmente — foi o que quase
  aconteceu aqui.
- O painel executa pelo Agent SDK, que usa o MESMO login do CLI. Por isso `conectado`
  depende da existência das credenciais, não do CLI estar no PATH.
- Só a EXISTÊNCIA de arquivos de credencial e o NOME dos `.pub` são lidos — nunca o
  conteúdo.
- Identidade validada antes de gravar: e-mail com formato, e valor não pode começar com
  `-` (o git leria como flag). Mesma família da validação de URL de remoto da T-030.

## Verificação
Suíte verde e build limpo. Aba conferida AO VIVO com captura, com detecção real desta
máquina: Claude conectada (credenciais presentes), GitHub conectada por **HTTPS via
"manager"**, chave `id_ed25519.pub` encontrada, `gh` não instalado, identidade
`Enzo Consulo <enzoconsulo@gmail.com>`, e a configuração do painel (porta 8765, teto de
2 jobs, 5 estratégias de modelo).

**1 defeito achado OLHANDO:** a tela dizia *"CLI do Claude Code: não encontrado no PATH"*
— e o CLI ESTÁ instalado, em `~/.local/bin/claude.exe`, apenas fora do PATH do processo
do servidor. Tecnicamente correto e praticamente enganoso: é a armadilha de "documentação
que mente" na forma de UI. Agora procura também nos caminhos padrão de instalação e diz
onde encontrou, deixando claro que o painel não depende do CLI para executar.

## Revisão
O risco desta tela é vazar credencial na própria UI. Por desenho ela só reporta
existência, nome de arquivo `.pub` e valores que já são públicos por natureza (nome e
e-mail do autor dos commits, que vão em todo commit publicado).
