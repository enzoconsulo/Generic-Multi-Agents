<#
.SYNOPSIS
  Espera a cota da assinatura voltar e retoma o trabalho da v2 de onde parou.

.DESCRIPTION
  POR QUE ESTE SCRIPT EXISTE
  A cota da assinatura cortou tres despachos em tres dias (31/08, 01/09, 02/09). Nenhum gerou
  fatura e nenhum perdeu trabalho, mas cada corte custa o despacho inteiro, e quem esta longe
  do teclado so descobre horas depois que a cota ja tinha voltado.

  COMO ELE SABE QUE A COTA VOLTOU
  Nao ha API de cota. O que existe e um fato medido pela T-018a: o `claude` emite, em TODA
  resposta, um evento `rate_limit_event` com a utilizacao das duas janelas:

      {"type":"rate_limit_event",
       "rate_limit_info":{"status":"allowed","rateLimitType":"five_hour",
                          "unifiedWindows":{"five_hour":{"utilization":0.67},
                                            "seven_day":{"utilization":0.60}}}}

  Entao a sonda daqui e uma chamada minima ao `claude` que le esse evento. Ela custa alguns
  tokens de cota e NAO gera fatura (assinatura). O intervalo padrao e generoso de proposito:
  sondar de minuto em minuto gastaria cota para descobrir que nao ha cota.

  A LINHA DE COMANDO NAO E CHUTE
  Cada flag abaixo foi medida contra o `claude` 2.1.258 na T-018b, e a razao de cada uma esta
  em projetos/fabrica-v2/_gestao/PROGRESSO.md:
    --print                       modo nao interativo
    --verbose                     OBRIGATORIO com stream-json; sem ele o CLI sai com 1 e
                                  stdout vazio (foi o defeito que abriu a T-018a)
    --output-format stream-json   e onde o rate_limit_event aparece
    --model haiku                 a sonda nao precisa de modelo caro
  O stdin vem do vazio (< NUL): sem isso o CLI espera 3 s por entrada que nunca vem.

  ESTE ARQUIVO E ASCII DE PROPOSITO
  O PowerShell 5.1 le script sem BOM como ANSI, e acento ou travessao viram lixo que quebra o
  parser. O banco-v2.ps1 ao lado segue a mesma convencao.

.PARAMETER Modo
  avisar  (padrao) Espera a cota voltar e AVISA. Voce cola o prompt de _sistema/v2/RETOMAR.md.
                   E o padrao porque nao gasta nada sem supervisao.
  auto             Espera a cota voltar e ABRE o Claude Code na raiz da fabrica.
  sondar           Le a cota UMA vez, imprime e sai. Nao espera.

.PARAMETER IntervaloMin
  Minutos entre sondas enquanto a cota estiver no teto. Padrao 15.

.PARAMETER TetoHoras
  Desiste depois deste tempo, para o script nao ficar vivo para sempre. Padrao 12.

.EXAMPLE
  .\retomar-v2.ps1
  .\retomar-v2.ps1 -Modo sondar
  .\retomar-v2.ps1 -Modo auto -IntervaloMin 20
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('avisar', 'auto', 'sondar')]
  [string]$Modo = 'avisar',

  [int]$IntervaloMin = 15,
  [int]$TetoHoras = 12
)

$ErrorActionPreference = 'Stop'
# Tres niveis: .../raiz/_sistema/ferramentas/este-arquivo.ps1 -> .../raiz
$raiz = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$promptFile = Join-Path $raiz '_sistema\v2\RETOMAR.md'

function Escrever($texto, $cor = 'Gray') { Write-Host $texto -ForegroundColor $cor }

