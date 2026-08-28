<#
.SYNOPSIS
  Compila e instala a extensao pgvector num PostgreSQL do Windows, com MSVC.

.DESCRIPTION
  POR QUE ESTE SCRIPT EXISTE
  Nao ha binario oficial de pgvector para Windows: a extensao precisa ser compilada
  com MSVC contra os headers de servidor do PostgreSQL. Sem Docker nesta maquina, este
  e o unico caminho nativo — e ele tem tres armadilhas que custaram tempo na primeira vez:

  1. `set VAR=valor && comando` no cmd captura o ESPACO antes do `&&` dentro do valor.
     O resultado sao caminhos como "C:\pgsql\18 \include\server" e um C1083 dizendo que
     postgres.h nao existe. Use sempre `set "VAR=valor"` com aspas.
  2. O instalador EDB pode deixar uma arvore INCOMPLETA. A instalacao que existia nesta
     maquina tinha bin/include/share mas nao tinha `lib/` — e sem `lib\postgres.lib` nao
     ha como linkar extensao nenhuma. Por isso este script exige PGROOT completo e
     confere antes de comecar.
  3. pgvector precisa de versao compativel com o servidor: suporte a Postgres 18 entrou
     na 0.8.1. Nao use tag anterior num servidor 18.

.PARAMETER PgRoot
  Raiz do PostgreSQL: precisa ter bin\, include\server\, lib\postgres.lib e share\extension\.

.PARAMETER Versao
  Tag do pgvector a compilar (ex.: v0.8.6).

.PARAMETER Trabalho
  Diretorio de trabalho para o clone. Apagado e recriado a cada execucao.

.EXAMPLE
  .\instalar-pgvector.ps1 -PgRoot 'C:\pgsql\18' -Versao 'v0.8.6'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$PgRoot,
  [string]$Versao = 'v0.8.6',
  [string]$Trabalho = "$env:TEMP\pgvector-build"
)

$ErrorActionPreference = 'Stop'

function Passo($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

# POR QUE ISTO EXISTE: no PowerShell 5.1, a stderr de um executavel nativo vira ErrorRecord
# quando a saida e redirecionada (`2>&1 | ...`), e com ErrorActionPreference='Stop' isso
# ABORTA o script mesmo com codigo de saida 0. O `git clone` escreve o aviso de detached
# HEAD em stderr — ou seja, um clone bem-sucedido matava a instalacao. Aqui a preferencia
# e afrouxada so em volta da chamada nativa, e o veredito passa a ser o $LASTEXITCODE,
# que e a unica coisa que um executavel realmente promete.
function Invoke-Nativo {
  param([Parameter(Mandatory)][scriptblock]$Bloco, [string]$Oque = 'comando externo')
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Bloco 2>&1 | ForEach-Object { Write-Host "  $_" } }
  finally { $ErrorActionPreference = $anterior }
  if ($LASTEXITCODE -ne 0) { throw "$Oque falhou (codigo $LASTEXITCODE)" }
}

Passo "Conferindo PGROOT: $PgRoot"
$exigidos = @(
  "$PgRoot\bin\postgres.exe",
  "$PgRoot\include\server\postgres.h",
  "$PgRoot\lib\postgres.lib",
  "$PgRoot\share\extension"
)
foreach ($e in $exigidos) {
  if (-not (Test-Path $e)) { throw "PGROOT incompleto: falta $e" }
  Write-Host "  ok  $e"
}
$versaoServidor = (& "$PgRoot\bin\postgres.exe" --version)
Write-Host "  servidor: $versaoServidor"

Passo 'Localizando o MSVC (vcvars64.bat)'
# PRIMEIRO o vswhere, que e a forma OFICIAL e independente de versao: ele vem com o
# instalador do Visual Studio e sabe onde cada instalacao esta, inclusive as que ainda
# nao existiam quando este script foi escrito. A lista fixa abaixo ficou como reserva.
# POR QUE: a lista fixa so conhecia 2019 e 2022. Numa maquina com VS 2026 Build Tools
# (em `...\Microsoft Visual Studio\18\BuildTools`) o script abortava com
# "vcvars64.bat nao encontrado" tendo o compilador instalado e funcionando.
$vcvars = $null
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
  $raiz = & $vswhere -latest -products * `
            -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
            -property installationPath
  if ($raiz) {
    $p = Join-Path $raiz.Trim() 'VC\Auxiliary\Build\vcvars64.bat'
    if (Test-Path $p) { $vcvars = $p }
  }
}
if (-not $vcvars) {
  $candidatos = @(
    'C:\Program Files\Microsoft Visual Studio\2022\BuildTools',
    'C:\Program Files\Microsoft Visual Studio\2022\Community',
    'C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools',
    'C:\Program Files (x86)\Microsoft Visual Studio\2019\Community'
  )
  foreach ($c in $candidatos) {
    $p = Join-Path $c 'VC\Auxiliary\Build\vcvars64.bat'
    if (Test-Path $p) { $vcvars = $p; break }
  }
}
if (-not $vcvars) { throw 'vcvars64.bat nao encontrado — instale os Build Tools do Visual Studio (workload C++).' }
Write-Host "  $vcvars"

Passo "Clonando pgvector $Versao"
if (Test-Path $Trabalho) { Remove-Item -LiteralPath $Trabalho -Recurse -Force }
New-Item -ItemType Directory -Force $Trabalho | Out-Null
Invoke-Nativo -Oque "git clone (tag $Versao)" -Bloco {
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch $Versao `
      'https://github.com/pgvector/pgvector.git' "$Trabalho\pgvector"
}

$src = "$Trabalho\pgvector"

Passo 'Compilando (nmake /F Makefile.win)'
# As ASPAS no `set "PGROOT=..."` sao a armadilha 1 do cabecalho. Nao as remova.
$build = "call `"$vcvars`" >nul 2>&1 && cd /d `"$src`" && set `"PGROOT=$PgRoot`" && nmake /F Makefile.win"
Invoke-Nativo -Oque 'compilacao' -Bloco { cmd /c $build }

Passo 'Instalando na arvore do PostgreSQL'
$install = "call `"$vcvars`" >nul 2>&1 && cd /d `"$src`" && set `"PGROOT=$PgRoot`" && nmake /F Makefile.win install"
Invoke-Nativo -Oque 'instalacao' -Bloco { cmd /c $install }

Passo 'Conferindo o que foi instalado'
$instalados = @("$PgRoot\lib\vector.dll", "$PgRoot\share\extension\vector.control")
foreach ($i in $instalados) {
  if (-not (Test-Path $i)) { throw "esperado mas ausente: $i" }
  Write-Host "  ok  $i"
}
Get-ChildItem "$PgRoot\share\extension\vector--*.sql" | Select-Object -Expand Name | ForEach-Object { Write-Host "  ok  $_" }

Write-Host "`npgvector $Versao instalado. Falta so, no banco: CREATE EXTENSION vector;" -ForegroundColor Green
