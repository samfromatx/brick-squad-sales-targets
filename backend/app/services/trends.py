from datetime import date
from typing import Optional

from app.db.queries.trends import get_card_market_data, get_gem_rate, search_cards
from app.models.api import (
    AnalysisWarning,
    AnchorObject,
    BounceBackSignals,
    BuyTarget,
    EvModel,
    LiquiditySignal,
    MarketHealth,
    TrendAnalysisResponse,
    TrendHealth,
    TrendSearchResult,
    VolatilitySignal,
    VolumeSignal,
    WindowRow,
)
from app.models.domain import CardMarketRow

# ── Constants ────────────────────────────────────────────────────────────────
GRADING_COST = 38.00
EBAY_FEE_MULT = 0.87
MIN_PROFIT_FLOOR = 20.00
MIN_SALES = 3
MIN_TREND_SALES = 2
MIN_VOLATILITY_SALES = 5
DOWNTREND_PENALTY = 10.00
PSA8_MULT = 0.50
GEM_FALLBACK_FB = 0.38
GEM_FALLBACK_BB = 0.55
STALE_DAYS = 30
VOLUME_ACCEL_THRESHOLD = 0.20
VOLUME_DECAY_THRESHOLD = -0.20
RAW_MIN_VIABLE = 15.00
SHORT_TERM_DIVERGENCE_WARN = 0.15
MIN_SHORT_TERM_SALES = 2

_GRADES = ("Raw", "PSA 9", "PSA 10")


# ── Helpers ───────────────────────────────────────────────────────────────────

def search_trend_cards(query: str, sport: str, limit: int = 10) -> list[TrendSearchResult]:
    if not query or len(query) < 2:
        return []
    cards = search_cards(query, sport=sport, limit=limit)
    return [TrendSearchResult(card=c, sport=sport) for c in cards]


def _group_by_window_grade(rows: list[CardMarketRow]) -> dict[int, dict[str, CardMarketRow]]:
    grouped: dict[int, dict[str, CardMarketRow]] = {}
    for row in rows:
        wd = row.window_days
        if wd not in grouped:
            grouped[wd] = {}
        grouped[wd][row.grade] = row
    return grouped


def _build_window_prices(
    grouped: dict[int, dict[str, CardMarketRow]],
    anchor_window: int = 90,
) -> list[WindowRow]:
    rows = []
    for wd in sorted(grouped.keys()):
        grades = grouped[wd]
        raw_r  = grades.get("Raw")
        psa9_r = grades.get("PSA 9")
        p10_r  = grades.get("PSA 10")

        raw_avg  = raw_r.avg  if raw_r  and raw_r.avg  > 0 else None
        psa9_avg = psa9_r.avg if psa9_r and psa9_r.avg > 0 else None
        psa10_avg = p10_r.avg if p10_r  and p10_r.avg  > 0 else None

        raw_psa9  = round(raw_avg / psa9_avg, 2)   if raw_avg  and psa9_avg else None
        psa10_psa9 = round(psa10_avg / psa9_avg, 2) if psa10_avg and psa9_avg else None

        rows.append(WindowRow(
            window_days=wd,
            raw_avg=raw_avg,
            psa9_avg=psa9_avg,
            psa10_avg=psa10_avg,
            raw_psa9_ratio=raw_psa9,
            psa10_psa9_ratio=psa10_psa9,
            is_anchor=(wd == anchor_window),
        ))
    return rows


# ── Step 1 ─────────────────────────────────────────────────────────────────

def _build_anchor(
    grouped: dict[int, dict[str, CardMarketRow]], grade: str
) -> Optional[AnchorObject]:
    for window in (90, 180):
        row = grouped.get(window, {}).get(grade)
        if row and row.avg is not None and (row.num_sales or 0) >= MIN_SALES:
            return AnchorObject(
                grade=grade,
                anchor_value=float(row.avg),
                anchor_window=window,
                anchor_sales_count=int(row.num_sales),
                anchor_source=f"{window}d_avg",
            )
    return None


