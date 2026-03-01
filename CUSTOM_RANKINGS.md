# Custom Rankings System

## Overview

The platform now supports uploading and displaying custom rankings from multiple sources alongside FantasyCalc and VFF rankings.

## Database Schema

### `ranking_sources`
Stores metadata about each ranking source (e.g., "RP 2026").

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Unique identifier (e.g., `reception_perception_2026`) |
| `display_name` | TEXT | Human-readable name |
| `description` | TEXT | Optional description |
| `is_active` | BOOLEAN | Whether to show this source |

### `custom_rankings`
Stores individual player rankings for each source.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `source_id` | UUID | Foreign key to `ranking_sources` |
| `sleeper_id` | TEXT | Foreign key to `players` |
| `rank` | INTEGER | Player's rank in this source |
| `notes` | TEXT | Optional notes/analysis |
| `signal` | TEXT | Buy/Sell/Hold signal |

## CSV Format

The system accepts tab-separated CSV files with the following columns:

| Column | Required | Description |
|--------|----------|-------------|
| `Rank` | Yes | Player's rank (integer) |
| `Player` | Yes | Player's full name |
| `Notes` | No | Analysis or commentary |
| `Buy/Sell/Hold` | No | Trading signal |

**Example:**
```
Rank	Player	Draft Year	Notes	Buy/Sell/Hold
1	Puka Nacua	2023	Awesome as a rookie...	Super Buy
2	Ja'Marr Chase	2021	No holes in his game...	Buy
```

## Importing Rankings

### Method 1: CLI Script

```bash
npx tsx scripts/import-rankings.ts path/to/rankings.csv
```

The script will:
1. Parse the CSV file
2. Create/update the ranking source
3. Match player names to Sleeper IDs
4. Import all rankings
5. Report matched/unmatched players

### Method 2: Admin UI

Navigate to `/admin/rankings` and use the upload form:

1. Enter a unique **Source Name** (e.g., `reception_perception_2026`)
2. Enter a **Display Name** (e.g., "RP 2026")
3. Add an optional **Description**
4. Upload your CSV file
5. Click "Upload Rankings"

The UI will show:
- Number of players matched
- List of unmatched players (if any)

## Player Name Matching

The system matches players by:
1. Exact name match (case-sensitive)
2. Case-insensitive match
3. Reports unmatched names for manual review

**Common mismatches:**
- Nicknames (e.g., "AJ Brown" vs "A.J. Brown")
- Suffixes (e.g., "Marvin Harrison" vs "Marvin Harrison Jr.")
- Spelling variations

## Displaying Custom Rankings

### In Components

Use the `CustomRankingsBadge` component:

```tsx
import { CustomRankingsBadge } from "@/components/CustomRankingsBadge";
import { getCustomRankings, buildCustomRankingsMap } from "@/lib/custom-rankings";

// In your server component
const customRankings = await getCustomRankings();
const rankingsMap = buildCustomRankingsMap(customRankings);

// Pass to client component
<CustomRankingsBadge rankings={rankingsMap.get(player.sleeper_id) || []} />
```

### Signal Colors

| Signal | Color |
|--------|-------|
| Super Buy | Green (600) |
| Buy | Green (500) |
| Hold | Gray (400) |
| Sell | Red (500) |
| Super Sell | Red (600) |

## API Endpoints

### Upload Rankings
```
POST /api/rankings/upload
Content-Type: multipart/form-data

Fields:
- file: CSV file
- sourceName: Unique identifier
- displayName: Human-readable name
- description: Optional description

Response:
{
  "success": true,
  "matched": 107,
  "unmatched": ["Player Name 1", "Player Name 2"],
  "total": 109
}
```

## Managing Sources

### Deactivate a Source

```sql
UPDATE ranking_sources 
SET is_active = false 
WHERE name = 'old_source_name';
```

### Delete a Source

```sql
DELETE FROM ranking_sources WHERE name = 'source_name';
-- Cascades to custom_rankings automatically
```

## Future Enhancements

- [ ] Source selector in UI to toggle between ranking sources
- [ ] Comparison view showing multiple sources side-by-side
- [ ] Historical tracking of ranking changes over time
- [ ] Bulk edit/delete rankings
- [ ] Export rankings to CSV
- [ ] API endpoint to fetch rankings by source
