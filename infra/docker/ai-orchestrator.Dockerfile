FROM python:3.12-slim AS runner
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
RUN useradd --create-home --uid 10001 faios
COPY services/ai-orchestrator/pyproject.toml services/ai-orchestrator/pyproject.toml
COPY services/ai-orchestrator/src services/ai-orchestrator/src
RUN python -m pip install --no-cache-dir ./services/ai-orchestrator
USER faios
EXPOSE 8000
CMD ["uvicorn", "faios_ai_orchestrator.main:app", "--host", "0.0.0.0", "--port", "8000"]
