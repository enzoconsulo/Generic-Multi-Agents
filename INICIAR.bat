@echo off
REM Atalho de duplo-clique: chama o iniciar.ps1 sem esbarrar na politica de execucao
REM do PowerShell (que bloqueia .ps1 por padrao em muitas maquinas).
REM chcp 65001 = UTF-8, senao os acentos do servidor saem embaralhados no console.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
if errorlevel 1 (
  echo.
  echo O painel encerrou com erro. A janela fica aberta para voce ler a mensagem acima.
  pause
)
