#!/bin/bash
# uso: vigiar.sh <projeto> <minutos_sem_mudanca>
S="$(dirname "$0")"; cd "$S"; ult=""; desde=$(date +%s); n=0
while true; do
  n=$((n+1)); out=$(elixir --sname vig$n$RANDOM --cookie marco058 estado.exs "$1" 2>&1 | grep -E "^(tarefas|piloto|NO_)")
  echo "$(date -u +%H:%M) $out" >> "vigia-$1.log"
  if echo "$out" | grep -q "NO_FORA_DO_AR\|SEM_PROCESSO\|ligado?: false"; then echo "$out"; exit 0; fi
  t=$(echo "$out" | grep tarefas)
  if [ "$t" != "$ult" ]; then ult="$t"; desde=$(date +%s); fi
  if [ $(( $(date +%s) - desde )) -gt $(( $2 * 60 )) ]; then echo "SEM MUDANCA HA $2 MIN: $out"; exit 0; fi
  sleep 180
done
