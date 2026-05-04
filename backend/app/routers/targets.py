from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.core.auth import get_current_user_id
from app.core.cache import cache_get, cache_set, make_etag
from app.core.logging import get_request_id
from app.services.targets import get_target, get_targets

router = APIRouter(prefix="/targets", tags=["targets"])

_TTL = 864000  # 10 days — data only changes on import


@router.get("")
async def list_targets(
    request: Request,
    response: Response,
    sport: str | None = Query(None),
    category: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    cache_key = f"bsst:targets:{user_id}:{sport or ''}:{category or ''}"

    data = cache_get(cache_key)
    if data is None:
        targets = get_targets(user_id, sport=sport, category=category)
        data = [t.model_dump(mode="json") for t in targets]
        cache_set(cache_key, data, ttl=_TTL)

    etag = make_etag(data)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "X-Request-ID": get_request_id()})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, must-revalidate"
    response.headers["X-Request-ID"] = get_request_id()
    return {"data": data}


@router.get("/{target_id}")
async def get_target_by_id(
    target_id: str,
    request: Request,
    response: Response,
    user_id: str = Depends(get_current_user_id),
):
    target = get_target(user_id, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    data = target.model_dump(mode="json")
    etag = make_etag(data)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "X-Request-ID": get_request_id()})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, must-revalidate"
    response.headers["X-Request-ID"] = get_request_id()
    return data
