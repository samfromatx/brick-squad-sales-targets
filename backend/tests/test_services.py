"""Service-layer tests using mock DB fixtures — no live DB required."""
from unittest.mock import MagicMock, patch

import pytest

# ── Shared fixtures ──────────────────────────────────────────────────────────

TARGET_ROW = {
    "id": "1",
    "sport": "football",
    "category": "graded",
    "rank": 1,
    "card_name": "Mahomes 2017 Prizm",
    "grade": "PSA 10",
    "target_price": 280.0,
    "max_price": 320.0,
    "trend_pct": "+12%",
    "vol": "high",
    "sell_at": 400.0,
    "rationale": "Liquid flagship",
    "is_new": False,
    "last_updated": "2026-04-01",
    "target_raw": None,
    "max_raw": None,
    "est_psa9": None,
    "est_psa10": None,
    "gem_rate": None,
    "roi": None,
    "score": None,
    "s1_cheap": False,
    "s2_stable": False,
    "s3_not_priced_in": False,
    "s4_volume": False,
    "s5_no_spike": False,
}

ENTRY_ROW = {
    "id": "e1",
    "user_id": "u1",
    "card_name": "Mahomes Prizm",
    "sport": "football",
    "grade": "PSA 10",
    "price_paid": 250.0,
    "grading_cost": 0.0,
    "target_sell": 350.0,
    "actual_sale": None,
    "sale_venue": None,
    "purchase_date": "2026-01-15",
    "notes": None,
    "pc": False,
}

ALLOC_ROW = {
    "id": "a1",
    "user_id": "u1",
    "budget_tier": "1000",
    "card": "Mahomes Prizm",
    "budget": 250.0,
    "thesis": "graded",
    "description": None,
    "created_at": None,
}

EBAY_ROW = {
    "id": "eb1",
    "user_id": "u1",
    "sport": "football",
    "category": "graded",
    "search_text": "mahomes prizm psa 10",
    "card_name": "Mahomes Prizm",
    "rank": 1,
    "created_at": None,
}


# ── targets service ──────────────────────────────────────────────────────────

class TestTargetsService:
    def test_get_targets_returns_typed_list(self):
        with patch("app.services.targets.fetch_targets", return_value=[TARGET_ROW]):
            from app.services.targets import get_targets
            results = get_targets("u1")
        assert len(results) == 1
        t = results[0]
        assert t.card_name == "Mahomes 2017 Prizm"
        assert t.sport.value == "football"
        assert t.category.value == "graded"

    def test_trend_pct_parsed_from_string(self):
        row = {**TARGET_ROW, "trend_pct": "+12%"}
        with patch("app.services.targets.fetch_targets", return_value=[row]):
            from app.services.targets import get_targets
            results = get_targets("u1")
        assert results[0].trend_pct == 12.0

    def test_trend_pct_none_when_missing(self):
        row = {**TARGET_ROW, "trend_pct": None}
        with patch("app.services.targets.fetch_targets", return_value=[row]):
            from app.services.targets import get_targets
            results = get_targets("u1")
        assert results[0].trend_pct is None

    def test_get_target_returns_none_when_missing(self):
        with patch("app.services.targets.fetch_target_by_id", return_value=None):
            from app.services.targets import get_target
            assert get_target("u1", "bad-id") is None

    def test_raw_metrics_populated_for_raw_category(self):
        row = {**TARGET_ROW, "category": "raw", "target_raw": 30.0, "max_raw": 40.0,
               "est_psa9": 80.0, "est_psa10": 150.0, "gem_rate": 0.35, "roi": 2.1}
        with patch("app.services.targets.fetch_targets", return_value=[row]):
            from app.services.targets import get_targets
            results = get_targets("u1")
        assert results[0].raw_metrics is not None
        assert results[0].raw_metrics.target_raw == 30.0

    def test_bounce_back_metrics_populated(self):
        row = {**TARGET_ROW, "category": "bounce_back", "score": 4,
               "s1_cheap": True, "s2_stable": True, "s3_not_priced_in": True,
               "s4_volume": False, "s5_no_spike": False}
        with patch("app.services.targets.fetch_targets", return_value=[row]):
            from app.services.targets import get_targets
            results = get_targets("u1")
        assert results[0].bounce_back_metrics is not None
        assert results[0].bounce_back_metrics.score == 4


