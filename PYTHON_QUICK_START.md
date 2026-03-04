# Quick Start: Python NFL Stats

## 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

## 2. Update Database Schema

```bash
npx drizzle-kit push
```

## 3. Run Ingestion

```bash
npm run ingest:nfl
```

That's it! Your database now has 2024 NFL stats with advanced metrics:
- Target share, air yards share
- WOPR (Weighted Opportunity Rating)
- RACR (Receiver Air Conversion Ratio)
- Fantasy points (standard & PPR)

## Next Steps

See `PYTHON_SETUP.md` for:
- Scheduling options (cron, GitHub Actions)
- Troubleshooting
- Multi-season ingestion
