# Prospect Data Ingestion

This directory contains scripts for ingesting Late Round Prospect Guide data into the database.

## Setup

The prospect data infrastructure is ready to use. The database table `prospect_data` has been created with the following fields:

- Player identification (name, position, college)
- ZAP Model scores and categories
- Physical attributes (height, weight)
- Draft capital delta (risk assessment)
- Statistical comparables
- Full analysis text

## Ingesting New Prospect Data

When you receive a new PDF from Late Round:

```bash
python3 scripts/ingest-prospects.py <path_to_pdf> <draft_year>
```

Example:
```bash
python3 scripts/ingest-prospects.py ~/Documents/LRProspectGuide2025.pdf 2025
```

The script will:
1. Parse the PDF and extract all player profiles
2. Extract ZAP scores, categories, physical data, and analysis
3. Insert/update the data in the database
4. Handle duplicates automatically (updates existing records)

## Current Data

- **2025 Draft Class**: 75 prospects ingested
  - Wide Receivers: ~46 players
  - Running Backs: ~29 players
  - Includes both rookies and Year 2 players

## Next Steps

To integrate this data into the mock draft:

1. **Add prospect columns** to the available players table
2. **Create filters** for ZAP categories (Elite Producer, Weekly Starter, etc.)
3. **Display prospect analysis** when viewing player details
4. **Highlight rookies** with ZAP data in the draft interface

The infrastructure is ready - just need to wire it up to the UI!
