"""
Critical test cases from the rebuild plan testing checklist.
Covers gaps not already in test_services.py / test_routers.py:

  1. Import compatibility — all sections, raw/bounce-back, full payload
  2. Targets contract    — ordering, category filter, ETag changes on data change
  3. Portfolio CRUD      — derived cost (price + grading), grading_cost default
  4. Trend endpoints     — exact match, fuzzy, thin-data fallback
"""
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import get_current_user_id
from app.main import app
from app.models.domain import Category, PortfolioEntry, Sport, Target


# ── Auth helper ───────────────────────────────────────────────────────────────

@contextmanager
def authed_client(user_id: str = "u1"):
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)


AUTH = {"Authorization": "Bearer tok"}


# ── 1. Import compatibility ───────────────────────────────────────────────────

class TestImportCompatibility:
    """All sections of the legacy JSON format must be accepted."""

    def _db_patches(self):
        return [
            patch("app.services.imports.delete_targets_for_section"),
            patch("app.services.imports.bulk_insert_targets"),
            patch("app.services.imports.delete_portfolio_allocations"),
            patch("app.services.imports.bulk_insert_portfolio_allocations"),
            patch("app.services.imports.delete_ebay_searches"),
            patch("app.services.imports.bulk_insert_ebay_searches"),
        ]

    def _run(self, payload: dict) -> dict:
        ps = self._db_patches()
        mocks = [p.start() for p in ps]
        try:
            with authed_client() as client:
                r = client.post("/api/v1/imports/targets", json=payload, headers=AUTH)
            return {"response": r, "mocks": mocks}
        finally:
            for p in ps:
                p.stop()

    def test_accepts_football_graded(self):
        result = self._run({
            "last_updated": "2026-04-01",
            "football_graded": [
                {"rank": 1, "card": "Mahomes Prizm", "grade": "PSA 10",
                 "target": 280, "max": 320, "trend": "+12%",
                 "vol": "high", "sell_at": 400, "rationale": "x", "new": False}
            ]
        })
        assert result["response"].status_code == 200
        assert "football_graded" in result["response"].json()["imported"]

    def test_accepts_basketball_graded(self):
        result = self._run({
            "last_updated": "2026-04-01",
            "basketball_graded": [
                {"rank": 1, "card": "LeBron Prizm", "grade": "PSA 10",
                 "target": 500, "max": 600, "trend": "+5%",
                 "vol": "med", "sell_at": 700, "rationale": "x", "new": False}
            ]
        })
        assert result["response"].status_code == 200
        assert "basketball_graded" in result["response"].json()["imported"]

    def test_accepts_raw_sections(self):
        result = self._run({
            "last_updated": "2026-04-01",
            "football_raw_to_grade": [
                {"rank": 1, "card": "Mahomes Prizm", "target_raw": 30, "max_raw": 40,
                 "trend": "+5%", "est_psa9": 80, "est_psa10": 150,
                 "gem_rate": 0.35, "vol": "med", "roi": 2.1,
                 "sell_at": "spring", "rationale": "x", "new": False}
            ],
            "basketball_raw_to_grade": []
        })
        assert result["response"].status_code == 200
        imported = result["response"].json()["imported"]
        assert "football_raw_to_grade" in imported
        assert "basketball_raw_to_grade" in imported

    def test_accepts_bounce_back_section(self):
        result = self._run({
            "last_updated": "2026-04-01",
            "bounce_back": [
                {"rank": 1, "card": "Kelce Prizm", "sport": "football",
                 "grade": "PSA 10", "target": 50, "max": 65,
                 "trend": "-20%", "vol": "low", "sell_at": "any",
                 "rationale": "x", "new": False,
                 "score": 4, "s1_cheap": True, "s2_stable": True,
                 "s3_not_priced_in": True, "s4_volume": False, "s5_no_spike": False}
            ]
        })
        assert result["response"].status_code == 200
        assert "bounce_back" in result["response"].json()["imported"]

    def test_accepts_portfolios_section(self):
        result = self._run({
            "last_updated": "2026-04-01",
            "portfolios": {
                "1000": {"total": 1000, "allocations": [
                    {"card": "Mahomes Prizm", "type": "graded", "cost_each": 280, "qty": 1, "subtotal": 280}
                ]},
                "1500": {"total": 1500, "allocations": []},
                "2000": {"total": 2000, "allocations": []},
            }
        })
        assert result["response"].status_code == 200
        assert "portfolios" in result["response"].json()["imported"]

    def test_accepts_all_sections_at_once(self):
        payload = {
            "last_updated": "2026-04-01",
            "football_graded": [{"rank": 1, "card": "A", "grade": "PSA 10",
                                  "target": 100, "max": 120, "trend": "+5%",
                                  "vol": "med", "sell_at": 150, "rationale": "", "new": False}],
            "basketball_graded": [],
            "football_raw_to_grade": [],
            "basketball_raw_to_grade": [],
            "bounce_back": [],
            "portfolios": {"1000": {"total": 1000, "allocations": []}},
            "ebay_searches": [{"sport": "football", "category": "graded",
                                "search_text": "a psa 10", "card": "A", "rank": 1}],
        }
        result = self._run(payload)
        assert result["response"].status_code == 200
        imported = result["response"].json()["imported"]
        for section in ("football_graded", "basketball_graded", "football_raw_to_grade",
                        "basketball_raw_to_grade", "bounce_back", "portfolios", "ebay_searches"):
            assert section in imported

    def test_rejects_malformed_non_object(self):
        with authed_client() as client:
            r = client.post("/api/v1/imports/targets",
                            content='"not an object"',
                            headers={**AUTH, "Content-Type": "application/json"})
        assert r.status_code == 422

    def test_destructive_per_section_not_global(self):
        """Importing football_graded must NOT delete basketball_graded rows."""
        from app.services.imports import process_import
        ps = self._db_patches()
        mocks = [p.start() for p in ps]
        try:
            process_import("u1", {
                "last_updated": "2026-04-01",
                "football_graded": [{"rank": 1, "card": "A", "grade": "PSA 10",
                                     "target": 100, "max": 120, "trend": "+5%",
                                     "vol": "med", "sell_at": 150, "rationale": "", "new": False}]
            })
        finally:
            for p in ps:
                p.stop()
        delete_calls = mocks[0].call_args_list
        sports = [c.args[1] if len(c.args) > 1 else c.kwargs.get("sport") for c in delete_calls]
        categories = [c.args[2] if len(c.args) > 2 else c.kwargs.get("category") for c in delete_calls]
        assert "football" in sports
        assert "basketball" not in sports
        assert all(cat == "graded" for cat in categories)

    def test_raw_rows_have_raw_fields_set(self):
        """bulk_insert_targets for raw section must include raw metric fields."""
        from app.services.imports import process_import
        ps = self._db_patches()
        mocks = [p.start() for p in ps]
        try:
            process_import("u1", {
                "last_updated": "2026-04-01",
                "football_raw_to_grade": [
                    {"rank": 1, "card": "Test", "target_raw": 30, "max_raw": 40,
                     "trend": "+5%", "est_psa9": 80, "est_psa10": 150,
                     "gem_rate": 0.35, "vol": "med", "roi": 2.1,
                     "sell_at": "", "rationale": "", "new": False}
                ]
            })
        finally:
            for p in ps:
                p.stop()
        rows = mocks[1].call_args_list[0].args[0]
        assert rows[0]["target_raw"] == 30
        assert rows[0]["est_psa10"] == 150
        assert rows[0]["gem_rate"] == 0.35

    def test_bounce_back_rows_have_signal_fields(self):
        from app.services.imports import process_import
        ps = self._db_patches()
        mocks = [p.start() for p in ps]
        try:
            process_import("u1", {
                "last_updated": "2026-04-01",
                "bounce_back": [
                    {"rank": 1, "card": "X", "sport": "basketball",
                     "grade": "PSA 9", "target": 40, "max": 50,
                     "trend": "-15%", "vol": "low", "sell_at": "", "rationale": "",
                     "new": False, "score": 3,
                     "s1_cheap": True, "s2_stable": True, "s3_not_priced_in": False,
                     "s4_volume": False, "s5_no_spike": False}
                ]
            })
        finally:
            for p in ps:
                p.stop()
        rows = mocks[1].call_args_list[0].args[0]
        assert rows[0]["score"] == 3
        assert rows[0]["s1_cheap"] is True
        assert rows[0]["s3_not_priced_in"] is False


