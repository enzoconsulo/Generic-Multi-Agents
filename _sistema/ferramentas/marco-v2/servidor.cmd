@echo off
cd /d C:\Users\enzoconsulo\Documents\Generic-Multi-Agents\projetos\fabrica-v2
set MIX_ENV=dev
elixir --sname fabrica --cookie marco058 -S mix phx.server >> C:\Users\enzoconsulo\tcc-tmp\marco-servidor.log 2>&1
