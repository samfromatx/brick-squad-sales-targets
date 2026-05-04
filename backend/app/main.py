import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import RequestIDMiddleware, configure_logging, get_request_id
from app.routers import (
    admin,
    bootstrap,
    card_targets,
    ebay,
    exports,
    health,
    imports,
    market_data,
    portfolio_entries,
    portfolios,
    targets,
    trends,
)

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.queries.card_index import load_index
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, load_index)  # fire-and-forget; doesn't block startup
    yield


app = FastAPI(title="Brick Squad Sales Targets API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)

API_PREFIX = "/api/v1"

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": "http_error", "message": exc.detail, "request_id": get_request_id()}},
        )
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "Internal server error", "request_id": get_request_id()}},
    )


app.include_router(health.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(bootstrap.router, prefix=API_PREFIX)
app.include_router(targets.router, prefix=API_PREFIX)
app.include_router(portfolios.router, prefix=API_PREFIX)
app.include_router(portfolio_entries.router, prefix=API_PREFIX)
app.include_router(trends.router, prefix=API_PREFIX)
app.include_router(ebay.router, prefix=API_PREFIX)
app.include_router(imports.router, prefix=API_PREFIX)
app.include_router(exports.router, prefix=API_PREFIX)
app.include_router(market_data.router, prefix=API_PREFIX)
app.include_router(card_targets.router, prefix=API_PREFIX)