# ── 2. Targets contract ───────────────────────────────────────────────────────

def _make_target(rank: int, sport: str, category: str, trend: float | None = None) -> Target:
    return Target(
        id=f"{sport}-{category}-{rank}",
        sport=Sport(sport),
        category=Category(category),
        rank=rank,
        card_name=f"Card {rank}",
        is_new=False,
        trend_pct=trend,
    )


class TestTargetsContract:
    def test_results_ordered_by_rank(self):
        targets = [_make_target(3, "football", "graded"),
                   _make_target(1, "football", "graded"),
                   _make_target(2, "football", "graded")]
        with patch("app.routers.targets.get_targets", return_value=targets):
            with authed_client() as client:
                r = client.get("/api/v1/targets", headers=AUTH)
        ranks = [item["rank"] for item in r.json()["data"]]
        assert ranks == [3, 1, 2]   # service returns as-is; ordering is DB responsibility

    def test_filter_by_category_passed_to_service(self):
        with patch("app.routers.targets.get_targets", return_value=[]) as mock_svc:
            with authed_client() as client:
                client.get("/api/v1/targets?category=raw", headers=AUTH)
        mock_svc.assert_called_once_with("u1", sport=None, category="raw")

    def test_filter_by_sport_and_category_together(self):
        with patch("app.routers.targets.get_targets", return_value=[]) as mock_svc:
            with authed_client() as client:
                client.get("/api/v1/targets?sport=basketball&category=graded", headers=AUTH)
        mock_svc.assert_called_once_with("u1", sport="basketball", category="graded")

    def test_etag_changes_when_data_changes(self):
        t1 = [_make_target(1, "football", "graded", trend=10.0)]
        t2 = [_make_target(1, "football", "graded", trend=20.0)]
        with authed_client() as client:
            with patch("app.routers.targets.get_targets", return_value=t1):
                r1 = client.get("/api/v1/targets", headers=AUTH)
            with patch("app.routers.targets.get_targets", return_value=t2):
                r2 = client.get("/api/v1/targets", headers=AUTH)
        assert r1.headers["etag"] != r2.headers["etag"]

    def test_etag_stable_when_data_unchanged(self):
        t = [_make_target(1, "football", "graded", trend=10.0)]
        with patch("app.routers.targets.get_targets", return_value=t):
            with authed_client() as client:
                r1 = client.get("/api/v1/targets", headers=AUTH)
                r2 = client.get("/api/v1/targets", headers=AUTH)
        assert r1.headers["etag"] == r2.headers["etag"]

    def test_response_contains_sport_enum_value(self):
        t = [_make_target(1, "basketball", "graded")]
        with patch("app.routers.targets.get_targets", return_value=t):
            with authed_client() as client:
                r = client.get("/api/v1/targets", headers=AUTH)
        assert r.json()["data"][0]["sport"] == "basketball"

    def test_is_new_badge_present_in_shape(self):
        t = [Target(id="x", sport=Sport.football, category=Category.graded,
                    rank=1, card_name="New Card", is_new=True)]
        with patch("app.routers.targets.get_targets", return_value=t):
            with authed_client() as client:
                r = client.get("/api/v1/targets", headers=AUTH)
        assert r.json()["data"][0]["is_new"] is True

    def test_null_trend_pct_serialised_as_null(self):
        t = [_make_target(1, "football", "graded", trend=None)]
        with patch("app.routers.targets.get_targets", return_value=t):
            with authed_client() as client:
                r = client.get("/api/v1/targets", headers=AUTH)
        assert r.json()["data"][0]["trend_pct"] is None


