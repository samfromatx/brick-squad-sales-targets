from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.core.cache import make_etag
from app.core.config import settings
from app.core.logging import get_request_id
from app.services.targets import get_target, get_targets

router = APIRouter(prefix="/targets", tags=["targets"])


@router.get("")
async def list_targets(
    request: Request,
    response: Response,
    sport: str | None = Query(None),
    category: str | None = Query(None),
):
    targets = get_targets(settings.owner_user_id, sport=sport, category=category)
    data = [t.model_dump(mode="json") for t in targets]
    etag = make_etag(data)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "X-Request-ID": get_request_id()})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, must-revalidate"
    response.headers["X-Request-ID"] = get_request_id()
    return {"data": data}


@router.get("/{target_id}")
async def get_target_by_id(
    target_id: str,
    request: Request,
    response: Response,
):
    target = get_target(settings.owner_user_id, target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    data = target.model_dump(mode="json")
    etag = make_etag(data)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "X-Request-ID": get_request_id()})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, must-revalidate"
    response.headers["X-Request-ID"] = get_request_id()
    return data
