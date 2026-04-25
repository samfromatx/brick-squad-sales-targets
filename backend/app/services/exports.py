from datetime import UTC, datetime

from app.models.export import ExportData, ExportSnapshot, ExportUser
from app.services.portfolio import get_portfolio_allocations, get_portfolio_entries
from app.services.targets import get_targets


def build_snapshot(user_id: str, user_email: str | None = None) -> ExportSnapshot:
    targets = get_targets(user_id)
    allocations = get_portfolio_allocations(user_id)
    entries, _ = get_portfolio_entries(user_id, limit=1000)

    last_updated: str | None = None
    if targets:
        dates = [t.last_updated for t in targets if t.last_updated]
        if dates:
            last_updated = max(dates)

    return ExportSnapshot(
        schema_version="v1",
        generated_at=datetime.now(UTC),
        last_updated=last_updated,
        user=ExportUser(id=user_id, email=user_email),
        data=ExportData(
            targets=targets,
            portfolio_allocations=allocations,
            portfolio_entries=entries,
        ),
    )
