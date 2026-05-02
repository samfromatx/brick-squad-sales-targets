"""Card Targets scoring and calculation service."""

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from app.db.connection import db_cursor
from app.db.queries import card_targets as ct_db
from app.models.api import TrendAnalysisResponse
from app.services.trends import run_trend_analysis

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPORTED_SPORTS = ["football", "basketball"]

TARGET_MIN_PRICE = 10.0
TARGET_MAX_PRICE = 200.0

SCORE_THRESHOLD_STRONG_BUY = 80
SCORE_THRESHOLD_BUY        = 70
SCORE_THRESHOLD_WATCH      = 60

MARKET_SCORE_MAX  = 30
VALUE_SCORE_MAX   = 35
TIMING_SCORE_MAX  = 15
PLAYER_SCORE_MAX  = 20
RISK_PENALTY_MAX  = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_player_key(value: str | None) -> str:
    if not value:
        return ""
    s = value.lower()
    s = re.sub(r'\.', '', s)
    s = re.sub(r"'", '', s)
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def has_warning(analysis: TrendAnalysisResponse, code: str) -> bool:
    return any(w.code == code for w in (analysis.warnings or []))


def is_within_target_price_range(target_buy_price: float | None) -> bool:
    if target_buy_price is None:
        return False
    return TARGET_MIN_PRICE <= target_buy_price <= TARGET_MAX_PRICE


# ---------------------------------------------------------------------------
# Grade selection
# ---------------------------------------------------------------------------

def recommended_grade_from_verdict(verdict: str) -> str | None:
    mapping = {
        "Buy raw & grade": "Raw",
        "Buy PSA 9": "PSA 9",
        "Buy PSA 10": "PSA 10",
    }
    return mapping.get(verdict)


def choose_watchlist_grade(candidate: dict) -> str | None:
    """Fallback grade selection for Watchlist candidates."""
    if candidate.get("psa9_avg_30d") and TARGET_MIN_PRICE <= candidate["psa9_avg_30d"] <= TARGET_MAX_PRICE:
        return "PSA 9"
    if candidate.get("raw_avg_30d") and TARGET_MIN_PRICE <= candidate["raw_avg_30d"] <= TARGET_MAX_PRICE:
        return "Raw"
    if candidate.get("psa10_avg_30d") and TARGET_MIN_PRICE <= candidate["psa10_avg_30d"] <= TARGET_MAX_PRICE:
        return "PSA 10"
    return None


# ---------------------------------------------------------------------------
# Price series helpers
# ---------------------------------------------------------------------------

def get_price_series_for_grade(candidate: dict, grade: str) -> dict:
    prefix = {
        "Raw": "raw",
        "PSA 9": "psa9",
        "PSA 10": "psa10",
    }.get(grade, "raw")

    return {
        "avg_7d":    candidate.get(f"{prefix}_avg_7d"),
        "avg_14d":   candidate.get(f"{prefix}_avg_14d"),
        "avg_30d":   candidate.get(f"{prefix}_avg_30d"),
        "avg_90d":   candidate.get(f"{prefix}_avg_90d"),
        "avg_180d":  candidate.get(f"{prefix}_avg_180d"),
        "sales_7d":  candidate.get(f"{prefix}_sales_7d") or 0,
        "sales_14d": candidate.get(f"{prefix}_sales_14d") or 0,
        "sales_30d": candidate.get(f"{prefix}_sales_30d") or 0,
        "last_sale": candidate.get(f"{prefix}_last_sale"),
    }


def select_current_price(price_series: dict, candidate: dict, grade: str) -> float | None:
    if (price_series.get("sales_7d") or 0) >= 2 and price_series.get("avg_7d"):
        return price_series["avg_7d"]
    if (price_series.get("sales_14d") or 0) >= 2 and price_series.get("avg_14d"):
        return price_series["avg_14d"]
    if (price_series.get("sales_30d") or 0) >= 2 and price_series.get("avg_30d"):
        return price_series["avg_30d"]
    if price_series.get("last_sale"):
        return price_series["last_sale"]
    return None


def get_recommended_grade_anchor(analysis: TrendAnalysisResponse, price_series: dict) -> float | None:
    """Return 90d or 180d anchor price for the recommended grade."""
    if price_series.get("avg_90d"):
        return price_series["avg_90d"]
    if price_series.get("avg_180d"):
        return price_series["avg_180d"]
    return None


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

