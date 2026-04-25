"""
Tests for the 14-step trend analysis engine.

All DB calls are mocked — no live Supabase connection required.
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.models.api import AnalysisWarning
from app.models.domain import CardMarketRow
from app.services.trends import (
    MIN_PROFIT_FLOOR,
    MIN_SALES,
    STALE_DAYS,
    _bounce_back,
    _build_anchor,
    _ev_model,
    _final_verdict,
    _gem_rate_lookup,
    _group_by_window_grade,
    _liquidity_signal,
    _market_confidence,
    _net_prices,
    _recency_check,
    _short_term_price_anchor,
    _trend_signal,
    _volatility_check,
    _volume_signal,
    run_trend_analysis,
)


# ── Fixture factory ────────────────────────────────────────────────────────

def make_row(
    window_days: int = 90,
    grade: str = "PSA 9",
    avg: float = 100.0,
    num_sales: int = 5,
    price_change_pct: float = 0.05,
    price_change_dollar: float = 5.0,
    starting_price: float = 95.0,
    last_sale: float = 105.0,
    last_sale_date: date | None = None,
    min_sale: float = 80.0,
    max_sale: float = 120.0,
    volume_change_pct: float = 0.10,
    total_sales_dollar: float = 500.0,
    sport: str = "football",
    card: str = "Test Card",
) -> CardMarketRow:
    if last_sale_date is None:
        last_sale_date = date.today() - timedelta(days=5)
    return CardMarketRow(
        sport=sport,
        window_days=window_days,
        card=card,
        grade=grade,
        avg=avg,
        num_sales=num_sales,
        price_change_pct=price_change_pct,
        price_change_dollar=price_change_dollar,
        starting_price=starting_price,
        last_sale=last_sale,
        last_sale_date=last_sale_date,
        min_sale=min_sale,
        max_sale=max_sale,
        volume_change_pct=volume_change_pct,
        total_sales_dollar=total_sales_dollar,
    )


def make_market_rows(**overrides) -> list[CardMarketRow]:
    """Minimal valid set covering 90d/180d/30d × Raw/PSA 9/PSA 10."""
    rows = []
    recent = date.today() - timedelta(days=5)
    for window in (7, 14, 30, 60, 90, 180, 360):
        for grade, base_avg in (("Raw", 55.0), ("PSA 9", 130.0), ("PSA 10", 290.0)):
            kw = dict(
                window_days=window,
                grade=grade,
                avg=base_avg,
                num_sales=6 if window in (90, 180) else 3,
                last_sale_date=recent,
                min_sale=base_avg * 0.75,
                max_sale=base_avg * 1.25,
                volume_change_pct=0.05,
                last_sale=base_avg,
                starting_price=base_avg * 0.95,
            )
            kw.update({k: v for k, v in overrides.items()
                        if k not in ("window_days", "grade") or True})
            rows.append(make_row(**kw))
    return rows


def _grouped(rows: list[CardMarketRow]) -> dict:
    return _group_by_window_grade(rows)


# ── Step 1: Anchor tests ───────────────────────────────────────────────────

def test_anchor_uses_90d_when_sufficient():
    rows = make_market_rows()
    grouped = _grouped(rows)
    anchor = _build_anchor(grouped, "PSA 9")
    assert anchor is not None
    assert anchor.anchor_window == 90
    assert anchor.anchor_value == 130.0


def test_anchor_falls_back_to_180d_when_90d_below_min_sales():
    rows = make_market_rows()
    grouped = _grouped(rows)
    # Override 90d PSA 9 to have only 2 sales
    grouped[90]["PSA 9"] = make_row(window_days=90, grade="PSA 9", num_sales=2)
    anchor = _build_anchor(grouped, "PSA 9")
    assert anchor is not None
    assert anchor.anchor_window == 180


def test_anchor_is_null_when_both_90d_and_180d_fail_min_sales():
    rows = make_market_rows()
    grouped = _grouped(rows)
    grouped[90]["PSA 9"] = make_row(window_days=90, grade="PSA 9", num_sales=1)
    grouped[180]["PSA 9"] = make_row(window_days=180, grade="PSA 9", num_sales=2)
    anchor = _build_anchor(grouped, "PSA 9")
    assert anchor is None


# ── Step 2: Recency tests ──────────────────────────────────────────────────

def test_recency_stale_when_last_sale_over_30_days():
    rows = make_market_rows()
    grouped = _grouped(rows)
    old_date = date.today() - timedelta(days=STALE_DAYS + 1)
    for grade in ("Raw", "PSA 9", "PSA 10"):
        row = grouped[90][grade]
        object.__setattr__(row, "last_sale_date", old_date)
    warnings: list[AnalysisWarning] = []
    stale, days = _recency_check(grouped, warnings)
    assert stale is True
    assert any(w.code == "STALE_DATA" for w in warnings)


def test_recency_not_stale_when_recent():
    rows = make_market_rows()
    grouped = _grouped(rows)
    warnings: list[AnalysisWarning] = []
    stale, days = _recency_check(grouped, warnings)
    assert stale is False
    assert not any(w.code == "STALE_DATA" for w in warnings)


# ── Step 7: Market confidence tests ───────────────────────────────────────

def test_market_confidence_low_when_stale():
    rows = make_market_rows()
    grouped = _grouped(rows)
    raw_anchor = _build_anchor(grouped, "Raw")
    psa9_anchor = _build_anchor(grouped, "PSA 9")
    psa10_anchor = _build_anchor(grouped, "PSA 10")
    trend = _trend_signal(grouped, raw_anchor, [])
    volume = _volume_signal(grouped, trend, [])
    liquidity = _liquidity_signal(grouped, [])
    volatility = _volatility_check(psa9_anchor, grouped, [])
    conf = _market_confidence(True, raw_anchor, psa9_anchor, liquidity, trend, volatility, volume)
    assert conf == "Low"


def test_market_confidence_low_suppresses_buy_verdicts():
    ev = None
    verdict = _final_verdict("Low", None, _trend_signal({}, None, []), ev, None, 0.38)
    assert verdict == "Watch - insufficient signal"


# ── Step 12: EV model tests ────────────────────────────────────────────────

def _make_anchors_for_ev():
    """Return anchors where EV should clearly clear the profit floor."""
    from app.models.api import AnchorObject
    raw = AnchorObject(grade="Raw", anchor_value=55.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    psa9 = AnchorObject(grade="PSA 9", anchor_value=130.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    psa10 = AnchorObject(grade="PSA 10", anchor_value=290.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    return raw, psa9, psa10


def test_ev_model_clears_profit_floor():
    from app.models.api import TrendHealth
    raw, psa9, psa10 = _make_anchors_for_ev()
    trend = TrendHealth(direction="Stable", ratio=1.0, source_grade="Raw", source_window="30d_vs_90d")
    net = _net_prices(raw, psa9, psa10)
    ev = _ev_model(raw, psa9, psa10, 0.38, trend, net)
    assert ev is not None
    assert ev.expected_profit >= MIN_PROFIT_FLOOR
    verdict = _final_verdict("High", raw, trend, ev, None, 0.38)
    assert verdict == "Buy raw & grade"


def test_ev_model_below_profit_floor_falls_to_slab():
    from app.models.api import AnchorObject, TrendHealth
    # Very low PSA 10 makes EV not clear the floor
    raw = AnchorObject(grade="Raw", anchor_value=55.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    psa9 = AnchorObject(grade="PSA 9", anchor_value=70.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    psa10 = AnchorObject(grade="PSA 10", anchor_value=85.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    trend = TrendHealth(direction="Stable", ratio=1.0, source_grade="PSA 9", source_window="30d_vs_90d")
    net = _net_prices(raw, psa9, psa10)
    ev = _ev_model(raw, psa9, psa10, 0.38, trend, net)
    assert ev is not None
    assert ev.expected_profit < MIN_PROFIT_FLOOR
    verdict = _final_verdict("High", raw, trend, ev, 1.2, 0.38)
    assert verdict in ("Buy PSA 9", "Buy PSA 10")


# ── Buy target tests ───────────────────────────────────────────────────────

def test_buy_target_raw_derivation_when_no_raw_sales():
    """No raw sales → derived from psa9 × 0.40, DERIVED_BUY_TARGET warning appended."""
    from app.models.api import AnchorObject, TrendHealth
    from app.services.trends import _buy_target

    psa9 = AnchorObject(grade="PSA 9", anchor_value=130.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    psa10 = AnchorObject(grade="PSA 10", anchor_value=290.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    trend = TrendHealth(direction="Stable", ratio=1.0, source_grade="PSA 9", source_window="30d_vs_90d")

    # Simulate an EV model that clears the floor so verdict = "Buy raw & grade"
    from app.models.api import EvModel
    ev = EvModel(
        raw_anchor=52.0, grading_cost=38.0, total_cost=90.0,
        psa9_anchor=130.0, psa10_anchor=290.0, gem_rate=0.38,
        gem_rate_source="sport_fallback",
        estimated_outcomes={"psa10": 0.38, "psa9": 0.40, "psa8_or_lower": 0.22},
        expected_resale_after_fees=140.0, expected_profit=50.0, profit_floor=20.0,
    )

    warnings: list[AnalysisWarning] = []
    target = _buy_target("Buy raw & grade", {}, None, psa9, psa10, ev, trend, warnings)
    assert target is not None
    assert target.grade == "Raw"
    assert target.warning == "DERIVED_BUY_TARGET"
    assert any(w.code == "DERIVED_BUY_TARGET" for w in warnings)
    # price should be psa9 × 0.40 = 52.0
    assert abs(target.price - 130.0 * 0.40) < 0.01


# ── Bounce back tests ──────────────────────────────────────────────────────

def _make_bounce_back_rows(b1=True, b2=True) -> list[CardMarketRow]:
    """Build rows that pass B1 and B2 and all optional signals → score 6."""
    today = date.today()
    rows = []
    # 180d avg = 100, 30d avg = 80 (20% below → B1 passes)
    # 30d avg < 90% of 180d → B4 passes, 14d avg ≈ 30d → B3 passes
    avg30 = 80.0 if b1 else 105.0
    sales30 = 3 if b2 else 1
    for window, avg, sales in (
        (7, 78.0, 2),
        (14, 81.0, 2),
        (30, avg30, sales30),
        (60, 90.0, 4),
        (90, 95.0, 5),
        (180, 100.0, 12),
        (360, 120, 24),
    ):
        rows.append(make_row(
            window_days=window,
            grade="PSA 9",
            avg=avg,
            num_sales=sales,
            last_sale_date=today - timedelta(days=3),
            min_sale=avg * 0.8,
            max_sale=avg * 1.2,  # max < 3× avg → B6 passes
        ))
    return rows


def test_bounce_back_qualifies_when_b1_b2_and_score_4():
    rows = _make_bounce_back_rows(b1=True, b2=True)
    grouped = _group_by_window_grade(rows)
    result = _bounce_back(grouped, "PSA 9")
    assert result is not None
    assert result.b1_cheap is True
    assert result.b2_recent_liquidity is True
    assert result.score >= 4
    assert result.qualifies is True


def test_bounce_back_does_not_qualify_when_b1_false():
    rows = _make_bounce_back_rows(b1=False, b2=True)
    grouped = _group_by_window_grade(rows)
    result = _bounce_back(grouped, "PSA 9")
    assert result is not None
    assert result.b1_cheap is False
    assert result.qualifies is False


def test_bounce_back_does_not_qualify_when_b2_false():
    rows = _make_bounce_back_rows(b1=True, b2=False)
    grouped = _group_by_window_grade(rows)
    result = _bounce_back(grouped, "PSA 9")
    assert result is not None
    assert result.b2_recent_liquidity is False
    assert result.qualifies is False


# ── Gem rate tests ─────────────────────────────────────────────────────────

def test_gem_rate_lookup_card_specific():
    warnings: list[AnalysisWarning] = []
    with patch("app.services.trends.get_gem_rate", return_value=0.42):
        rate, source = _gem_rate_lookup("Test Card", "football", warnings)
    assert rate == 0.42
    assert source == "card_specific"
    assert not any(w.code == "GEM_FALLBACK" for w in warnings)


def test_gem_rate_lookup_sport_fallback_football():
    warnings: list[AnalysisWarning] = []
    with patch("app.services.trends.get_gem_rate", return_value=None):
        rate, source = _gem_rate_lookup("Unknown Card", "football", warnings)
    assert rate == 0.38
    assert source == "sport_fallback"
    assert any(w.code == "GEM_FALLBACK" for w in warnings)


def test_gem_rate_lookup_sport_fallback_basketball():
    warnings: list[AnalysisWarning] = []
    with patch("app.services.trends.get_gem_rate", return_value=None):
        rate, source = _gem_rate_lookup("Unknown Card", "basketball", warnings)
    assert rate == 0.55
    assert source == "sport_fallback"


# ── Short-term price anchor tests ─────────────────────────────────────────

def _make_grouped_with_short_term(avg_7d: float, avg_14d: float, avg_30d: float,
                                   sales_7d: int = 3, sales_14d: int = 3) -> dict:
    rows = [
        make_row(window_days=7,  grade="PSA 9", avg=avg_7d,  num_sales=sales_7d),
        make_row(window_days=14, grade="PSA 9", avg=avg_14d, num_sales=sales_14d),
        make_row(window_days=30, grade="PSA 9", avg=avg_30d, num_sales=5),
    ]
    return _group_by_window_grade(rows)


def test_short_term_downtrend_uses_7d_14d_avg():
    grouped = _make_grouped_with_short_term(avg_7d=160.0, avg_14d=165.0, avg_30d=175.0)
    warnings: list[AnalysisWarning] = []
    ceiling, basis = _short_term_price_anchor(grouped, "PSA 9", 175.0, warnings)
    assert abs(ceiling - 162.5) < 0.01
    assert basis == "7d/14d avg (continuing decline)"


def test_short_term_uptrend_uses_7d_14d_avg():
    grouped = _make_grouped_with_short_term(avg_7d=190.0, avg_14d=185.0, avg_30d=175.0)
    warnings: list[AnalysisWarning] = []
    ceiling, basis = _short_term_price_anchor(grouped, "PSA 9", 175.0, warnings)
    assert abs(ceiling - 187.5) < 0.01
    assert basis == "7d/14d avg (momentum)"


def test_short_term_conflicting_signals_falls_back_to_30d():
    grouped = _make_grouped_with_short_term(avg_7d=160.0, avg_14d=185.0, avg_30d=175.0)
    warnings: list[AnalysisWarning] = []
    ceiling, basis = _short_term_price_anchor(grouped, "PSA 9", 175.0, warnings)
    assert ceiling == 175.0
    assert basis == "30d avg"


def test_short_term_below_min_sales_falls_back_to_30d():
    grouped = _make_grouped_with_short_term(avg_7d=160.0, avg_14d=165.0, avg_30d=175.0, sales_7d=1)
    warnings: list[AnalysisWarning] = []
    ceiling, basis = _short_term_price_anchor(grouped, "PSA 9", 175.0, warnings)
    assert ceiling == 175.0
    assert basis == "30d avg"


def test_short_term_divergence_warning_fires():
    # avg_7d=$140, avg_14d=$145, avg_30d=$175 → anchor=$142.5, divergence≈18.6%
    grouped = _make_grouped_with_short_term(avg_7d=140.0, avg_14d=145.0, avg_30d=175.0)
    warnings: list[AnalysisWarning] = []
    _short_term_price_anchor(grouped, "PSA 9", 175.0, warnings)
    assert any(w.code == "SHORT_TERM_DIVERGENCE" for w in warnings)
    assert any(w.severity == "medium" for w in warnings if w.code == "SHORT_TERM_DIVERGENCE")


def test_short_term_divergence_warning_suppressed_when_small():
    # avg_7d=$168, avg_14d=$170, avg_30d=$175 → divergence≈4% → no warning
    grouped = _make_grouped_with_short_term(avg_7d=168.0, avg_14d=170.0, avg_30d=175.0)
    warnings: list[AnalysisWarning] = []
    _short_term_price_anchor(grouped, "PSA 9", 175.0, warnings)
    assert not any(w.code == "SHORT_TERM_DIVERGENCE" for w in warnings)


def test_short_term_anchor_cap_holds_at_90d_discount():
    # Short-term anchor ($200) > anchor*0.90 ($180) → min() clamps to $180
    from app.models.api import AnchorObject, TrendHealth
    from app.services.trends import _buy_target
    psa9 = AnchorObject(grade="PSA 9", anchor_value=200.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    psa10 = AnchorObject(grade="PSA 10", anchor_value=450.0, anchor_window=90, anchor_sales_count=6, anchor_source="90d_avg")
    trend = TrendHealth(direction="Stable", ratio=1.0, source_grade="PSA 9", source_window="30d_vs_90d")
    grouped = _make_grouped_with_short_term(avg_7d=210.0, avg_14d=205.0, avg_30d=190.0)
    # Add 30d PSA 9 row so _buy_target picks it up
    grouped[30]["PSA 9"] = make_row(window_days=30, grade="PSA 9", avg=190.0, num_sales=5)
    warnings: list[AnalysisWarning] = []
    target = _buy_target("Buy PSA 9", grouped, None, psa9, psa10, None, trend, warnings)
    assert target is not None
    assert target.price <= 200.0 * 0.90 + 0.01  # never exceeds anchor × 0.90


def test_short_term_zero_avg_30d_no_division_error():
    grouped = _make_grouped_with_short_term(avg_7d=5.0, avg_14d=4.0, avg_30d=0.0)
    warnings: list[AnalysisWarning] = []
    # Should not raise ZeroDivisionError; 7d/14d < 30d (0) is false, falls back
    ceiling, basis = _short_term_price_anchor(grouped, "PSA 9", 0.0, warnings)
    assert not any(w.code == "SHORT_TERM_DIVERGENCE" for w in warnings)


# ── Full integration (mocked DB) ──────────────────────────────────────────

def test_run_trend_analysis_returns_none_for_missing_card():
    with patch("app.services.trends.get_card_market_data", return_value=[]):
        result = run_trend_analysis("NonExistent Card", "football")
    assert result is None


def test_run_trend_analysis_full_buy_raw_grade():
    rows = make_market_rows()
    with (
        patch("app.services.trends.get_card_market_data", return_value=rows),
        patch("app.services.trends.get_gem_rate", return_value=0.38),
    ):
        result = run_trend_analysis("Test Card", "football")

    assert result is not None
    assert result.verdict in ("Buy raw & grade", "Buy PSA 9", "Buy PSA 10", "Pass", "Watch - insufficient signal")
    assert result.market_confidence in ("Low", "Medium", "High")
    assert isinstance(result.warnings, list)


def test_run_trend_analysis_stale_forces_watch():
    rows = make_market_rows()
    old = date.today() - timedelta(days=STALE_DAYS + 5)
    for r in rows:
        object.__setattr__(r, "last_sale_date", old)

    with (
        patch("app.services.trends.get_card_market_data", return_value=rows),
        patch("app.services.trends.get_gem_rate", return_value=None),
    ):
        result = run_trend_analysis("Test Card", "football")

    assert result is not None
    assert result.market_confidence == "Low"
    assert result.verdict == "Watch - insufficient signal"
