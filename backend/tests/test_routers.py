"""Router tests using FastAPI TestClient with mocked services — no live DB."""
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import get_current_user_id
from app.main import app
from app.models.domain import Category, PortfolioAllocation, PortfolioAllocationItem, Sport, Target

# ── Helpers ──────────────────────────────────────────────────────────────────

AUTH_HEADER = {"Authorization": "Bearer valid-token"}

MOCK_TARGET = Target(
    id="t1",
    sport=Sport.football,
    category=Category.graded,
    rank=1,
    card_name="Mahomes 2017 Prizm",
    grade="PSA 10",
    target_price=280.0,
    max_price=320.0,
    trend_pct=12.0,
    sell_at=400.0,
    is_new=False,
    last_updated="2026-04-01",
)

MOCK_ALLOC = PortfolioAllocation(
    tier="1000",
    allocations=[PortfolioAllocationItem(card_name="Mahomes Prizm", budget=250.0)],
)


@contextmanager
def authed_client(user_id: str = "u1"):
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)


# ── Health ────────────────────────────────────────────────────────────────────

class TestHealth:
    def test_healthz_returns_200(self):
        with TestClient(app) as client:
            r = client.get("/api/v1/healthz")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

    def test_readyz_ok_when_db_up(self):
        with patch("app.routers.health.check_connection", return_value=True):
            with TestClient(app) as client:
                r = client.get("/api/v1/readyz")
        assert r.status_code == 200

    def test_readyz_503_when_db_down(self):
        with patch("app.routers.health.check_connection", return_value=False):
            with TestClient(app) as client:
                r = client.get("/api/v1/readyz")
        assert r.status_code == 503

    def test_healthz_requires_no_auth(self):
        with TestClient(app) as client:
            r = client.get("/api/v1/healthz")
        assert r.status_code == 200


# ── Auth enforcement ──────────────────────────────────────────────────────────

class TestAuthEnforcement:
    @pytest.mark.parametrize("path", [
        "/api/v1/bootstrap",
        "/api/v1/targets",
        "/api/v1/portfolios",
        "/api/v1/ebay-searches",
        "/api/v1/exports/snapshot",
        "/api/v1/trends/search?q=test",
        "/api/v1/trends/detail?card=Mahomes",
    ])
    def test_returns_401_without_token(self, path):
        with TestClient(app) as client:
            r = client.get(path)
        assert r.status_code in (401, 403)


# ── Targets ───────────────────────────────────────────────────────────────────

