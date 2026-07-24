from fastapi import FastAPI

from faios_ai_orchestrator.features.planning.router import router as planning_router

app = FastAPI(
    title="FAIOS AI Orchestrator",
    version="0.0.0",
    docs_url=None,
    redoc_url=None,
)

app.include_router(planning_router)

# Business, authentication, model-provider, MCP execution, and workflow routes are intentionally deferred.
