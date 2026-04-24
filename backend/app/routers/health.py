from fastapi import APIRouter, HTTPException

from app.db.connection import check_connection

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz():
    return {"status": "ok"}


@router.get("/readyz")
async def readyz():
    if not check_connection():
        raise HTTPException(status_code=503, detail="DB unavailable")
    return {"status": "ok"}