# ── Step 2 ─────────────────────────────────────────────────────────────────

def _recency_check(
    grouped: dict[int, dict[str, CardMarketRow]],
    warnings: list[AnalysisWarning],
) -> tuple[bool, int]:
    today = date.today()
    last_date: Optional[date] = None

    # prefer 90d row for most data-rich grade
    for grade in _GRADES:
        row = grouped.get(90, {}).get(grade)
        if row and row.last_sale_date:
            last_date = row.last_sale_date
            break

    if last_date is None:
        for wd in sorted(grouped):
            for grade in _GRADES:
                row = grouped[wd].get(grade)
                if row and row.last_sale_date:
                    last_date = row.last_sale_date
                    break
            if last_date:
                break

    if last_date is None:
        return False, 0

    days = (today - last_date).days
    stale = days > STALE_DAYS
    if stale:
        warnings.append(AnalysisWarning(
            code="STALE_DATA",
            severity="high",
            message=f"Last sale was {days} days ago. Market data may be unreliable.",
        ))
    return stale, days


# ── Step 3 ─────────────────────────────────────────────────────────────────

def _volatility_check(
    anchor: AnchorObject,
    grouped: dict[int, dict[str, CardMarketRow]],
    warnings: list[AnalysisWarning],
) -> VolatilitySignal:
    if anchor.anchor_sales_count < MIN_VOLATILITY_SALES:
        return VolatilitySignal(label="Unknown - thin data", ratio=None)

    row = grouped.get(anchor.anchor_window, {}).get(anchor.grade)
    if not row or row.min_sale is None or row.max_sale is None:
        return VolatilitySignal(label="Unknown - thin data", ratio=None)

    ratio = (float(row.max_sale) - float(row.min_sale)) / anchor.anchor_value
    if ratio < 0.35:
        label = "Low"
    elif ratio < 0.75:
        label = "Moderate"
    elif ratio < 1.0:
        label = "High"
    else:
        label = "Extreme"

    if label in ("High", "Extreme"):
        warnings.append(AnalysisWarning(
            code="WIDE_SPREAD",
            severity="medium",
            message="Wide price spread detected. Average price may not reflect true market value.",
        ))
    return VolatilitySignal(label=label, ratio=round(ratio, 3))


# ── Step 4 ─────────────────────────────────────────────────────────────────

def _trend_signal(
    grouped: dict[int, dict[str, CardMarketRow]],
    raw_anchor: Optional[AnchorObject],
    warnings: list[AnalysisWarning],
) -> TrendHealth:
    # determine priority order
    raw_viable = raw_anchor is not None and raw_anchor.anchor_value >= RAW_MIN_VIABLE
    if raw_viable:
        priority = ("Raw", "PSA 9", "PSA 10")
    else:
        priority = ("PSA 9", "PSA 10", "Raw")

    for grade in priority:
        anchor_row_30 = grouped.get(30, {}).get(grade)
        if not anchor_row_30 or (anchor_row_30.num_sales or 0) < MIN_TREND_SALES:
            continue
        # find the reference anchor (90d or 180d)
        ref_row = grouped.get(90, {}).get(grade) or grouped.get(180, {}).get(grade)
        if not ref_row or ref_row.avg is None or anchor_row_30.avg is None:
            continue

        ratio = float(anchor_row_30.avg) / float(ref_row.avg)
        if ratio >= 1.25:
            direction = "Strong uptrend"
        elif ratio >= 1.10:
            direction = "Mild uptrend"
        elif ratio >= 0.90:
            direction = "Stable"
        elif ratio >= 0.75:
            direction = "Mild downtrend"
        else:
            direction = "Strong downtrend"

        return TrendHealth(
            direction=direction,
            ratio=round(ratio, 3),
            source_grade=grade,
            source_window="30d_vs_90d",
        )

    warnings.append(AnalysisWarning(
        code="NO_TREND_SIGNAL",
        severity="low",
        message="Insufficient 30d sales data to compute trend direction.",
    ))
    return TrendHealth(direction="Insufficient data", ratio=None, source_grade=None, source_window=None)


