import re

from app.db.connection import db_cursor


def normalize_grade(grade: str) -> str:
    g = grade.strip().upper()
    if "PSA 10" in g or "PSA10" in g:
        return "PSA 10"
    if "PSA 9" in g or "PSA9" in g:
        return "PSA 9"
    return "Raw"


def normalize_name(s: str) -> str:
    s = s.lower()
    s = re.sub(r'/\d+', '', s)
    s = re.sub(r'#\d+', '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def tokenize(card_name: str) -> list[str]:
    return [t for t in normalize_name(card_name).split(' ') if t]


def _jaccard_find(card_name: str, norm_grade: str, candidates: list[dict]) -> dict | None:
    grade_lower = norm_grade.lower()
    tokens = tokenize(card_name)
    token_set = set(tokens)

    grade_cands = [c for c in candidates if (c['grade'] or '').lower() == grade_lower]

    # Exact match first
    exact = next((c for c in grade_cands if (c['card'] or '').lower() == card_name.lower()), None)
    if exact:
        return exact

    # Bidirectional token subset match
    matched = []
    for c in grade_cands:
        csv_toks = tokenize(c['card'] or '')
        csv_set = set(csv_toks)
        if all(t in csv_set for t in tokens) or all(t in token_set for t in csv_toks):
            matched.append(c)

    if not matched:
        return None
    if len(matched) == 1:
        return matched[0]

    # Jaccard scoring to break ties
    def score(c: dict) -> tuple[float, int]:
        csv_toks = tokenize(c['card'] or '')
        csv_set = set(csv_toks)
        overlap = sum(1 for t in tokens if t in csv_set)
        union = len(token_set | csv_set)
        return (overlap / union if union > 0 else 0.0), -len(csv_toks)

    matched.sort(key=score, reverse=True)
    best_score = score(matched[0])[0]

    if len(matched) > 1 and score(matched[1])[0] >= best_score * 0.95:
        best_norm = normalize_name(matched[0]['card'] or '')
        all_same = all(
            normalize_name(c['card'] or '') == best_norm
            for c in matched
            if score(c)[0] >= best_score * 0.95
        )
        if not all_same:
            return None

    return matched[0]


def batch_market_data(cards: list[dict]) -> list[dict]:
    """
    cards: list of {id, card, grade}
    Returns list of result dicts in same order.
    Uses a single DB query to fetch candidates, then Jaccard matching in Python.
    """
    def empty(id_: str) -> dict:
        return {
            'id': id_, 'matched_card': None, 'match_confidence': 'none',
            'avg_7d': None, 'avg_30d': None, 'trend_7d_pct': None,
            'trend_30d_pct': None, 'num_sales_30d': None,
        }

    if not cards:
        return []

    norm_grades = {c['id']: normalize_grade(c['grade']) for c in cards}
    unique_grades = list(set(norm_grades.values()))

    # Collect distinctive tokens (len >= 3) across all card names
    all_tokens: set[str] = set()
    for item in cards:
        all_tokens.update(t for t in tokenize(item['card']) if len(t) >= 3)

    if not all_tokens:
        return [empty(c['id']) for c in cards]

    grade_placeholders = ', '.join(['%s'] * len(unique_grades))
    token_conditions = ' OR '.join(['card ILIKE %s'] * len(all_tokens))

    sql = f"""
        SELECT card, grade, avg, window_days, price_change_pct, num_sales
        FROM card_market_data
        WHERE window_days IN (7, 14, 30, 60, 90, 180)
          AND grade IN ({grade_placeholders})
          AND ({token_conditions})
    """
    params: list = unique_grades + [f'%{t}%' for t in all_tokens]

    with db_cursor() as cur:
        cur.execute(sql, params)
        all_rows = [dict(r) for r in cur.fetchall()]

    # Build (card, grade, window) lookup for fast retrieval after matching
    row_lookup: dict[tuple[str, str, int], dict] = {}
    for r in all_rows:
        key = (r['card'], r['grade'], int(r['window_days']))
        row_lookup[key] = r

    # Fallback chains: prefer shorter windows, fall back to longer ones
    windows_7d  = [7, 14, 30]
    windows_30d = [30, 60, 90, 180]

    results = []
    for item in cards:
        result = empty(item['id'])
        norm_grade = norm_grades[item['id']]

        best = _jaccard_find(item['card'], norm_grade, all_rows)
        if not best:
            results.append(result)
            continue

        matched_card = best['card']
        result['matched_card'] = matched_card
        result['match_confidence'] = 'fuzzy'

        r7 = next((row_lookup[k] for w in windows_7d if (k := (matched_card, norm_grade, w)) in row_lookup), None)
        r30 = next((row_lookup[k] for w in windows_30d if (k := (matched_card, norm_grade, w)) in row_lookup), None)

        if r7:
            result['avg_7d']       = float(r7['avg']) if r7['avg'] is not None else None
            result['trend_7d_pct'] = float(r7['price_change_pct']) if r7['price_change_pct'] is not None else None
        if r30:
            result['avg_30d']       = float(r30['avg']) if r30['avg'] is not None else None
            result['trend_30d_pct'] = float(r30['price_change_pct']) if r30['price_change_pct'] is not None else None
            result['num_sales_30d'] = int(r30['num_sales']) if r30['num_sales'] is not None else None

        results.append(result)

    return results
