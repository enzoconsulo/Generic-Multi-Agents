#!/bin/bash
# SessionStart da fábrica — SÓ na nuvem (Claude Code on the web).
#
# A máquina de casa é Windows, com Postgres subido à mão (banco-v2.ps1) e Elixir instalado.
# O contêiner da nuvem nasce sem nada disso e morre ao fim da sessão, então a cada início
# este hook reconstrói o mínimo para rodar os projetos da fábrica:
#
#   1. Erlang/OTP + Elixir nas MESMAS versões da máquina de casa (OTP 28.1, Elixir 1.19.4),
#      de builds.hex.pm com sha256 conferido. Versão diferente da de casa é bateria que
#      passa aqui e reprova lá (ou o contrário) — e aí ninguém sabe qual das duas mente.
#   2. projetos/fabrica-v2, clonado se faltar (projetos/ fica fora do git da fábrica).
#   3. PostgreSQL 18 + pgvector em 127.0.0.1:5432, usuário postgres/postgres — o mesmo de
#      config/dev.exs e config/test.exs do projeto. 18 porque é o de casa (C:/pgsql/18).
#   4. deps do projeto (mix deps.get) — o estado do contêiner é cacheado depois do hook.
#
# Idempotente: cada passo confere antes de agir. Falha de um passo NÃO derruba a sessão
# (o clone, por exemplo, só funciona se o repositório estiver anexado à sessão) — avisa
# em stderr e segue. Fora da nuvem, não faz nada.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

RAIZ="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
FERRAMENTAS=/opt/fabrica
OTP_VERSAO=28.1
OTP_SHA=6f7a95250a83f999909cf64dc375fd08809eb057f61b24eecdf2b3b44fe621ab
ELIXIR_VERSAO=1.19.4
ELIXIR_SHA=8fd7b5705b756c0e1ec71f9e8281b4b75801b9564f0205b5035319e8505ad2b4
PG_VERSAO=18
PROJETO_V2="$RAIZ/projetos/fabrica-v2"
REPO_V2=https://github.com/enzoconsulo/fabrica-v2

avisar() { echo "[session-start] $*" >&2; }

# Ubuntu da imagem: o .tar.gz do OTP é por versão de distro.
DISTRO="ubuntu-$(. /etc/os-release && echo "$VERSION_ID")"

instalar_otp() {
  local destino="$FERRAMENTAS/otp-$OTP_VERSAO"
  [ -x "$destino/bin/erl" ] && return 0
  avisar "instalando Erlang/OTP $OTP_VERSAO ($DISTRO)"
  local tmp; tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/otp.tar.gz" \
    "https://builds.hex.pm/builds/otp/amd64/$DISTRO/OTP-$OTP_VERSAO.tar.gz" || return 1
  echo "$OTP_SHA  $tmp/otp.tar.gz" | sha256sum -c --quiet || return 1
  mkdir -p "$FERRAMENTAS"
  tar xzf "$tmp/otp.tar.gz" -C "$tmp"
  rm -rf "$destino"
  mv "$tmp/OTP-$OTP_VERSAO" "$destino"
  (cd "$destino" && ./Install -minimal "$destino" >/dev/null) || return 1
  rm -rf "$tmp"
}

instalar_elixir() {
  local destino="$FERRAMENTAS/elixir-$ELIXIR_VERSAO"
  [ -x "$destino/bin/elixir" ] && return 0
  avisar "instalando Elixir $ELIXIR_VERSAO"
  local tmp; tmp=$(mktemp -d)
  local otp_maior=${OTP_VERSAO%%.*}
  curl -fsSL -o "$tmp/elixir.zip" \
    "https://builds.hex.pm/builds/elixir/v$ELIXIR_VERSAO-otp-$otp_maior.zip" || return 1
  echo "$ELIXIR_SHA  $tmp/elixir.zip" | sha256sum -c --quiet || return 1
  rm -rf "$destino"
  mkdir -p "$destino"
  unzip -q "$tmp/elixir.zip" -d "$destino" || return 1
  rm -rf "$tmp"
}

