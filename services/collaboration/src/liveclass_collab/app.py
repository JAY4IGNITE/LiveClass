"""Single-process ASGI app: HTTP API routers + WebSocket gateway (decision D1).

Run locally with:  ``uv run uvicorn liveclass_collab.app:app --port 8000``
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from liveclass_api.core.logging import configure_logging
from liveclass_api.http import auth, classes, sessions
from liveclass_collab.gateway import router as ws_router


def create_app() -> FastAPI:
    configure_logging(json_output=False)
    app = FastAPI(title="LiveClass", version="0.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allows all origins
        allow_credentials=False,
        allow_methods=["*"],  # Allows all methods (including OPTIONS)
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(classes.router)
    app.include_router(sessions.router)
    app.include_router(ws_router)

    @app.get("/healthz", tags=["ops"])
    @app.head("/healthz", tags=["ops"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
