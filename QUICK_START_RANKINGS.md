# Quick Start: Uploading Custom Rankings

## Via Admin Dashboard (Recommended)

1. Navigate to `http://localhost:3000/admin`

2. Scroll to **"Upload Additional Rankings"** section

3. Fill in the form:
   - **Source Name (ID)**: Unique identifier like `reception_perception_2026`
   - **Display Name**: Human-readable name like `RP 2026`
   - **Description**: Optional description
   - **CSV/TSV File**: Your rankings file

4. Click **"Upload Additional Rankings"**

5. Review the results showing matched/unmatched players

## CSV Format

Your file should be tab-separated with these columns:

```
Rank	Player	Notes	Buy/Sell/Hold
1	Puka Nacua	Great player...	Super Buy
2	Ja'Marr Chase	Elite WR...	Buy
```

**Required columns:**
- `Rank` - Integer ranking
- `Player` - Full player name

**Optional columns:**
- `Notes` - Analysis text
- `Buy/Sell/Hold` - Trading signal

## Via CLI (Alternative)

```bash
npx tsx scripts/import-rankings.ts path/to/your-rankings.csv
```

This will automatically create a source called "RP 2026" (you can edit the script to change this).

## What Happens Next?

The system will:
1. ✅ Match player names to your database
2. ✅ Store rankings with notes and signals
3. ✅ Report any unmatched players
4. ✅ Make rankings available for display in components

## Viewing Imported Rankings

```bash
npx tsx scripts/view-rankings.ts
```

This shows all active ranking sources and sample data.
