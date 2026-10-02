"""FastAPI application factory for the HTTP API.

In the walking skeleton the collaboration gateway mounts these routers into a
single process (decision D1); this factory keeps the HTTP surface testable on
its own.
"""

from fastapi import FastAPI

from liveclass_api.core.logging import configure_logging
from liveclass_api.http import auth, classes, sessions


def create_app() -> FastAPI:
    configure_logging(json_output=False)
    app = FastAPI(title="LiveClass API", version="0.0.0")
    app.include_router(auth.router)
    app.include_router(classes.router)
    app.include_router(sessions.router)

    @app.get("/healthz", tags=["ops"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
