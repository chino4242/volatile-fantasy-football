# Quick Start for Contributors

Get up and running in 5 minutes.

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/<your-org>/volatile-fantasy-football.git
cd volatile-fantasy-football
npm install
```

### 2. Configure Database

Ask Ryan for the Supabase database connection string, then create `.env.local`:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

### 3. Verify It Works

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Test the app:**
- Enter a Sleeper username (try `ryancontino` or your own)
- Click into a league to see the dashboard
- Navigate to a team roster

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run test:all` | Run all tests (unit + E2E) |
| `npm run lint` | Check code style |
| `npx drizzle-kit studio` | Open visual database browser |
| `npx tsx scripts/verify-db.ts` | Verify database connection |
| `npx tsx scripts/ingest-players.ts` | Update player data from FantasyCalc |

## Project Structure (Key Files)

```
src/
├── app/                    # Next.js pages
│   ├── page.tsx           # Home / login page
│   ├── players/           # Top 50 players list
│   ├── league/[id]/       # Sleeper league pages
│   └── fleaflicker/[id]/  # Fleaflicker league pages
├── components/            # Reusable UI components
├── db/
│   ├── schema.ts         # Database schema (Drizzle)
│   └── index.ts          # DB connection
└── lib/
    ├── sleeper.ts        # Sleeper API client
    └── fleaflicker.ts    # Fleaflicker API client
```

## Making Changes

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

3. **Test locally**
   ```bash
   npm run test:all
   npm run lint
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Helpful Resources

- **Full Documentation:** See [README.md](README.md)
- **Sleeper API Docs:** [docs.sleeper.com](https://docs.sleeper.com/)
- **FantasyCalc API:** [fantasycalc.com](https://fantasycalc.com/)

## Learning the Stack

This project is a great way to learn modern full-stack development. Here's what matters most for each technology:

### TypeScript: Type Safety Across Boundaries

The most important concept is understanding how types flow through your app:

```typescript
// Database schema defines the source of truth
export const players = pgTable('players', {
  id: text('id').primaryKey(),
  full_name: text('full_name').notNull(),
  position: text('position'),
});

// Drizzle infers TypeScript types from schema
type Player = typeof players.$inferSelect;

// API responses get typed
interface SleeperRoster {
  roster_id: number;
  players: string[];
}

// Components receive typed props
function TeamRoster({ players }: { players: Player[] }) {
  // TypeScript catches errors at compile time
}
```

**In This Project:** Look at `src/db/schema.ts` → see how those types are used in `src/lib/sleeper.ts` → trace them to components.

**Learn By Doing:** Add a new field to a table and watch TypeScript force you to handle it everywhere.

---

### Next.js 16 (App Router): Server vs Client Components

This is the biggest mental shift in modern Next.js:

```typescript
// app/league/[leagueId]/page.tsx
// DEFAULT: Server Component (runs on server, no JS sent to client)
export default async function LeaguePage({ params }) {
  // Can directly query database
  const players = await db.select().from(playersTable);
  
  // Can fetch APIs without exposing keys
  const rosters = await fetchSleeperRosters(params.leagueId);
  
  return <LeagueTable data={rosters} />; // Static HTML sent to browser
}

// components/LeagueTable.tsx
'use client'; // EXPLICIT: Client Component (interactive, runs in browser)
export function LeagueTable({ data }) {
  const [sortBy, setSortBy] = useState('value');
  // Can use hooks, event handlers, browser APIs
}
```

**The Rule:**
- **Server Components** (default): Database queries, API calls, no interactivity
- **Client Components** (`'use client'`): State, effects, event handlers, browser APIs

**In This Project:** 
- `app/league/[leagueId]/page.tsx` = Server (fetches data)
- `components/LeagueTable.tsx` = Client (sorting, filtering)

**Learn By Doing:** Try to use `useState` in a Server Component and see the error. Then understand why.

---

### Drizzle ORM: Type-Safe SQL Builder

Drizzle is NOT like Prisma (magic ORM). It's a thin layer over SQL that gives you TypeScript safety:

```typescript
// Define schema (this IS your database)
export const players = pgTable('players', {
  id: text('id').primaryKey(),
  full_name: text('full_name').notNull(),
  position: text('position'),
});