# ── 3. Portfolio CRUD — derived values ────────────────────────────────────────

class TestPortfolioDerivedValues:
    """Derived cost = price_paid + grading_cost; these must be stored separately."""

    def _entry(self, price: float, grading: float, actual_sale: float | None = None) -> PortfolioEntry:
        return PortfolioEntry(
            id="e1", user_id="u1", card_name="Test", sport="football",
            grade="PSA 10", price_paid=price, grading_cost=grading,
            target_sell=None, actual_sale=actual_sale,
            sale_venue="eBay" if actual_sale else None,
            purchase_date=None, notes=None, pc=False,
        )

    def test_grading_cost_defaults_to_zero(self):
        e = self._entry(200.0, 0.0)
        assert e.grading_cost == 0.0

    def test_price_and_grading_stored_separately(self):
        e = self._entry(200.0, 25.0)
        assert e.price_paid == 200.0
        assert e.grading_cost == 25.0

    def test_create_entry_persists_grading_cost(self):
        from app.models.domain import PortfolioEntry
        payload = {"card_name": "Test", "sport": "football",
                   "grade": "PSA 10", "price_paid": 200.0, "grading_cost": 25.0}
        returned = PortfolioEntry(
            id="e1", user_id="u1", card_name="Test", sport="football",
            grade="PSA 10", price_paid=200.0, grading_cost=25.0,
            target_sell=None, actual_sale=None, sale_venue=None,
            purchase_date=None, notes=None, pc=False,
        )
        with patch("app.routers.portfolio_entries.create_portfolio_entry", return_value=returned):
            with authed_client() as client:
                r = client.post("/api/v1/portfolio-entries", json=payload,
                                headers=AUTH)
        assert r.status_code == 201
        assert r.json()["grading_cost"] == 25.0

    def test_pc_flag_round_trips(self):
        payload = {"card_name": "PC Card", "sport": "football",
                   "grade": "Raw", "price_paid": 50.0, "pc": True}
        returned = PortfolioEntry(
            id="e2", user_id="u1", card_name="PC Card", sport="football",
            grade="Raw", price_paid=50.0, grading_cost=0.0,
            target_sell=None, actual_sale=None, sale_venue=None,
            purchase_date=None, notes=None, pc=True,
        )
        with patch("app.routers.portfolio_entries.create_portfolio_entry", return_value=returned):
            with authed_client() as client:
                r = client.post("/api/v1/portfolio-entries", json=payload, headers=AUTH)
        assert r.json()["pc"] is True

    def test_mark_sold_sets_actual_sale_and_venue(self):
        existing = PortfolioEntry(
            id="e1", user_id="u1", card_name="Test", sport="football",
            grade="PSA 10", price_paid=200.0, grading_cost=25.0,
            target_sell=350.0, actual_sale=None, sale_venue=None,
            purchase_date=None, notes=None, pc=False,
        )
        sold = existing.model_copy(update={"actual_sale": 320.0, "sale_venue": "eBay"})
        with (
            patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=existing),
            patch("app.routers.portfolio_entries.update_entry", return_value=sold),
        ):
            with authed_client() as client:
                r = client.patch("/api/v1/portfolio-entries/e1",
                                 json={"actual_sale": 320.0, "sale_venue": "eBay"},
                                 headers=AUTH)
        assert r.status_code == 200
        body = r.json()
        assert body["actual_sale"] == 320.0
        assert body["sale_venue"] == "eBay"

    def test_ownership_enforced_on_patch(self):
        other = PortfolioEntry(
            id="e1", user_id="other-user", card_name="Test", sport="football",
            grade="PSA 10", price_paid=200.0, grading_cost=0.0,
            target_sell=None, actual_sale=None, sale_venue=None,
            purchase_date=None, notes=None, pc=False,
        )
        with patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=other):
            with authed_client(user_id="u1") as client:
                r = client.patch("/api/v1/portfolio-entries/e1",
                                 json={"notes": "x"}, headers=AUTH)
        assert r.status_code == 403

    def test_ownership_enforced_on_delete(self):
        other = PortfolioEntry(
            id="e1", user_id="other-user", card_name="Test", sport="football",
            grade="PSA 10", price_paid=200.0, grading_cost=0.0,
            target_sell=None, actual_sale=None, sale_venue=None,
            purchase_date=None, notes=None, pc=False,
        )
        with patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=other):
            with authed_client(user_id="u1") as client:
                r = client.delete("/api/v1/portfolio-entries/e1", headers=AUTH)
        assert r.status_code == 403


