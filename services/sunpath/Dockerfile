FROM python:3.11-slim

WORKDIR /app

# curl for healthcheck; build tools for shapely/pyproj wheels are bundled, so none needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && opentelemetry-bootstrap -a install

COPY app/ ./app/

# Headless matplotlib — no display in the container.
ENV MPLBACKEND=Agg

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["opentelemetry-instrument", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
