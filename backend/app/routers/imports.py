from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.auth import get_current_user_id
from app.core.cache import cache_delete, cache_delete_pattern
from app.core.logging import get_request_id
from app.services.imports import process_import

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/targets", status_code=200)
async def import_targets(
    body: dict,
    response: Response,
    user_id: str = Depends(get_current_user_id),
):
    if not isinstance(body, dict):
        raise HTTPException(status_code=422, detail="Payload must be a JSON object")

    known_keys = {
        "last_updated",
        "football_graded", "basketball_graded",
        "football_raw_to_grade", "basketball_raw_to_grade",
        "bounce_back", "portfolios", "ebay_searches",
    }
    data_keys = known_keys - {"last_updated"}
    if not any(k in body for k in data_keys):
        raise HTTPException(status_code=422, detail="Payload contains no recognised import sections")

    result = process_import(user_id, body)

    # Invalidate cached responses so next page load reflects imported data
    cache_delete(f"bsst:bootstrap:{user_id}")
    cache_delete_pattern(f"bsst:targets:{user_id}:*")

    response.headers["X-Request-ID"] = get_request_id()
    return result
