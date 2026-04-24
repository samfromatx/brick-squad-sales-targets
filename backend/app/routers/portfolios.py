from fastapi import APIRouter, Depends, Request, Response

from app.core.auth import get_current_user_id
from app.core.cache import make_etag
from app.core.logging import get_request_id
from app.services.portfolio import get_portfolio_allocations

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.get("")
async def list_portfolios(
    request: Request,
    response: Response,
    user_id: str = Depends(get_current_user_id),
):
    allocations = get_portfolio_allocations(user_id)
    data = [a.model_dump(mode="json") for a in allocations]
    etag = make_etag(data)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "X-Request-ID": get_request_id()})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, must-revalidate"
    response.headers["X-Request-ID"] = get_request_id()
    return {"data": data}
