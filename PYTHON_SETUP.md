# Python NFL Stats Ingestion Setup

## Prerequisites

- Python 3.8+ installed
- PostgreSQL database (already configured via `DATABASE_URL`)

## Installation

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

   Or if you prefer using a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

## Database Schema Update

Push the updated schema to add new columns:

```bash
npx drizzle-kit push
```

This adds:
- `target_share` - Percentage of team targets
- `air_yards_share` - Percentage of team air yards
- `wopr` - Weighted Opportunity Rating (combines target share + air yards share)
- `racr` - Receiver Air Conversion Ratio (yards per air yard)
- `fantasy_points` - Standard fantasy points
- `fantasy_points_ppr` - PPR fantasy points

## Running the Ingestion

```bash
python scripts/ingest-nfl-stats-py.py
```

This will:
1. Fetch 2024 weekly NFL data from `nfl_data_py`
2. Insert/update records in `weekly_player_stats` table
3. Handle duplicates via `ON CONFLICT DO UPDATE`

## Scheduling (Optional)

### Option 1: Manual
Run the script whenever you want fresh data (e.g., Monday mornings after games).

### Option 2: Cron (Linux/Mac)
```bash
# Run every Monday at 9 AM
0 9 * * 1 cd /path/to/project && python scripts/ingest-nfl-stats-py.py
```

### Option 3: GitHub Actions
Create `.github/workflows/ingest-nfl-stats.yml`:

```yaml
name: Ingest NFL Stats
on:
  schedule:
    - cron: '0 14 * * 1'  # Every Monday at 9 AM EST (14:00 UTC)
  workflow_dispatch:  # Allow manual trigger

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: python scripts/ingest-nfl-stats-py.py
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Then add `DATABASE_URL` to your GitHub repository secrets.

## Verifying Data

Check the data was imported:

```bash
npx tsx scripts/verify-nfl-data.ts
```

Or query directly:
```sql
SELECT COUNT(*) FROM weekly_player_stats WHERE season = 2024;
```

## Updating for Future Seasons

Edit `scripts/ingest-nfl-stats-py.py` line 28:
```python
df = nfl.import_weekly_data([2024, 2025], columns=[...])
```

## Troubleshooting

**Error: `DATABASE_URL` not found**
- Ensure `.env.local` exists with `DATABASE_URL=...`

**Error: `relation "weekly_player_stats" does not exist`**
- Run `npx drizzle-kit push` to create the table

**Error: `column "target_share" does not exist`**
- Run `npx drizzle-kit push` to add new columns

**No data returned**
- Check that 2024 season data is available in `nfl_data_py`
- Try running with `[2023]` to test with completed season
