<#
.SYNOPSIS
    Vigia o Postgres que a fabrica usa e o ressobe se ele sumir.

.DESCRIPTION
    Nesta maquina o Postgres NAO e servico do Windows: ele foi subido a mao, de um
    `cmd.exe` ("C:/pgsql/18/bin/postgres.exe" -D "C:/pgsql/dados"). Enquanto alguem esta na
    frente do computador isso e indiferente. Com a fabrica rodando sozinha o dia inteiro,
    nao e: banco fora do ar reprova TODA tarefa, e como nao ha servico, nada o traz de volta.

    Este vigia e deliberadamente burro e conservador. Ele so age quando as DUAS condicoes
    valem ao mesmo tempo: ninguem escutando na 5432 E nenhum processo `postgres` vivo. Se um
    dos dois existir, ele nao encosta — banco meio de pe e caso para gente olhar, nao para
    laco automatico adivinhar. Subir um segundo postmaster sobre o mesmo diretorio de dados
    seria muito pior que o problema que ele resolve (e o proprio Postgres se recusa a fazer,
    pelo arquivo de lock; a guarda daqui e para nem chegar la).

    Se o banco nao voltar, ele NAO tenta consertar a fabrica: as rodadas vao falhar, e o
    freio de `sem-progresso` do piloto para o laco sozinho depois de duas. Cada mecanismo
    fazendo a sua parte.

.EXAMPLE
    .\manter-postgres.ps1
    Vigia a cada 30s, log em painel\dados\postgres-vigia.log

.NOTES
    Para PARAR:
        Get-Content painel\dados\postgres-vigia.pid | ForEach-Object { Stop-Process -Id $_ }
#>
[CmdletBinding()]
param(
    [int]$Porta = 5432,
    [int]$IntervaloSegundos = 30,
    [string]$Executavel = "C:/pgsql/18/bin/postgres.exe",
    [string]$DiretorioDados = "C:/pgsql/dados"
)

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Definition
$dados = Join-Path $raiz "painel\dados"
if (-not (Test-Path $dados)) { New-Item -ItemType Directory -Path $dados -Force | Out-Null }

$log = Join-Path $dados "postgres-vigia.log"
Set-Content -Path (Join-Path $dados "postgres-vigia.pid") -Value $PID -Encoding utf8

function Registrar($texto) {
    $carimbo = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $log -Value "[$carimbo] $texto" -Encoding utf8
}

function Escutando {
    try {
        return [bool](Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)
    } catch { return $false }
}

function ProcessoVivo {
    return [bool](Get-Process -Name "postgres" -ErrorAction SilentlyContinue)
}

Registrar "vigia no ar (pid $PID), porta $Porta, dados $DiretorioDados"

$religadas = 0
while ($true) {
    Start-Sleep -Seconds $IntervaloSegundos

    if (Escutando) { continue }

    if (ProcessoVivo) {
        # Processo de pe sem escutar: arranque, recuperacao de queda ou desligamento em
        # curso. Qualquer um deles passa sozinho; entrar no meio e que nao passa.
        Registrar "5432 sem escuta, mas ha processo postgres vivo - nao vou encostar."
        continue
    }

    $religadas++
    Registrar "POSTGRES FORA DO AR (nem escuta, nem processo). Tentativa de religar #$religadas."

    try {
        $p = Start-Process -FilePath $Executavel -ArgumentList @("-D", $DiretorioDados) `
            -WindowStyle Hidden -PassThru
        Registrar "postgres iniciado (pid $($p.Id)); conferindo em 15s"
        Start-Sleep -Seconds 15
        if (Escutando) {
            Registrar "de volta: 5432 escutando."
        } else {
            Registrar "AINDA FORA depois de religar. A fabrica vai reprovar tarefa ate isto voltar; o piloto para sozinho por sem-progresso."
        }
    } catch {
        Registrar "FALHA ao religar: $_"
    }
}
