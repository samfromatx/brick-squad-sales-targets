"""Card Targets API routes."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user_id
from app.core.cache import cache_get, cache_set
from app.db.queries.card_targets import (
    fetch_card_targets,
    fetch_player_metadata_list,
    update_player_metadata,
)
from app.models.api import (
    CardTargetResponse,
    CardTargetScoresResponse,
    CardTargetWarningResponse,
    CardTargetsListResponse,
    PlayerMetadataListResponse,
    PlayerMetadataResponse,
    PlayerMetadataUpdateRequest,
)

router = APIRouter(tags=["card-targets"])

_TTL = 864000  # 10 days — card targets only change on recalculation


def _row_to_card_target_response(row: dict) -> CardTargetResponse:
    scores = CardTargetScoresResponse(
        market_score=float(row["market_score"]),
        value_score=float(row["value_score"]),
        timing_score=float(row["timing_score"]),
        player_score=float(row["player_score"]),
        risk_penalty=float(row["risk_penalty"]),
        target_score=float(row["target_score"]),
    )
    warnings = [
        CardTargetWarningResponse(code=w["code"], message=w["message"])
        for w in (row.get("warnings") or [])
    ]
    return CardTargetResponse(
        sport=row["sport"],
        card=row["card"],
        player_name=row["player_name"],
        player_key=row["player_key"],
        recommended_grade=row["recommended_grade"],
        recommendation_strength=row["recommendation_strength"],
        strategy_type=row.get("strategy_type"),
        recommendation=row["recommendation"],
        rank=row["rank"],
        target_buy_price=float(row["target_buy_price"]) if row.get("target_buy_price") is not None else None,
        current_price=float(row["current_price"]) if row.get("current_price") is not None else None,
        avg_7d=float(row["avg_7d"]) if row.get("avg_7d") is not None else None,
        avg_14d=float(row["avg_14d"]) if row.get("avg_14d") is not None else None,
        avg_30d=float(row["avg_30d"]) if row.get("avg_30d") is not None else None,
        avg_90d=float(row["avg_90d"]) if row.get("avg_90d") is not None else None,
        avg_180d=float(row["avg_180d"]) if row.get("avg_180d") is not None else None,
        raw_avg_30d=float(row["raw_avg_30d"]) if row.get("raw_avg_30d") is not None else None,
        psa9_avg_30d=float(row["psa9_avg_30d"]) if row.get("psa9_avg_30d") is not None else None,
        psa10_avg_30d=float(row["psa10_avg_30d"]) if row.get("psa10_avg_30d") is not None else None,
        market_confidence=row["market_confidence"],
        liquidity_label=row.get("liquidity_label"),
        total_90d_sales=row.get("total_90d_sales"),
        trend_label=row.get("trend_label"),
        volume_signal=row.get("volume_signal"),
        volatility_label=row.get("volatility_label"),
        scores=scores,
        justification=row.get("justification") or [],
        warnings=warnings,
        full_analysis=row.get("full_analysis") or {},
    )


def _row_to_player_metadata_response(row: dict) -> PlayerMetadataResponse:
    last_seen = row.get("last_seen_at")
    if hasattr(last_seen, "isoformat"):
        last_seen_str = last_seen.isoformat()
    else:
        last_seen_str = str(last_seen) if last_seen else ""

    return PlayerMetadataResponse(
        id=row["id"],
        player_name=row["player_name"],
        player_key=row["player_key"],
        sport=row["sport"],
        team=row.get("team"),
        position=row.get("position"),
        rookie_year=row.get("rookie_year"),
        active=row.get("active"),
        hobby_tier=row.get("hobby_tier", 0),
        upside_score=row.get("upside_score", 0),
        current_relevance_score=row.get("current_relevance_score", 0),
        manual_catalyst_score=row.get("manual_catalyst_score", 0),
        risk_score=row.get("risk_score", 0),
        manual_catalyst=row.get("manual_catalyst"),
        notes=row.get("notes"),
        needs_review=row.get("needs_review", True),
        last_seen_at=last_seen_str,
    )


# ---------------------------------------------------------------------------
# GET /card-targets  (authenticated)
# ---------------------------------------------------------------------------

@router.get("/card-targets", response_model=CardTargetsListResponse)
def list_card_targets(
    sport: Literal["football", "basketball"] = Query(...),
    view: str | None = Query(None, description="buy | watchlist | overheated | all"),
    min_price: float | None = Query(None),
    max_price: float | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id),
) -> CardTargetsListResponse:
    resolved_view = view if view != "all" else None
    cache_key = f"bsst:card-targets:{sport}:{resolved_view}:{min_price}:{max_price}:{q}:{limit}:{offset}"
    cached = cache_get(cache_key)
    if cached is not None:
        return CardTargetsListResponse(**cached)

    rows, total = fetch_card_targets(
        sport=sport,
        view=resolved_view,
        min_price=min_price,
        max_price=max_price,
        q=q,
        limit=limit,
        offset=offset,
    )
    result = CardTargetsListResponse(
        data=[_row_to_card_target_response(r) for r in rows],
        total=total,
    )
    cache_set(cache_key, result.model_dump(mode="json"), ttl=_TTL)
    return result


# ---------------------------------------------------------------------------
# GET /player-metadata  (admin only)
# ---------------------------------------------------------------------------

@router.get("/player-metadata", response_model=PlayerMetadataListResponse)
def list_player_metadata(
    sport: Literal["football", "basketball"] | None = Query(None),
    needs_review: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id),
) -> PlayerMetadataListResponse:
    rows, total = fetch_player_metadata_list(
        sport=sport,
        needs_review=needs_review,
        limit=limit,
        offset=offset,
    )
    return PlayerMetadataListResponse(
        data=[_row_to_player_metadata_response(r) for r in rows],
        total=total,
    )


# ---------------------------------------------------------------------------
# PATCH /player-metadata/{id}  (admin only)
# ---------------------------------------------------------------------------

@router.patch("/player-metadata/{player_id}", response_model=PlayerMetadataResponse)
def patch_player_metadata(
    player_id: int,
    body: PlayerMetadataUpdateRequest,
    user_id: str = Depends(get_current_user_id),
) -> PlayerMetadataResponse:
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    updated = update_player_metadata(player_id, fields)
    if not updated:
        raise HTTPException(status_code=404, detail="Player not found")

    return _row_to_player_metadata_response(updated)
