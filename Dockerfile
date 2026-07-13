FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal on purpose - this image only needs to run uvicorn.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static

ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Shell form so $PORT expands - most hosting platforms inject their own PORT.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
