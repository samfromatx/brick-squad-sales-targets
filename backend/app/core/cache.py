import hashlib
import json
from typing import Any


def make_etag(data: Any) -> str:
    serialized = json.dumps(data, sort_keys=True, default=str)
    digest = hashlib.sha256(serialized.encode()).hexdigest()[:16]
    return f'"{digest}"'