@dataclass
class CardTargetScores:
    market_score: float
    value_score: float
    timing_score: float
    player_score: float
    risk_penalty: float
    target_score: float


def calculate_market_score(analysis: TrendAnalysisResponse) -> float:
    score = 0.0

    if analysis.market_confidence == "High":
        score += 8
    elif analysis.market_confidence == "Medium":
        score += 4

    liquidity = analysis.market_health.liquidity.label if analysis.market_health else None
    if liquidity == "Liquid":     score += 6
    elif liquidity == "Moderate": score += 4
    elif liquidity == "Thin":     score += 1

    trend = analysis.market_health.trend.direction if analysis.market_health else None
    if trend == "Strong uptrend":   score += 5
    elif trend == "Mild uptrend":   score += 4
    elif trend == "Stable":         score += 3
    elif trend == "Mild downtrend": score += 1

    volume = analysis.market_health.volume.signal if analysis.market_health else None
    if volume == "Accelerating": score += 4
    elif volume == "Stable":     score += 2

    volatility = analysis.market_health.volatility.label if analysis.market_health else None
    if volatility in ("Low", "Moderate"): score += 4
    elif volatility == "High":            score += 1

    if not has_warning(analysis, "STALE_DATA"):
        score += 3

    return min(score, MARKET_SCORE_MAX)


def calculate_value_score(
    analysis: TrendAnalysisResponse,
    current_price: float | None,
    target_buy_price: float | None,
    price_series: dict,
) -> float:
    score = 0.0

    if current_price is not None and target_buy_price is not None:
        if current_price <= target_buy_price:
            score += 10
        elif current_price <= target_buy_price * 1.05:
            score += 5

    anchor = get_recommended_grade_anchor(analysis, price_series)
    if anchor is not None and target_buy_price is not None:
        discount = 1 - target_buy_price / anchor
        if discount >= 0.10:   score += 6
        elif discount >= 0.05: score += 3

    if analysis.verdict == "Buy raw & grade":
        expected_profit = analysis.ev_model.expected_profit if analysis.ev_model else None
        if expected_profit is not None and expected_profit >= 20:
            score += 7

    # TODO: expose raw_viability from trend analysis
    # raw_label = analysis.raw_viability.label if analysis.raw_viability else None
    # if raw_label == "Viable grade candidate": score += 5
    # elif raw_label == "Marginal - near-perfect only": score += 2

    # TODO: expose multiplier_context from trend analysis
    # multiplier_label = analysis.multiplier_context.label if analysis.multiplier_context else ""
    # if "Buy PSA 9" in multiplier_label: score += 4
    # if "PSA 10 scarcity real" in multiplier_label: score += 4

    if analysis.bounce_back and analysis.bounce_back.qualifies:
        score += 3

    return min(score, VALUE_SCORE_MAX)


def calculate_timing_score(
    analysis: TrendAnalysisResponse,
    price_series: dict,
) -> float:
    score = 0.0

    avg_7d   = price_series.get("avg_7d")
    avg_14d  = price_series.get("avg_14d")
    avg_30d  = price_series.get("avg_30d")
    avg_180d = price_series.get("avg_180d")

    if avg_7d is not None and avg_14d is not None and avg_30d is not None:
        if avg_7d > avg_30d and avg_14d > avg_30d:
            score += 4

        stabilizing = avg_14d >= avg_30d * 0.97 and avg_30d < avg_180d if avg_180d else False
        if stabilizing:
            score += 4

        if avg_180d is not None and avg_30d < avg_180d * 0.90 and stabilizing:
            score += 4

    volume = analysis.market_health.volume.signal if analysis.market_health else None
    trend  = analysis.market_health.trend.direction if analysis.market_health else None
    if volume == "Accelerating" and trend in ("Strong uptrend", "Mild uptrend", "Stable"):
        score += 2

    if not has_warning(analysis, "SHORT_TERM_DIVERGENCE"):
        score += 1

    return min(score, TIMING_SCORE_MAX)


