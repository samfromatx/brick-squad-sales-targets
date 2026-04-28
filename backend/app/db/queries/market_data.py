import re

from app.db.connection import db_cursor

_COMMON_TERMS = {
    'prizm', 'optic', 'select', 'chrome', 'topps', 'panini', 'silver', 'refractor',
    'holo', 'parallel', 'rookie', 'auto', 'autograph', 'jersey', 'patch', 'black',
    'white', 'gold', 'blue', 'green', 'red', 'purple', 'orange', 'pink', 'yellow',
    'mosaic', 'donruss', 'score', 'leaf', 'upper', 'deck', 'fleer', 'bowman',
    'finest', 'stadium', 'ultra', 'hoops', 'chronicles', 'obsidian', 'spectra',
    'national', 'treasures', 'contenders', 'limited', 'certified', 'absolute',
    'luminance', 'revolution', 'zenith', 'playoff', 'prestige', 'numbered',
    'base', 'short', 'print', 'variation', 'crystal', 'scope',
}

_YEAR_RE = re.compile(r'^(19|20)\d{2}$')


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


def _query_tokens(card_name: str) -> list[str]:
    """Tokens for the DB AND-clause.

    Includes parallels (holo/silver/base etc.) so wrong parallels are excluded
    at query time. Excludes years so DB cards with missing year still match.
    Requires len >= 2 to skip single-char noise.
    """
    return [t for t in tokenize(card_name)
            if len(t) >= 2 and not _YEAR_RE.match(t)]


def _is_year(token: str) -> bool:
    return bool(_YEAR_RE.match(token))


def _jaccard_find(card_name: str, norm_grade: str, candidates: list[dict]) -> dict | None:
    grade_lower = norm_grade.lower()
    tokens = tokenize(card_name)
    token_set = set(tokens)

    grade_cands = [c for c in candidates if (c['grade'] or '').lower() == grade_lower]

    # Exact match (raw string, case-insensitive)
    exact = next((c for c in grade_cands if (c['card'] or '').lower() == card_name.lower()), None)
    if exact:
        return exact

    # Bidirectional subset — with strict rule on the DB⊆portfolio direction:
    # portfolio⊆DB: DB has all portfolio tokens plus extras → fine
    # DB⊆portfolio: only match if the extra tokens in portfolio are ONLY years
    #   (prevents "Holo" variant matching a "Base" card that is missing "holo")
    matched = []
    for c in grade_cands:
        csv_set = set(tokenize(c['card'] or ''))
        if all(t in csv_set for t in tokens):
            # portfolio ⊆ DB — always OK
            matched.append(c)
        elif all(t in token_set for t in csv_set):
            # DB ⊆ portfolio — only OK if extra tokens are years
            extra = token_set - csv_set
            if all(_is_year(t) for t in extra):
                matched.append(c)

    # Jaccard fallback at 0.8 threshold for near-identical names (e.g. year missing)
    if not matched:
        def jaccard_score(c: dict) -> float:
            csv_set = set(tokenize(c['card'] or ''))
            overlap = sum(1 for t in tokens if t in csv_set)
            union = len(token_set | csv_set)
            return overlap / union if union > 0 else 0.0

        best_c = max(grade_cands, key=jaccard_score, default=None)
        if best_c and jaccard_score(best_c) >= 0.8:
            return best_c
        return None

    if len(matched) == 1:
        return matched[0]

    # Jaccard tie-breaking among subset matches
    def jaccard(c: dict) -> float:
        csv_set = set(tokenize(c['card'] or ''))
        overlap = sum(1 for t in tokens if t in csv_set)
        union = len(token_set | csv_set)
        return overlap / union if union > 0 else 0.0

    matched.sort(key=lambda c: (jaccard(c), -len(tokenize(c['card'] or ''))), reverse=True)
    best = jaccard(matched[0])

    if len(matched) > 1 and jaccard(matched[1]) >= best * 0.95:
        best_norm = normalize_name(matched[0]['card'] or '')
        all_same = all(
            normalize_name(c['card'] or '') == best_norm
            for c in matched
            if jaccard(c) >= best * 0.95
        )
        if not all_same:
            return None

    return matched[0]


def batch_market_data(cards: list[dict]) -> list[dict]:
    """
    cards: list of {id, card, grade}

    Per-card AND-clauses OR'd together. Each card's clause requires all its
    non-year tokens (including parallels like 'holo'/'silver') so wrong
    parallel variants are excluded from candidates at query time.
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

    card_clauses: list[str] = []
    card_params: list[str] = []
    for item in cards:
        toks = _query_tokens(item['card'])
        if not toks:
            continue
        clause = '(' + ' AND '.join(['card ILIKE %s'] * len(toks)) + ')'
        card_clauses.append(clause)
        card_params.extend(f'%{t}%' for t in toks)

    if not card_clauses:
        return [empty(c['id']) for c in cards]

    grade_placeholders = ', '.join(['%s'] * len(unique_grades))
    or_clauses = ' OR '.join(card_clauses)

    sql = f"""
        SELECT card, grade, "avg", window_days, price_change_pct, num_sales
        FROM card_market_data
        WHERE window_days IN (7, 14, 30, 60, 90, 180)
          AND grade IN ({grade_placeholders})
          AND ({or_clauses})
    """
    params: list = unique_grades + card_params

    with db_cursor() as cur:
        cur.execute(sql, params)
        all_rows = [dict(r) for r in cur.fetchall()]

    row_lookup: dict[tuple[str, str, int], dict] = {}
    for r in all_rows:
        key = (r['card'], r['grade'], int(r['window_days']))
        row_lookup[key] = r

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
