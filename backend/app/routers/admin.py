from fastapi import APIRouter, Header, HTTPException

from app.core.cache import cache_delete_pattern
from app.core.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_service_key(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    if not settings.supabase_service_role_key or token != settings.supabase_service_role_key:
        raise HTTPException(status_code=403, detail="Invalid service key")


@router.post("/cache-bust")
def cache_bust(authorization: str = Header(...)):
    _require_service_key(authorization)
    cache_delete_pattern("bsst:mktdata:*")
    cache_delete_pattern("bsst:card-targets:*")
    cache_delete_pattern("bsst:trends:*")
    return {"cleared": ["bsst:mktdata:*", "bsst:card-targets:*", "bsst:trends:*"]}
