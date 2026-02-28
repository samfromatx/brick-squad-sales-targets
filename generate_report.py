#!/usr/bin/env python3
"""
Brick Squad Sports Cards — Report Generator
============================================
Reads a 30-day eBay sales CSV + config.yaml and generates a standalone
interactive HTML report with:
  - Max bid prices (FMV-weighted with trend multipliers)
  - Gem rates from graded sales distribution
  - Expected Value (EV) per card
  - Budget portfolio recommendations ranked by EV ROI%
  - PSA grading math breakdowns
  - Sell timing calendar

Usage:
  python generate_report.py --csv data/top-players-last-30-days.csv
  python generate_report.py --csv data.csv --config my_config.yaml --output my_report.html
"""

import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import yaml


# ─── CSV Parsing ───────────────────────────────────────────────

def parse_dollar(val):
    """Parse a dollar string like '$1,234.56' to float."""
    if not val or val == "N/A":
        return None
    s = str(val).replace("$", "").replace(",", "").strip()
    # Handle "Last Sale" which may have extra text
    match = re.search(r"[\d.]+", s)
    return float(match.group()) if match else None


def parse_number(val):
    """Parse a numeric string, stripping commas."""
    if not val or val == "N/A":
        return None
    s = str(val).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def load_csv(filepath):
    """Load the 30-day sales CSV into a list of dicts with parsed values."""
    rows = []
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            parsed = {
                "card": row.get("Card", "").strip(),
                "grade": row.get("Grade", "").strip(),
                "avg": parse_dollar(row.get("Avg")),
                "min": parse_dollar(row.get("Min Sale")),
                "max": parse_dollar(row.get("Max Sale")),
                "last": parse_dollar(row.get("Last Sale")),
                "start": parse_dollar(row.get("Starting Price")),
                "volume": int(parse_number(row.get("# of Sales")) or 0),
                "price_change_pct": parse_number(row.get("Price Change %")),
                "volume_change_pct": parse_number(row.get("Volume Change %")),
                "total_sales": parse_dollar(row.get("Total Sales $")),
            }
            rows.append(parsed)
    return rows


# ─── Max Bid Calculation ──────────────────────────────────────

def calc_max_bid(avg_30d, last_sale, formula_cfg):
    """Calculate max bid using FMV-weighted trend formula."""
    if not avg_30d or not last_sale or avg_30d == 0:
        return None, None, None, None, None

    fmv = (avg_30d * formula_cfg["fmv_avg_weight"]) + (
        last_sale * formula_cfg["fmv_last_weight"]
    )
    trend_pct = (last_sale - avg_30d) / avg_30d

    if trend_pct > formula_cfg["up_threshold"]:
        multiplier = formula_cfg["up_multiplier"]
        trend = "UP"
    elif trend_pct < formula_cfg["down_threshold"]:
        multiplier = formula_cfg["down_multiplier"]
        trend = "DOWN"
    else:
        multiplier = formula_cfg["flat_multiplier"]
        trend = "FLAT"

    max_bid = round(fmv * multiplier, 2)
    return max_bid, round(fmv, 2), round(trend_pct * 100, 1), trend, multiplier


# ─── Gem Rate Calculation ─────────────────────────────────────

def calc_gem_rates(csv_data, card_name):
    """Calculate gem rate from graded sales distribution for a card."""
    graded = {}
    for row in csv_data:
        if row["card"] == card_name and row["grade"] != "Raw":
            graded[row["grade"]] = row["volume"]

    psa10 = graded.get("PSA 10", 0)
    psa9 = graded.get("PSA 9", 0)
    psa8 = graded.get("PSA 8", 0)
    other = sum(v for k, v in graded.items() if k not in ("PSA 10", "PSA 9", "PSA 8"))
    total = psa10 + psa9 + psa8 + other

    if total == 0:
        return None

    return {
        "psa10": round(psa10 / total * 100),
        "psa9": round(psa9 / total * 100),
        "psa8": round(psa8 / total * 100),
        "sample_size": total,
    }


# ─── Card Processing ──────────────────────────────────────────

