# ── Worker NLP Dockerfile ─────────────────────────────────────
# Python 3.11 slim — News ingestion + FinBERT/CryptoBERT sentiment
# Models downloaded at runtime into persistent hf-models volume.
# ──────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/root/.cache/huggingface

WORKDIR /app

# System deps for lxml + torch + Playwright (article body fallback)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    libxml2 \
    libxslt1.1 \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./

# Install with CPU-only torch via extra index
RUN pip install --upgrade pip && \
    pip install ".[all]" \
    --extra-index-url https://download.pytorch.org/whl/cpu

COPY src/ ./src/

RUN playwright install chromium

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8002/health')" || exit 1

CMD ["python", "-m", "src.main"]
