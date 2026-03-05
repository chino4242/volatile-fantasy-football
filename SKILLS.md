# Technical Skills & Implementation Details

This document outlines the key technical implementations and patterns used in the Volatile Fantasy Football platform.

## Draft Pick Management

### Overview
The platform generates and tracks all draft picks for dynasty leagues, including traded picks, and integrates them with player valuations for comprehensive team analysis.

### Implementation

#### 1. Draft Pick Generation (`src/lib/sleeper.ts`)

```typescript
export function getAllDraftPicks(
  rosters: SleeperRoster[], 
  tradedPicks: SleeperTradedPick[], 
  currentYear: number = 2026
): DraftPick[]
```

- Generates all picks for next 3 years (configurable)
- Creates 5 rounds per year per team (standard dynasty format)
- Applies trades from Sleeper API to update ownership
- Returns picks with both `originalOwner` and `currentOwner` fields

#### 2. Pick Valuation

Draft picks are valued using FantasyCalc's pick values:
- Pick IDs follow format: `FP_YYYY_R` (e.g., `FP_2026_1` for 2026 1st round)
- Values are stored in the same `player_values` table as player valuations
- Picks are integrated into team total values for accurate dynasty rankings

#### 3. Trade Target Analysis

When clicking a draft pick, the system:
1. Calculates 5% tolerance range around pick value
2. Filters all league players within that range
3. Excludes players on the current team
4. Groups results by position (QB, RB, WR, TE)
5. Shows top 3 targets per position, sorted by value proximity
6. Displays Market Value Gap indicators (BUY/SELL/HOLD) for each target
7. "Show More" button loads additional targets (3 more per position)

```typescript
const tolerance = 0.05; // 5%
const minValue = pickValue * (1 - tolerance);
const maxValue = pickValue * (1 + tolerance);
```

## Market Value Gap Analysis

### Overview
Compares FantasyCalc market rankings against proprietary analysis rankings to identify buy-low and sell-high opportunities.

### Implementation

#### Gap Calculation

```typescript
const getValueGap = (player: PlayerData, format: '1qb' | 'sf') => {
    const marketRank = format === '1qb' ? player.fc_rank_1qb : player.fc_rank_sf;
    const analysisRank = format === '1qb' ? player.rank_1qb_overall : player.rank_sf_overall;
    
    if (!marketRank || !analysisRank) return null;
    
    // Positive gap = player ranked higher in analysis than market (BUY)
    // Negative gap = player ranked lower in analysis than market (SELL)
    return marketRank - analysisRank;
};
```

#### Gap Labels

- **STRONG BUY** (gap ≥ 20): Market significantly undervalues player
- **BUY** (gap ≥ 10): Market undervalues player
- **HOLD** (gap between -9 and 9): Market fairly values player
- **SELL** (gap ≤ -10): Market overvalues player
- **STRONG SELL** (gap ≤ -20): Market significantly overvalues player

### Display Locations

1. **Team Roster Table:** "Signal" column always rendered (when toggled on via the column picker)
2. **Trade Target Modal:** Value gap badge shown for each trade target

### Data Requirements

Requires both market and analysis rankings:
- Market: `fc_rank_1qb`, `fc_rank_sf` from FantasyCalc
- Analysis: `rank_1qb_overall`, `rank_sf_overall` from proprietary rankings

Players missing either ranking show "-" instead of a gap indicator.

## Interactive Position Filters

### Client-Side State Management

The team roster table uses React state to manage position filters:

```typescript
const [activePositions, setActivePositions] = useState<Set<string>>(
  new Set(['QB', 'RB', 'WR', 'TE']) // PICK excluded by default
);
```

### Features
- **Default State:** Players visible, picks hidden
- **Toggle Behavior:** Click position box to show/hide
- **Visual Feedback:** Active positions use position-specific colors
- **Dynamic Filtering:** Table updates instantly on filter change

### Color Scheme

Position-specific colors for visual clarity:
```typescript
const colors = {
  QB: '#9de89f',  // Light green
  RB: '#ffadad',  // Light red/pink
  WR: '#9bf6ff',  // Light cyan
  TE: '#ffd6a5',  // Light orange
  PICK: '#6fffe9' // Highlight cyan
};
```

