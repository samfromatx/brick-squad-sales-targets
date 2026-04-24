from fastapi import APIRouter, Request, Response

from app.core.cache import make_etag
from app.core.config import settings
from app.core.logging import get_request_id
from app.services.exports import build_snapshot

router = APIRouter(prefix="/bootstrap", tags=["bootstrap"])


@router.get("")
async def bootstrap(request: Request, response: Response):
    snap = build_snapshot(settings.owner_user_id)
    data = snap.model_dump(mode="json")
    etag = make_etag(data)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "X-Request-ID": get_request_id()})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, must-revalidate"
    response.headers["X-Request-ID"] = get_request_id()
    return data
