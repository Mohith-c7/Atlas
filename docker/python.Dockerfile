# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/ai-orchestrator/pyproject.toml ./pyproject.toml
COPY services/ai-orchestrator/src ./src

RUN pip install --no-cache-dir .

CMD ["uvicorn", "faios_ai_orchestrator.main:app", "--host", "0.0.0.0", "--port", "8000"]