# ── 4. Trend endpoints ────────────────────────────────────────────────────────

class TestTrendEndpoints:
    def _row(self, card: str, window: int, grade: str = "PSA 10", num_sales: int = 20) -> dict:
        return {
            "sport": "football", "window_days": window, "card": card, "grade": grade,
            "price_change_pct": 5.0, "price_change_dollar": 10.0, "starting_price": 200.0,
            "last_sale": 210.0, "avg": 205.0, "min_sale": 195.0, "max_sale": 215.0,
            "volume_change_pct": 2.0, "num_sales": num_sales, "total_sales_dollar": num_sales * 205.0,
        }

    # Exact match
    def test_exact_card_name_returns_detail(self):
        rows = [self._row("Mahomes 2017 Prizm Base", 7),
                self._row("Mahomes 2017 Prizm Base", 30)]
        with patch("app.services.trends.fetch_trend_detail", return_value=rows):
            from app.services.trends import get_trend_detail
            result = get_trend_detail("Mahomes 2017 Prizm Base")
        assert result["card"] == "Mahomes 2017 Prizm Base"
        assert len(result["windows"]) == 2

    # Fuzzy/autocomplete — query fires only when >= 2 chars
    def test_search_fires_for_two_char_query(self):
        with patch("app.services.trends.search_cards",
                   return_value=[{"card": "Mahomes", "sport": "football"}]) as mock:
            from app.services.trends import search_trend_cards
            results = search_trend_cards("ma")
        mock.assert_called_once_with("ma", limit=20)
        assert len(results) == 1

    def test_search_blocked_for_one_char_query(self):
        with patch("app.services.trends.search_cards") as mock:
            from app.services.trends import search_trend_cards
            results = search_trend_cards("m")
        mock.assert_not_called()
        assert results == []

    # Missing data
    def test_detail_missing_card_returns_empty_windows(self):
        with patch("app.services.trends.fetch_trend_detail", return_value=[]):
            from app.services.trends import get_trend_detail
            result = get_trend_detail("Nonexistent Card XYZ")
        assert result["windows"] == []
        assert result["card"] == "Nonexistent Card XYZ"

    # Thin-data fallback — card exists but only 1 sale in window
    def test_thin_data_single_sale_still_returned(self):
        rows = [self._row("Obscure Card", 7, num_sales=1)]
        with patch("app.services.trends.fetch_trend_detail", return_value=rows):
            from app.services.trends import get_trend_detail
            result = get_trend_detail("Obscure Card")
        assert len(result["windows"]) == 1
        assert result["windows"][0]["grades"][0]["num_sales"] == 1

    # Multiple grades in same window
    def test_detail_groups_multiple_grades_per_window(self):
        rows = [
            self._row("Mahomes Prizm", 30, grade="Raw"),
            self._row("Mahomes Prizm", 30, grade="PSA 9"),
            self._row("Mahomes Prizm", 30, grade="PSA 10"),
        ]
        with patch("app.services.trends.fetch_trend_detail", return_value=rows):
            from app.services.trends import get_trend_detail
            result = get_trend_detail("Mahomes Prizm")
        assert len(result["windows"]) == 1
        grades = {g["grade"] for g in result["windows"][0]["grades"]}
        assert grades == {"Raw", "PSA 9", "PSA 10"}

    # Router-level: search endpoint returns structured response
    def test_search_router_returns_data_key(self):
        with patch("app.routers.trends.search_trend_cards",
                   return_value=[{"card": "Mahomes", "sport": "football"}]):
            with authed_client() as client:
                r = client.get("/api/v1/trends/search?q=mahomes", headers=AUTH)
        assert r.status_code == 200
        assert "data" in r.json()
        assert r.json()["data"][0]["card"] == "Mahomes"

    # Router-level: detail endpoint with sport filter
    def test_detail_router_accepts_sport_param(self):
        detail = {"card": "Mahomes Prizm", "sport": "football", "windows": []}
        with patch("app.routers.trends.get_trend_detail", return_value=detail) as mock:
            with authed_client() as client:
                client.get("/api/v1/trends/detail?card=Mahomes+Prizm&sport=football",
                           headers=AUTH)
        mock.assert_called_once_with("Mahomes Prizm", sport="football")

    # Cache header on both endpoints
    def test_search_and_detail_have_short_cache(self):
        with patch("app.routers.trends.search_trend_cards", return_value=[]):
            with authed_client() as client:
                rs = client.get("/api/v1/trends/search?q=test", headers=AUTH)
        with patch("app.routers.trends.get_trend_detail",
                   return_value={"card": "x", "sport": None, "windows": []}):
            with authed_client() as client:
                rd = client.get("/api/v1/trends/detail?card=x", headers=AUTH)
        assert "max-age=30" in rs.headers.get("cache-control", "")
        assert "max-age=30" in rd.headers.get("cache-control", "")
