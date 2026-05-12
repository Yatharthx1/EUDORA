FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    EUDORA_LOCAL_DEV=0 \
    EUDORA_BASE_URL=http://127.0.0.1:7860 \
    EUDORA_ENABLE_LOCAL_QWEN=0 \
    MAX_REQUEST_BODY_BYTES=10485760

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libspatialindex-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY data/ data/
COPY qwen-orchestrator/ qwen-orchestrator/
COPY indore.graphml indore.pkl main.py deploy_app.py ./

EXPOSE 7860

CMD ["uvicorn", "deploy_app:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers"]