Applied at 30% opacity for table row backgrounds, full opacity for active filter buttons.

## Data Flow Architecture

### Server Components (Next.js App Router)

Team pages are Server Components that:
1. Fetch live data from Sleeper API
2. Query database for player/pick values
3. Generate all draft picks with ownership
4. Calculate position summaries
5. Pass data to Client Component for interactivity

### Client Components

`TeamRosterTable.tsx` handles:
- Position filter state
- Trade target modal state
- Trade target pagination (Show More functionality)
- Value gap calculations and display
- User interactions (clicks, toggles)
- Dynamic filtering of player/pick list

### Performance Optimization

- **Parallel Queries:** Player data and pick data fetched simultaneously
- **Map Lookups:** O(1) lookups for player values and ownership
- **Memoization:** Position summaries calculated once on server
- **Minimal Re-renders:** Client state changes only affect filtered view

## Database Schema

### Player Values Table

Stores both player and draft pick values:

```typescript
export const playerValues = pgTable("player_values", {
  sleeper_id: text("sleeper_id").primaryKey(),
  // FantasyCalc — Superflex
  fc_value_sf: integer("fc_value_sf"),
  fc_rank_sf: integer("fc_rank_sf"),
  fc_position_rank_sf: integer("fc_position_rank_sf"),   // e.g. 5 → "RB5"
  // FantasyCalc — 1QB
  fc_value_1qb: integer("fc_value_1qb"),
  fc_rank_1qb: integer("fc_rank_1qb"),
  fc_position_rank_1qb: integer("fc_position_rank_1qb"),
  // Shared FC metrics
  fc_combined_value: integer("fc_combined_value"),        // dynasty + redraft
  fc_trade_frequency: decimal("fc_trade_frequency", { precision: 6, scale: 4 }), // e.g. 0.0092
  fc_trend_30_day: integer("fc_trend_30_day"),           // value delta last 30 days
  redraft_value: integer("redraft_value"),
  // Legacy (backward compat, mirrors SF)
  fc_value: integer("fc_value"),
  fc_rank: integer("fc_rank"),
  // Proprietary ranks
  rank_1qb_overall: integer("rank_1qb_overall"),
  rank_1qb_pos: integer("rank_1qb_pos"),
  rank_1qb_tier: integer("rank_1qb_tier"),
  rank_sf_overall: integer("rank_sf_overall"),
  rank_sf_pos: integer("rank_sf_pos"),
  rank_sf_tier: integer("rank_sf_tier"),
  // ...
});
```

Draft picks use the same schema with:
- `sleeper_id`: FantasyCalc pick ID (e.g., `FP_2026_1`)
- `fc_value_sf`: Superflex pick value
- `fc_value_1qb`: 1QB pick value

## API Integration Patterns

### Sleeper API

**Traded Picks Endpoint:**
```
GET https://api.sleeper.app/v1/league/{leagueId}/traded_picks
```

Returns:
```typescript
{
  season: string;      // "2026"
  round: number;       // 1-5
  roster_id: number;   // Original owner
  owner_id: number;    // Current owner
}
```

### FantasyCalc API

**Values Endpoint:**
```
GET https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5
```

Includes both player values and pick values in same response.

## Testing Strategy

### Unit Tests (Vitest)

- `getAllDraftPicks()`: Verifies pick generation and trade application
- `getPickFantasyCalcId()`: Validates ID format conversion
- API client functions: Mocked fetch responses

### Integration Tests

- Database queries with mocked Drizzle instance
- Pick ownership calculations
- Trade target filtering logic

### E2E Tests (Playwright)

- Team page navigation
- Position filter interactions
- Trade target modal display
- Mobile responsiveness

## Mobile Optimization

### Responsive Design Patterns

1. **Grid Layouts:** `grid-cols-5` for position filters
2. **Conditional Display:** `hidden sm:table-cell` for secondary columns
3. **Touch Targets:** Minimum 44px height for filter buttons
4. **Modal Scrolling:** `max-h-[80vh] overflow-y-auto` for trade targets

### Tailwind Breakpoints

- `sm:` 640px - Show position/team columns
- `md:` 768px - Show additional ranking columns
- `lg:` 1024px - Show tier columns