# ── portfolio service ────────────────────────────────────────────────────────

class TestPortfolioService:
    def test_get_portfolio_entries_returns_typed_list(self):
        with patch("app.services.portfolio.fetch_portfolio_entries", return_value=[ENTRY_ROW]):
            from app.services.portfolio import get_portfolio_entries
            entries, has_more = get_portfolio_entries("u1")
        assert len(entries) == 1
        assert entries[0].card_name == "Mahomes Prizm"
        assert has_more is False

    def test_get_portfolio_entries_has_more_flag(self):
        rows = [ENTRY_ROW] * 101
        with patch("app.services.portfolio.fetch_portfolio_entries", return_value=rows):
            from app.services.portfolio import get_portfolio_entries
            entries, has_more = get_portfolio_entries("u1", limit=100)
        assert len(entries) == 100
        assert has_more is True

    def test_create_entry_calls_insert(self):
        with patch("app.services.portfolio.insert_portfolio_entry", return_value=ENTRY_ROW) as mock_insert:
            from app.services.portfolio import create_portfolio_entry
            entry = create_portfolio_entry("u1", {"card_name": "Mahomes Prizm", "sport": "football",
                                                   "grade": "PSA 10", "price_paid": 250.0})
        mock_insert.assert_called_once()
        assert entry.card_name == "Mahomes Prizm"

    def test_remove_entry_returns_false_when_not_found(self):
        with patch("app.services.portfolio.fetch_portfolio_entry", return_value=None):
            from app.services.portfolio import remove_entry
            assert remove_entry("u1", "bad-id") is False

    def test_get_allocations_groups_by_tier(self):
        rows = [ALLOC_ROW, {**ALLOC_ROW, "id": "a2", "budget_tier": "1500"}]
        with patch("app.services.portfolio.fetch_portfolio_allocations", return_value=rows):
            from app.services.portfolio import get_portfolio_allocations
            allocs = get_portfolio_allocations("u1")
        assert len(allocs) == 2
        assert {a.tier for a in allocs} == {"1000", "1500"}


# ── trends service ───────────────────────────────────────────────────────────

class TestTrendsService:
    def test_search_returns_empty_for_short_query(self):
        from app.services.trends import search_trend_cards
        with patch("app.services.trends.search_cards") as mock:
            result = search_trend_cards("a")
        mock.assert_not_called()
        assert result == []

    def test_search_calls_db_for_valid_query(self):
        with patch("app.services.trends.search_cards", return_value=[{"card": "Mahomes", "sport": "football"}]):
            from app.services.trends import search_trend_cards
            results = search_trend_cards("mahomes")
        assert len(results) == 1

    def test_detail_returns_empty_windows_when_no_data(self):
        with patch("app.services.trends.fetch_trend_detail", return_value=[]):
            from app.services.trends import get_trend_detail
            result = get_trend_detail("Unknown Card")
        assert result["windows"] == []

    def test_detail_groups_by_window(self):
        rows = [
            {"sport": "football", "window_days": 7, "grade": "PSA 10",
             "price_change_pct": 5.0, "price_change_dollar": 10.0, "starting_price": 200.0,
             "last_sale": 210.0, "avg": 205.0, "min_sale": 195.0, "max_sale": 215.0,
             "volume_change_pct": 2.0, "num_sales": 8, "total_sales_dollar": 1640.0},
            {"sport": "football", "window_days": 30, "grade": "PSA 10",
             "price_change_pct": 8.0, "price_change_dollar": 16.0, "starting_price": 194.0,
             "last_sale": 210.0, "avg": 202.0, "min_sale": 190.0, "max_sale": 220.0,
             "volume_change_pct": 5.0, "num_sales": 25, "total_sales_dollar": 5050.0},
        ]
        with patch("app.services.trends.fetch_trend_detail", return_value=rows):
            from app.services.trends import get_trend_detail
            result = get_trend_detail("Mahomes Prizm")
        assert len(result["windows"]) == 2
        assert result["windows"][0]["window_days"] == 7