def calculate_player_score(player: dict | None) -> float:
    if not player:
        return 0.0

    hobby    = clamp(player.get("hobby_tier", 0), 0, 10) * 0.8
    upside   = clamp(player.get("upside_score", 0), 0, 5) * 1.2
    current  = clamp(player.get("current_relevance_score", 0), 0, 5) * 1.0
    catalyst = clamp(player.get("manual_catalyst_score", 0), 0, 5) * 1.0
    risk     = clamp(player.get("risk_score", 0), 0, 5) * 1.2

    score = hobby + upside + current + catalyst - risk

    if player.get("sport") == "football":
        position = (player.get("position") or "").upper()
        if position == "QB":
            score += 3
        elif position in ("WR", "RB"):
            score += 1.5
        elif position == "TE":
            score += 0.5

    return clamp(score, 0, PLAYER_SCORE_MAX)


def calculate_risk_penalty(
    analysis: TrendAnalysisResponse,
    player: dict | None,
) -> float:
    penalty = 0.0

    if analysis.market_confidence == "Low":      penalty += 30
    if has_warning(analysis, "STALE_DATA"):      penalty += 20
    if has_warning(analysis, "LOW_CONFIDENCE"):  penalty += 20
    if has_warning(analysis, "STRONG_DOWNTREND"):penalty += 15
    if has_warning(analysis, "FRAGILE_PREMIUM"): penalty += 8
    if has_warning(analysis, "GEM_FALLBACK"):    penalty += 4

    liquidity = analysis.market_health.liquidity.label if analysis.market_health else None
    if liquidity == "Very thin": penalty += 20
    elif liquidity == "Thin":    penalty += 5

    volatility = analysis.market_health.volatility.label if analysis.market_health else None
    if volatility == "Extreme": penalty += 12
    elif volatility == "High":  penalty += 6

    if player:
        penalty += clamp(player.get("risk_score", 0), 0, 5) * 3

    return min(penalty, RISK_PENALTY_MAX)


def calculate_card_target_score(
    analysis: TrendAnalysisResponse,
    player: dict | None,
    current_price: float | None,
    target_buy_price: float | None,
    price_series: dict,
) -> CardTargetScores:
    market_score = calculate_market_score(analysis)
    value_score  = calculate_value_score(analysis, current_price, target_buy_price, price_series)
    timing_score = calculate_timing_score(analysis, price_series)
    player_score = calculate_player_score(player)
    risk_penalty = calculate_risk_penalty(analysis, player)

    target_score = clamp(
        market_score + value_score + timing_score + player_score - risk_penalty,
        0,
        100,
    )

    return CardTargetScores(
        market_score=market_score,
        value_score=value_score,
        timing_score=timing_score,
        player_score=player_score,
        risk_penalty=risk_penalty,
        target_score=target_score,
    )


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def classify_recommendation_strength(
    analysis: TrendAnalysisResponse,
    scores: CardTargetScores,
    current_price: float | None,
    target_buy_price: float | None,
) -> str:
    price_is_buyable = (
        current_price is not None
        and target_buy_price is not None
        and current_price <= target_buy_price
    )
    target_in_range  = is_within_target_price_range(target_buy_price)
    low_confidence   = analysis.market_confidence == "Low"
    stale            = has_warning(analysis, "STALE_DATA")
    very_thin        = (
        analysis.market_health.liquidity.label == "Very thin"
        if analysis.market_health else False
    )
    strong_downtrend = has_warning(analysis, "STRONG_DOWNTREND")
    bounce_qualifies = bool(analysis.bounce_back and analysis.bounce_back.qualifies)

    blocked_from_buy = (
        low_confidence
        or stale
        or very_thin
        or (strong_downtrend and not bounce_qualifies)
        or not price_is_buyable
        or not target_in_range
    )

    if not blocked_from_buy:
        if scores.target_score >= SCORE_THRESHOLD_STRONG_BUY:
            return "Strong Buy Target"
        if scores.target_score >= SCORE_THRESHOLD_BUY:
            return "Buy Target"
        if scores.target_score >= 65:
            return "Value Target"

    if scores.target_score >= SCORE_THRESHOLD_WATCH:
        return "Watchlist Target"

    return "Avoid / Overheated"


def classify_strategy_type(
    analysis: TrendAnalysisResponse,
    recommendation_strength: str,
) -> str | None:
    if recommendation_strength in ("Avoid / Overheated",):
        return None

    if analysis.bounce_back and analysis.bounce_back.qualifies:
        return "Bounce-back Target"

    if analysis.verdict == "Buy raw & grade":
        return "Grade Target"

    if analysis.verdict in ("Buy PSA 9", "Buy PSA 10"):
        return "Slab Target"

    trend  = analysis.market_health.trend.direction if analysis.market_health else None
    volume = analysis.market_health.volume.signal if analysis.market_health else None
    if trend in ("Strong uptrend", "Mild uptrend") and volume == "Accelerating":
        return "Momentum Target"

    return None