# ── Step 5 ─────────────────────────────────────────────────────────────────

def _volume_signal(
    grouped: dict[int, dict[str, CardMarketRow]],
    trend: TrendHealth,
    warnings: list[AnalysisWarning],
) -> VolumeSignal:
    # use the grade that sourced the trend signal, or fall back to first available
    grade = trend.source_grade
    row = None
    if grade:
        row = grouped.get(30, {}).get(grade)
    if row is None:
        for g in _GRADES:
            row = grouped.get(30, {}).get(g)
            if row:
                break

    if row is None or row.volume_change_pct is None:
        return VolumeSignal(signal="Stable", change_pct=None)

    pct = float(row.volume_change_pct)
    if pct >= VOLUME_ACCEL_THRESHOLD:
        signal: str = "Accelerating"
    elif pct <= VOLUME_DECAY_THRESHOLD:
        signal = "Declining"
    else:
        signal = "Stable"

    # FRAGILE_PREMIUM warning
    if trend.direction in ("Strong uptrend", "Mild uptrend") and signal == "Declining":
        warnings.append(AnalysisWarning(
            code="FRAGILE_PREMIUM",
            severity="medium",
            message="Price is trending up but volume is declining — premium may not be sustained.",
        ))

    return VolumeSignal(signal=signal, change_pct=round(pct, 4))


# ── Step 6 ─────────────────────────────────────────────────────────────────

def _liquidity_signal(
    grouped: dict[int, dict[str, CardMarketRow]],
    warnings: list[AnalysisWarning],
) -> LiquiditySignal:
    total = 0
    for grade in _GRADES:
        row = grouped.get(90, {}).get(grade)
        if row and row.num_sales:
            total += int(row.num_sales)

    if total <= 2:
        label = "Very thin"
    elif total <= 5:
        label = "Thin"
    elif total <= 12:
        label = "Moderate"
    else:
        label = "Liquid"

    if label in ("Very thin", "Thin"):
        warnings.append(AnalysisWarning(
            code="LOW_CONFIDENCE",
            severity="medium" if label == "Thin" else "high",
            message=f"Liquidity is {label.lower()}. Price signals may not be reliable.",
        ))
    return LiquiditySignal(label=label, total_90d_sales=total)


# ── Step 7 ─────────────────────────────────────────────────────────────────

def _market_confidence(
    stale: bool,
    raw_anchor: Optional[AnchorObject],
    psa9_anchor: Optional[AnchorObject],
    liquidity: LiquiditySignal,
    trend: TrendHealth,
    volatility: VolatilitySignal,
    volume: VolumeSignal,
) -> str:
    # Low conditions
    if (
        stale
        or (raw_anchor is None and psa9_anchor is None)
        or liquidity.label == "Very thin"
        or (trend.direction == "Insufficient data" and psa9_anchor is None)
    ):
        return "Low"

    # Medium conditions
    if (
        trend.direction in ("Mild downtrend", "Strong downtrend")
        or liquidity.label == "Thin"
        or liquidity.total_90d_sales < 5
        or volatility.label in ("High", "Extreme")
    ):
        confidence = "Medium"
    else:
        confidence = "High"

    # Volume boosts (cannot override Low)
    boost = (
        trend.direction in ("Strong uptrend", "Mild uptrend") and volume.signal == "Accelerating"
    ) or (trend.direction == "Stable" and volume.signal == "Accelerating")

    if boost and confidence == "Medium":
        confidence = "High"

    return confidence


# ── Step 8 ─────────────────────────────────────────────────────────────────

