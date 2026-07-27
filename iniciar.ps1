<#
.SYNOPSIS
    Sobe o Painel da Fábrica: confere os pré-requisitos, prepara a estrutura,
    instala, compila e abre o painel no navegador.

.DESCRIPTION
    Roda tudo o que é preciso para a fábrica funcionar, na ordem certa, e explica
    cada passo. Pode ser rodado quantas vezes quiser: só refaz o que falta.

.EXAMPLE
    .\iniciar.ps1
    Modo normal: instala (se preciso), compila e sobe em http://127.0.0.1:8765

.EXAMPLE
    .\iniciar.ps1 -Dev
    Modo desenvolvimento: recarrega ao salvar (abre em http://localhost:5173)

.EXAMPLE
    .\iniciar.ps1 -SemBuild
    Pula a compilação (mais rápido quando você não mexeu no código)
#>
[CmdletBinding()]
param(
    [int]$Porta = 8765,
    [switch]$Dev,
    [switch]$SemBuild,
    [switch]$NaoAbrirNavegador
)

$ErrorActionPreference = "Stop"

# O servidor Node escreve acentos em UTF-8; sem isto o console do Windows mostra
# "F├íbrica" no lugar de "Fábrica".
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

# ------------------------------------------------------------------ aparência
function Titulo($texto) {
    Write-Host ""
    Write-Host "  $texto" -ForegroundColor Cyan
    Write-Host "  $('-' * $texto.Length)" -ForegroundColor DarkCyan
}
function Ok($texto)     { Write-Host "  [ok]    $texto" -ForegroundColor Green }
function Aviso($texto)  { Write-Host "  [aviso] $texto" -ForegroundColor Yellow }
function Erro($texto)   { Write-Host "  [ERRO]  $texto" -ForegroundColor Red }
function Passo($texto)  { Write-Host "  [..]    $texto" -ForegroundColor Gray }

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Definition
$painel = Join-Path $raiz "painel"

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "   Gerador de Projetos - Painel da Fabrica" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor Cyan

# ------------------------------------------------------- 1. pré-requisitos
Titulo "1/5  Pre-requisitos"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Erro "Node.js nao encontrado no PATH."
    Write-Host "         Instale a versao 22 ou superior: https://nodejs.org" -ForegroundColor Gray
    exit 1
}
$versaoNode = (& node -v)
$maiorNode = 0
if ($versaoNode -match '^v(\d+)\.') { $maiorNode = [int]$Matches[1] }
if ($maiorNode -lt 22) {
    Erro "Node $versaoNode encontrado, mas o painel exige a versao 22 ou superior."
    Write-Host "         Atualize em https://nodejs.org" -ForegroundColor Gray
    exit 1
}
Ok "Node $versaoNode"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Erro "npm nao encontrado no PATH (costuma vir junto com o Node)."
    exit 1
}
Ok "npm $(& npm -v)"

if (Get-Command git -ErrorAction SilentlyContinue) {
    Ok "git disponivel"
} else {
    Aviso "git NAO encontrado. O painel abre, mas importar projetos vai falhar"
    Write-Host "          (a importacao inicializa um repositorio quando a pasta nao tem um)." -ForegroundColor Gray
}

# O painel dispara os fluxos pelo binario EMBUTIDO no Agent SDK, nao pelo `claude` do
# PATH (decisao registrada no spike T-001). O que importa de verdade e existir o login
# por assinatura na maquina - que fica em ~/.claude.
$dirClaude = Join-Path $env:USERPROFILE ".claude"
if (Test-Path $dirClaude) {
    Ok "Login do Claude Code encontrado (~/.claude)"
} else {
    Aviso "Nao encontrei ~/.claude - parece que o Claude Code nunca foi usado aqui."
    Write-Host "          O painel sobe e mostra tudo normalmente, mas para DISPARAR fluxos" -ForegroundColor Gray
    Write-Host "          (/trabalhar, /status, analise) e preciso estar logado por assinatura." -ForegroundColor Gray
    Write-Host "          Rode 'claude' uma vez no terminal e faca login." -ForegroundColor Gray
}

if (-not (Test-Path $painel)) {
    Erro "Pasta 'painel' nao encontrada em: $raiz"
    Write-Host "         Rode este script de dentro da pasta da fabrica." -ForegroundColor Gray
    exit 1
}