# Devolve um hashtable com as duas janelas, ou $null se nao deu para ler.
# NAO lanca: cota estourada tambem e uma resposta valida, e quem decide e o chamador.
function Ler-Cota {
  $tmp = Join-Path $env:TEMP ("sonda-cota-{0}.txt" -f (Get-Random))
  try {
    # cmd /c para conseguir o `< NUL` (stdin vindo do vazio) de forma confiavel no Windows.
    $linha = 'claude --print --verbose --output-format stream-json --model haiku "oi" < NUL'
    cmd /c "$linha > `"$tmp`" 2>&1" | Out-Null
    if (-not (Test-Path $tmp)) { return $null }

    $bruto = Get-Content $tmp -Raw
    if ([string]::IsNullOrWhiteSpace($bruto)) { return $null }

    # Parede de cota: o CLI diz isso em texto quando nao ha mais o que gastar.
    if ($bruto -match '(?i)rate.?limit exceeded|usage limit|session limit') {
      return @{ estourada = $true; five_hour = $null; seven_day = $null }
    }

    foreach ($l in ($bruto -split "`n")) {
      if ($l -notmatch 'rate_limit_event') { continue }
      try { $ev = $l | ConvertFrom-Json } catch { continue }
      $j = $ev.rate_limit_info.unifiedWindows
      if ($null -eq $j) { continue }
      return @{
        estourada = $false
        five_hour = [double]$j.five_hour.utilization
        seven_day = [double]$j.seven_day.utilization
      }
    }

    # Respondeu, mas sem o evento: o CLI respondeu, entao ha cota.
    return @{ estourada = $false; five_hour = $null; seven_day = $null }
  }
  finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  }
}

function Formatar($c) {
  if ($null -eq $c) { return 'ilegivel (o claude nao respondeu: ele esta instalado e no PATH?)' }
  if ($c.estourada) { return 'ESTOURADA' }
  $f = if ($null -ne $c.five_hour) { '{0:P0}' -f $c.five_hour } else { '?' }
  $s = if ($null -ne $c.seven_day) { '{0:P0}' -f $c.seven_day } else { '?' }
  return "disponivel  ::  5h em $f  ::  7 dias em $s"
}

function Tem-Cota($c) { return ($null -ne $c) -and (-not $c.estourada) }

# ------------------------------------------------------------------ sondar
if ($Modo -eq 'sondar') {
  $c = Ler-Cota
  if (Tem-Cota $c) { Escrever (Formatar $c) 'Green'; exit 0 }
  Escrever (Formatar $c) 'Yellow'
  exit 1
}

# ------------------------------------------------------------------ esperar
$limite = (Get-Date).AddHours($TetoHoras)
Escrever "Esperando a cota. Sonda a cada $IntervaloMin min; desiste as $($limite.ToString('HH:mm'))." 'Cyan'
Escrever "Ctrl+C para parar. A sonda gasta alguns tokens de cota e NAO gera fatura."
Escrever ""

while ((Get-Date) -lt $limite) {
  $c = Ler-Cota
  $agora = (Get-Date).ToString('HH:mm:ss')
  $texto = Formatar $c

  if (Tem-Cota $c) {
    Escrever "[$agora] $texto" 'Green'
    Escrever ""
    Escrever "A COTA VOLTOU." 'Green'

    if ($Modo -eq 'avisar') {
      Escrever ""
      Escrever "Abra o Claude Code na raiz da fabrica e cole o prompt de:" 'Cyan'
      Escrever "  $promptFile" 'White'
      Escrever ""
      Escrever "Edite a linha DECISAO: antes de colar. E a unica coisa que so voce sabe." 'DarkGray'
      try { [Console]::Beep(880, 300); [Console]::Beep(1320, 400) } catch { }
      exit 0
    }

    # Modo auto: abre o Claude Code INTERATIVO, ja posicionado na raiz da fabrica.
    # Interativo de proposito, e nao `--print`: num job headless nao existe quem entregue a
    # notificacao de subagente concluido, e o orquestrador cortaria os agentes em voo. Essa
    # armadilha ja custou duas rodadas a esta fabrica; esta no CLAUDE.md, regra 7.
    Escrever ""
    Escrever "Abrindo o Claude Code. Cole o prompt de:" 'Cyan'
    Escrever "  $promptFile" 'White'
    Push-Location $raiz
    try { claude } finally { Pop-Location }
    exit 0
  }

  Escrever "[$agora] $texto  ->  nova sonda em $IntervaloMin min" 'DarkGray'
  Start-Sleep -Seconds ($IntervaloMin * 60)
}

Escrever ""
Escrever "Desisti depois de $TetoHoras h sem cota. Rode de novo, ou use -TetoHoras maior." 'Yellow'
exit 1