def _net_prices(
    raw_anchor: Optional[AnchorObject],
    psa9_anchor: Optional[AnchorObject],
    psa10_anchor: Optional[AnchorObject],
) -> dict[str, Optional[float]]:
    def net(anchor: Optional[AnchorObject]) -> Optional[float]:
        return anchor.anchor_value * EBAY_FEE_MULT if anchor else None

    net_psa8 = None
    if raw_anchor:
        net_psa8 = raw_anchor.anchor_value * PSA8_MULT * EBAY_FEE_MULT

    return {
        "raw": net(raw_anchor),
        "psa9": net(psa9_anchor),
        "psa10": net(psa10_anchor),
        "psa8": net_psa8,
    }


# ── Step 9 ─────────────────────────────────────────────────────────────────

def _raw_viability_ratio(
    raw_anchor: Optional[AnchorObject],
    psa9_anchor: Optional[AnchorObject],
) -> Optional[float]:
    if (
        raw_anchor is None
        or psa9_anchor is None
        or raw_anchor.anchor_sales_count < MIN_SALES
        or psa9_anchor.anchor_sales_count < MIN_SALES
    ):
        return None
    return raw_anchor.anchor_value / psa9_anchor.anchor_value


# ── Step 11 ────────────────────────────────────────────────────────────────

def _gem_rate_lookup(
    card: str, sport: str, warnings: list[AnalysisWarning]
) -> tuple[float, str]:
    rate = get_gem_rate(card, sport)
    if rate is not None:
        return rate, "card_specific"

    fallback = GEM_FALLBACK_FB if sport == "football" else GEM_FALLBACK_BB
    warnings.append(AnalysisWarning(
        code="GEM_FALLBACK",
        severity="medium",
        message="Using sport-average gem rate. EV estimates are less reliable.",
    ))
    return fallback, "sport_fallback"


# ── Step 12 ────────────────────────────────────────────────────────────────

def _ev_model(
    raw_anchor: AnchorObject,
    psa9_anchor: AnchorObject,
    psa10_anchor: AnchorObject,
    gem_rate: float,
    trend: TrendHealth,
    net: dict[str, Optional[float]],
) -> Optional[EvModel]:
    p10 = gem_rate
    p9 = min(0.40, 0.90 - p10)
    p_low = 1.0 - p10 - p9

    downtrend_penalty = DOWNTREND_PENALTY if trend.direction == "Mild downtrend" else 0.0
    cost_basis = raw_anchor.anchor_value + GRADING_COST + downtrend_penalty

    net_psa10 = net["psa10"] or 0.0
    net_psa9 = net["psa9"] or 0.0
    net_psa8 = net["psa8"] or 0.0

    ev = (p10 * net_psa10) + (p9 * net_psa9) + (p_low * net_psa8)
    net_ev = ev - cost_basis

    return EvModel(
        raw_anchor=round(raw_anchor.anchor_value, 2),
        grading_cost=GRADING_COST,
        total_cost=round(cost_basis, 2),
        psa9_anchor=round(psa9_anchor.anchor_value, 2),
        psa10_anchor=round(psa10_anchor.anchor_value, 2),
        gem_rate=gem_rate,
        gem_rate_source="",  # set by caller
        estimated_outcomes={"psa10": round(p10, 4), "psa9": round(p9, 4), "psa8_or_lower": round(p_low, 4)},
        expected_resale_after_fees=round(ev, 2),
        expected_profit=round(net_ev, 2),
        profit_floor=MIN_PROFIT_FLOOR,
    )


# ── Step 13 ────────────────────────────────────────────────────────────────

def _multiplier_matrix(
    psa9_anchor: Optional[AnchorObject],
    psa10_anchor: Optional[AnchorObject],
) -> tuple[Optional[float], str]:
    if not psa9_anchor or not psa10_anchor:
        return None, "Insufficient data"
    mult = psa10_anchor.anchor_value / psa9_anchor.anchor_value
    return round(mult, 2), f"{mult:.2f}x"


# ── Step 14 ────────────────────────────────────────────────────────────────

