#!/usr/bin/env bash
# UGT server bootstrap for Ubuntu Server 22.04/24.04 (spare PC, mini PC or VPS).
# Idempotent: safe to run again. Deletes nothing.
#
# What it does:
#   1. system updates + automatic security updates
#   2. Docker Engine + compose plugin (official Docker apt repo)
#   3. Tailscale with Tailscale SSH (the only way in from outside)
#   4. ufw: deny all incoming, allow only the tailscale0 interface
#   5. laptop: keep running with the lid closed, never suspend
#   6. publish the UGT UI on the tailnet only (tailscale serve → 127.0.0.1:3000)
#
# Usage:  sudo ./bootstrap.sh [--user <name>] [--no-lid] [--skip-serve]
# All UGT ports in docker-compose.yml are bound to 127.0.0.1: nothing is reachable
# from the LAN or the internet. Access is via https://<host>.<tailnet>.ts.net only.
set -euo pipefail

TARGET_USER="${SUDO_USER:-}"
DO_LID=1
DO_SERVE=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user) TARGET_USER="$2"; shift 2 ;;
    --no-lid) DO_LID=0; shift ;;
    --skip-serve) DO_SERVE=0; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;32m[ugt-bootstrap]\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m[ugt-bootstrap] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run with sudo"
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "this script supports Ubuntu only (found ${ID:-unknown})"

log "1/6 system updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw unattended-upgrades git
dpkg-reconfigure -f noninteractive unattended-upgrades

log "2/6 Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
# Log rotation so logs never fill a small disk
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
JSON
  systemctl restart docker
fi
if [[ -n "$TARGET_USER" ]] && id "$TARGET_USER" >/dev/null 2>&1; then
  usermod -aG docker "$TARGET_USER"
fi

log "3/6 Tailscale"
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.noarmor.gpg" -o /usr/share/keyrings/tailscale-archive-keyring.gpg
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.tailscale-keyring.list" -o /etc/apt/sources.list.d/tailscale.list
  apt-get update -y
  apt-get install -y tailscale
fi
systemctl enable --now tailscaled
if ! tailscale status >/dev/null 2>&1; then
  echo "Open the link below to add this machine to your tailnet:"
  tailscale up --ssh
fi
tailscale status >/dev/null 2>&1 || die "Tailscale is not connected: the firewall step would lock you out. Fix Tailscale and run again."

log "4/6 firewall (incoming only via Tailscale)"
ufw default deny incoming
ufw default allow outgoing
ufw allow in on tailscale0
ufw --force enable
ufw status verbose

if [[ $DO_LID -eq 1 ]]; then
  log "5/6 no suspend, lid closed keeps running"
  mkdir -p /etc/systemd/logind.conf.d
  cat > /etc/systemd/logind.conf.d/ugt-no-suspend.conf <<'CONF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
CONF
  systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
  systemctl restart systemd-logind || true
else
  log "5/6 skipped (--no-lid)"
fi

if [[ $DO_SERVE -eq 1 ]]; then
  log "6/6 UGT UI on the tailnet only"
  # Proxies https://<host>.<tailnet>.ts.net → 127.0.0.1:3000. Not public (that would be 'funnel').
  tailscale serve --bg 3000 || echo "tailscale serve failed: enable HTTPS in the Tailscale admin console (DNS → HTTPS certificates) and run: sudo tailscale serve --bg 3000"
else
  log "6/6 skipped (--skip-serve)"
fi

log "done. Next: clone the repo, copy .env and secrets/kek.bin by hand (never via git), then:"
echo "   docker compose up -d --build                                   # full"
echo "   docker compose -f docker-compose.yml -f ops/server/docker-compose.lite.yml up -d --build   # 4 GB PC"
[[ -n "$TARGET_USER" ]] && echo "   (log out and back in so '$TARGET_USER' can use docker without sudo)"
