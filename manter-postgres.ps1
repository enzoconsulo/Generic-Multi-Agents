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

function DonoDoSocket {
    # PID que detem a escuta na porta, ou $null se ninguem escuta.
    try {
        $c = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue |
             Select-Object -First 1
        if ($null -eq $c) { return $null }
        return [int]$c.OwningProcess
    } catch { return $null }
}

function Escutando {
    return $null -ne (DonoDoSocket)
}

function ProcessoVivo {
    return [bool](Get-Process -Name "postgres" -ErrorAction SilentlyContinue)
}

<#
    SOCKET ORFAO — o modo de falha que este vigia era CEGO para ver (21/09).

    As duas guardas originais ("so age se ninguem escuta E nenhum postgres vive") foram
    escritas para nunca subir um segundo postmaster sobre o mesmo data dir. Corretas — e
    juntas elas descrevem exatamente o estado em que o Postgres desta maquina realmente
    morre, que nao e "sumiu": e morre SUJO.

    A assinatura, medida tres vezes (T-056 ciclos 3, 5 e a manha de 21/09):

        porta 5432 LISTENING  -> PID 11272
        Get-Process 11272     -> NAO EXISTE   (postmaster defunto segurando o socket)
        postgres.exe 4612     -> --forkchild, pai = 11272  (orfao segurando o data dir)

    Nesse estado AS DUAS guardas sao falsas (ha escuta, ha processo), entao o vigia nunca
    encostava — e `banco-v2.ps1 subir` tambem nao subia, porque o data dir estava preso.
    O banco ficava no chao por horas e a fabrica reprovava TODA tarefa que o tocasse.

    A guarda que importa nao e "ha um processo?", e sim "ha um postmaster VIVO?". Matar um
    filho orfao de postmaster morto nao derruba ninguem: nao existe cliente conectado
    atraves de um postmaster que ja morreu.
#>
function SocketOrfao {
    $dono = DonoDoSocket
    if ($null -eq $dono) { return $false }
    return $null -eq (Get-Process -Id $dono -ErrorAction SilentlyContinue)
}

function LimparOrfaos($donoMorto) {
    # Mata SO os filhos do postmaster DEFUNTO que detem o socket — por PID especifico,
    # nunca `taskkill /IM`.
    #
    # O criterio NAO pode ser "postgres.exe sem pai vivo": um postmaster SAUDAVEL quase
    # sempre tem pai morto tambem (quem o lancou — um cmd.exe, um Start-Process — ja
    # saiu ha muito). Esse criterio derrubaria um banco no ar, que e o oposto do que este
    # vigia existe para fazer. A filiacao ao PID defunto e o que torna a limpeza segura.
    $mortos = 0
    foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" -ErrorAction SilentlyContinue)) {
        if ([int]$p.ParentProcessId -ne [int]$donoMorto) { continue }
        try {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
            Registrar "  orfao morto: pid $($p.ProcessId) (filho do defunto $donoMorto)"
            $mortos++
        } catch {
            Registrar "  NAO consegui matar o orfao pid $($p.ProcessId): $_"
        }
    }
    return $mortos
}

Registrar "vigia no ar (pid $PID), porta $Porta, dados $DiretorioDados"

function Religar($motivo) {
    Registrar "POSTGRES FORA DO AR ($motivo). Religando."
    try {
        $p = Start-Process -FilePath $Executavel -ArgumentList @("-D", $DiretorioDados) `
            -WindowStyle Hidden -PassThru
        Registrar "postgres iniciado (pid $($p.Id)); aguardando atender"
        # Espera ATENDER, nao so escutar. Depois de um desligamento sujo o postmaster sobe
        # em crash recovery e fica ate ~1min respondendo "the database system is starting
        # up": ja escutando, ainda recusando. Medir por `Escutando` aqui daria "de volta"
        # cedo demais — e a fabrica dispararia a passada mecanica contra um banco que ainda
        # recusa conexao, que e a reprovacao falsa que este vigia existe para evitar.
        $fim = (Get-Date).AddMinutes(3)
        do {
            Start-Sleep -Seconds 5
            & "$(Split-Path $Executavel)\pg_isready.exe" -h 127.0.0.1 -p $Porta > $null 2>&1
            $pronto = $LASTEXITCODE -eq 0
        } while (-not $pronto -and (Get-Date) -lt $fim)

        if ($pronto) {
            Registrar "de volta: 5432 atendendo."
        } else {
            Registrar "AINDA FORA depois de religar. A fabrica vai reprovar tarefa ate isto voltar; o piloto para sozinho por sem-progresso."
        }
    } catch {
        Registrar "FALHA ao religar: $_"
    }
}

$religadas = 0
while ($true) {
    Start-Sleep -Seconds $IntervaloSegundos

    if (Escutando) {
        # Ha escuta — mas de quem? Postmaster defunto deixa o socket de pe, e e esse o
        # estado em que esta maquina de fato adoece (ver o bloco SOCKET ORFAO acima).
        if (-not (SocketOrfao)) { continue }

        $donoMorto = DonoDoSocket
        $religadas++
        Registrar "SOCKET ORFAO na $Porta (dono $donoMorto morto) - tentativa de conserto #$religadas."
        $mortos = LimparOrfaos $donoMorto
        Registrar "  $mortos orfao(s) removido(s); data dir liberado."
        Start-Sleep -Seconds 2
        if (Escutando) {
            # Alguem ainda segura a porta e nao e orfao: caso para gente olhar, nao para
            # laco automatico adivinhar. Mesma doutrina conservadora do resto do script.
            Registrar "  porta AINDA ocupada apos limpar orfaos - nao vou encostar."
            continue
        }
        Religar "socket orfao limpo"
        continue
    }

    if (ProcessoVivo) {
        # Processo de pe sem escutar: arranque, recuperacao de queda ou desligamento em
        # curso. Qualquer um deles passa sozinho; entrar no meio e que nao passa.
        Registrar "5432 sem escuta, mas ha processo postgres vivo - nao vou encostar."
        continue
    }

    $religadas++
    Religar "nem escuta, nem processo - tentativa #$religadas"
}