def _break_even_grade(
    cost_basis: float,
    psa9_anchor: Optional[AnchorObject],
    psa10_anchor: Optional[AnchorObject],
) -> Optional[str]:
    if psa9_anchor is None and psa10_anchor is None:
        return None
    be_gross = (cost_basis + MIN_PROFIT_FLOOR) / EBAY_FEE_MULT
    if psa9_anchor and be_gross <= psa9_anchor.anchor_value:
        return "Needs PSA 9"
    if psa10_anchor and be_gross <= psa10_anchor.anchor_value:
        return "Needs PSA 10"
    return "No grade covers cost"


# ── Final Verdict ──────────────────────────────────────────────────────────

def _final_verdict(
    market_confidence: str,
    raw_anchor: Optional[AnchorObject],
    trend: TrendHealth,
    ev_model: Optional[EvModel],
    multiplier: Optional[float],
    gem_rate: float,
) -> str:
    if market_confidence == "Low":
        return "Watch - insufficient signal"

    grading_blocked = (
        raw_anchor is None
        or raw_anchor.anchor_value < RAW_MIN_VIABLE
        or trend.direction == "Strong downtrend"
    )

    if grading_blocked:
        suggest_psa10 = (multiplier is not None and multiplier > 3.5 and gem_rate < 0.15)
        return "Buy PSA 10" if suggest_psa10 else "Buy PSA 9"

    if ev_model is not None and ev_model.expected_profit >= MIN_PROFIT_FLOOR:
        return "Buy raw & grade"

    suggest_psa10 = (multiplier is not None and multiplier > 3.5 and gem_rate < 0.15)
    if suggest_psa10:
        return "Buy PSA 10"

    if raw_anchor or ev_model is not None:
        return "Buy PSA 9"

    return "Pass"


# ── Short-term price anchor ────────────────────────────────────────────────

def _short_term_price_anchor(
    grouped: dict[int, dict[str, CardMarketRow]],
    grade: str,
    avg_30d: float,
    warnings: list[AnalysisWarning],
) -> tuple[float, str]:
    row_7d  = grouped.get(7,  {}).get(grade)
    row_14d = grouped.get(14, {}).get(grade)

    if not row_7d or row_7d.num_sales < MIN_SHORT_TERM_SALES:
        return avg_30d, "30d avg"
    if not row_14d or row_14d.num_sales < MIN_SHORT_TERM_SALES:
        return avg_30d, "30d avg"

    avg_7d  = row_7d.avg
    avg_14d = row_14d.avg

    downtrend = avg_7d < avg_30d and avg_14d < avg_30d
    uptrend   = avg_7d > avg_30d and avg_14d > avg_30d

    if not downtrend and not uptrend:
        return avg_30d, "30d avg"

    short_term_anchor = (avg_7d + avg_14d) / 2

    if avg_30d > 0:
        divergence = abs(short_term_anchor - avg_30d) / avg_30d
        if divergence > SHORT_TERM_DIVERGENCE_WARN:
            direction_label = "declining" if downtrend else "rising"
            warnings.append(AnalysisWarning(
                code="SHORT_TERM_DIVERGENCE",
                severity="medium",
                message=(
                    f"7d/14d avg (${short_term_anchor:.2f}) diverges "
                    f"{divergence:.0%} from 30d avg (${avg_30d:.2f}) — "
                    f"market is actively {direction_label}."
                ),
            ))

    if downtrend:
        return short_term_anchor, "7d/14d avg (continuing decline)"
    return short_term_anchor, "7d/14d avg (momentum)"


# ── Buy Target ─────────────────────────────────────────────────────────────

