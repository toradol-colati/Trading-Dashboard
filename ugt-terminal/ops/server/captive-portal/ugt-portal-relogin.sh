#!/usr/bin/env bash
# Auto re-login for a Wi-Fi captive portal (hotel, campus, residence networks).
# Template: the portal URL and form fields depend on the network, so they live in
# /etc/ugt/portal.env (root-only, chmod 600), never in git.
#
# Logic: probe a "no content" URL. HTTP 204 → online, do nothing.
# Anything else (redirect to the portal, 200 login page, timeout) → POST the login form once.
# Every outcome is written to the journal: `journalctl -t ugt-portal`.
set -uo pipefail

CONF="${UGT_PORTAL_CONF:-/etc/ugt/portal.env}"
log() { logger -t ugt-portal -- "$*"; echo "$*"; }

[[ -r "$CONF" ]] || { log "config $CONF missing: copy portal.env.example and fill it in"; exit 1; }
# shellcheck disable=SC1090
. "$CONF"
: "${PORTAL_URL:?PORTAL_URL not set in $CONF}"
PROBE_URL="${PROBE_URL:-http://connectivitycheck.gstatic.com/generate_204}"
PORTAL_METHOD="${PORTAL_METHOD:-POST}"
PORTAL_FORM="${PORTAL_FORM:-}"          # e.g. "username=foo&password=bar&accept=1"

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROBE_URL" || echo 000)
if [[ "$code" == "204" ]]; then
  exit 0
fi
log "offline or captive (probe returned $code): logging in to $PORTAL_URL"

if [[ "$PORTAL_METHOD" == "GET" ]]; then
  resp=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L "$PORTAL_URL" || echo 000)
else
  resp=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L -X POST --data "$PORTAL_FORM" "$PORTAL_URL" || echo 000)
fi

sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROBE_URL" || echo 000)
if [[ "$code" == "204" ]]; then
  log "login ok (portal answered $resp)"
  exit 0
fi
log "login FAILED: portal answered $resp, probe still $code. Check the form fields in $CONF"
exit 1