> **Note:** Optional columns toggled on by the user via the column picker are always visible regardless of viewport. Responsive hiding only applies to always-visible secondary columns (Position, Team).

## Configurable Column Visibility (Team Roster Table)

### Overview
The `TeamRosterTable` component (`src/app/league/[leagueId]/team/[rosterId]/TeamRosterTable.tsx`) supports a user-controlled column picker that lets users choose exactly which data columns to display.

### Column Groups

| Group | Columns |
|---|---|
| **Core** | Market Value |
| **FantasyCalc** | FC Overall Rank, FC Position Rank, Combined Value, 30-Day Trend, Trade Frequency |
| **VFF Rankings** | VFF Overall Rank, VFF Position Rank, Tier, Signal (BUY/SELL/HOLD) |

### Implementation

```typescript
type ColKey = 'market_value' | 'fc_rank' | 'fc_pos_rank' | 'combined_value'
            | 'trend_30d' | 'trade_freq' | 'internal_rank' | 'internal_pos'
            | 'tier' | 'value_gap';

const COLUMNS: ColDef[] = [
    { key: 'market_value', label: 'Market Value', defaultOn: true,  group: 'core' },
    { key: 'fc_rank',      label: 'FC Overall',   defaultOn: true,  group: 'fc' },
    { key: 'fc_pos_rank',  label: 'FC Pos Rank',  defaultOn: true,  group: 'fc' },
    { key: 'combined_value',label:'Combined',     defaultOn: false, group: 'fc' },
    { key: 'trend_30d',    label: '30d Trend',    defaultOn: true,  group: 'fc' },
    { key: 'trade_freq',   label: 'Trade Freq',   defaultOn: false, group: 'fc' },
    { key: 'internal_rank',label: 'VFF Rank',     defaultOn: false, group: 'internal' },
    { key: 'internal_pos', label: 'VFF Pos',      defaultOn: false, group: 'internal' },
    { key: 'tier',         label: 'Tier',         defaultOn: false, group: 'internal' },
    { key: 'value_gap',    label: 'Signal',       defaultOn: true,  group: 'internal' },
];
```

State is stored in a `Set<ColKey>` via `useState`. The header and every row cell are both conditionally rendered via `{show(key) && (<th/td>...)}`. This means column visibility is perfectly synchronized between headers and cells.

### New FantasyCalc Fields (Ingested)

| Field | Source | Usage |
|---|---|---|
| `fc_position_rank_sf` / `_1qb` | `item.positionRank` | Displayed as "RB5", "WR12", etc. |
| `fc_combined_value` | `item.combinedValue` | Dynasty + redraft combined score |
| `fc_trade_frequency` | `item.maybeTradeFrequency` | Shows as %, colored green/amber/grey |
| `fc_trend_30_day` | `item.trend30Day` | Shown as ↑+100 / ↓-46 with color |

Trade Frequency coloring:
- **Green** (>1.5%) — highly liquid, frequently traded
- **Amber** (0.5–1.5%) — moderate liquidity
**Grey** (<0.5%) — rarely trades

---

## Scoring Format per League

### Overview
Each league (Sleeper or Fleaflicker) can be independently configured as **1QB** or **Superflex (SF)**. This affects all value and rank calculations across league, team, and free agent pages.

### Storage

Format preferences are stored in `localStorage` via `useUser.tsx`:

```typescript
fleaflickerLeagueFormats: Record<string, '1qb' | 'sf'>  // keyed by leagueId
sleeperLeagueFormats:     Record<string, '1qb' | 'sf'>
```

Storage keys:
- `vff_fleaflicker_league_formats`
- `vff_sleeper_league_formats`

### Dashboard UI

Each league card on the home dashboard shows a **1QB / SF** toggle. Clicking updates the stored format immediately via `setLeagueFormat(leagueId, platform, format)`. League links are generated with `?format=sf` or `?format=1qb` query params.

### Server Pages

All league, team, and free agent pages read the `format` search param:

```typescript
const { format: formatParam } = await searchParams;
const format = (formatParam === 'sf' ? 'sf' : '1qb') as '1qb' | 'sf';
```