class TestTargetsRouter:
    def test_list_targets_returns_data(self):
        with patch("app.routers.targets.get_targets", return_value=[MOCK_TARGET]):
            with authed_client() as client:
                r = client.get("/api/v1/targets", headers=AUTH_HEADER)
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert body["data"][0]["card_name"] == "Mahomes 2017 Prizm"

    def test_list_targets_has_etag(self):
        with patch("app.routers.targets.get_targets", return_value=[MOCK_TARGET]):
            with authed_client() as client:
                r = client.get("/api/v1/targets", headers=AUTH_HEADER)
        assert "etag" in r.headers

    def test_list_targets_304_on_matching_etag(self):
        with patch("app.routers.targets.get_targets", return_value=[MOCK_TARGET]):
            with authed_client() as client:
                r1 = client.get("/api/v1/targets", headers=AUTH_HEADER)
                etag = r1.headers["etag"]
                r2 = client.get("/api/v1/targets", headers={**AUTH_HEADER, "if-none-match": etag})
        assert r2.status_code == 304

    def test_list_targets_filter_by_sport(self):
        with patch("app.routers.targets.get_targets", return_value=[]) as mock_svc:
            with authed_client() as client:
                client.get("/api/v1/targets?sport=football", headers=AUTH_HEADER)
        mock_svc.assert_called_once_with("u1", sport="football", category=None)

    def test_get_target_404_when_missing(self):
        with patch("app.routers.targets.get_target", return_value=None):
            with authed_client() as client:
                r = client.get("/api/v1/targets/bad-id", headers=AUTH_HEADER)
        assert r.status_code == 404

    def test_get_target_returns_target(self):
        with patch("app.routers.targets.get_target", return_value=MOCK_TARGET):
            with authed_client() as client:
                r = client.get("/api/v1/targets/t1", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["card_name"] == "Mahomes 2017 Prizm"

    def test_response_shape_has_required_fields(self):
        with patch("app.routers.targets.get_targets", return_value=[MOCK_TARGET]):
            with authed_client() as client:
                r = client.get("/api/v1/targets", headers=AUTH_HEADER)
        item = r.json()["data"][0]
        for field in ("id", "sport", "category", "rank", "card_name", "is_new"):
            assert field in item, f"Missing field: {field}"

    def test_trend_pct_is_float_not_string(self):
        with patch("app.routers.targets.get_targets", return_value=[MOCK_TARGET]):
            with authed_client() as client:
                r = client.get("/api/v1/targets", headers=AUTH_HEADER)
        item = r.json()["data"][0]
        assert isinstance(item["trend_pct"], (float, int, type(None)))


# ── Portfolios ────────────────────────────────────────────────────────────────

class TestPortfoliosRouter:
    def test_list_portfolios_returns_data(self):
        with patch("app.routers.portfolios.get_portfolio_allocations", return_value=[MOCK_ALLOC]):
            with authed_client() as client:
                r = client.get("/api/v1/portfolios", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["data"][0]["tier"] == "1000"

    def test_list_portfolios_has_etag(self):
        with patch("app.routers.portfolios.get_portfolio_allocations", return_value=[MOCK_ALLOC]):
            with authed_client() as client:
                r = client.get("/api/v1/portfolios", headers=AUTH_HEADER)
        assert "etag" in r.headers

    def test_portfolios_304_on_matching_etag(self):
        with patch("app.routers.portfolios.get_portfolio_allocations", return_value=[MOCK_ALLOC]):
            with authed_client() as client:
                r1 = client.get("/api/v1/portfolios", headers=AUTH_HEADER)
                etag = r1.headers["etag"]
                r2 = client.get("/api/v1/portfolios", headers={**AUTH_HEADER, "if-none-match": etag})
        assert r2.status_code == 304


# ── eBay searches ─────────────────────────────────────────────────────────────

class TestEbayRouter:
    def test_list_ebay_searches_returns_data(self):
        row = {"id": "eb1", "sport": "football", "category": "graded",
               "search_text": "mahomes prizm psa 10", "card_name": "Mahomes", "rank": 1}
        with patch("app.routers.ebay.fetch_ebay_searches", return_value=[row]):
            with authed_client() as client:
                r = client.get("/api/v1/ebay-searches", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["data"][0]["search_text"] == "mahomes prizm psa 10"

    def test_ebay_has_more_false_for_small_result(self):
        row = {"id": "eb1", "sport": "football", "category": "graded",
               "search_text": "test", "card_name": None, "rank": None}
        with patch("app.routers.ebay.fetch_ebay_searches", return_value=[row]):
            with authed_client() as client:
                r = client.get("/api/v1/ebay-searches", headers=AUTH_HEADER)
        assert r.json()["has_more"] is False


# ── Trends ────────────────────────────────────────────────────────────────────

class TestTrendsRouter:
    def test_search_returns_results(self):
        with patch("app.routers.trends.search_trend_cards", return_value=[{"card": "Mahomes", "sport": "football"}]):
            with authed_client() as client:
                r = client.get("/api/v1/trends/search?q=mahomes", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert len(r.json()["data"]) == 1

    def test_search_has_short_cache_header(self):
        with patch("app.routers.trends.search_trend_cards", return_value=[]):
            with authed_client() as client:
                r = client.get("/api/v1/trends/search?q=test", headers=AUTH_HEADER)
        assert "max-age=30" in r.headers.get("cache-control", "")

    def test_detail_returns_card_and_windows(self):
        detail = {"card": "Mahomes Prizm", "sport": "football", "windows": []}
        with patch("app.routers.trends.get_trend_detail", return_value=detail):
            with authed_client() as client:
                r = client.get("/api/v1/trends/detail?card=Mahomes+Prizm", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["card"] == "Mahomes Prizm"


# ── Bootstrap ─────────────────────────────────────────────────────────────────

class TestBootstrapRouter:
    def _mock_snapshot(self):
        from datetime import UTC, datetime
        from app.models.export import ExportData, ExportSnapshot, ExportUser
        return ExportSnapshot(
            schema_version="v1",
            generated_at=datetime.now(UTC),
            last_updated="2026-04-01",
            user=ExportUser(id="u1", email="sam@example.com"),
            data=ExportData(targets=[MOCK_TARGET]),
        )

    def test_bootstrap_returns_snapshot_shape(self):
        with patch("app.routers.bootstrap.build_snapshot", return_value=self._mock_snapshot()):
            with authed_client() as client:
                r = client.get("/api/v1/bootstrap", headers=AUTH_HEADER)
        assert r.status_code == 200
        body = r.json()
        assert body["schema_version"] == "v1"
        assert "data" in body
        assert len(body["data"]["targets"]) == 1

    def test_bootstrap_has_etag(self):
        with patch("app.routers.bootstrap.build_snapshot", return_value=self._mock_snapshot()):
            with authed_client() as client:
                r = client.get("/api/v1/bootstrap", headers=AUTH_HEADER)
        assert "etag" in r.headers

    def test_bootstrap_304_on_matching_etag(self):
        snap = self._mock_snapshot()
        with patch("app.routers.bootstrap.build_snapshot", return_value=snap):
            with authed_client() as client:
                r1 = client.get("/api/v1/bootstrap", headers=AUTH_HEADER)
                etag = r1.headers["etag"]
                r2 = client.get("/api/v1/bootstrap", headers={**AUTH_HEADER, "if-none-match": etag})
        assert r2.status_code == 304


# ── Exports ───────────────────────────────────────────────────────────────────

class TestExportsRouter:
    def _mock_snapshot(self):
        from datetime import UTC, datetime
        from app.models.export import ExportData, ExportSnapshot, ExportUser
        return ExportSnapshot(
            schema_version="v1",
            generated_at=datetime.now(UTC),
            last_updated="2026-04-01",
            user=ExportUser(id="u1"),
            data=ExportData(),
        )

    def test_snapshot_returns_200(self):
        with patch("app.routers.exports.build_snapshot", return_value=self._mock_snapshot()):
            with authed_client() as client:
                r = client.get("/api/v1/exports/snapshot", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["schema_version"] == "v1"

    def test_snapshot_304_on_matching_etag(self):
        snap = self._mock_snapshot()
        with patch("app.routers.exports.build_snapshot", return_value=snap):
            with authed_client() as client:
                r1 = client.get("/api/v1/exports/snapshot", headers=AUTH_HEADER)
                etag = r1.headers["etag"]
                r2 = client.get("/api/v1/exports/snapshot", headers={**AUTH_HEADER, "if-none-match": etag})
        assert r2.status_code == 304


# ── Portfolio entries (CRUD) ──────────────────────────────────────────────────

from app.models.domain import PortfolioEntry  # noqa: E402

MOCK_ENTRY = PortfolioEntry(
    id="e1", user_id="u1", card_name="Mahomes Prizm", sport="football",
    grade="PSA 10", price_paid=250.0, grading_cost=0.0,
    target_sell=350.0, actual_sale=None, sale_venue=None,
    purchase_date="2026-01-15", notes=None, pc=False,
)

OTHER_ENTRY = PortfolioEntry(
    id="e2", user_id="other-user", card_name="LeBron Prizm", sport="basketball",
    grade="PSA 9", price_paid=100.0, grading_cost=0.0,
    target_sell=None, actual_sale=None, sale_venue=None,
    purchase_date=None, notes=None, pc=False,
)


class TestPortfolioEntriesRouter:
    def test_list_entries_returns_data(self):
        with patch("app.routers.portfolio_entries.get_portfolio_entries", return_value=([MOCK_ENTRY], False)):
            with authed_client() as client:
                r = client.get("/api/v1/portfolio-entries", headers=AUTH_HEADER)
        assert r.status_code == 200
        body = r.json()
        assert body["data"][0]["card_name"] == "Mahomes Prizm"
        assert body["has_more"] is False

    def test_create_entry_returns_201(self):
        payload = {"card_name": "Mahomes Prizm", "sport": "football",
                   "grade": "PSA 10", "price_paid": 250.0}
        with patch("app.routers.portfolio_entries.create_portfolio_entry", return_value=MOCK_ENTRY):
            with authed_client() as client:
                r = client.post("/api/v1/portfolio-entries", json=payload, headers=AUTH_HEADER)
        assert r.status_code == 201
        assert r.json()["card_name"] == "Mahomes Prizm"

    def test_create_then_get_reflects_entry(self):
        payload = {"card_name": "Mahomes Prizm", "sport": "football",
                   "grade": "PSA 10", "price_paid": 250.0}
        with (
            patch("app.routers.portfolio_entries.create_portfolio_entry", return_value=MOCK_ENTRY),
            patch("app.routers.portfolio_entries.get_portfolio_entries", return_value=([MOCK_ENTRY], False)),
        ):
            with authed_client() as client:
                post_r = client.post("/api/v1/portfolio-entries", json=payload, headers=AUTH_HEADER)
                get_r = client.get("/api/v1/portfolio-entries", headers=AUTH_HEADER)
        assert post_r.status_code == 201
        assert get_r.json()["data"][0]["id"] == post_r.json()["id"]

    def test_patch_entry_returns_updated(self):
        updated = MOCK_ENTRY.model_copy(update={"actual_sale": 320.0})
        with (
            patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=MOCK_ENTRY),
            patch("app.routers.portfolio_entries.update_entry", return_value=updated),
        ):
            with authed_client() as client:
                r = client.patch("/api/v1/portfolio-entries/e1",
                                 json={"actual_sale": 320.0}, headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["actual_sale"] == 320.0

    def test_patch_entry_404_when_missing(self):
        with patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=None):
            with authed_client() as client:
                r = client.patch("/api/v1/portfolio-entries/bad",
                                 json={"notes": "x"}, headers=AUTH_HEADER)
        assert r.status_code == 404

    def test_patch_entry_403_when_not_owner(self):
        with patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=OTHER_ENTRY):
            with authed_client(user_id="u1") as client:
                r = client.patch("/api/v1/portfolio-entries/e2",
                                 json={"notes": "x"}, headers=AUTH_HEADER)
        assert r.status_code == 403

    def test_delete_entry_returns_204(self):
        with (
            patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=MOCK_ENTRY),
            patch("app.routers.portfolio_entries.remove_entry", return_value=True),
        ):
            with authed_client() as client:
                r = client.delete("/api/v1/portfolio-entries/e1", headers=AUTH_HEADER)
        assert r.status_code == 204

    def test_delete_entry_404_when_missing(self):
        with patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=None):
            with authed_client() as client:
                r = client.delete("/api/v1/portfolio-entries/bad", headers=AUTH_HEADER)
        assert r.status_code == 404

    def test_delete_entry_403_when_not_owner(self):
        with patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=OTHER_ENTRY):
            with authed_client(user_id="u1") as client:
                r = client.delete("/api/v1/portfolio-entries/e2", headers=AUTH_HEADER)
        assert r.status_code == 403

    def test_mark_sold_via_patch(self):
        sold = MOCK_ENTRY.model_copy(update={"actual_sale": 310.0, "sale_venue": "eBay"})
        with (
            patch("app.routers.portfolio_entries.get_portfolio_entry", return_value=MOCK_ENTRY),
            patch("app.routers.portfolio_entries.update_entry", return_value=sold),
        ):
            with authed_client() as client:
                r = client.patch("/api/v1/portfolio-entries/e1",
                                 json={"actual_sale": 310.0, "sale_venue": "eBay"},
                                 headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["sale_venue"] == "eBay"


# ── Import endpoint ───────────────────────────────────────────────────────────

class TestImportsRouter:
    def _patches(self):
        return [
            patch("app.services.imports.delete_targets_for_section"),
            patch("app.services.imports.bulk_insert_targets"),
            patch("app.services.imports.delete_portfolio_allocations"),
            patch("app.services.imports.bulk_insert_portfolio_allocations"),
            patch("app.services.imports.delete_ebay_searches"),
            patch("app.services.imports.bulk_insert_ebay_searches"),
        ]

    def test_import_valid_payload_returns_200(self):
        payload = {
            "last_updated": "2026-04-01",
            "football_graded": [
                {"rank": 1, "card": "Mahomes Prizm", "grade": "PSA 10",
                 "target": 280, "max": 320, "trend": "+12%",
                 "vol": "high", "sell_at": 400, "rationale": "x", "new": False}
            ]
        }
        ps = self._patches()
        [p.start() for p in ps]
        try:
            with authed_client() as client:
                r = client.post("/api/v1/imports/targets", json=payload, headers=AUTH_HEADER)
        finally:
            [p.stop() for p in ps]
        assert r.status_code == 200
        assert "football_graded" in r.json()["imported"]

    def test_import_empty_object_returns_422(self):
        with authed_client() as client:
            r = client.post("/api/v1/imports/targets", json={}, headers=AUTH_HEADER)
        assert r.status_code == 422

    def test_import_only_last_updated_returns_422(self):
        with authed_client() as client:
            r = client.post("/api/v1/imports/targets",
                            json={"last_updated": "2026-04-01"}, headers=AUTH_HEADER)
        assert r.status_code == 422

    def test_import_requires_auth(self):
        with TestClient(app) as client:
            r = client.post("/api/v1/imports/targets", json={"football_graded": []})
        assert r.status_code in (401, 403)