# ------------------------------------------------------- 2. estrutura
Titulo "2/5  Estrutura da fabrica"

# projetos/ fica fora do git (cada projeto e um repo proprio), entao nao existe
# depois de um clone limpo. O painel precisa da pasta para listar/importar.
$projetos = Join-Path $raiz "projetos"
if (Test-Path $projetos) {
    $qtd = @(Get-ChildItem $projetos -Directory -ErrorAction SilentlyContinue).Count
    Ok "projetos/ existe ($qtd projeto(s))"
} else {
    New-Item -ItemType Directory -Path $projetos -Force | Out-Null
    Ok "projetos/ criada (fica fora do git; cada projeto e um repositorio proprio)"
}

foreach ($sub in @("_sistema\logs", "_sistema\ideias")) {
    $caminho = Join-Path $raiz $sub
    if (-not (Test-Path $caminho)) {
        New-Item -ItemType Directory -Path $caminho -Force | Out-Null
        Ok "$sub criada"
    }
}

# ------------------------------------------------------- 3. dependências
Titulo "3/5  Dependencias"

Push-Location $painel
try {
    $precisaInstalar = -not (Test-Path (Join-Path $painel "node_modules\@anthropic-ai\claude-agent-sdk"))
    if ($precisaInstalar) {
        Passo "Instalando (primeira vez; pode levar alguns minutos)..."
        & npm install
        if ($LASTEXITCODE -ne 0) { Erro "npm install falhou."; exit 1 }
        Ok "Dependencias instaladas"
    } else {
        Ok "Dependencias ja instaladas (pulei o npm install)"
    }

    # ------------------------------------------------------- 4. build
    Titulo "4/5  Compilacao"

    if ($Dev) {
        Ok "Modo -Dev: compilacao dispensada (o Vite/tsx compila ao vivo)"
    } elseif ($SemBuild -and (Test-Path (Join-Path $painel "web\dist"))) {
        Ok "-SemBuild: reaproveitando a compilacao anterior"
    } else {
        Passo "Compilando servidor e web..."
        & npm run build
        if ($LASTEXITCODE -ne 0) { Erro "A compilacao falhou (veja o erro acima)."; exit 1 }
        Ok "Compilado"
    }

    # ------------------------------------------------------- 5. subir
    Titulo "5/5  Subindo o painel"

    $emUso = $null
    try {
        $emUso = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
    } catch { }
    if ($emUso) {
        $pidEmUso = ($emUso | Select-Object -First 1).OwningProcess
        Aviso "A porta $Porta ja esta em uso (PID $pidEmUso) - provavelmente um painel antigo."
        $resposta = Read-Host "        Encerrar esse processo e continuar? (S/n)"
        if ($resposta -eq "" -or $resposta -match '^[SsYy]') {
            Stop-Process -Id $pidEmUso -Force
            Start-Sleep -Seconds 1
            Ok "Processo anterior encerrado"
        } else {
            Erro "Porta ocupada. Use -Porta <outra> ou encerre o processo manualmente."
            exit 1
        }
    }

    if ($Dev) {
        $url = "http://localhost:5173"
    } else {
        $url = "http://127.0.0.1:$Porta"
    }
    $urlSaude = "http://127.0.0.1:$Porta/api/saude"

    if (-not $NaoAbrirNavegador) {
        # Espera o servidor responder de verdade antes de abrir o navegador
        # (abrir antes mostraria uma pagina de erro e assustaria a toa).
        Start-Job -ScriptBlock {
            param($alvo, $saude)
            for ($i = 0; $i -lt 120; $i++) {
                Start-Sleep -Milliseconds 500
                try {
                    $r = Invoke-WebRequest -Uri $saude -UseBasicParsing -TimeoutSec 2
                    if ($r.StatusCode -eq 200) { Start-Process $alvo; return }
                } catch { }
            }
        } -ArgumentList $url, $urlSaude | Out-Null
    }

    Write-Host ""
    Write-Host "  Painel em: $url" -ForegroundColor Green
    Write-Host "  Pare com Ctrl+C." -ForegroundColor Gray
    Write-Host ""

    $env:PORTA = "$Porta"
    if ($Dev) { & npm run dev } else { & npm start }
}
finally {
    Pop-Location
    Get-Job -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue
}