This controls:
- Which `fc_value_*` column is queried from the DB
- Which `fc_rank_*` and `fc_position_rank_*` columns are displayed
- How the TeamRosterTable labels its rank columns ("1QB Rank" vs "SF Rank")
- The order players appear in free agent views

### Adding a New Fleaflicker League

When a user adds a Fleaflicker league, they choose the format upfront via a 1QB/SF toggle. The format is stored alongside the league ID.

---

## Keeper League Support

### Overview
Users can designate leagues as **Dynasty**, **Keeper**, or **Redraft** and set the number of keepers for keeper leagues. A visual "keeper line" appears on team rosters showing which players would be kept. The league dashboard displays a "Value Dropped" column showing the total value of players each team would need to drop.

### Implementation

#### State Management (`src/hooks/useUser.tsx`)

```typescript
leagueTypes: Record<string, 'dynasty' | 'keeper' | 'redraft'>
keeperCounts: Record<string, number>
```

Storage keys:
- `vff_league_types`
- `vff_keeper_counts`

Functions:
- `setLeagueType(leagueId, type)` — Updates league type
- `setKeeperCount(leagueId, count)` — Updates keeper count

#### Dashboard UI (`src/app/page.tsx`)

Each league card shows:
1. **League Type Selector** — Three buttons: Dynasty / Keeper / Redraft
2. **Keeper Count Input** — Only visible when "Keeper" is selected
3. **URL Generation** — Includes `?format=sf&keepers=3` in league links

```typescript
const params = new URLSearchParams();
params.set('format', format);
if (leagueTypes[league.id] === 'keeper' && keeperCounts[league.id]) {
  params.set('keepers', keeperCounts[league.id].toString());
}
```

#### Value Dropped Calculation

For keeper leagues, the platform calculates which players would need to be dropped:

```typescript
// Collect players with values (excluding picks)
const playersWithValues = roster.players.map(p => ({ value: p.fc_value || 0 }));

// Sort by value descending
const sortedPlayers = playersWithValues.sort((a, b) => b.value - a.value);

// Sum values beyond keeper limit
if (playersWithValues.length > keeperCount) {
  valueDropped = sortedPlayers.slice(keeperCount).reduce((sum, p) => sum + p.value, 0);
}
```

**League Table Display:**
- "Value Dropped" column appears only when `keeperCount > 0`
- Shows total value of players beyond keeper limit
- Sortable column
- Displayed in red to indicate lost value

**Team Page Display:**
- "Value Dropped" stat appears next to total value
- Only visible when keeper count is set
- Format: "Value Dropped: 1,234"

#### Team Roster Visualization (`TeamRosterTable.tsx`)

The keeper line appears after the Nth player (excluding picks):

```typescript
const playersOnly = filteredPlayers.filter(p => p.position !== 'PICK');
const isKeeperLine = keeperCount && keeperCount > 0 && 
                     player.position !== 'PICK' && 
                     playersOnly.indexOf(player) === keeperCount - 1;
```

Visual design:
- Gradient line: green → yellow → red
- Label: "KEEPER LINE (N keepers)"
- Full-width row spanning all columns

#### URL Parameter Flow

1. Dashboard sets `?keepers=3` in league link
2. League page reads param, passes to `LeagueTable`
3. `LeagueTable` includes param in team links
4. Team page reads param, passes to `TeamRosterTable`
5. `TeamRosterTable` renders keeper line at correct position

### Supported Platforms

- ✅ Sleeper leagues
- ✅ Fleaflicker leagues

Both platforms support the same keeper league functionality with identical UI and behavior.

---

## Position Value Analytics

### Overview
The platform displays position-specific value summaries on the All Players page and Free Agent pages, making it easy to identify position scarcity and available value.

### Implementation

#### Calculation

```typescript
const positionTotals = players.reduce((acc, player) => {
    const pos = player.position || 'UNK';
    if (!acc[pos]) acc[pos] = 0;
    acc[pos] += player.fc_value || 0;
    return acc;
}, {} as Record<string, number>);
```

#### Display Locations

1. **All Players Page** (`/players`)
   - Shows total value of all players by position
   - Helps identify overall position depth in dynasty format

