<#
.SYNOPSIS
    Mantem o Painel da Fabrica de pe, sozinho, pelo tempo que for preciso.

.DESCRIPTION
    `iniciar.ps1` sobe o painel em PRIMEIRO PLANO: ele pergunta as coisas (Read-Host se a
    porta estiver ocupada), escreve na tela e morre com o Ctrl+C ou com o fechamento do
    terminal. Isso e o certo para operar a fabrica sentado na frente dela.

    Este script e para o caso oposto: a maquina fica ligada e NINGUEM esta olhando. Ele nao
    pergunta nada, escreve num log em vez da tela, e - o que importa - RESSOBE o servidor se
    ele cair. Sem isso, uma queda as 11h significa o dia inteiro parado com o piloto
    automatico desligado junto, porque o piloto vive DENTRO do processo do servidor: quem
    encadeia as rodadas e o `PilotoAutomatico` do proprio painel, entao servidor no chao e
    fabrica no chao.

    Reinicio tem recuo progressivo (5s, 10s, 20s ... ate 5min). Nao e zelo: servidor que
    morre no arranque - porta ocupada, dist/ ausente, banco fora do ar - reiniciaria em laco
    fechado enchendo o disco de log. O recuo transforma isso num sinal legivel no log em vez
    de um incendio.

.EXAMPLE
    .\manter-painel.ps1
    Mantem o painel em http://127.0.0.1:8765, com log em painel\dados\supervisor.log

.NOTES
    Para PARAR: feche a janela do supervisor, ou
        Get-Content painel\dados\supervisor.pid | ForEach-Object { Stop-Process -Id $_ }
    e depois encerre o processo node que ficou na porta.
#>
[CmdletBinding()]
param(
    [int]$Porta = 8765,
    [int]$RecuoMaximoSegundos = 300
)

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Definition
$painel = Join-Path $raiz "painel"
$dados = Join-Path $painel "dados"
if (-not (Test-Path $dados)) { New-Item -ItemType Directory -Path $dados -Force | Out-Null }

$log = Join-Path $dados "supervisor.log"
$arquivoPid = Join-Path $dados "supervisor.pid"
$entrada = Join-Path $painel "servidor\dist\index.js"

function Registrar($texto) {
    $carimbo = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $log -Value "[$carimbo] $texto" -Encoding utf8
}

# O PID do SUPERVISOR, para quem quiser para-lo depois sem cacar processo na mao.
Set-Content -Path $arquivoPid -Value $PID -Encoding utf8

Registrar "supervisor no ar (pid $PID), porta $Porta, entrada $entrada"

if (-not (Test-Path $entrada)) {
    Registrar "ERRO: $entrada nao existe. Rode 'npm run build' em painel\ antes."
    exit 1
}

$env:PORTA = "$Porta"
$recuo = 5
$quedas = 0

while ($true) {
    $inicio = Get-Date
    Registrar "subindo o servidor..."

    # -NoNewWindow mantem o node como filho DESTE processo: se o supervisor for encerrado,
    # o servidor vai junto, que e o comportamento esperado de um supervisor.
    $proc = Start-Process -FilePath "node" -ArgumentList $entrada `
        -WorkingDirectory $painel -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $dados "servidor.out.log") `
        -RedirectStandardError (Join-Path $dados "servidor.err.log")

    Registrar "servidor no ar (pid $($proc.Id))"
    $proc.WaitForExit()

    $viveu = [int]((Get-Date) - $inicio).TotalSeconds
    $quedas++
    Registrar "servidor SAIU com codigo $($proc.ExitCode) apos ${viveu}s (queda #$quedas)"

    # Queda depois de um bom tempo de pe e incidente isolado: recomeca do recuo minimo.
    # Queda logo no arranque e defeito de configuracao: recua mais a cada tentativa.
    if ($viveu -ge 120) {
        $recuo = 5
    } else {
        $recuo = [Math]::Min($recuo * 2, $RecuoMaximoSegundos)
    }

    Registrar "religando em ${recuo}s"
    Start-Sleep -Seconds $recuo
}