def process_cards(csv_data, config):
    """Process all cards defined in config against CSV data."""
    formula_cfg = config["max_bid_formula"]
    psa_pricing = config["psa_pricing"]
    gem_cfg = config["gem_rate"]
    players_cfg = config["players"]
    cards_cfg = config["cards"]

    processed = []

    for card_cfg in cards_cfg:
        csv_name = card_cfg["csv_name"]
        grade = card_cfg.get("grade_override", "Raw")
        player_key = card_cfg["player"]
        player = players_cfg.get(player_key, {})

        # Find matching CSV row
        row = None
        for r in csv_data:
            if r["card"] == csv_name and r["grade"] == grade:
                row = r
                break

        if not row:
            print(f"  WARNING: No CSV data for {csv_name} [{grade}]", file=sys.stderr)
            continue

        # Calculate max bid
        max_bid, fmv, trend_pct, trend, mult = calc_max_bid(
            row["avg"], row["last"], formula_cfg
        )

        if max_bid is None:
            continue

        card_data = {
            "id": f"{player_key}-{csv_name[-20:]}-{grade}".lower().replace(" ", "-"),
            "card": csv_name,
            "grade": grade,
            "player": player_key,
            "player_color": player.get("color", "#475569"),
            "tier": card_cfg.get("tier", player.get("tier", "B")),
            "category": card_cfg.get("category", "rawbuy"),
            "sell_window": card_cfg.get("sell_window", ""),
            "avg": row["avg"],
            "last": row["last"],
            "min": row["min"],
            "max": row["max"],
            "vol": row["volume"],
            "fmv": fmv,
            "trend_pct": trend_pct,
            "trend": trend,
            "mult": mult,
            "max_bid": max_bid,
        }

        # For grading plays: compute gem rates, EV, grading math
        if card_cfg.get("category") == "grading" and grade == "Raw":
            rec_tier = card_cfg.get("rec_grading_tier", "value_bulk")
            grading_cost = psa_pricing.get(rec_tier, 24.99)
            all_in = max_bid + grading_cost

            # Find PSA 10 value
            psa10_val = None
            for r in csv_data:
                if r["card"] == csv_name and r["grade"] == "PSA 10":
                    psa10_val = r["avg"]
                    break

            psa9_val = card_cfg.get("psa9_value_override")
            if not psa9_val:
                for r in csv_data:
                    if r["card"] == csv_name and r["grade"] == "PSA 9":
                        psa9_val = r["avg"]
                        break
            if not psa9_val:
                psa9_val = (psa10_val or 0) * 0.3  # Rough estimate

            # Gem rates
            gem_rate = calc_gem_rates(csv_data, csv_name)

            # EV calculation
            ev = None
            if gem_rate and psa10_val:
                psa8_val = psa9_val * gem_cfg["psa8_value_fraction"]
                ev_return = (
                    (gem_rate["psa10"] / 100 * psa10_val)
                    + (gem_rate["psa9"] / 100 * psa9_val)
                    + (gem_rate["psa8"] / 100 * psa8_val)
                )
                ev = round(ev_return - all_in, 2)

            card_data["psa10_avg"] = psa10_val
            card_data["psa9_val"] = psa9_val
            card_data["gem_rate"] = gem_rate
            card_data["grading_math"] = {
                "raw": max_bid,
                "grading_cost": grading_cost,
                "all_in": round(all_in, 2),
                "psa10": psa10_val,
                "psa9": psa9_val,
                "profit10": round((psa10_val or 0) - all_in, 2),
                "roi10": (
                    round(((psa10_val or 0) - all_in) / all_in * 100)
                    if psa10_val
                    else 0
                ),
                "rec_tier": rec_tier,
                "rec_tier_name": rec_tier.replace("_", " ").title(),
            }
            card_data["ev"] = ev
            card_data["ev_roi"] = (
                round(ev / all_in * 100, 1) if ev and all_in > 0 else None
            )

        processed.append(card_data)

    return processed


# ─── Budget Portfolio Generation ──────────────────────────────