# ---------------------------------------------------------------------------
# Text generation
# ---------------------------------------------------------------------------

def build_recommendation_text(
    strength: str,
    strategy_type: str | None,
    recommended_grade: str,
    target_buy_price: float | None,
) -> str:
    if target_buy_price is not None:
        price_str = f"${target_buy_price:.0f}"
        if strength in ("Strong Buy Target", "Buy Target", "Value Target"):
            return f"Buy {recommended_grade} under {price_str}"
        if strength == "Watchlist Target":
            return f"Watch — target is {price_str}"
    if strength == "Avoid / Overheated":
        return "Avoid — price is above target or data is insufficient"
    return f"{strength}"


def build_justification(
    analysis: TrendAnalysisResponse,
    player: dict | None,
    recommended_grade: str | None,
    current_price: float | None,
    target_buy_price: float | None,
    scores: CardTargetScores,
) -> list[str]:
    bullets: list[str] = []

    if recommended_grade:
        bullets.append(
            f"{recommended_grade} is the best risk-adjusted format based on the current market data."
        )

    if current_price is not None and target_buy_price is not None:
        if current_price <= target_buy_price:
            bullets.append("Current price is at or below the calculated buy target.")
        else:
            bullets.append("Current price is above the calculated buy target; do not chase.")

    liquidity = analysis.market_health.liquidity.label if analysis.market_health else None
    if liquidity in ("Liquid", "Moderate"):
        bullets.append(
            f"Liquidity is {liquidity.lower()}, so the signal is more reliable than thin-market cards."
        )

    trend = analysis.market_health.trend.direction if analysis.market_health else None
    if trend:
        bullets.append(f"Market trend is {trend.lower()}.")

    if analysis.verdict == "Buy raw & grade":
        bullets.append("Raw grading EV clears the profit floor.")

    if analysis.bounce_back and analysis.bounce_back.qualifies:
        bullets.append("Bounce-back setup qualifies based on pullback, liquidity, and stabilization.")

    if player and player.get("manual_catalyst"):
        bullets.append(player["manual_catalyst"])

    return bullets[:5]


def build_card_target_warnings(
    analysis: TrendAnalysisResponse,
    player: dict | None,
    current_price: float | None,
    target_buy_price: float | None,
    scores: CardTargetScores,
) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    seen_codes: set[str] = set()

    def add(code: str, message: str) -> None:
        if code not in seen_codes:
            warnings.append({"code": code, "message": message})
            seen_codes.add(code)

    for w in (analysis.warnings or []):
        add(w.code, w.message or w.code)

    if (
        current_price is not None
        and target_buy_price is not None
        and current_price > target_buy_price
    ):
        add("PRICE_ABOVE_TARGET", "Current price is above the buy target. Do not chase.")

    if target_buy_price is None or not (TARGET_MIN_PRICE <= target_buy_price <= TARGET_MAX_PRICE):
        add("TARGET_OUTSIDE_RANGE", "Target buy price is outside the $10–$200 range.")

    if player and player.get("needs_review"):
        add("PLAYER_NEEDS_REVIEW", "Player metadata has not been reviewed yet.")

    if scores.player_score < 5:
        add("LOW_PLAYER_SCORE", "Player score is low or player metadata is incomplete.")

    return warnings


def trim_full_analysis(analysis: TrendAnalysisResponse) -> dict:
    result: dict = {
        "verdict": analysis.verdict,
        "market_confidence": analysis.market_confidence,
    }
    if analysis.market_health:
        result["market_health"] = {
            "trend": {"direction": analysis.market_health.trend.direction},
            "volume": {"signal": analysis.market_health.volume.signal},
            "liquidity": {
                "label": analysis.market_health.liquidity.label,
                "total_90d_sales": analysis.market_health.liquidity.total_90d_sales,
            },
            "volatility": {"label": analysis.market_health.volatility.label},
        }
    if analysis.ev_model:
        result["ev_model"] = {
            "expected_profit": analysis.ev_model.expected_profit,
            "profit_floor": analysis.ev_model.profit_floor,
        }
    if analysis.bounce_back:
        result["bounce_back"] = {
            "qualifies": analysis.bounce_back.qualifies,
            "score": analysis.bounce_back.score,
        }
    return result