# /usr/local/bin além do PATH: subagentes e shells que não leem o CLAUDE_ENV_FILE também
# enxergam `mix`. Os do Elixir são EMBRULHOS, não links: o contêiner não tem locale, e sem
# UTF-8 a VM sobe com nomes em latin1 — os do projeto têm acento. O embrulho também leva o
# FABRICA_PG_BIN (ver subir_postgres), para o `mix test.backup` achar o pg_dump daqui.
ligar_binarios() {
  local b
  for b in "$FERRAMENTAS/otp-$OTP_VERSAO/bin"/*; do
    [ -x "$b" ] && [ -f "$b" ] && ln -sf "$b" "/usr/local/bin/$(basename "$b")"
  done
  for b in "$FERRAMENTAS/elixir-$ELIXIR_VERSAO/bin"/*; do
    [ -x "$b" ] && [ -f "$b" ] || continue
    rm -f "/usr/local/bin/$(basename "$b")"
    printf '#!/bin/sh\nexport LANG="${LANG:-C.UTF-8}" ELIXIR_ERL_OPTIONS="${ELIXIR_ERL_OPTIONS:-+fnu}"\nexport FABRICA_PG_BIN="${FABRICA_PG_BIN:-/usr/lib/postgresql/%s/bin}"\nexec "%s" "$@"\n' \
      "$PG_VERSAO" "$b" > "/usr/local/bin/$(basename "$b")"
    chmod +x "/usr/local/bin/$(basename "$b")"
  done
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$FERRAMENTAS/elixir-$ELIXIR_VERSAO/bin:$FERRAMENTAS/otp-$OTP_VERSAO/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
    echo "export LANG=C.UTF-8 ELIXIR_ERL_OPTIONS=+fnu" >> "$CLAUDE_ENV_FILE"
  fi
  export PATH="$FERRAMENTAS/elixir-$ELIXIR_VERSAO/bin:$FERRAMENTAS/otp-$OTP_VERSAO/bin:$PATH"
  export LANG=C.UTF-8 ELIXIR_ERL_OPTIONS=+fnu
  mix local.hex --force --if-missing >/dev/null 2>&1 || avisar "mix local.hex falhou"
  mix local.rebar --force --if-missing >/dev/null 2>&1 || avisar "mix local.rebar falhou"
}

clonar_projeto() {
  [ -d "$PROJETO_V2/.git" ] && return 0
  avisar "clonando $REPO_V2 em projetos/fabrica-v2"
  mkdir -p "$RAIZ/projetos"
  git clone --depth 50 "$REPO_V2" "$PROJETO_V2" ||
    { avisar "clone falhou — o repositório fabrica-v2 está anexado a esta sessão?"; return 1; }
}

subir_postgres() {
  # A imagem traz um cluster 16 na 5432 (parado). O de casa é 18: o 16 vai para a 5433 e
  # deixa de subir sozinho, para nunca disputar a porta com o 18.
  if pg_lsclusters -h 2>/dev/null | awk '$1=="16" && $2=="main" && $3=="5432"' | grep -q .; then
    pg_ctlcluster 16 main stop >/dev/null 2>&1 || true
    sed -i 's/^port = 5432/port = 5433/' /etc/postgresql/16/main/postgresql.conf
    echo manual > /etc/postgresql/16/main/start.conf
  fi
  if ! pg_lsclusters -h 2>/dev/null | awk -v v="$PG_VERSAO" '$1==v && $2=="main"' | grep -q .; then
    avisar "criando cluster PostgreSQL $PG_VERSAO"
    pg_createcluster "$PG_VERSAO" main --port 5432 >/dev/null || return 1
  fi
  pg_ctlcluster "$PG_VERSAO" main start >/dev/null 2>&1 || true
  local i
  for i in $(seq 1 30); do
    pg_isready -h 127.0.0.1 -p 5432 -q && break
    sleep 0.5
  done
  pg_isready -h 127.0.0.1 -p 5432 -q || { avisar "Postgres não subiu"; return 1; }
  # Mesmas credenciais de config/dev.exs e config/test.exs (postgres/postgres via TCP).
  su postgres -c "psql -p 5432 -qAtc \"ALTER USER postgres PASSWORD 'postgres'\"" >/dev/null ||
    return 1
  # `Fabrica.Backup` chama pg_dump/pg_restore sem senha (em casa o banco aceita local sem
  # pedir). Aqui o pg_hba exige scram: o .pgpass entrega a mesma senha do config/.
  echo "127.0.0.1:5432:*:postgres:postgres" > "$HOME/.pgpass"
  chmod 600 "$HOME/.pgpass"
  # O config/ do projeto aponta :pg_bin para C:/pgsql/18/bin; FABRICA_PG_BIN o sobrepõe
  # (config/config.exs). Binários da MESMA versão do servidor — dump de outra versão
  # estoura na restauração.
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PGCLUSTER=$PG_VERSAO/main FABRICA_PG_BIN=/usr/lib/postgresql/$PG_VERSAO/bin" >> "$CLAUDE_ENV_FILE"
  fi
}

baixar_deps() {
  [ -f "$PROJETO_V2/mix.exs" ] || return 0
  (cd "$PROJETO_V2" && mix deps.get >/dev/null 2>&1) || { avisar "mix deps.get falhou"; return 1; }
}

instalar_otp || avisar "falhou instalar Erlang/OTP"
instalar_elixir || avisar "falhou instalar Elixir"
ligar_binarios
clonar_projeto
subir_postgres || avisar "falhou subir o Postgres"
baixar_deps
exit 0
