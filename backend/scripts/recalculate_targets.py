"""
Standalone card targets recalculation script.

Run from the backend/ directory with SUPABASE_DB_URL set:

    python scripts/recalculate_targets.py football
    python scripts/recalculate_targets.py basketball
    python scripts/recalculate_targets.py football basketball

Or via GitHub Actions (workflow_dispatch).
"""

import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

# Ensure the backend package is importable when run as a script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.card_targets import (
    SUPPORTED_SPORTS,
    calculate_card_targets_for_sport,
    persist_card_targets,
    sync_player_metadata_for_sports,
)


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


def main() -> None:
    sports = sys.argv[1:] if len(sys.argv) > 1 else list(SUPPORTED_SPORTS)

    invalid = [s for s in sports if s not in SUPPORTED_SPORTS]
    if invalid:
        print(f"ERROR: Unknown sports: {invalid}. Valid options: {SUPPORTED_SPORTS}")
        sys.exit(1)

    print(f"[{ts()}] Starting recalculation for: {sports}")
    print(f"[{ts()}] Syncing player metadata...")
    t0 = time.time()
    sync_player_metadata_for_sports(sports)
    print(f"[{ts()}] Metadata sync done ({time.time() - t0:.1f}s)")

    for sport in sports:
        print(f"\n[{ts()}] === {sport.upper()} ===")

        print(f"[{ts()}] Loading candidates and market data...")
        t1 = time.time()
        results = calculate_card_targets_for_sport(sport)
        print(f"[{ts()}] Scored {len(results)} targets ({time.time() - t1:.1f}s)")

        print(f"[{ts()}] Writing to DB...")
        t2 = time.time()
        count = persist_card_targets(sport, results)
        print(f"[{ts()}] Wrote {count} rows ({time.time() - t2:.1f}s)")

    print(f"\n[{ts()}] All done.")

    api_url = os.getenv("API_BASE_URL", "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if api_url and service_key:
        print(f"[{ts()}] Busting cache...")
        req = urllib.request.Request(
            f"{api_url}/api/v1/admin/cache-bust",
            method="POST",
            headers={"Authorization": f"Bearer {service_key}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                print(f"[{ts()}] Cache bust: HTTP {resp.status}")
        except Exception as e:
            print(f"[{ts()}] Cache bust failed (non-fatal): {e}")
    else:
        print(f"[{ts()}] Skipping cache bust: API_BASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")


if __name__ == "__main__":
    main()