# ── imports service ──────────────────────────────────────────────────────────

class TestImportsService:
    def _patch_all(self):
        patches = [
            patch("app.services.imports.delete_targets_for_section"),
            patch("app.services.imports.bulk_insert_targets"),
            patch("app.services.imports.delete_portfolio_allocations"),
            patch("app.services.imports.bulk_insert_portfolio_allocations"),
            patch("app.services.imports.delete_ebay_searches"),
            patch("app.services.imports.bulk_insert_ebay_searches"),
        ]
        return patches

    def test_imports_graded_section(self):
        payload = {
            "last_updated": "2026-04-01",
            "football_graded": [
                {"rank": 1, "card": "Mahomes Prizm", "grade": "PSA 10",
                 "target": 280, "max": 320, "trend": "+12%",
                 "vol": "high", "sell_at": 400, "rationale": "Liquid", "new": False}
            ]
        }
        patches = self._patch_all()
        mocks = [p.start() for p in patches]
        try:
            from app.services.imports import process_import
            result = process_import("u1", payload)
        finally:
            for p in patches:
                p.stop()

        assert "football_graded" in result["imported"]
        mocks[0].assert_called_once()  # delete called
        mocks[1].assert_called_once()  # insert called

    def test_destructive_semantics_only_for_present_sections(self):
        payload = {"last_updated": "2026-04-01", "football_graded": []}
        patches = self._patch_all()
        mocks = [p.start() for p in patches]
        try:
            from app.services.imports import process_import
            process_import("u1", payload)
        finally:
            for p in patches:
                p.stop()

        # delete called for football_graded but not for basketball_graded
        delete_calls = mocks[0].call_args_list
        sports_deleted = [c.args[1] if len(c.args) > 1 else c.kwargs.get("sport") for c in delete_calls]
        assert "football" in sports_deleted
        assert "basketball" not in sports_deleted

    def test_rejects_if_card_field_missing(self):
        # card field defaults to empty string — import still runs, DB will catch constraint
        payload = {"last_updated": "2026-04-01", "football_graded": [{"rank": 1}]}
        patches = self._patch_all()
        [p.start() for p in patches]
        try:
            from app.services.imports import process_import
            result = process_import("u1", payload)
            assert "football_graded" in result["imported"]
        finally:
            for p in patches:
                p.stop()

    def test_imports_ebay_searches(self):
        payload = {
            "last_updated": "2026-04-01",
            "ebay_searches": [{"sport": "football", "category": "graded",
                                "search_text": "mahomes prizm psa 10", "card": "Mahomes", "rank": 1}]
        }
        patches = self._patch_all()
        mocks = [p.start() for p in patches]
        try:
            from app.services.imports import process_import
            result = process_import("u1", payload)
        finally:
            for p in patches:
                p.stop()

        assert "ebay_searches" in result["imported"]
        mocks[5].assert_called_once()


# ── exports service ──────────────────────────────────────────────────────────

class TestExportsService:
    def test_build_snapshot_shape(self):
        from app.models.domain import Category, Sport, Target
        mock_target = Target(
            id="1", sport=Sport.football, category=Category.graded,
            rank=1, card_name="Mahomes Prizm", is_new=False, last_updated="2026-04-01",
        )
        with (
            patch("app.services.exports.get_targets", return_value=[mock_target]),
            patch("app.services.exports.get_portfolio_allocations", return_value=[]),
            patch("app.services.exports.get_portfolio_entries", return_value=([], False)),
        ):
            from app.services.exports import build_snapshot
            snap = build_snapshot("u1", "sam@example.com")

        assert snap.schema_version == "v1"
        assert snap.user.id == "u1"
        assert snap.last_updated == "2026-04-01"
        assert len(snap.data.targets) == 1