# ---------------------------------------------------------------------------
# Player metadata sync
# ---------------------------------------------------------------------------

def sync_player_metadata_for_sports(sports: list[str]) -> None:
    sql = """
    select distinct
      nullif(trim(player_name), '') as player_name,
      sport
    from public.card_market_data
    where nullif(trim(player_name), '') is not null
      and sport = any(%s)
    """
    with db_cursor() as cur:
        cur.execute(sql, (sports,))
        rows = cur.fetchall()

    to_upsert = []
    for row in rows:
        player_name = row.get("player_name") if isinstance(row, dict) else row[0]
        sport_val   = row.get("sport") if isinstance(row, dict) else row[1]
        if not player_name:
            continue
        to_upsert.append({
            "player_name": player_name,
            "player_key": normalize_player_key(player_name),
            "sport": sport_val,
        })

    ct_db.upsert_player_metadata(to_upsert)


# ---------------------------------------------------------------------------
# Main calculation
# ---------------------------------------------------------------------------

def calculate_card_targets_for_sport(sport: str) -> list[dict]:
    candidates = ct_db.load_card_candidates(sport)
    players    = ct_db.load_player_metadata_map(sport)
    results    = []

    for candidate in candidates:
        analysis: Optional[TrendAnalysisResponse] = run_trend_analysis(
            card=candidate["card"], sport=sport
        )
        if analysis is None:
            continue

        recommended_grade = recommended_grade_from_verdict(analysis.verdict)
        if not recommended_grade:
            recommended_grade = choose_watchlist_grade(candidate)
        if not recommended_grade:
            continue

        target_buy_price = analysis.buy_target.price if analysis.buy_target else None
        price_series     = get_price_series_for_grade(candidate, recommended_grade)
        current_price    = select_current_price(price_series, candidate, recommended_grade)

        player_key = normalize_player_key(candidate.get("player_name"))
        player     = players.get(player_key)

        scores = calculate_card_target_score(
            analysis=analysis,
            player=player,
            current_price=current_price,
            target_buy_price=target_buy_price,
            price_series=price_series,
        )

        strength      = classify_recommendation_strength(analysis, scores, current_price, target_buy_price)
        strategy_type = classify_strategy_type(analysis, strength)
        justification = build_justification(analysis, player, recommended_grade, current_price, target_buy_price, scores)
        warnings      = build_card_target_warnings(analysis, player, current_price, target_buy_price, scores)

        results.append({
            "sport":        sport,
            "card":         candidate["card"],
            "player_name":  candidate.get("player_name") or "",
            "player_key":   player_key,
            "recommended_grade":       recommended_grade,
            "recommendation_strength": strength,
            "strategy_type":           strategy_type,
            "recommendation": build_recommendation_text(strength, strategy_type, recommended_grade, target_buy_price),
            "target_buy_price": target_buy_price,
            "current_price":    current_price,
            "avg_7d":   price_series.get("avg_7d"),
            "avg_14d":  price_series.get("avg_14d"),
            "avg_30d":  price_series.get("avg_30d"),
            "avg_90d":  price_series.get("avg_90d"),
            "avg_180d": price_series.get("avg_180d"),
            "raw_avg_30d":   candidate.get("raw_avg_30d"),
            "psa9_avg_30d":  candidate.get("psa9_avg_30d"),
            "psa10_avg_30d": candidate.get("psa10_avg_30d"),
            "market_confidence": analysis.market_confidence,
            "liquidity_label":   analysis.market_health.liquidity.label if analysis.market_health else None,
            "total_90d_sales":   analysis.market_health.liquidity.total_90d_sales if analysis.market_health else None,
            "trend_label":       analysis.market_health.trend.direction if analysis.market_health else None,
            "volume_signal":     analysis.market_health.volume.signal if analysis.market_health else None,
            "volatility_label":  analysis.market_health.volatility.label if analysis.market_health else None,
            "scores":        scores,
            "justification": justification,
            "warnings":      warnings,
            "full_analysis": trim_full_analysis(analysis),
        })

    results.sort(key=lambda r: r["scores"].target_score, reverse=True)

    for i, result in enumerate(results, start=1):
        result["rank"] = i

    return results


def persist_card_targets(sport: str, results: list[dict]) -> int:
    ct_db.persist_card_targets_for_sport(sport, results)
    return len(results)