// Query with type safety
const qbs = await db
  .select()
  .from(players)
  .where(eq(players.position, 'QB'))
  .limit(10);
// qbs is typed as Player[]

// Joins are explicit
const rostersWithPlayers = await db
  .select()
  .from(rosters)
  .leftJoin(rosterPlayers, eq(rosters.id, rosterPlayers.roster_id))
  .leftJoin(players, eq(rosterPlayers.player_id, players.id));
```

**Why It Matters:**
- Schema changes = run `npx drizzle-kit push` (syncs to DB)
- TypeScript types auto-update from schema
- You write SQL-like queries, not magic methods

**In This Project:** Look at `src/db/schema.ts` for table definitions, then see queries in `app/league/[leagueId]/page.tsx`.

**Learn By Doing:** Add a new column to `players` table, push it, then query it. See how types update automatically.

---

### PostgreSQL: Relational Data Modeling

Your app has a classic relational structure:

```
players (master list)
  ↓
player_values (1-to-many: one player, many value snapshots)
  
leagues
  ↓
rosters (teams in a league)
  ↓
roster_players (join table: many-to-many between rosters and players)
```

**Important Patterns in This Project:**

1. **Foreign Keys** - `roster_players.player_id` references `players.id`
2. **Indexes** - Speed up lookups (e.g., searching by `sleeper_id`)
3. **Joins** - Combine data from multiple tables in one query

**In This Project:** Open `npx drizzle-kit studio` and explore the relationships visually.

**Learn By Doing:** Write a query that joins `rosters` → `roster_players` → `players` → `player_values` to get a team's total value.

---

### How They Work Together

Here's the data flow in this app:

```
1. PostgreSQL (Supabase)
   └─ Stores: players, player_values, leagues, rosters
   
2. Drizzle ORM
   └─ Defines schema in TypeScript
   └─ Generates type-safe queries
   
3. Next.js Server Components
   └─ Fetch data using Drizzle
   └─ Render HTML on server
   
4. Next.js Client Components
   └─ Add interactivity (sorting, filtering)
   └─ Use data passed from server
   
5. TypeScript
   └─ Ensures type safety at every step
```

---

## Learning Path

### Week 1: Read the Data Flow
1. Pick one page (e.g., League Dashboard)
2. Start at `app/league/[leagueId]/page.tsx`
3. Trace the data:
   - What Drizzle queries run?
   - What types are returned?
   - How is data passed to components?
   - Which components are Server vs Client?

### Week 2: Add a Simple Feature
**Task:** Add a "Last Updated" timestamp to player values

1. **PostgreSQL:** Add `updated_at` column to `player_values` table
2. **Drizzle:** Update schema in `src/db/schema.ts`
3. **Migration:** Run `npx drizzle-kit push`
4. **TypeScript:** Types auto-update
5. **Next.js:** Display the timestamp in the UI

### Week 3: Add an Interactive Feature
**Task:** Add a "Compare Teams" button that lets you select 2 teams

1. **Client Component:** Create `CompareTeams.tsx` with `'use client'`
2. **State Management:** Use `useState` for selected teams
3. **Server Action:** Fetch comparison data
4. **TypeScript:** Type the comparison response

---

## Key Pattern to Remember

**This project follows this pattern everywhere:**

1. **Schema** (Drizzle) defines the shape of data
2. **Server Component** (Next.js) fetches data
3. **Client Component** (React) makes it interactive
4. **TypeScript** ensures it all connects correctly

Master this flow and you'll understand 80% of modern full-stack development.

---

## Additional Resources

- **Next.js App Router:** [nextjs.org/docs/app](https://nextjs.org/docs/app) - Focus on "Server Components" and "Data Fetching"
- **Drizzle:** [orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview) - Read "Queries" section
- **TypeScript:** [typescriptlang.org/docs/handbook/2/everyday-types.html](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
- **PostgreSQL:** [postgresqltutorial.com](https://www.postgresqltutorial.com/) - Focus on JOINs and indexes

---

## Need Help?

- Check the full [README.md](README.md) for architecture details
- Review [CONTRIBUTING.md](CONTRIBUTING.md) for PR guidelines
- Ask Ryan if you get stuck
