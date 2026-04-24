# ── Worker Broker Dockerfile ──────────────────────────────────
# Python 3.11 slim — Market data WS + Portfolio sync + PAC engine
# ──────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --upgrade pip && \
    pip install ".[all]"

COPY src/ ./src/

EXPOSE 8003

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8003/health')" || exit 1

CMD ["python", "-m", "src.main"]