2. **Free Agent Pages** (Sleeper & Fleaflicker)
   - Shows available value by position for the specific league
   - Helps identify waiver wire opportunities
   - Particularly useful for identifying QB surplus in smaller leagues

#### UI Design

Four summary cards displayed in a 2x2 grid (4 columns on desktop):
- **QB** — Total/Available QB value
- **RB** — Total/Available RB value
- **WR** — Total/Available WR value
- **TE** — Total/Available TE value

Each card shows:
- Position label (uppercase)
- Large formatted value (e.g., "123,456")
- Subtitle: "Total Value" or "Available Value"

### Use Cases

- **10-team leagues:** Quickly see QB surplus on waivers
- **Deep leagues:** Identify position scarcity
- **Trade analysis:** Compare available value vs. rostered value
- **Waiver strategy:** Target positions with high available value

---

## Future Enhancements

Potential improvements to the platform:

1. **Pick Trading:** Allow users to simulate trades directly in the UI
2. **Historical Tracking:** Show pick value changes over time
3. **Draft Position:** Estimate pick slot based on team standings
4. **Multi-Pick Packages:** Analyze value of pick combinations
5. **Custom Tolerance:** Let users adjust the 5% trade target range
6. **Export Trades:** Generate trade proposals to share with league
7. **Value Gap Trends:** Track how market vs. analysis gaps change over time
8. **Gap Filtering:** Filter roster by BUY/SELL/HOLD recommendations
9. **Cross-device Login:** Persist Soft Login via database instead of localStorage
10. ~~**Fleaflicker league listing:** Source user's Fleaflicker leagues via API or manual add~~ ✅ Done — users can manually add Fleaflicker leagues by ID from the dashboard

---

## Caching System

### Overview
The platform uses an in-memory caching layer to dramatically improve page load times and reduce external API calls to Sleeper and Fleaflicker.

### Implementation

**Cache Module** (`src/lib/cache.ts`)
- Simple Map-based cache with TTL (Time To Live) support
- Each cache entry stores data + timestamp
- Automatic expiration on read (lazy deletion)
- Pattern-based clearing for targeted cache invalidation

**TTL Configuration:**
```typescript
export const TTL = {
  LEAGUE_DATA: 10 * 60 * 1000,      // 10 minutes
  USER_LEAGUES: 15 * 60 * 1000,     // 15 minutes
  FLEAFLICKER_LEAGUE: 10 * 60 * 1000,
  FLEAFLICKER_ROSTERS: 10 * 60 * 1000,
};
```

### Integration

**Sleeper API** (`src/lib/sleeper.ts`)
- `getLeagueUsers()` - Cached by `sleeper:users:{leagueId}`
- `getLeagueRosters()` - Cached by `sleeper:rosters:{leagueId}`
- `getTradedPicks()` - Cached by `sleeper:picks:{leagueId}`

**Fleaflicker API** (`src/lib/fleaflicker.ts`)
- `getFleaflickerLeague()` - Cached by `fleaflicker:league:{leagueId}`
- `getFleaflickerTeamPicks()` - Cached by `fleaflicker:picks:{leagueId}:{teamId}`

### Manual Refresh

**API Endpoint** (`/api/cache/clear`)
- POST endpoint to clear cache for specific league
- Accepts `{ leagueId, platform }` in request body
- Clears all related cache entries for that league

**Refresh Button Component** (`src/components/RefreshButton.tsx`)
- Client component with loading state
- Calls `/api/cache/clear` then triggers `router.refresh()`
- Displayed on league dashboard pages

### Performance Impact

**Before Caching:**
- League page: ~2-3 seconds (3 API calls)
- Team page: ~2-3 seconds (3 API calls)
- Navigation between teams: ~2-3 seconds each

**After Caching:**
- First load: ~2-3 seconds (cache miss)
- Subsequent loads: ~200-500ms (cache hit)
- Navigation between teams: ~200-500ms (instant)

**Cache Hit Rate:** Expected 80-90% for typical user sessions

### Limitations

- **In-Memory Only:** Cache is lost on server restart (Vercel serverless functions)
- **No Distributed Cache:** Each serverless function instance has its own cache
- **No Persistence:** Cache doesn't survive deployments

