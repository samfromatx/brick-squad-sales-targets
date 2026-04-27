from fastapi import APIRouter, Depends

from app.core.auth import get_current_user_id
from app.core.logging import get_request_id
from app.models.api import MarketDataBatchRequest, MarketDataBatchResponse
from app.services.market_data import get_batch_market_data

router = APIRouter(prefix="/market-data", tags=["market-data"])


@router.post("/batch", response_model=MarketDataBatchResponse)
async def batch_market_data(
    body: MarketDataBatchRequest,
    _user_id: str = Depends(get_current_user_id),
) -> MarketDataBatchResponse:
    result = await get_batch_market_data(body)
    return result
