"""
Unit tests for the Card Targets scoring layer.
No DB or network calls — all TrendAnalysisResponse objects are constructed directly.
"""

import pytest

from app.models.api import (
    AnalysisWarning,
    BounceBackSignals,
    BuyTarget,
    EvModel,
    LiquiditySignal,
    MarketHealth,
    TrendAnalysisResponse,
    TrendHealth,
    VolatilitySignal,
    VolumeSignal,
)
from app.services.card_targets import (
    TARGET_MIN_PRICE,
    TARGET_MAX_PRICE,
    CardTargetScores,
    build_card_target_warnings,
    build_justification,
    calculate_card_target_score,
    calculate_market_score,
    calculate_player_score,
    calculate_risk_penalty,
    calculate_timing_score,
    calculate_value_score,
    choose_watchlist_grade,
    classify_recommendation_strength,
    classify_strategy_type,
    get_price_series_for_grade,
    is_within_target_price_range,
    normalize_player_key,
    recommended_grade_from_verdict,
    select_current_price,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_analysis(
    verdict: str = "Buy PSA 9",
    market_confidence: str = "High",
    liquidity: str = "Liquid",
    trend: str = "Mild uptrend",
    volume: str = "Stable",
    volatility: str = "Moderate",
    warnings: list | None = None,
    bounce_back: BounceBackSignals | None = None,
    buy_target_price: float | None = 50.0,
    expected_profit: float | None = 25.0,
) -> TrendAnalysisResponse:
    return TrendAnalysisResponse(
        verdict=verdict,
        market_confidence=market_confidence,
        primary_reason="test",
        buy_target=BuyTarget(grade="PSA 9", price=buy_target_price, basis="30d avg") if buy_target_price else None,
        market_health=MarketHealth(
            trend=TrendHealth(direction=trend),
            volume=VolumeSignal(signal=volume),
            liquidity=LiquiditySignal(label=liquidity, total_90d_sales=20),
            volatility=VolatilitySignal(label=volatility),
        ),
        ev_model=EvModel(
            raw_anchor=40.0, grading_cost=38.0, total_cost=78.0,
            psa9_anchor=60.0, psa10_anchor=120.0, gem_rate=0.38,
            gem_rate_source="sport_fallback",
            estimated_outcomes={"psa10": 0.38, "psa9": 0.40, "psa8_or_lower": 0.22},
            expected_resale_after_fees=98.0,
            expected_profit=expected_profit or 0.0,
            profit_floor=20.0,
        ),
        warnings=warnings or [],
        bounce_back=bounce_back,
        window_prices=[],
    )


def make_bounce_back(qualifies: bool = True, score: int = 5) -> BounceBackSignals:
    return BounceBackSignals(
        b1_cheap=True, b2_recent_liquidity=True, b3_stabilizing=True,
        b4_recovery_not_priced=True, b5_market_active=True, b6_no_spike=False,
        score=score, qualifies=qualifies,
    )


def make_warning(code: str) -> AnalysisWarning:
    return AnalysisWarning(code=code, severity="medium", message=code)


def make_scores(
    market=20.0, value=25.0, timing=10.0, player=10.0, risk=5.0
) -> CardTargetScores:
    return CardTargetScores(
        market_score=market,
        value_score=value,
        timing_score=timing,
        player_score=player,
        risk_penalty=risk,
        target_score=market + value + timing + player - risk,
    )


# ---------------------------------------------------------------------------
# normalize_player_key
# ---------------------------------------------------------------------------

class TestNormalizePlayerKey:
    def test_strips_dots(self):
        assert normalize_player_key("C.J. Stroud") == "cj stroud"

    def test_strips_apostrophes(self):
        assert normalize_player_key("De'Von Achane") == "devon achane"

    def test_collapses_spaces(self):
        assert normalize_player_key("C  J   Stroud") == "c j stroud"

    def test_lowercases(self):
        assert normalize_player_key("Patrick MAHOMES") == "patrick mahomes"

    def test_none_returns_empty(self):
        assert normalize_player_key(None) == ""

    def test_empty_returns_empty(self):
        assert normalize_player_key("") == ""

    def test_variants_match(self):
        assert normalize_player_key("C.J. Stroud") == normalize_player_key("CJ Stroud")


# ---------------------------------------------------------------------------
# recommended_grade_from_verdict
# ---------------------------------------------------------------------------

class TestRecommendedGradeFromVerdict:
    def test_buy_raw(self):
        assert recommended_grade_from_verdict("Buy raw & grade") == "Raw"

    def test_buy_psa9(self):
        assert recommended_grade_from_verdict("Buy PSA 9") == "PSA 9"

    def test_buy_psa10(self):
        assert recommended_grade_from_verdict("Buy PSA 10") == "PSA 10"

    def test_pass_returns_none(self):
        assert recommended_grade_from_verdict("Pass") is None

    def test_watch_returns_none(self):
        assert recommended_grade_from_verdict("Watch - insufficient signal") is None


# ---------------------------------------------------------------------------
# choose_watchlist_grade
# ---------------------------------------------------------------------------

class TestChooseWatchlistGrade:
    def test_prefers_psa9(self):
        candidate = {"psa9_avg_30d": 50.0, "raw_avg_30d": 30.0, "psa10_avg_30d": 180.0}
        assert choose_watchlist_grade(candidate) == "PSA 9"

    def test_falls_back_to_raw(self):
        candidate = {"psa9_avg_30d": 5.0, "raw_avg_30d": 30.0, "psa10_avg_30d": 300.0}
        assert choose_watchlist_grade(candidate) == "Raw"

    def test_falls_back_to_psa10(self):
        candidate = {"psa9_avg_30d": 5.0, "raw_avg_30d": 5.0, "psa10_avg_30d": 100.0}
        assert choose_watchlist_grade(candidate) == "PSA 10"

    def test_all_out_of_range_returns_none(self):
        candidate = {"psa9_avg_30d": 5.0, "raw_avg_30d": 5.0, "psa10_avg_30d": 500.0}
        assert choose_watchlist_grade(candidate) is None


# ---------------------------------------------------------------------------
# is_within_target_price_range
# ---------------------------------------------------------------------------

class TestIsWithinTargetPriceRange:
    def test_in_range(self):
        assert is_within_target_price_range(50.0) is True
        assert is_within_target_price_range(10.0) is True
        assert is_within_target_price_range(200.0) is True

    def test_below_min(self):
        assert is_within_target_price_range(9.99) is False

    def test_above_max(self):
        assert is_within_target_price_range(200.01) is False

    def test_none_returns_false(self):
        assert is_within_target_price_range(None) is False


# ---------------------------------------------------------------------------
# select_current_price
# ---------------------------------------------------------------------------

class TestSelectCurrentPrice:
    def make_series(self, sales_7d=0, avg_7d=None, sales_14d=0, avg_14d=None,
                    sales_30d=0, avg_30d=None, last_sale=None):
        return {
            "sales_7d": sales_7d, "avg_7d": avg_7d,
            "sales_14d": sales_14d, "avg_14d": avg_14d,
            "sales_30d": sales_30d, "avg_30d": avg_30d,
            "last_sale": last_sale,
        }

    def test_prefers_7d_when_sufficient(self):
        s = self.make_series(sales_7d=3, avg_7d=55.0, sales_30d=10, avg_30d=50.0)
        assert select_current_price(s, {}, "PSA 9") == 55.0

    def test_falls_back_to_14d(self):
        s = self.make_series(sales_7d=1, avg_7d=55.0, sales_14d=4, avg_14d=52.0)
        assert select_current_price(s, {}, "PSA 9") == 52.0

    def test_falls_back_to_30d(self):
        s = self.make_series(sales_30d=5, avg_30d=48.0)
        assert select_current_price(s, {}, "PSA 9") == 48.0

    def test_falls_back_to_last_sale(self):
        s = self.make_series(last_sale=45.0)
        assert select_current_price(s, {}, "PSA 9") == 45.0

    def test_returns_none_when_no_data(self):
        s = self.make_series()
        assert select_current_price(s, {}, "PSA 9") is None


# ---------------------------------------------------------------------------
# get_price_series_for_grade
# ---------------------------------------------------------------------------

class TestGetPriceSeriesForGrade:
    def test_raw_prefix(self):
        candidate = {"raw_avg_30d": 40.0, "psa9_avg_30d": 60.0}
        series = get_price_series_for_grade(candidate, "Raw")
        assert series["avg_30d"] == 40.0

    def test_psa9_prefix(self):
        candidate = {"raw_avg_30d": 40.0, "psa9_avg_30d": 60.0}
        series = get_price_series_for_grade(candidate, "PSA 9")
        assert series["avg_30d"] == 60.0

    def test_psa10_prefix(self):
        candidate = {"psa10_avg_7d": 90.0}
        series = get_price_series_for_grade(candidate, "PSA 10")
        assert series["avg_7d"] == 90.0


# ---------------------------------------------------------------------------
# calculate_market_score
# ---------------------------------------------------------------------------

class TestCalculateMarketScore:
    def test_high_confidence_liquid_uptrend(self):
        analysis = make_analysis(
            market_confidence="High", liquidity="Liquid",
            trend="Strong uptrend", volume="Accelerating", volatility="Low",
        )
        score = calculate_market_score(analysis)
        assert score == 30  # capped at max

    def test_low_confidence_thin_downtrend(self):
        analysis = make_analysis(
            market_confidence="Low", liquidity="Thin",
            trend="Mild downtrend", volume="Declining", volatility="High",
        )
        score = calculate_market_score(analysis)
        assert score < 10

    def test_stale_data_penalty(self):
        analysis_fresh = make_analysis(warnings=[])
        analysis_stale = make_analysis(warnings=[make_warning("STALE_DATA")])
        assert calculate_market_score(analysis_fresh) > calculate_market_score(analysis_stale)

    def test_never_exceeds_max(self):
        analysis = make_analysis(
            market_confidence="High", liquidity="Liquid",
            trend="Strong uptrend", volume="Accelerating", volatility="Low",
        )
        assert calculate_market_score(analysis) <= 30


# ---------------------------------------------------------------------------
# calculate_value_score
# ---------------------------------------------------------------------------

class TestCalculateValueScore:
    def test_current_at_or_below_target_gets_points(self):
        analysis = make_analysis()
        price_series = {"avg_90d": 70.0}
        score_at = calculate_value_score(analysis, 50.0, 50.0, price_series)
        score_above = calculate_value_score(analysis, 60.0, 50.0, price_series)
        assert score_at > score_above

    def test_ev_profit_adds_points_for_raw_grade_verdict(self):
        analysis_buy = make_analysis(verdict="Buy raw & grade", expected_profit=30.0)
        analysis_pass = make_analysis(verdict="Pass", expected_profit=30.0)
        ps = {"avg_90d": 50.0}
        assert calculate_value_score(analysis_buy, 30.0, 30.0, ps) > \
               calculate_value_score(analysis_pass, 30.0, 30.0, ps)

    def test_bounce_back_adds_points(self):
        analysis_bb = make_analysis(bounce_back=make_bounce_back(qualifies=True))
        analysis_no = make_analysis(bounce_back=None)
        ps = {}
        assert calculate_value_score(analysis_bb, 50.0, 50.0, ps) > \
               calculate_value_score(analysis_no, 50.0, 50.0, ps)

    def test_never_exceeds_max(self):
        analysis = make_analysis(verdict="Buy raw & grade", expected_profit=100.0,
                                  bounce_back=make_bounce_back())
        ps = {"avg_90d": 100.0}
        assert calculate_value_score(analysis, 40.0, 40.0, ps) <= 35


# ---------------------------------------------------------------------------
# calculate_timing_score
# ---------------------------------------------------------------------------

class TestCalculateTimingScore:
    def test_accelerating_uptrend_adds_points(self):
        analysis = make_analysis(volume="Accelerating", trend="Mild uptrend")
        ps = {"avg_7d": 55.0, "avg_14d": 53.0, "avg_30d": 50.0, "avg_180d": 60.0}
        score = calculate_timing_score(analysis, ps)
        assert score > 0

    def test_no_short_term_divergence_adds_point(self):
        analysis_clean = make_analysis(warnings=[])
        analysis_div   = make_analysis(warnings=[make_warning("SHORT_TERM_DIVERGENCE")])
        ps = {}
        assert calculate_timing_score(analysis_clean, ps) > calculate_timing_score(analysis_div, ps)

    def test_never_exceeds_max(self):
        analysis = make_analysis(volume="Accelerating", trend="Strong uptrend")
        ps = {"avg_7d": 60.0, "avg_14d": 58.0, "avg_30d": 50.0, "avg_180d": 65.0}
        assert calculate_timing_score(analysis, ps) <= 15


# ---------------------------------------------------------------------------
# calculate_player_score
# ---------------------------------------------------------------------------

class TestCalculatePlayerScore:
    def test_no_player_returns_zero(self):
        assert calculate_player_score(None) == 0.0

    def test_high_tier_qb_scores_well(self):
        player = {
            "hobby_tier": 9, "upside_score": 4, "current_relevance_score": 4,
            "manual_catalyst_score": 3, "risk_score": 1, "sport": "football",
            "position": "QB",
        }
        assert calculate_player_score(player) >= 15

    def test_high_risk_reduces_score(self):
        base = {"hobby_tier": 5, "upside_score": 3, "current_relevance_score": 3,
                "manual_catalyst_score": 3, "risk_score": 0, "sport": "football", "position": "WR"}
        risky = {**base, "risk_score": 5}
        assert calculate_player_score(base) > calculate_player_score(risky)

    def test_never_exceeds_max(self):
        player = {
            "hobby_tier": 10, "upside_score": 5, "current_relevance_score": 5,
            "manual_catalyst_score": 5, "risk_score": 0, "sport": "football", "position": "QB",
        }
        assert calculate_player_score(player) <= 20

    def test_never_below_zero(self):
        player = {
            "hobby_tier": 0, "upside_score": 0, "current_relevance_score": 0,
            "manual_catalyst_score": 0, "risk_score": 5, "sport": "football", "position": "TE",
        }
        assert calculate_player_score(player) >= 0.0


# ---------------------------------------------------------------------------
# calculate_risk_penalty
# ---------------------------------------------------------------------------

class TestCalculateRiskPenalty:
    def test_low_confidence_maxes_out(self):
        analysis = make_analysis(market_confidence="Low")
        penalty = calculate_risk_penalty(analysis, None)
        assert penalty >= 30  # hits the cap

    def test_stale_data_adds_penalty(self):
        clean  = make_analysis(warnings=[])
        stale  = make_analysis(warnings=[make_warning("STALE_DATA")])
        assert calculate_risk_penalty(stale, None) > calculate_risk_penalty(clean, None)

    def test_very_thin_liquidity_adds_penalty(self):
        thin = make_analysis(liquidity="Very thin")
        liq  = make_analysis(liquidity="Liquid")
        assert calculate_risk_penalty(thin, None) > calculate_risk_penalty(liq, None)

    def test_player_risk_score_adds_penalty(self):
        analysis = make_analysis()
        p_safe  = {"risk_score": 0}
        p_risky = {"risk_score": 5}
        assert calculate_risk_penalty(analysis, p_risky) > calculate_risk_penalty(analysis, p_safe)

    def test_never_exceeds_cap(self):
        analysis = make_analysis(
            market_confidence="Low", liquidity="Very thin", volatility="Extreme",
            warnings=[make_warning("STALE_DATA"), make_warning("STRONG_DOWNTREND"),
                      make_warning("LOW_CONFIDENCE"), make_warning("FRAGILE_PREMIUM")],
        )
        assert calculate_risk_penalty(analysis, {"risk_score": 5}) <= 30


# ---------------------------------------------------------------------------
# calculate_card_target_score
# ---------------------------------------------------------------------------

class TestCalculateCardTargetScore:
    def test_strong_inputs_produce_high_score(self):
        analysis = make_analysis(
            market_confidence="High", liquidity="Liquid",
            trend="Mild uptrend", volume="Accelerating", volatility="Low",
            warnings=[], expected_profit=25.0,
        )
        player = {
            "hobby_tier": 8, "upside_score": 4, "current_relevance_score": 4,
            "manual_catalyst_score": 3, "risk_score": 1, "sport": "football", "position": "QB",
        }
        ps = {"avg_7d": 50.0, "avg_14d": 48.0, "avg_30d": 46.0, "avg_90d": 60.0}
        result = calculate_card_target_score(analysis, player, 45.0, 50.0, ps)
        assert result.target_score >= 50

    def test_score_never_below_zero(self):
        analysis = make_analysis(
            market_confidence="Low", liquidity="Very thin",
            warnings=[make_warning("STALE_DATA"), make_warning("LOW_CONFIDENCE")],
        )
        ps = {}
        result = calculate_card_target_score(analysis, None, None, None, ps)
        assert result.target_score >= 0

    def test_score_never_above_100(self):
        analysis = make_analysis(
            market_confidence="High", liquidity="Liquid",
            trend="Strong uptrend", volume="Accelerating", volatility="Low",
            warnings=[], expected_profit=100.0, verdict="Buy raw & grade",
            bounce_back=make_bounce_back(),
        )
        player = {
            "hobby_tier": 10, "upside_score": 5, "current_relevance_score": 5,
            "manual_catalyst_score": 5, "risk_score": 0, "sport": "football", "position": "QB",
        }
        ps = {"avg_7d": 60.0, "avg_14d": 58.0, "avg_30d": 50.0, "avg_90d": 70.0, "avg_180d": 80.0}
        result = calculate_card_target_score(analysis, player, 40.0, 50.0, ps)
        assert result.target_score <= 100


# ---------------------------------------------------------------------------
# classify_recommendation_strength
# ---------------------------------------------------------------------------

class TestClassifyRecommendationStrength:
    def _scores(self, score: float) -> CardTargetScores:
        return CardTargetScores(
            market_score=score * 0.3, value_score=score * 0.35,
            timing_score=score * 0.15, player_score=score * 0.2,
            risk_penalty=0.0, target_score=score,
        )

    def test_strong_buy_when_all_clear(self):
        analysis = make_analysis(market_confidence="High", liquidity="Liquid", warnings=[])
        result = classify_recommendation_strength(analysis, self._scores(85), 45.0, 50.0)
        assert result == "Strong Buy Target"

    def test_buy_target_threshold(self):
        analysis = make_analysis(market_confidence="High", liquidity="Liquid", warnings=[])
        result = classify_recommendation_strength(analysis, self._scores(72), 45.0, 50.0)
        assert result == "Buy Target"

    def test_value_target_threshold(self):
        analysis = make_analysis(market_confidence="High", liquidity="Liquid", warnings=[])
        result = classify_recommendation_strength(analysis, self._scores(66), 45.0, 50.0)
        assert result == "Value Target"

    def test_blocked_by_low_confidence(self):
        analysis = make_analysis(market_confidence="Low")
        result = classify_recommendation_strength(analysis, self._scores(90), 45.0, 50.0)
        assert result not in ("Strong Buy Target", "Buy Target", "Value Target")

    def test_blocked_by_stale_data(self):
        analysis = make_analysis(warnings=[make_warning("STALE_DATA")])
        result = classify_recommendation_strength(analysis, self._scores(90), 45.0, 50.0)
        assert result not in ("Strong Buy Target", "Buy Target", "Value Target")

    def test_blocked_when_price_above_target(self):
        analysis = make_analysis(market_confidence="High", liquidity="Liquid", warnings=[])
        result = classify_recommendation_strength(analysis, self._scores(85), 60.0, 50.0)
        assert result not in ("Strong Buy Target", "Buy Target", "Value Target")

    def test_blocked_by_target_outside_range(self):
        analysis = make_analysis(market_confidence="High", liquidity="Liquid", warnings=[])
        result = classify_recommendation_strength(analysis, self._scores(85), 45.0, 5.0)
        assert result not in ("Strong Buy Target", "Buy Target", "Value Target")

    def test_blocked_by_very_thin_liquidity(self):
        analysis = make_analysis(liquidity="Very thin")
        result = classify_recommendation_strength(analysis, self._scores(85), 45.0, 50.0)
        assert result not in ("Strong Buy Target", "Buy Target", "Value Target")

    def test_strong_downtrend_blocked_without_bounce_back(self):
        analysis = make_analysis(warnings=[make_warning("STRONG_DOWNTREND")], bounce_back=None)
        result = classify_recommendation_strength(analysis, self._scores(85), 45.0, 50.0)
        assert result not in ("Strong Buy Target", "Buy Target", "Value Target")

    def test_strong_downtrend_not_blocked_with_bounce_back(self):
        bb = make_bounce_back(qualifies=True)
        analysis = make_analysis(
            market_confidence="High", liquidity="Liquid",
            warnings=[make_warning("STRONG_DOWNTREND")], bounce_back=bb,
        )
        result = classify_recommendation_strength(analysis, self._scores(85), 45.0, 50.0)
        assert result in ("Strong Buy Target", "Buy Target", "Value Target")

    def test_watchlist_when_score_sufficient_but_blocked(self):
        analysis = make_analysis(market_confidence="Low")
        result = classify_recommendation_strength(analysis, self._scores(65), 45.0, 50.0)
        assert result == "Watchlist Target"

    def test_avoid_when_score_too_low(self):
        analysis = make_analysis(market_confidence="Low")
        result = classify_recommendation_strength(analysis, self._scores(30), 45.0, 50.0)
        assert result == "Avoid / Overheated"


# ---------------------------------------------------------------------------
# classify_strategy_type
# ---------------------------------------------------------------------------

class TestClassifyStrategyType:
    def test_grade_target_for_raw_verdict(self):
        analysis = make_analysis(verdict="Buy raw & grade")
        assert classify_strategy_type(analysis, "Buy Target") == "Grade Target"

    def test_slab_target_for_psa9_verdict(self):
        analysis = make_analysis(verdict="Buy PSA 9")
        assert classify_strategy_type(analysis, "Buy Target") == "Slab Target"

    def test_bounce_back_takes_priority(self):
        analysis = make_analysis(verdict="Buy PSA 9", bounce_back=make_bounce_back(qualifies=True))
        assert classify_strategy_type(analysis, "Buy Target") == "Bounce-back Target"

    def test_momentum_target(self):
        analysis = make_analysis(
            verdict="Pass", trend="Strong uptrend", volume="Accelerating",
        )
        assert classify_strategy_type(analysis, "Watchlist Target") == "Momentum Target"

    def test_none_for_avoid(self):
        analysis = make_analysis()
        assert classify_strategy_type(analysis, "Avoid / Overheated") is None


# ---------------------------------------------------------------------------
# build_justification
# ---------------------------------------------------------------------------

class TestBuildJustification:
    def test_includes_grade(self):
        analysis = make_analysis()
        scores = make_scores()
        bullets = build_justification(analysis, None, "PSA 9", 45.0, 50.0, scores)
        assert any("PSA 9" in b for b in bullets)

    def test_price_at_target(self):
        analysis = make_analysis()
        scores = make_scores()
        bullets = build_justification(analysis, None, "PSA 9", 50.0, 50.0, scores)
        assert any("at or below" in b for b in bullets)

    def test_price_above_target(self):
        analysis = make_analysis()
        scores = make_scores()
        bullets = build_justification(analysis, None, "PSA 9", 60.0, 50.0, scores)
        assert any("above" in b for b in bullets)

    def test_manual_catalyst_included(self):
        analysis = make_analysis()
        scores = make_scores()
        player = {"manual_catalyst": "Potential HOF candidate in 2027"}
        bullets = build_justification(analysis, player, "PSA 9", 45.0, 50.0, scores)
        assert any("HOF" in b for b in bullets)

    def test_max_five_bullets(self):
        analysis = make_analysis(bounce_back=make_bounce_back())
        scores = make_scores()
        player = {"manual_catalyst": "Big catalyst here"}
        bullets = build_justification(analysis, player, "Raw", 40.0, 50.0, scores)
        assert len(bullets) <= 5


# ---------------------------------------------------------------------------
# build_card_target_warnings
# ---------------------------------------------------------------------------

class TestBuildCardTargetWarnings:
    def test_passes_through_trend_warnings(self):
        analysis = make_analysis(warnings=[make_warning("STALE_DATA")])
        scores = make_scores()
        result = build_card_target_warnings(analysis, None, 45.0, 50.0, scores)
        codes = [w["code"] for w in result]
        assert "STALE_DATA" in codes

    def test_price_above_target_warning(self):
        analysis = make_analysis(warnings=[])
        scores = make_scores()
        result = build_card_target_warnings(analysis, None, 60.0, 50.0, scores)
        codes = [w["code"] for w in result]
        assert "PRICE_ABOVE_TARGET" in codes

    def test_target_outside_range_warning(self):
        analysis = make_analysis(warnings=[])
        scores = make_scores()
        result = build_card_target_warnings(analysis, None, 5.0, 5.0, scores)
        codes = [w["code"] for w in result]
        assert "TARGET_OUTSIDE_RANGE" in codes

    def test_player_needs_review_warning(self):
        analysis = make_analysis(warnings=[])
        scores = make_scores(player=10.0)
        player = {"needs_review": True}
        result = build_card_target_warnings(analysis, player, 45.0, 50.0, scores)
        codes = [w["code"] for w in result]
        assert "PLAYER_NEEDS_REVIEW" in codes

    def test_low_player_score_warning(self):
        analysis = make_analysis(warnings=[])
        scores = make_scores(player=2.0)
        result = build_card_target_warnings(analysis, None, 45.0, 50.0, scores)
        codes = [w["code"] for w in result]
        assert "LOW_PLAYER_SCORE" in codes

    def test_no_duplicate_codes(self):
        analysis = make_analysis(warnings=[make_warning("STALE_DATA"), make_warning("STALE_DATA")])
        scores = make_scores()
        result = build_card_target_warnings(analysis, None, 45.0, 50.0, scores)
        codes = [w["code"] for w in result]
        assert len(codes) == len(set(codes))
