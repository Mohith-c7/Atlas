from fastapi import FastAPI

app = FastAPI(
    title="FAIOS AI Orchestrator",
    version="0.0.0",
    docs_url=None,
    redoc_url=None,
)

# Business, authentication, and workflow routes are intentionally deferred.
