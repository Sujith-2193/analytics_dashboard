FROM python:3.12-slim

WORKDIR /app

# PostgreSQL client headers are needed by psycopg2-binary-compatible builds.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./

# Railway/Render-style platforms inject PORT at runtime. 8000 is the local default.
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
