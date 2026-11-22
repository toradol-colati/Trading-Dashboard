# UGT server: setup

Ready-to-run scripts for when the hardware is available (spare PC → mini PC → VPS).
Nothing here deletes data, and nothing opens a port to the LAN or the internet.

## Security model

- Every port in `docker-compose.yml` is bound to `127.0.0.1`.
- The only way in is **Tailscale** (private WireGuard network between your devices).
  The UI is published on the tailnet with `tailscale serve` (HTTPS, tailnet only, **not** `funnel`).
- `ufw` denies all incoming traffic except on the `tailscale0` interface.
- SSH goes through Tailscale SSH; port 22 is not reachable from the network.
- `.env` and `secrets/kek.bin` are copied by hand (for example `scp` over Tailscale), never via git.

## Steps

1. Install Ubuntu Server 24.04 LTS (minimal), with a user that has sudo.
2. Copy this repository to the machine and run:
   ```bash
   sudo ./ugt-terminal/ops/server/bootstrap.sh
   ```
   It prints a Tailscale link: open it and approve the machine. Run it again whenever you like: it is idempotent.
   Options: `--no-lid` (desktop or VPS), `--skip-serve`, `--user <name>`.
3. Copy `.env` and `secrets/kek.bin` into `ugt-terminal/`.
4. Start the stack from `ugt-terminal/`:
   ```bash
   docker compose up -d --build                                                  # mini PC / VPS
   docker compose -f docker-compose.yml -f ops/server/docker-compose.lite.yml up -d --build   # 4 GB PC
   ```
5. Open `https://<machine-name>.<tailnet>.ts.net` from the phone or laptop (with Tailscale on).

## Wi-Fi with a login page (captive portal)

Some networks ask you to log in again every few hours. The `captive-portal/` template does it automatically:

```bash
sudo ./ugt-terminal/ops/server/captive-portal/install.sh   # first run creates /etc/ugt/portal.env
sudo nano /etc/ugt/portal.env                               # portal URL and form fields
sudo ./ugt-terminal/ops/server/captive-portal/install.sh   # installs the 2-minute timer
journalctl -t ugt-portal -f                                 # see what it does
```

The portal URL and fields come from logging in once from a browser with DevTools → Network open.
The credentials stay in `/etc/ugt/portal.env` (root only, chmod 600).

## Checks

```bash
docker compose ps                         # every service Up / healthy
curl -s localhost:3001/api/forecast/status | head -c 400
sudo ufw status verbose                   # only tailscale0 allowed
tailscale serve status                    # UI on the tailnet
```
