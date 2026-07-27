import { execFile } from "node:child_process";

/**
 * Seletor NATIVO de pasta (T-021): abre o diálogo do Windows para o usuário escolher a
 * pasta a importar, em vez de digitar/colar o caminho.
 *
 * POR QUE ISTO RODA NO SERVIDOR, e não no navegador: o navegador NÃO entrega caminho
 * absoluto. Tanto `<input type="file" webkitdirectory>` quanto `showDirectoryPicker()`
 * dão os arquivos mas escondem a localização no disco (segurança) — viria
 * "meu-projeto/src/app.js" sem dizer se é C:\dev ou D:\trabalho, e a importação precisa
 * do caminho absoluto para copiar. Como o painel é uma ferramenta LOCAL (servidor no
 * 127.0.0.1 da própria máquina do usuário), quem abre o diálogo é o backend.
 *
 * Risco considerado: uma página maliciosa poderia disparar este POST e fazer aparecer um
 * diálogo na tela (chateação). Ela NÃO consegue ler a resposta (sem CORS, o navegador
 * bloqueia) e nenhum caminho vaza sem o usuário escolher a pasta com as próprias mãos.
 */

/** Um diálogo por vez: dois modais nativos ao mesmo tempo confundem o usuário. */
let abertoAgora = false;

export class ErroSeletorIndisponivel extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ErroSeletorIndisponivel";
  }
}

export class ErroSeletorEmUso extends Error {
  constructor() {
    super("Já existe um seletor de pasta aberto. Conclua ou cancele o que está na tela.");
    this.name = "ErroSeletorEmUso";
  }
}

/** Script do diálogo. UTF-8 explícito: caminhos com acento ("Documentos") viriam quebrados. */
const SCRIPT_PS = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Selecione a pasta do projeto que voce quer importar para a fabrica'
$dlg.ShowNewFolderButton = $false
# Form invisivel so para o dialogo nascer NA FRENTE das outras janelas (senao ele abre
# atras do navegador e parece que nada aconteceu).
$frente = New-Object System.Windows.Forms.Form
$frente.TopMost = $true
$frente.ShowInTaskbar = $false
$frente.Opacity = 0
$frente.Show()
$resultado = $dlg.ShowDialog($frente)
$frente.Close()
if ($resultado -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dlg.SelectedPath) }
`;

export interface OpcoesSeletor {
  /** Tempo máximo esperando o usuário decidir (default 5 min). */
  timeoutMs?: number;
  /**
   * Abridor do diálogo — injetável para os testes exercitarem as guardas (plataforma,
   * concorrência, cancelamento) sem abrir uma janela de verdade, que exigiria um humano.
   */
  abrir?: (timeoutMs: number) => Promise<string | null>;
  /** Plataforma (injetável): permite testar o caminho "não-Windows" em qualquer máquina. */
  plataforma?: string;
}

/** Abridor real: dispara o PowerShell com o diálogo do Windows. */
function abrirComPowerShell(timeoutMs: number): Promise<string | null> {
  return new Promise((resolver, rejeitar) => {
    const filho = execFile(
      "powershell.exe",
      // -STA é obrigatório para diálogos do Windows Forms. Sem -NonInteractive: o
      // objetivo aqui é justamente interagir com o usuário.
      ["-NoProfile", "-STA", "-Command", SCRIPT_PS],
      { encoding: "utf8", timeout: timeoutMs, windowsHide: true },
      (erro, stdout) => {
        if (erro) {
          rejeitar(
            new ErroSeletorIndisponivel(
              `Não foi possível abrir o seletor de pasta: ${erro.message}`,
            ),
          );
          return;
        }
        const caminho = stdout.trim();
        resolver(caminho === "" ? null : caminho);
      },
    );
    filho.on("error", (e) => rejeitar(new ErroSeletorIndisponivel(e.message)));
  });
}

/**
 * Abre o seletor e resolve com o caminho ABSOLUTO escolhido, ou `null` se o usuário
 * cancelou. Lança `ErroSeletorIndisponivel` fora do Windows e `ErroSeletorEmUso` se já
 * houver um diálogo aberto.
 */
export async function escolherPasta(opcoes: OpcoesSeletor = {}): Promise<string | null> {
  const plataforma = opcoes.plataforma ?? process.platform;
  if (plataforma !== "win32") {
    throw new ErroSeletorIndisponivel(
      "O seletor nativo de pasta só existe no Windows. Cole o caminho no campo ao lado.",
    );
  }
  if (abertoAgora) throw new ErroSeletorEmUso();

  abertoAgora = true;
  try {
    const abrir = opcoes.abrir ?? abrirComPowerShell;
    return await abrir(opcoes.timeoutMs ?? 5 * 60_000);
  } finally {
    // `finally` e não no callback: erro, cancelamento ou sucesso, o cadeado SEMPRE abre —
    // senão um diálogo que falhou travaria o botão para sempre.
    abertoAgora = false;
  }
}