def _buy_target(
    verdict: str,
    grouped: dict[int, dict[str, CardMarketRow]],
    raw_anchor: Optional[AnchorObject],
    psa9_anchor: Optional[AnchorObject],
    psa10_anchor: Optional[AnchorObject],
    ev_model: Optional[EvModel],
    trend: TrendHealth,
    warnings: list[AnalysisWarning],
) -> Optional[BuyTarget]:
    downtrend_penalty = DOWNTREND_PENALTY if trend.direction == "Mild downtrend" else 0.0

    if verdict == "Buy raw & grade":
        if ev_model:
            max_raw = ev_model.expected_resale_after_fees - GRADING_COST - MIN_PROFIT_FLOOR - downtrend_penalty
            warning_code = None
            if raw_anchor and raw_anchor.anchor_value > max_raw:
                warnings.append(AnalysisWarning(
                    code="RAW_ABOVE_EV_TARGET",
                    severity="medium",
                    message="Current raw anchor exceeds EV-safe buy price.",
                ))
                warning_code = "RAW_ABOVE_EV_TARGET"

            # Derived fallback if no raw anchor
            if raw_anchor is None and psa9_anchor:
                derived_price = psa9_anchor.anchor_value * 0.40
                warnings.append(AnalysisWarning(
                    code="DERIVED_BUY_TARGET",
                    severity="low",
                    message="No raw sales data. Buy target derived from PSA 9 anchor × 0.40.",
                ))
                return BuyTarget(grade="Raw", price=round(derived_price, 2), basis="Derived from PSA 9 × 0.40", warning="DERIVED_BUY_TARGET")

            return BuyTarget(grade="Raw", price=round(max_raw, 2), basis="EV-safe max raw price", warning=warning_code)
        return None

    if verdict == "Buy PSA 9" and psa9_anchor:
        row_30 = grouped.get(30, {}).get("PSA 9")
        avg_30 = float(row_30.avg) if row_30 and row_30.avg else None
        anchor_disc = psa9_anchor.anchor_value * 0.90
        if avg_30:
            price_ceiling, basis = _short_term_price_anchor(grouped, "PSA 9", avg_30, warnings)
            price = min(price_ceiling, anchor_disc)
        else:
            price = anchor_disc
            basis = "anchor × 0.90"
        thin = psa9_anchor.anchor_sales_count < MIN_SALES
        if thin:
            warnings.append(AnalysisWarning(
                code="THIN_BUY_TARGET",
                severity="low",
                message="Buy target sourced from window with fewer than 3 sales.",
            ))
        return BuyTarget(grade="PSA 9", price=round(price, 2), basis=basis, warning="THIN_BUY_TARGET" if thin else None)

    if verdict == "Buy PSA 10" and psa10_anchor:
        price = psa10_anchor.anchor_value * 0.85
        thin = psa10_anchor.anchor_sales_count < MIN_SALES
        if thin:
            warnings.append(AnalysisWarning(
                code="THIN_BUY_TARGET",
                severity="low",
                message="Buy target sourced from window with fewer than 3 sales.",
            ))
        return BuyTarget(grade="PSA 10", price=round(price, 2), basis="anchor × 0.85", warning="THIN_BUY_TARGET" if thin else None)

    return None


# ── Bounce Back ────────────────────────────────────────────────────────────

def _bounce_back(
    grouped: dict[int, dict[str, CardMarketRow]], grade: str
) -> Optional[BounceBackSignals]:
    r30 = grouped.get(30, {}).get(grade)
    r180 = grouped.get(180, {}).get(grade)
    r14 = grouped.get(14, {}).get(grade)
    r7 = grouped.get(7, {}).get(grade)
    r360 = grouped.get(360, {}).get(grade)

    if not r30 or not r180:
        return None

    avg30 = float(r30.avg) if r30.avg else None
    avg180 = float(r180.avg) if r180.avg else None
    avg14 = float(r14.avg) if r14 and r14.avg else None
    avg7 = float(r7.avg) if r7 and r7.avg else None
    sales30 = int(r30.num_sales) if r30.num_sales else 0
    sales360 = int(r360.num_sales) if r360 and r360.num_sales else 0
    max180 = float(r180.max_sale) if r180.max_sale else None

    # B1: 30d avg >= 15% below 180d avg
    b1 = bool(avg30 and avg180 and avg30 <= avg180 * 0.85)

    # B2: 30d sales >= 2
    b2 = sales30 >= 2

    # B3: 14d avg >= 97% of 30d avg (floor forming)
    b3 = bool(avg14 and avg30 and avg14 >= avg30 * 0.97)

    # B4: 7d avg still < 90% of 180d avg (recovery not priced in)
    b4 = bool(avg7 and avg180 and avg7 < avg180 * 0.90)

    # B5: 30d sales >= (360d_sales / 12) * 0.25; minimum 1 enforced
    threshold = max(1, (sales360 / 12) * 0.25)
    b5 = sales30 >= threshold

    # B6: 180d max < 3x 180d avg (no spike distortion)
    b6 = bool(max180 and avg180 and max180 < avg180 * 3)

    score = sum([b1, b2, b3, b4, b5, b6])
    return BounceBackSignals(
        b1_cheap=b1,
        b2_recent_liquidity=b2,
        b3_stabilizing=b3,
        b4_recovery_not_priced=b4,
        b5_market_active=b5,
        b6_no_spike=b6,
        score=score,
        qualifies=b1 and b2 and score >= 4,
    )


