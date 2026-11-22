# ── Worker Recorder Dockerfile ────────────────────────────────
# M0 data foundations: price stream → database, hourly sentiment,
# daily history (Binance, FRED, Stooq, Fear & Greed).
# Small image, no browsers, no ML models.
# ──────────────────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install .

COPY src/ ./src/

# Run as an unprivileged user
RUN useradd --create-home --uid 10001 recorder
USER recorder

EXPOSE 8004

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8004/health')" || exit 1

CMD ["python", "-m", "src.main"]
