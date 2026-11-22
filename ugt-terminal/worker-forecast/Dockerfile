# ── Worker Forecast Dockerfile ────────────────────────────────
# R forecast engine (fable / feasts / tsibble, i.e. fpp3).
# Reads history from the database, writes forecast_results and
# forecast_log. No ports, no network listeners.
# ──────────────────────────────────────────────────────────────
FROM mambaorg/micromamba:1.5.10

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/environment.yml
RUN micromamba install -y -n base -f /tmp/environment.yml && \
    micromamba clean --all --yes

WORKDIR /app
COPY --chown=$MAMBA_USER:$MAMBA_USER R/ ./R/

# Healthy while the engine loop keeps touching its heartbeat file
HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
  CMD find /tmp/heartbeat -mmin -10 | grep -q heartbeat || exit 1

CMD ["Rscript", "R/main.R"]
