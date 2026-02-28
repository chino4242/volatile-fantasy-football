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

1. **Team Roster Table:** Value Gap column appears when 1QB or SF rankings are toggled on
2. **Trade Target Modal:** Value Gap badge shown for each trade target

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
  fc_value: integer("fc_value"),
  fc_value_sf: integer("fc_value_sf"),
  fc_value_1qb: integer("fc_value_1qb"),
  fc_rank: integer("fc_rank"),
  fc_rank_sf: integer("fc_rank_sf"),
  fc_rank_1qb: integer("fc_rank_1qb"),
  rank_1qb_overall: integer("rank_1qb_overall"),
  rank_1qb_pos: integer("rank_1qb_pos"),
  rank_1qb_tier: integer("rank_1qb_tier"),
  rank_sf_overall: integer("rank_sf_overall"),
  rank_sf_pos: integer("rank_sf_pos"),
  rank_sf_tier: integer("rank_sf_tier"),
  // ... other fields
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

## Future Enhancements

Potential improvements to the draft pick system:

1. **Pick Trading:** Allow users to simulate trades directly in the UI
2. **Historical Tracking:** Show pick value changes over time
3. **Draft Position:** Estimate pick slot based on team standings
4. **Multi-Pick Packages:** Analyze value of pick combinations
5. **Custom Tolerance:** Let users adjust the 5% trade target range
6. **Export Trades:** Generate trade proposals to share with league
7. **Value Gap Trends:** Track how market vs. analysis gaps change over time
8. **Gap Filtering:** Filter roster by BUY/SELL/HOLD recommendations
