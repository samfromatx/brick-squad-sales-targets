from app.db.queries.portfolio import (
    delete_portfolio_entry,
    fetch_portfolio_allocations,
    fetch_portfolio_entries,
    fetch_portfolio_entry,
    insert_portfolio_entry,
    update_portfolio_entry,
)
from app.models.domain import PortfolioAllocation, PortfolioAllocationItem, PortfolioEntry


def _row_to_entry(row: dict) -> PortfolioEntry:
    return PortfolioEntry(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        card_name=row["card_name"],
        sport=row["sport"],
        grade=row["grade"],
        price_paid=float(row["price_paid"]),
        grading_cost=float(row.get("grading_cost") or 0),
        target_sell=float(row["target_sell"]) if row.get("target_sell") is not None else None,
        actual_sale=float(row["actual_sale"]) if row.get("actual_sale") is not None else None,
        sale_venue=row.get("sale_venue"),
        purchase_date=str(row["purchase_date"]) if row.get("purchase_date") else None,
        notes=row.get("notes"),
        pc=bool(row.get("pc", False)),
    )


def get_portfolio_entries(
    user_id: str, cursor_id: str | None = None, limit: int = 100
) -> tuple[list[PortfolioEntry], bool]:
    rows = fetch_portfolio_entries(user_id, cursor_id=cursor_id, limit=limit)
    has_more = len(rows) > limit
    return [_row_to_entry(r) for r in rows[:limit]], has_more


def get_portfolio_entry(user_id: str, entry_id: str) -> PortfolioEntry | None:
    row = fetch_portfolio_entry(user_id, entry_id)
    return _row_to_entry(row) if row else None


def create_portfolio_entry(user_id: str, data: dict) -> PortfolioEntry:
    row = insert_portfolio_entry(user_id, data)
    return _row_to_entry(row)


def update_entry(user_id: str, entry_id: str, updates: dict) -> PortfolioEntry | None:
    existing = fetch_portfolio_entry(user_id, entry_id)
    if not existing:
        return None
    row = update_portfolio_entry(entry_id, updates)
    return _row_to_entry(row) if row else None


def remove_entry(user_id: str, entry_id: str) -> bool:
    existing = fetch_portfolio_entry(user_id, entry_id)
    if not existing:
        return False
    delete_portfolio_entry(entry_id)
    return True


def get_portfolio_allocations(user_id: str) -> list[PortfolioAllocation]:
    rows = fetch_portfolio_allocations(user_id)
    tiers: dict[str, PortfolioAllocation] = {}
    for row in rows:
        tier = str(row["budget_tier"])
        if tier not in tiers:
            tiers[tier] = PortfolioAllocation(tier=tier, allocations=[])
        tiers[tier].allocations.append(
            PortfolioAllocationItem(
                card_name=row["card"],
                budget=float(row.get("budget") or 0),
                thesis=row.get("thesis"),
            )
        )
    return list(tiers.values())
