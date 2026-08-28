<#
.SYNOPSIS
  Sobe, derruba e confere o PostgreSQL local da v2 (com pgvector).

.DESCRIPTION
  POR QUE NAO E UM SERVICO DO WINDOWS
  Seria o padrao, e foi decidido contra DE PROPOSITO: esta maquina tem 7,9 GB com ~1,4 GB
  livres, e um servico que sobe no boot consome memoria todo dia por um banco que so e
  usado quando se trabalha na v2. O gargalo desta maquina e memoria, nao conveniencia.
  Quando a v2 estiver rodando de verdade, registrar como servico e uma linha:
    pg_ctl register -N postgres-v2 -D C:\pgsql\dados -U "NT AUTHORITY\NetworkService"
  (o postgres RECUSA rodar sob conta administrativa no Windows — por isso a conta de
  servico precisa ser explicita, e o diretorio de dados precisa dar permissao a ela.)

.PARAMETER Acao
  subir | derrubar | estado | conferir  (conferir = prova que o pgvector responde)

.EXAMPLE
  .\banco-v2.ps1 subir
  .\banco-v2.ps1 conferir
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('subir', 'derrubar', 'estado', 'conferir')]
  [string]$Acao = 'estado'
)

$PG    = 'C:\pgsql\18'
$DADOS = 'C:\pgsql\dados'
$LOG   = "$DADOS\servidor.log"
$BANCO = 'fabrica_v2_dev'

# A stderr de executavel nativo vira erro terminante no PowerShell 5.1 quando redirecionada.
# Aqui o veredito e sempre o codigo de saida, nunca a presenca de texto em stderr.
$ErrorActionPreference = 'Continue'

function NoAr {
  $null = & "$PG\bin\pg_isready.exe" -h 127.0.0.1 -p 5432 2>&1
  return ($LASTEXITCODE -eq 0)
}

switch ($Acao) {

  'estado' {
    if (NoAr) {
      Write-Host 'no ar  - 127.0.0.1:5432' -ForegroundColor Green
      & "$PG\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d $BANCO -tAc `
        "SELECT 'pgvector ' || extversion FROM pg_extension WHERE extname='vector';"
    } else {
      Write-Host 'parado' -ForegroundColor Yellow
    }
  }

  'subir' {
    if (NoAr) { Write-Host 'ja estava no ar'; break }
    # `Start-Process` em vez de chamada direta: o pg_ctl segura o console herdado e a
    # chamada nunca retorna, mesmo com o servidor ja aceitando conexao.
    Start-Process -FilePath "$PG\bin\pg_ctl.exe" `
      -ArgumentList @('-D', "`"$DADOS`"", '-l', "`"$LOG`"", 'start') `
      -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Milliseconds 500
      if (NoAr) { Write-Host 'no ar - 127.0.0.1:5432' -ForegroundColor Green; break }
    }
    if (-not (NoAr)) {
      Write-Host 'NAO subiu. Ultimas linhas do log:' -ForegroundColor Red
      Get-Content $LOG -Tail 15 -ErrorAction SilentlyContinue
      exit 1
    }
  }

  'derrubar' {
    if (-not (NoAr)) { Write-Host 'ja estava parado'; break }
    & "$PG\bin\pg_ctl.exe" -D $DADOS -m fast stop | Out-Null
    Write-Host 'parado' -ForegroundColor Yellow
  }

  'conferir' {
    if (-not (NoAr)) { Write-Host 'banco parado - rode: banco-v2.ps1 subir' -ForegroundColor Red; exit 1 }
    $sql = @'
SELECT extversion AS pgvector FROM pg_extension WHERE extname='vector';
CREATE TEMP TABLE t (v vector(3));
INSERT INTO t VALUES ('[1,0,0]'), ('[0,1,0]'), ('[0.9,0.1,0]');
SELECT v::text, round((v <=> '[1,0,0]')::numeric, 4) AS distancia FROM t ORDER BY v <=> '[1,0,0]';
'@
    $tmp = Join-Path $env:TEMP 'conferir-pgvector.sql'
    [IO.File]::WriteAllText($tmp, $sql)   # sem BOM: o psql aceita, mas outras ferramentas nao
    & "$PG\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d $BANCO -v ON_ERROR_STOP=1 -f $tmp
    if ($LASTEXITCODE -ne 0) { Write-Host 'FALHOU' -ForegroundColor Red; exit 1 }
    Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
    Write-Host 'pgvector operante.' -ForegroundColor Green
  }
}
