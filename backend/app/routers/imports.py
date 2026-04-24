from fastapi import APIRouter, HTTPException, Response

from app.core.config import settings
from app.core.logging import get_request_id
from app.services.imports import process_import

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/targets", status_code=200)
async def import_targets(body: dict, response: Response):
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

    result = process_import(settings.owner_user_id, body)
    response.headers["X-Request-ID"] = get_request_id()
    return result
