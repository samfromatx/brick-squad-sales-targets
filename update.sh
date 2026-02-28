#!/bin/bash
# Monthly update: drop new CSV in data/, run this script, then push.
# Usage:
#   ./update.sh                              # uses data/top-players-last-30-days.csv
#   ./update.sh data/march-2026.csv          # uses a specific file

CSV=${1:-data/top-players-last-30-days.csv}

echo "📊 Generating report from: $CSV"
source .venv/bin/activate
python3 generate_report.py --csv "$CSV" --output docs/index.html

echo ""
echo "✅ Done. Push to update the live page:"
echo "   git add -A && git commit -m \"Update report $(date +%Y-%m-%d)\" && git push"
