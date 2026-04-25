# Combine & Deploy CSV Sales Data

Process new CSV exports from the drop folder into the project's data files, then upload to Supabase.

## Paths
- **Drop folder:** `~/Documents/brick-card-sales/csv-imports/`
- **Project data:** `~/Documents/bricksquad-apps/brick-squad-sales-targets/docs/data/` and `data/`
- **Upload script:** `~/Documents/bricksquad-apps/brick-squad-sales-targets/scripts/upload-market-data.mjs`

## File naming conventions

Two patterns are supported. Files in the drop folder may use either.

### Pattern A — Sales-range slices (original)
`{sport}-all-players-{type}-last-{N}-days-{min}.csv`
or with an optional max:
`{sport}-all-players-{type}-last-{N}-days-{min}-{max}.csv`

Examples:
- `basketball-all-players-raw-last-360-days-5-9.csv`
- `football-all-players-graded-last-180-days-25.csv`

Where `{min}` is the lower bound of the sales count range; `-{max}` is optional.

### Pattern B — Set-based slices (new)
`{sport}-{type}-{set}-last-{N}-days-{part}.csv`

Examples:
- `football-raw-prizm-last-90-days-1.csv`
- `football-raw-select-last-90-days-2.csv`
- `football-raw-other-last-90-days-3.csv`
- `basketball-graded-prizm-last-30-days-1.csv`

Where `{set}` is the card set name (e.g. `prizm`, `select`, `other`) and `{part}` is a sequence number (1, 2, 3…). All parts across all sets for the same `{sport}+{type}+{N}` get merged together.

## Steps to execute

### 1. Scan and report
List all CSV files in the drop folder. If none found, stop and tell the user. Detect which pattern each file matches and group them by `{sport}+{type}+{N}`. Show a summary table of what was found (including which pattern was detected) before doing anything.

### 2. Combine slices within each group
For each `{sport}+{type}+{N}` group, collect all files regardless of which pattern they use:

- **Pattern A** regex: `^(football|basketball)-all-players-(raw|graded)-last-(\d+)-days-(\d+)(-\d+)?\.csv$`
  - Sort by `{min}` ascending
- **Pattern B** regex: `^(football|basketball)-(raw|graded)-(\w+)-last-(\d+)-days-(\d+)\.csv$`
  - Sort by `{set}` name then `{part}` number (e.g. other-1, other-2, prizm-1, prizm-2, select-1, select-2)

If a group has files from both patterns, combine them all — Pattern A files first (sorted by min), then Pattern B files (sorted by set+part).

- Take the CSV header from the first file in the group
- Append data rows (skip header line) from every subsequent file
- Write to a temp combined file

```bash
TEMP=$(mktemp -d)
# for each group, e.g. football-raw-90:
out="$TEMP/football-raw-90.csv"
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

### 5. Upload to Supabase
After copying, upload the updated windows to Supabase using the upload script.

Check if `SUPABASE_SERVICE_KEY` is set in the environment:
```bash
echo ${SUPABASE_SERVICE_KEY:+set}
```

**If set:** run the upload script, passing only the windows updated in this run:
```bash
SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
  /opt/homebrew/bin/node \
  ~/Documents/bricksquad-apps/brick-squad-sales-targets/scripts/upload-market-data.mjs \
  --windows {N,N,...} \
  --sports {sport,sport,...}
```

Where `{N,N,...}` is the comma-separated list of window values that were actually updated (e.g. `30,180`) and `{sport,sport,...}` are the sports that had updates.

**If not set:** skip this step and note in the summary:
> ⚠️ Supabase upload skipped — set SUPABASE_SERVICE_KEY to enable automatic uploads.
> Get it from: Supabase Dashboard → Settings → API → service_role key
> Then add to your shell profile: `export SUPABASE_SERVICE_KEY=<key>`

### 6. Show summary table
Print a table like:
```
Window              | Rows   | Updated | Supabase
--------------------|--------|---------|----------
football 180d       | 68,928 | ✅      | ✅
basketball 360d     | 49,944 | ✅      | ✅
```

Include a Supabase column showing upload status (✅ uploaded, ⚠️ skipped, ❌ error).

### 7. Commit and push
```bash
git add docs/data/ data/
git commit -m "Update CSV data: {list windows updated} — {today's date}"
git push
```

### 8. Offer to clear the drop folder
Ask the user: "Drop folder processed. Clear the {N} source files from csv-imports?"
If yes, delete the CSV files from the drop folder (not the folder itself).

## Error handling
- If a file doesn't match the expected naming pattern, skip it and warn the user
- If a group is missing its raw or graded counterpart, process what exists and flag it
- If the Supabase upload fails, report the error but do not block the git commit — local files are the source of truth
- Always show row counts so the user can sanity-check the data