def generate_budgets(cards, config):
    """Generate budget portfolios ranked by EV ROI%."""
    budgets_cfg = config["budgets"]
    psa_pricing = config["psa_pricing"]

    # Get all grading plays sorted by EV ROI
    grading_plays = sorted(
        [c for c in cards if c.get("ev_roi") is not None and c["category"] == "grading"],
        key=lambda x: x["ev_roi"],
        reverse=True,
    )

    # Get all PSA 10 buy candidates
    psa10_buys = [c for c in cards if c["category"] in ("psa10buy", "psa10dip")]

    budgets = []
    for bcfg in budgets_cfg:
        budget = {
            "amount": bcfg["amount"],
            "title": bcfg["title"],
            "picks": [],
            "total_ev": 0,
            "grading_cost": 0,
        }

        remaining = bcfg["amount"]

        # Always include Collectors Club
        if bcfg.get("include_collectors_club"):
            budget["picks"].append(
                {
                    "card": "📦 PSA Collectors Club",
                    "qty": "1x",
                    "target": f"${psa_pricing['collectors_club']:.0f}",
                    "cost": f"${psa_pricing['collectors_club']:.0f}",
                    "why": "REQUIRED for Value Bulk. Saves $8/card vs Value tier.",
                    "ev": None,
                }
            )
            remaining -= psa_pricing["collectors_club"]

        # Allocate grading plays by EV ROI ranking
        grading_picks = []
        grading_card_count = 0
        max_grading = bcfg.get("max_grading_cards", 15)

        for gp in grading_plays:
            if grading_card_count >= max_grading:
                break

            gm = gp["grading_math"]
            tier_cost = gm["grading_cost"]
            card_cost = gp["max_bid"]

            # Determine quantity based on card cost and remaining budget
            if card_cost < 15:
                qty = min(15, max_grading - grading_card_count)
                # Scale down for smaller budgets
                if bcfg["amount"] <= 500:
                    qty = min(qty, 15)
                elif bcfg["amount"] <= 1000:
                    qty = min(qty, 10)
            elif card_cost < 50:
                qty = min(5, max_grading - grading_card_count)
                if bcfg["amount"] <= 500:
                    qty = min(qty, 4)
            else:
                qty = min(4, max_grading - grading_card_count)
                if bcfg["amount"] <= 500:
                    qty = 0  # Skip expensive cards at $500
                elif bcfg["amount"] <= 1000:
                    qty = min(qty, 2)

            if qty == 0:
                continue

            total_card_cost = card_cost * qty
            total_grading = tier_cost * qty

            if total_card_cost + total_grading > remaining * 0.8:
                # Don't let one card eat too much budget
                qty = max(1, int((remaining * 0.4) / (card_cost + tier_cost)))

            if qty == 0:
                continue

            total_card_cost = card_cost * qty
            total_grading = tier_cost * qty

            ev_str = f"+${gp['ev']:.2f}" if gp.get("ev") else None
            gem_str = f"{gp['gem_rate']['psa10']}% gem" if gp.get("gem_rate") else ""
            evr_str = f"{gp['ev_roi']:.0f}% EV ROI" if gp.get("ev_roi") else ""

            grading_picks.append(
                {
                    "card": f"{gp['player']} {gp['card'].split('#')[0].split('Prizm')[-1].split('Optic')[-1].strip()} Raw",
                    "qty": f"{qty}x",
                    "target": f"≤${card_cost:.2f} ea",
                    "cost": f"${total_card_cost:.0f}-{total_card_cost * 1.3:.0f}",
                    "why": f"{evr_str}. {gem_str}. EV {ev_str}/card." if ev_str else evr_str,
                    "ev": ev_str,
                    "grading_tier": gm["rec_tier"],
                    "grading_qty": qty,
                    "grading_cost_per": tier_cost,
                }
            )

            remaining -= total_card_cost
            budget["grading_cost"] += total_grading
            budget["total_ev"] += (gp.get("ev") or 0) * qty
            grading_card_count += qty

        budget["picks"].extend(grading_picks)

        # Add PSA 10 holds if budget allows
        if bcfg.get("include_psa10_holds"):
            max_holds = bcfg.get("max_psa10_holds", 2)
            holds_added = 0
            for p10 in sorted(psa10_buys, key=lambda x: x["vol"], reverse=True):
                if holds_added >= max_holds:
                    break
                if p10["max_bid"] > remaining * 0.5:
                    continue
                if p10["max_bid"] > remaining:
                    continue

                budget["picks"].append(
                    {
                        "card": f"{p10['player']} {p10['card'].split('#')[0].strip()} PSA 10",
                        "qty": "1x",
                        "target": f"≤${p10['max_bid']:.2f}",
                        "cost": f"${p10['max_bid'] * 0.85:.0f}-{p10['max_bid']:.0f}",
                        "why": f"Already graded. No gem rate risk. Sell window: {p10['sell_window']}.",
                        "ev": None,
                    }
                )
                remaining -= p10["max_bid"]
                holds_added += 1

        # Add grading cost line items
        bulk_cards = sum(
            p["grading_qty"]
            for p in grading_picks
            if p.get("grading_tier") == "value_bulk"
        )
        max_cards = sum(
            p["grading_qty"]
            for p in grading_picks
            if p.get("grading_tier") == "value_max"
        )
        plus_cards = sum(
            p["grading_qty"]
            for p in grading_picks
            if p.get("grading_tier") == "value_plus"
        )

        if bulk_cards > 0:
            cost = bulk_cards * psa_pricing["value_bulk"]
            budget["picks"].append(
                {
                    "card": f"📦 PSA Value Bulk ({bulk_cards} cards)",
                    "qty": str(bulk_cards),
                    "target": f"${psa_pricing['value_bulk']}/ea",
                    "cost": f"${cost:.0f}",
                    "why": f"~65-95 biz days → Jun-Aug.",
                    "ev": None,
                }
            )
        if max_cards > 0:
            cost = max_cards * psa_pricing["value_max"]
            budget["picks"].append(
                {
                    "card": f"📦 PSA Value Max ({max_cards} premium)",
                    "qty": str(max_cards),
                    "target": f"${psa_pricing['value_max']}/ea",
                    "cost": f"${cost:.0f}",
                    "why": f"~35 biz days → Apr-May.",
                    "ev": None,
                }
            )
        if plus_cards > 0:
            cost = plus_cards * psa_pricing["value_plus"]
            budget["picks"].append(
                {
                    "card": f"📦 PSA Value Plus ({plus_cards} cards)",
                    "qty": str(plus_cards),
                    "target": f"${psa_pricing['value_plus']}/ea",
                    "cost": f"${cost:.0f}",
                    "why": f"~45 biz days → May-Jun.",
                    "ev": None,
                }
            )

        budget["grading_cost_str"] = f"${budget['grading_cost']:.0f}"
        budget["total_ev_str"] = f"+${budget['total_ev']:.0f}"

        budgets.append(budget)

    return budgets


# ─── HTML Generation ──────────────────────────────────────────

