#!/usr/bin/env bash
# Installs the captive-portal re-login as a systemd timer. Needs /etc/ugt/portal.env first.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
cd "$(dirname "$0")"
install -d -m 700 /etc/ugt
if [[ ! -f /etc/ugt/portal.env ]]; then
  install -m 600 portal.env.example /etc/ugt/portal.env
  echo "Created /etc/ugt/portal.env from the example: edit it with the real portal URL and fields, then run this again."
  exit 0
fi
install -m 755 ugt-portal-relogin.sh /usr/local/bin/ugt-portal-relogin.sh
install -m 644 ugt-portal-relogin.service ugt-portal-relogin.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ugt-portal-relogin.timer
systemctl start ugt-portal-relogin.service || true
journalctl -t ugt-portal -n 5 --no-pager || true