For production at scale, consider upgrading to Redis or Vercel KV for persistent, distributed caching.

---

## Free Agent View

### Overview
The Free Agent view is available at:
- Sleeper: `/league/[leagueId]/free-agents`
- Fleaflicker: `/fleaflicker/[leagueId]/free-agents`

It shows all players currently not rostered in the specified league, ranked by dynasty value.

### How it Works

1. **Fetch all rostered players** from Sleeper or Fleaflicker API for the given league.
2. **Query the database** for all active players (non-picks) with `fc_value`, `fc_rank`, `position`, `years_exp`.
3. **Exclude rostered players** from results using a `NOT IN` filter via Drizzle's `notInArray()`.
4. **Sort by value descending**, take the top 200.
5. Render via the `FreeAgentTable` client component.

### FreeAgentTable Component (`src/components/FreeAgentTable.tsx`)

A client component with:
- **Position tabs:** ALL / QB / RB / WR / TE / ROOKIES
- **Sortable columns:** Rank, Player Name, Position, Value
- **Graceful image fallback:** Shows player's first initial when Sleeper CDN doesn't have their headshot
- **No-results state:** Displays a friendly empty state when no players match the filter

```typescript
// Rookies are identified client-side by years_exp
const filteredPlayers = filterPosition === 'ROOKIES'
    ? players.filter(p => p.years_exp === 0)
    : players.filter(p => p.position === filterPosition);
```

---

## Rookie Identification

### Data Source
FantasyCalc's API returns a `maybeYoe` (years of experience) field for each player. This is ingested and stored in the `players.years_exp` column.

### Ingestion

```typescript
// In scripts/ingest-players.ts
const playersBatch = sfData.map((item) => ({
    sleeper_id: item.player.sleeperId,
    years_exp: item.player.maybeYoe,   // <-- mapped here
    // ...
}));

// Critically, must be included in onConflictDoUpdate to update existing rows:
await db.insert(players).values(playersBatch).onConflictDoUpdate({
    target: players.sleeper_id,
    set: {
        years_exp: sql.raw("excluded.years_exp"),
        // ...
    }
});
```

> **Gotcha:** If `years_exp` is omitted from `onConflictDoUpdate.set`, Drizzle uses `INSERT ... ON CONFLICT DO UPDATE` but will **not** overwrite the column for existing rows. This means re-running the ingestion script will leave old players with `NULL` for `years_exp`.

### Usage
`years_exp === 0` → Rookie  
`years_exp === null` → Unknown (player not in FantasyCalc dataset)

---

## Soft Login / Personalized Dashboard

### Overview
Users can connect their Sleeper account by entering their username. The app then shows a personalized dashboard of their leagues. No password, no database account required.

### Implementation

#### AuthProvider (`src/hooks/useUser.tsx`)

A React Context Provider backed by `localStorage`:

```typescript
const AUTH_KEYS = {
    sleeperUsername: 'vff_sleeper_username',
    sleeperUserId:   'vff_sleeper_user_id',
    fleaflickerUsername: 'vff_fleaflicker_username',
};
```

- **`loginSleeper(username, userId)`** — Validates username via Sleeper API, saves both username and `user_id` to localStorage.
- **`loginFleaflicker(email)`** — Saves email to localStorage. (Fleaflicker does not have a simple user lookup API, so this is purely optimistic.)
- **`logout()`** — Clears all keys from localStorage.
- Wrapped app-wide via `providers.tsx` → `layout.tsx`.

#### Login Flow

1. User enters Sleeper username.
2. Client calls `GET https://api.sleeper.app/v1/user/{username}` to validate.
3. On success, saves `display_name` + `user_id` to localStorage via `loginSleeper()`.
4. `useEffect` fires with the new `sleeperUserId` and calls `GET https://api.sleeper.app/v1/user/{userId}/leagues/nfl/2025`.
5. Leagues are rendered as clickable cards navigating to `/league/[leagueId]`.

#### AppHeader Auth Awareness

The `AppHeader` component reads `sleeperUsername` / `fleaflickerUsername` from `useAuth()`. If logged in, the hardcoded nav links (Sleeper/Fleaflicker) are hidden; the user's personalized dashboard on `/` serves as the navigation hub instead.