# ── Primary reason text ────────────────────────────────────────────────────

def _primary_reason(
    verdict: str,
    market_confidence: str,
    ev_model: Optional[EvModel],
    trend: TrendHealth,
    liquidity: LiquiditySignal,
    raw_anchor: Optional[AnchorObject],
) -> str:
    if market_confidence == "Low":
        return "Market data is insufficient or stale to make a confident recommendation."
    if verdict == "Buy raw & grade" and ev_model:
        return f"EV clears profit floor by ${ev_model.expected_profit - MIN_PROFIT_FLOOR:.0f}. Net expected profit: ${ev_model.expected_profit:.0f}."
    if verdict in ("Buy PSA 9", "Buy PSA 10"):
        if trend.direction == "Strong downtrend":
            return "Strong downtrend blocks grading. Slab buying recommended at discount."
        if raw_anchor is None or raw_anchor.anchor_value < RAW_MIN_VIABLE:
            return "Raw price below grading threshold. Buy the slab."
        return f"EV model did not clear profit floor. Slab path: {verdict}."
    if verdict == "Pass":
        return "Risk/reward does not justify entry at current prices."
    return "Insufficient market signal."


# ── Main entry point ───────────────────────────────────────────────────────

def run_trend_analysis(
    card: str, sport: str
) -> Optional[TrendAnalysisResponse]:
    rows = get_card_market_data(card, sport)
    if not rows:
        return None

    warnings: list[AnalysisWarning] = []
    grouped = _group_by_window_grade(rows)

    # Step 1: anchors
    raw_anchor = _build_anchor(grouped, "Raw")
    psa9_anchor = _build_anchor(grouped, "PSA 9")
    psa10_anchor = _build_anchor(grouped, "PSA 10")

    if raw_anchor is None and psa9_anchor is None and psa10_anchor is None:
        return TrendAnalysisResponse(
            verdict="Insufficient data",
            market_confidence="Low",
            primary_reason="No price anchors available. Fewer than 3 sales in any window.",
            buy_target=None,
            market_health=MarketHealth(
                trend=TrendHealth(direction="Insufficient data"),
                volume=VolumeSignal(signal="Stable"),
                liquidity=LiquiditySignal(label="Very thin", total_90d_sales=0),
                volatility=VolatilitySignal(label="Unknown - thin data"),
            ),
            ev_model=None,
            break_even_grade=None,
            warnings=warnings,
            bounce_back=None,
        )

    # Step 2: recency check
    stale, _days_since = _recency_check(grouped, warnings)

    # Step 3: volatility (use best available anchor)
    best_anchor = psa9_anchor or raw_anchor or psa10_anchor
    volatility = _volatility_check(best_anchor, grouped, warnings)

    # Step 4: trend
    trend = _trend_signal(grouped, raw_anchor, warnings)

    # Step 5: volume
    volume = _volume_signal(grouped, trend, warnings)

    # Step 6: liquidity
    liquidity = _liquidity_signal(grouped, warnings)

    # Step 7: market confidence
    market_confidence = _market_confidence(
        stale, raw_anchor, psa9_anchor, liquidity, trend, volatility, volume
    )

    # Step 8: net prices
    net = _net_prices(raw_anchor, psa9_anchor, psa10_anchor)

    # Step 9: raw viability ratio
    raw_ratio = _raw_viability_ratio(raw_anchor, psa9_anchor)

    # Steps 10–12: EV model gating
    ev: Optional[EvModel] = None

    raw_blocked = (
        raw_anchor is None
        or raw_anchor.anchor_value < RAW_MIN_VIABLE
    )
    strong_downtrend = trend.direction == "Strong downtrend"

    if raw_blocked and raw_anchor is not None:
        warnings.append(AnalysisWarning(
            code="RAW_BELOW_THRESHOLD",
            severity="medium",
            message=f"Raw anchor ${raw_anchor.anchor_value:.0f} is below minimum viable threshold (${RAW_MIN_VIABLE:.0f}).",
        ))

    if strong_downtrend:
        warnings.append(AnalysisWarning(
            code="STRONG_DOWNTREND",
            severity="high",
            message="Strong downtrend detected. Grading path blocked.",
        ))

    # Step 11: gem rate — always looked up; needed for verdict even when EV is blocked
    gem_rate, gem_rate_source = _gem_rate_lookup(card, sport, warnings)

    if not raw_blocked and not strong_downtrend:
        # Step 12: run EV model if all anchors present and ratio viable
        if (
            psa9_anchor is not None
            and psa10_anchor is not None
            and (raw_ratio is None or raw_ratio <= 0.60)
        ):
            ev = _ev_model(raw_anchor, psa9_anchor, psa10_anchor, gem_rate, trend, net)
            if ev:
                ev.gem_rate_source = gem_rate_source

    # Step 13: multiplier matrix
    multiplier, _mult_label = _multiplier_matrix(psa9_anchor, psa10_anchor)

    # Final verdict
    verdict = _final_verdict(market_confidence, raw_anchor, trend, ev, multiplier, gem_rate)

    # Step 14: break-even grade
    be_grade: Optional[str] = None
    if ev and not raw_blocked and not strong_downtrend:
        be_grade = _break_even_grade(ev.total_cost, psa9_anchor, psa10_anchor)

    # Buy target
    buy_target = _buy_target(
        verdict, grouped, raw_anchor, psa9_anchor, psa10_anchor, ev, trend, warnings
    )

    # Bounce back: run for PSA 9 and PSA 10, return higher-scoring qualifying result
    bb_psa9 = _bounce_back(grouped, "PSA 9")
    bb_psa10 = _bounce_back(grouped, "PSA 10")
    bounce_back: Optional[BounceBackSignals] = None
    candidates = [b for b in [bb_psa9, bb_psa10] if b is not None and b.qualifies]
    if candidates:
        bounce_back = max(candidates, key=lambda b: b.score)
    elif bb_psa9 or bb_psa10:
        # return the higher-scoring even if not qualifying, for display
        non_null = [b for b in [bb_psa9, bb_psa10] if b is not None]
        if non_null:
            bounce_back = max(non_null, key=lambda b: b.score)

    primary_reason = _primary_reason(verdict, market_confidence, ev, trend, liquidity, raw_anchor)

    anchor_window = raw_anchor.anchor_window if raw_anchor else 90

    return TrendAnalysisResponse(
        verdict=verdict,
        market_confidence=market_confidence,
        primary_reason=primary_reason,
        buy_target=buy_target,
        market_health=MarketHealth(
            trend=trend,
            volume=volume,
            liquidity=liquidity,
            volatility=volatility,
        ),
        ev_model=ev,
        break_even_grade=be_grade,
        warnings=warnings,
        bounce_back=bounce_back,
        window_prices=_build_window_prices(grouped, anchor_window),
    )
