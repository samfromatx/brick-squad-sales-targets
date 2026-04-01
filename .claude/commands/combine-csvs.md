# Combine & Deploy CSV Sales Data

Process new CSV exports from the drop folder into the project's data files.

## Paths
- **Drop folder:** `~/Documents/brick-card-sales/csv-imports/`
- **Project data:** `~/Documents/bricksquad-apps/brick-squad-sales-targets/docs/data/` and `data/`

## File naming convention
Downloaded files follow the pattern:
`{sport}-all-players-{type}-last-{N}-days-{min}-{max}.csv`

Examples:
- `basketball-all-players-raw-last-360-days-5-9.csv`
- `football-all-players-graded-last-180-days-25-49.csv`

Where `{min}-{max}` is the sales count range for that export slice.

## Steps to execute

### 1. Scan and report
List all CSV files in the drop folder. If none found, stop and tell the user. Group them by `{sport}+{type}+{N}` and show a summary table of what was found before doing anything.

### 2. Combine slices within each group
For each `{sport}+{type}+{N}` group (e.g. all the `basketball-raw-360` files):
- Sort files in the group by their `{min}` sales number ascending (so lowest range first)
- Take the CSV header from the first file
- Append data rows (skip header line) from every file in the group
- Write to a temp combined file

Use bash:
```bash
TEMP=$(mktemp -d)
# for each group, e.g. basketball-raw-360:
out="$TEMP/basketball-raw-360.csv"
head -1 "first_file.csv" > "$out"
for f in sorted_files; do tail -n +2 "$f" >> "$out"; done
```

### 3. Merge raw + graded into final output files
For each `{sport}+{N}` pair where both raw and graded combined files exist:
```bash
{ head -1 raw_combined.csv; tail -n +2 raw_combined.csv; tail -n +2 graded_combined.csv; } > final.csv
```

Final filename format: `{sport}-all-players-last-{N}-days.csv`

If only raw or only graded exists for a window, use what's available and note it.

### 4. Copy to project
Copy each final file to both:
- `~/Documents/bricksquad-apps/brick-squad-sales-targets/docs/data/`
- `~/Documents/bricksquad-apps/brick-squad-sales-targets/data/`

Only overwrite files that were actually updated in this run.

### 5. Show summary table
Print a table like:
```
Window              | Rows   | Updated
--------------------|--------|--------
football 180d       | 68,928 | ✅
basketball 360d     | 49,944 | ✅
```

### 6. Commit and push
```bash
git add docs/data/ data/
git commit -m "Update CSV data: {list windows updated} — {today's date}"
git push
```

### 7. Offer to clear the drop folder
Ask the user: "Drop folder processed. Clear the {N} source files from csv-imports?"
If yes, delete the CSV files from the drop folder (not the folder itself).

## Error handling
- If a file doesn't match the expected naming pattern, skip it and warn the user
- If a group is missing its raw or graded counterpart, process what exists and flag it
- Always show row counts so the user can sanity-check the data