def generate_html(cards, budgets, config, output_path):
    """Generate the standalone HTML report file."""
    players_cfg = config["players"]
    psa_pricing = config["psa_pricing"]
    psa_turnaround = config["psa_turnaround"]
    psa_back_by = config["psa_back_by"]
    sell_calendar = config.get("sell_calendar", [])
    formula_cfg = config["max_bid_formula"]

    now = datetime.now().strftime("%B %d, %Y")

    # Serialize data for embedding in HTML
    cards_json = json.dumps(cards, indent=2)
    budgets_json = json.dumps(budgets, indent=2)
    players_json = json.dumps(players_cfg, indent=2)
    psa_json = json.dumps(
        {
            "pricing": psa_pricing,
            "turnaround": psa_turnaround,
            "back_by": psa_back_by,
        },
        indent=2,
    )
    calendar_json = json.dumps(sell_calendar, indent=2)
    formula_json = json.dumps(formula_cfg, indent=2)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Brick Squad — eBay Max Bid & Sell Playbook</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 0 auto; padding: 12px 16px; color: #1a1a2e; background: #fff; }}
.header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; color: white; }}
.header h1 {{ font-size: 19px; font-weight: 700; }}
.header p {{ opacity: 0.8; font-size: 12px; margin-top: 6px; }}
.info-row {{ display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }}
.info-box {{ flex: 1; min-width: 250px; border-radius: 8px; padding: 10px 14px; font-size: 12px; }}
.info-blue {{ background: #eff6ff; border: 1px solid #93c5fd; }}
.info-red {{ background: #fef2f2; border: 1px solid #fca5a5; }}
.tabs {{ display: flex; gap: 4px; margin-bottom: 14px; overflow-x: auto; }}
.tab {{ padding: 8px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap; background: #f1f5f9; color: #475569; }}
.tab.active {{ background: #1a1a2e; color: white; }}
.tab-content {{ display: none; }}
.tab-content.active {{ display: block; }}
.card-row {{ border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; }}
.badge {{ border-radius: 3px; padding: 1px 6px; font-size: 9px; font-weight: 700; display: inline-block; }}
.badge-player {{ color: white; }}
.badge-raw {{ background: #fef3c7; color: #92400e; }}
.badge-psa10 {{ background: #dbeafe; color: #1e40af; }}
.badge-tier-s {{ background: #dc2626; color: white; }}
.badge-tier-a {{ background: #f59e0b; color: white; }}
.badge-tier-b {{ background: #94a3b8; color: white; }}
.badge-up {{ background: #dcfce7; color: #166534; }}
.badge-flat {{ background: #fef3c7; color: #92400e; }}
.badge-down {{ background: #fee2e2; color: #991b1b; }}
.stat-box {{ text-align: center; padding: 4px 8px; }}
.stat-label {{ font-size: 9px; color: #94a3b8; font-weight: 600; }}
.stat-value {{ font-size: 14px; font-weight: 800; }}
.max-bid-box {{ background: #f0fdf4; border-radius: 6px; padding: 5px 10px; border: 2px solid #16a34a; }}
.gem-box {{ border-radius: 6px; padding: 4px 8px; }}
.gem-green {{ background: #f0fdf4; border: 1px solid #86efac; }}
.gem-yellow {{ background: #fffbeb; border: 1px solid #fde68a; }}
.gem-red {{ background: #fef2f2; border: 1px solid #fca5a5; }}
.ev-box {{ border-radius: 6px; padding: 4px 8px; }}
.ev-positive {{ background: #eff6ff; border: 1px solid #93c5fd; }}
.ev-negative {{ background: #fef2f2; border: 1px solid #fca5a5; }}
.section-header {{ font-size: 16px; font-weight: 700; margin-bottom: 4px; }}
.section-sub {{ font-size: 12px; color: #64748b; margin-bottom: 12px; }}
.budget-header {{ background: linear-gradient(135deg, #1a1a2e, #0f3460); border-radius: 10px; padding: 16px 20px; color: white; margin-bottom: 12px; }}
.budget-pick {{ border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; background: #f8fafc; }}
.budget-pick.psa {{ background: #fef3c7; border-left: 4px solid #f59e0b; }}
.calendar-item {{ border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 6px; }}
.grading-card {{ border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }}
.grading-panels {{ display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }}
.grading-panel {{ flex: 1; min-width: 140px; border-radius: 6px; padding: 8px 10px; }}
.panel-default {{ background: #f8fafc; border: 1px solid #e2e8f0; }}
.panel-recommended {{ background: #f0fdf4; border: 2px solid #16a34a; }}
.footer {{ margin-top: 16px; padding: 10px 14px; background: #f1f5f9; border-radius: 8px; font-size: 10px; color: #94a3b8; }}
.flex {{ display: flex; }}
.flex-wrap {{ flex-wrap: wrap; }}
.gap-4 {{ gap: 4px; }}
.gap-6 {{ gap: 6px; }}
.gap-8 {{ gap: 8px; }}
.items-center {{ align-items: center; }}
.justify-between {{ justify-content: space-between; }}
.flex-1 {{ flex: 1; }}
.text-11 {{ font-size: 11px; }}
.text-12 {{ font-size: 12px; }}
.text-13 {{ font-size: 13px; }}
.fw-600 {{ font-weight: 600; }}
.fw-700 {{ font-weight: 700; }}
.fw-800 {{ font-weight: 800; }}
.color-gray {{ color: #64748b; }}
.color-green {{ color: #166534; }}
.color-red {{ color: #dc2626; }}
.color-blue {{ color: #1d4ed8; }}
.mt-4 {{ margin-top: 4px; }}
.mt-6 {{ margin-top: 6px; }}
.mb-6 {{ margin-bottom: 6px; }}
.mb-8 {{ margin-bottom: 8px; }}
.shrink-0 {{ flex-shrink: 0; }}
.collapsible {{ cursor: pointer; }}
.collapse-content {{ display: none; }}
.collapse-content.open {{ display: block; }}
</style>
</head>
<body>

<div class="header">
  <div class="flex items-center gap-8">
    <span style="font-size:24px">🏀</span>
    <h1>Brick Squad — eBay Max Bid & Sell Playbook</h1>
  </div>
  <p>FMV-weighted max bids with trend multipliers | Generated {now}</p>
</div>

<div class="info-row">
  <div class="info-box info-blue">
    <strong>📊 Max Bid Formula</strong>
    <span class="collapsible" onclick="toggleCollapse('formula-detail')" style="float:right;color:#64748b">▼</span>
    <div id="formula-detail" class="collapse-content" style="margin-top:6px;font-size:11px;line-height:1.6">
      <div><strong>FMV</strong> = (30d avg × {formula_cfg['fmv_avg_weight']}) + (last sale × {formula_cfg['fmv_last_weight']})</div>
      <div><strong>Trend</strong> = (last sale − avg) / avg</div>
      <div style="margin-top:4px">
        <span class="badge badge-up">📈 UP (&gt;+{int(formula_cfg['up_threshold']*100)}%)</span> mult = {formula_cfg['up_multiplier']} — aggressive
      </div>
      <div><span class="badge badge-flat">➡️ FLAT (±{int(formula_cfg['up_threshold']*100)}%)</span> mult = {formula_cfg['flat_multiplier']} — standard</div>
      <div><span class="badge badge-down">📉 DOWN (&lt;-{int(abs(formula_cfg['down_threshold'])*100)}%)</span> mult = {formula_cfg['down_multiplier']} — defensive</div>
      <div style="margin-top:4px"><strong>Max Bid</strong> = FMV × multiplier</div>
    </div>
  </div>
  <div class="info-box info-red">
    <strong>⚠️ PSA Pricing:</strong>
    Value Bulk ${psa_pricing['value_bulk']} |
    Value ${psa_pricing['value']} |
    Value Plus ${psa_pricing['value_plus']} |
    Value Max ${psa_pricing['value_max']} |
    Regular ${psa_pricing['regular']}.
    <strong>Collectors Club (${psa_pricing['collectors_club']}/yr) required</strong> for Value Bulk.
  </div>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('budgets')">💰 Budget Portfolios</button>
  <button class="tab" onclick="switchTab('buylist')">📋 Buy List + Max Bids</button>
  <button class="tab" onclick="switchTab('grading')">🔬 Grading Math</button>
  <button class="tab" onclick="switchTab('timing')">⏰ When to Sell</button>
</div>

<div id="tab-budgets" class="tab-content active"></div>
<div id="tab-buylist" class="tab-content"></div>
<div id="tab-grading" class="tab-content"></div>
<div id="tab-timing" class="tab-content"></div>

<div class="footer">
  Max bid = FMV × trend multiplier. Gem rates from 30-day eBay graded sales distribution.
  EV = (gem% × PSA10) + (PSA9% × PSA9) + (PSA8% × est.) − all-in cost.
  Factor eBay fees (~13%) + shipping. This is not financial advice.
</div>

<script>
const CARDS = {cards_json};
const BUDGETS = {budgets_json};
const PLAYERS = {players_json};
const PSA = {psa_json};
const CALENDAR = {calendar_json};

const fmtD = (n) => n >= 1000 ? '$' + (n/1000).toFixed(2) + 'K' : '$' + n.toFixed(2);

const tierColors = {{ S: '#dc2626', A: '#f59e0b', B: '#94a3b8' }};
const trendIcons = {{ UP: '📈', FLAT: '➡️', DOWN: '📉' }};

function switchTab(id) {{
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  event.target.classList.add('active');
}}

function toggleCollapse(id) {{
  document.getElementById(id).classList.toggle('open');
}}

// ─── Render Budget Portfolios ───
function renderBudgets() {{
  const container = document.getElementById('tab-budgets');
  let html = '<h2 class="section-header">Budget Portfolio Builder</h2>';
  html += '<p class="section-sub">All picks ranked by EV ROI%. Gem rates factored into expected returns.</p>';

  // Budget selector buttons
  html += '<div class="flex gap-4 mb-8">';
  BUDGETS.forEach((b, i) => {{
    html += `<button class="tab ${{i===0?'active':''}}" onclick="showBudget(${{i}}, this)">${{b.title.split('—')[0].trim()}}</button>`;
  }});
  html += '</div>';

  BUDGETS.forEach((b, i) => {{
    html += `<div id="budget-${{i}}" style="display:${{i===0?'block':'none'}}">`;
    html += `<div class="budget-header">
      <h3 style="margin-bottom:4px;font-size:16px">${{b.title}}</h3>
      <div class="flex gap-8 flex-wrap" style="margin-top:10px">
        <div><div style="font-size:10px;opacity:0.7">GRADING COST</div><div style="font-size:15px;font-weight:700;color:#fbbf24">${{b.grading_cost_str}}</div></div>
        <div><div style="font-size:10px;opacity:0.7">TOTAL SUBMISSION EV</div><div style="font-size:15px;font-weight:700;color:#4ade80">${{b.total_ev_str}}</div></div>
      </div>
    </div>`;

    b.picks.forEach(p => {{
      const isPSA = p.card.startsWith('📦');
      html += `<div class="budget-pick ${{isPSA?'psa':''}}">
        <div class="flex justify-between flex-wrap gap-8">
          <div style="flex:1;min-width:200px">
            <div class="text-13 fw-700">${{p.card}}</div>
            <div class="text-11 color-gray mt-4">${{p.why}}</div>
          </div>
          <div class="flex gap-8 shrink-0">
            <div class="stat-box"><div class="stat-label">QTY</div><div class="text-13 fw-700">${{p.qty}}</div></div>
            <div class="stat-box"><div class="stat-label" style="color:#166534">MAX BID</div><div class="text-13 fw-700" style="color:#166534">${{p.target}}</div></div>
            <div class="stat-box"><div class="stat-label">COST</div><div class="text-13 fw-700">${{p.cost}}</div></div>
            ${{p.ev ? `<div class="stat-box"><div class="stat-label" style="color:#1d4ed8">EV/CARD</div><div class="text-13 fw-700" style="color:#1d4ed8">${{p.ev}}</div></div>` : ''}}
          </div>
        </div>
      </div>`;
    }});

    html += '</div>';
  }});

  container.innerHTML = html;
}}

function showBudget(idx, btn) {{
  BUDGETS.forEach((_, i) => {{
    document.getElementById('budget-' + i).style.display = i === idx ? 'block' : 'none';
  }});
  btn.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}}

// ─── Render Buy List ───
function renderBuyList() {{
  const container = document.getElementById('tab-buylist');
  let html = '<div class="text-11 color-gray mb-8">Showing ' + CARDS.length + ' cards • Max bids from FMV formula</div>';

  CARDS.forEach(c => {{
    const playerColor = c.player_color || '#475569';
    const gradeBadge = c.grade === 'Raw' ? 'badge-raw' : 'badge-psa10';
    const tierBadge = 'badge-tier-' + c.tier.toLowerCase();
    const trendBadge = 'badge-' + c.trend.toLowerCase();
    const trendSign = c.trend_pct > 0 ? '+' : '';

    html += `<div class="card-row" style="border-left:4px solid ${{playerColor}}">
      <div class="flex justify-between flex-wrap gap-8">
        <div style="flex:1;min-width:220px">
          <div class="flex items-center gap-4 flex-wrap">
            <span class="badge badge-player" style="background:${{playerColor}}">${{c.player}}</span>
            <span class="badge ${{gradeBadge}}">${{c.grade}}</span>
            <span class="badge ${{tierBadge}}">TIER ${{c.tier}}</span>
            <span class="badge ${{trendBadge}}">${{trendIcons[c.trend]}} ${{c.trend}} ${{trendSign}}${{c.trend_pct.toFixed(0)}}%</span>
            <span class="text-12 fw-600">${{c.card}}</span>
          </div>
          <p class="text-11 color-gray mt-4">${{c.sell_window}}</p>
        </div>
        <div class="flex gap-8 shrink-0 items-center">
          <div class="stat-box max-bid-box">
            <div class="stat-label" style="color:#166534">MAX BID</div>
            <div class="stat-value" style="color:#166534;font-size:16px">${{fmtD(c.max_bid)}}</div>
          </div>
          <div class="stat-box"><div class="stat-label">FMV</div><div class="text-12 fw-600">${{fmtD(c.fmv)}}</div></div>
          <div class="stat-box"><div class="stat-label">30D AVG</div><div class="text-12 fw-600">${{fmtD(c.avg)}}</div></div>
          <div class="stat-box"><div class="stat-label">LAST</div><div class="text-12 fw-600">${{fmtD(c.last)}}</div></div>
          <div class="stat-box"><div class="stat-label">VOL</div><div class="text-12 fw-600">${{c.vol}}</div></div>`;

    // PSA 10 ROI + Gem Rate + EV badges for raw grading plays
    if (c.grade === 'Raw' && c.psa10_avg && c.grading_math) {{
      const gm = c.grading_math;
      const roi = gm.roi10;
      html += `<div class="stat-box" style="background:#fef2f2;border-radius:6px">
        <div class="stat-label" style="color:#dc2626">PSA10 ROI</div>
        <div class="stat-value" style="color:#dc2626">${{roi}}%</div>
        <div style="font-size:9px;color:#94a3b8">${{fmtD(c.psa10_avg)}}</div>
      </div>`;

      if (c.gem_rate) {{
        const gr = c.gem_rate;
        const gemClass = gr.psa10 >= 50 ? 'gem-green' : gr.psa10 >= 35 ? 'gem-yellow' : 'gem-red';
        const gemColor = gr.psa10 >= 50 ? '#166534' : gr.psa10 >= 35 ? '#92400e' : '#991b1b';
        html += `<div class="stat-box gem-box ${{gemClass}}">
          <div class="stat-label" style="color:#64748b">GEM RATE</div>
          <div class="stat-value" style="color:${{gemColor}}">${{gr.psa10}}%</div>
          <div style="font-size:9px;color:#94a3b8">n=${{gr.sample_size}}</div>
        </div>`;
      }}

      if (c.ev !== null && c.ev !== undefined) {{
        const evClass = c.ev > 0 ? 'ev-positive' : 'ev-negative';
        const evColor = c.ev > 0 ? '#1d4ed8' : '#991b1b';
        html += `<div class="stat-box ev-box ${{evClass}}">
          <div class="stat-label" style="color:#64748b">EV/CARD</div>
          <div class="stat-value" style="color:${{evColor}}">${{c.ev >= 0 ? '+' : ''}}${{fmtD(c.ev)}}</div>
          <div style="font-size:9px;color:#94a3b8">expected</div>
        </div>`;
      }}
    }}

    html += `</div></div></div>`;
  }});

  container.innerHTML = html;
}}

// ─── Render Grading Math ───
function renderGrading() {{
  const container = document.getElementById('tab-grading');
  let html = '<h2 class="section-header">Grading ROI — At Max Bid Entry + PSA Pricing</h2>';
  html += '<p class="section-sub">ROI at PSA 10 + gem rate probability + expected value per submission.</p>';

  const gradingCards = CARDS.filter(c => c.grading_math && c.grade === 'Raw');

  gradingCards.forEach(c => {{
    const gm = c.grading_math;
    const playerColor = c.player_color || '#475569';
    const tierBadge = 'badge-tier-' + c.tier.toLowerCase();
    const trendBadge = 'badge-' + c.trend.toLowerCase();
    const trendSign = c.trend_pct > 0 ? '+' : '';

    html += `<div class="grading-card" style="border-left:4px solid ${{playerColor}}">
      <div class="flex items-center gap-4 flex-wrap mb-6">
        <span class="badge badge-player" style="background:${{playerColor}}">${{c.player}}</span>
        <span class="badge ${{tierBadge}}">TIER ${{c.tier}}</span>
        <span class="badge ${{trendBadge}}">${{trendIcons[c.trend]}} ${{c.trend}} ${{trendSign}}${{c.trend_pct.toFixed(0)}}%</span>
        <span class="text-13 fw-700">${{c.card}}</span>
        <span class="text-11 color-gray">| Max bid ${{fmtD(gm.raw)}}</span>
      </div>
      <div class="grading-panels">
        <div class="grading-panel panel-recommended">
          <div style="font-size:9px;font-weight:700;color:#16a34a;margin-bottom:2px">✓ RECOMMENDED</div>
          <div style="font-size:10px;font-weight:600;color:#64748b">${{gm.rec_tier_name}} ($$${{gm.grading_cost}})</div>
          <div class="text-11">All-in: <strong>$$${{gm.all_in.toFixed(2)}}</strong></div>
          <div class="text-11">PSA 10 profit: <strong style="color:#16a34a">$$${{gm.profit10.toFixed(0)}}</strong></div>
          <div class="text-11">ROI: <strong style="color:#dc2626">${{gm.roi10}}%</strong></div>
        </div>
        <div class="grading-panel panel-default">
          <div style="font-size:10px;font-weight:600;color:#64748b">Graded Values</div>
          <div class="text-11">PSA 10: <strong style="color:#2563eb">${{gm.psa10 ? '$' + gm.psa10.toFixed(0) : 'N/A'}}</strong></div>
          <div class="text-11">PSA 9: <strong>${{gm.psa9 ? '$' + gm.psa9.toFixed(0) : 'N/A'}}</strong></div>
          <div class="text-11">30d raw vol: <strong>${{c.vol}}</strong></div>
        </div>`;

    if (c.gem_rate) {{
      const gr = c.gem_rate;
      const gemEmoji = gr.psa10 >= 50 ? '🟢' : gr.psa10 >= 35 ? '🟡' : '🔴';
      const gemBorder = gr.psa10 >= 50 ? '#16a34a' : gr.psa10 >= 35 ? '#f59e0b' : '#ef4444';
      const gemBg = gr.psa10 >= 50 ? '#f0fdf4' : gr.psa10 >= 35 ? '#fffbeb' : '#fef2f2';
      const gemColor = gr.psa10 >= 50 ? '#166534' : gr.psa10 >= 35 ? '#92400e' : '#991b1b';

      const ev = c.ev || 0;
      const ev10 = ev * 10;
      const evColor = ev > 0 ? '#166534' : '#991b1b';

      html += `<div class="grading-panel" style="background:${{gemBg}};border:2px solid ${{gemBorder}};min-width:160px">
        <div style="font-size:10px;font-weight:700;color:${{gemColor}};margin-bottom:2px">${{gemEmoji}} Gem Rate & EV</div>
        <div class="text-11">PSA 10: <strong>${{gr.psa10}}%</strong> · PSA 9: <strong>${{gr.psa9}}%</strong> · PSA 8: <strong>${{gr.psa8}}%</strong></div>
        <div style="font-size:10px;color:#64748b;margin-bottom:4px">Based on ${{gr.sample_size}} graded sales</div>
        <div style="border-top:1px solid #e2e8f0;padding-top:4px">
          <div class="text-11">EV per card: <strong style="color:${{evColor}}">${{ev >= 0 ? '+' : ''}}${{fmtD(ev)}}</strong></div>
          <div class="text-11">EV per 10: <strong style="color:${{evColor}}">${{ev10 >= 0 ? '+' : ''}}${{fmtD(ev10)}}</strong></div>
        </div>
        <div style="font-size:9px;color:#94a3b8;margin-top:3px">EV = (gem% × PSA10) + (9% × PSA9) + (8% × PSA8) − all-in</div>
      </div>`;
    }}

    html += `</div>
      <div class="text-11 color-gray">⏱ ${{gm.rec_tier_name}}: ${{PSA.turnaround[gm.rec_tier] || 'N/A'}} → back by ${{PSA.back_by[gm.rec_tier] || 'N/A'}} | Sell: ${{c.sell_window}}</div>
    </div>`;
  }});

  container.innerHTML = html;
}}

// ─── Render Sell Timing ───
function renderTiming() {{
  const container = document.getElementById('tab-timing');
  let html = '<h2 class="section-header" style="margin-bottom:12px">When to Sell — Catalyst Calendar</h2>';

  const colors = ['#16a34a', '#2563eb', '#7c3aed', '#dc2626', '#64748b', '#9333ea', '#059669'];
  const bgs = ['#f0fdf4', '#eff6ff', '#f5f3ff', '#fef2f2', '#f8fafc', '#faf5ff', '#ecfdf5'];

  CALENDAR.forEach((e, i) => {{
    const color = colors[i % colors.length];
    const bg = bgs[i % bgs.length];
    html += `<div class="calendar-item" style="background:${{bg}};border-left:4px solid ${{color}}">
      <div class="flex justify-between items-center mb-4">
        <span class="text-13 fw-700">${{e.date}} — ${{e.label}}</span>
        <span class="badge" style="background:${{color}};color:white;padding:2px 8px;font-size:10px">${{e.action}}</span>
      </div>
      <p class="text-12" style="color:#475569">${{e.note}}</p>
      ${{e.current ? '<p class="text-12 fw-600" style="color:#b45309;margin-top:6px">👉 YOU ARE HERE</p>' : ''}}
    </div>`;
  }});

  container.innerHTML = html;
}}

// ─── Initialize ───
renderBudgets();
renderBuyList();
renderGrading();
renderTiming();
</script>
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"✅ Report generated: {output_path}")
    print(f"   Cards processed: {len(cards)}")
    print(f"   Grading plays: {sum(1 for c in cards if c.get('grading_math'))}")
    print(f"   Budgets: {len(budgets)}")


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate Brick Squad card investment report"
    )
    parser.add_argument(
        "--csv", required=True, help="Path to 30-day sales CSV"
    )
    parser.add_argument(
        "--config", default="config.yaml", help="Path to config YAML (default: config.yaml)"
    )
    parser.add_argument(
        "--output", default=None, help="Output HTML path (default: report-YYYY-MM-DD.html)"
    )
    args = parser.parse_args()

    # Default output filename with date
    if not args.output:
        date_str = datetime.now().strftime("%Y-%m-%d")
        args.output = f"report-{date_str}.html"

    # Load config
    config_path = Path(args.config)
    if not config_path.exists():
        print(f"ERROR: Config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    # Load CSV
    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"ERROR: CSV file not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading CSV: {csv_path}")
    csv_data = load_csv(csv_path)
    print(f"  Loaded {len(csv_data)} rows")

    # Process cards
    print("Processing cards...")
    cards = process_cards(csv_data, config)
    print(f"  Processed {len(cards)} cards")

    # Generate budgets
    print("Generating budget portfolios...")
    budgets = generate_budgets(cards, config)

    # Generate HTML
    print(f"Generating report: {args.output}")
    generate_html(cards, budgets, config, args.output)


if __name__ == "__main__":
    main()
