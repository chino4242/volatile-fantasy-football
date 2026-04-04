# Contributing to Volatile Fantasy Football

Thanks for your interest in contributing! This guide will help you get set up and understand our workflow.

## Development Setup

1. **Fork & clone** the repository
2. Run `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in your `DATABASE_URL`
4. Run `npx drizzle-kit push` to set up the database schema
5. Run `npx tsx scripts/ingest-players.ts` to seed player data
6. Run `npm run dev` to start the dev server
7. Run `npm run test` to verify your environment is working (Vitest unit tests)
8. Run `npm run test:e2e` to verify the core UI workflows (Playwright E2E)

## Branch Naming

Use descriptive branch names:

```
feature/add-trade-calculator
fix/mobile-table-overflow
chore/update-dependencies
```

## Code Style

- **TypeScript** — All new files should be `.ts` or `.tsx`
- **Tailwind CSS** — Use Tailwind utility classes for styling. No external CSS files per component
- **Server Components** — Pages are Server Components by default (Next.js App Router). Only use `"use client"` when you need interactivity (event handlers, hooks, etc.)
- **Drizzle ORM** — All database queries go through Drizzle. No raw SQL unless absolutely necessary
- **Formatting** — We use Prettier with the Tailwind plugin. Run `npx prettier --write .` before committing

## Testing Guidelines

We use both **Vitest** for unit testing and **Playwright** for End-to-End testing. Before submitting a PR, make sure you run:

```bash
npm run test:all
```

- **API Integrations:** Any changes to fetching logic (e.g., `src/lib/sleeper.ts`) must include tests that mock the network request using Vitest's `vi.fn()`.
- **Database Scripts:** Any changes to ingestion or migration scripts should be tested by mocking the Drizzle `db` export, verifying the exact `insert.values().onConflictDoUpdate()` flow.
- **UI Workflows:** Any new pages or changes to critical navigation paths must be covered or updated in `e2e/navigation.spec.ts`.
- **Mobile First:** The Playwright config tests against both Desktop Chrome and Mobile Chrome. Ensure your Tailwind classes (`sm:`) work correctly across both viewports.

## Project Architecture

```
src/
├── app/          # Pages & layouts (Next.js App Router)
├── components/   # Reusable React components
├── db/           # Database connection & Drizzle schema
└── lib/          # API clients & utility functions
```

### Key Conventions

- **Pages** live in `src/app/` using Next.js file-based routing
- **Shared components** go in `src/components/`
- **External API clients** (Sleeper, FantasyCalc, etc.) go in `src/lib/`
- **Database schema changes** are made in `src/db/schema.ts` and pushed with `npx drizzle-kit push`
- **Data scripts** live in `scripts/` and are run with `npx tsx`

## Database Changes

If your contribution modifies the database schema:

1. Update `src/db/schema.ts`
2. Run `npx drizzle-kit push` to apply changes to your local database
3. Test thoroughly — schema changes affect all pages that query the database
4. Document any new tables or columns in your PR description

## Data Ingestion

### Player Data (FantasyCalc)
```bash
npx tsx scripts/ingest-players.ts
```

### Prospect Guide (Late Round PDF)
```bash
python3 scripts/ingest-prospects.py <pdf_path> <draft_year>
```

### Prospect Writeups (Multi-Source)
```bash
npx tsx scripts/ingest-writeups.ts <directory> <draft_year> <source>
```
- Files go in `data/prospect_writeups/` (gitignored — copyrighted material)
- Naming: `firstname_lastname_source.txt`
- Safe to re-run (upserts on name + source + year)

## League Settings

League settings (scoring format, league type, keeper count) are persisted to the `leagues` table via `/api/league-settings`. All league-scoped server pages fall back to the database when URL params are missing. When adding new league-scoped pages, follow this pattern:

```typescript
let format = (formatParam === 'sf' || formatParam === '1qb') ? formatParam : undefined;
if (!format) {
    const leagueData = await db.select({ scoring_format: leagues.scoring_format })
        .from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
    if (leagueData[0]?.scoring_format) format = leagueData[0].scoring_format;
}
if (!format) format = 'sf';
```

## Adding a New Page

1. Create a new directory under `src/app/` following Next.js conventions
2. Export a default async function (Server Component) from `page.tsx`
3. Use `export const dynamic = 'force-dynamic'` if the page queries the database
4. Add navigation links in `src/components/AppHeader.tsx` if appropriate

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Add screenshots for UI changes (especially mobile views)
- Make sure `npm run build` passes before submitting
- Test on mobile viewport sizes — we care about mobile UX

## Reporting Issues

Open a GitHub issue with:

- **What happened** vs. **what you expected**
- Browser/device info (especially for mobile bugs)
- Screenshots if applicable
- Steps to reproduce

## Questions?

Open a discussion or reach out to the maintainer. We're happy to help you get started!
