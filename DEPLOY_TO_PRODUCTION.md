# Deploy Custom Rankings to Production

## Step 1: Commit and Push Code

```bash
# Add all changes
git add .

# Commit
git commit -m "Add custom rankings system with RP integration"

# Push to main (triggers Vercel deployment)
git push origin main
```

## Step 2: Wait for Vercel Deployment

- Vercel will automatically deploy when you push to main
- Check deployment status at: https://vercel.com/your-project
- Wait for "Deployment Complete" ✅

## Step 3: Run Database Migration on Production

The new tables (`ranking_sources`, `custom_rankings`, `nfl_stats`) need to be created in production.

**Option A: Drizzle Studio (Recommended)**
```bash
# Connect to production database
npx drizzle-kit push
```

**Option B: Manual SQL (if needed)**
Run these in your production database console:

```sql
-- Already done by drizzle-kit push, but here for reference
CREATE TABLE ranking_sources (...);
CREATE TABLE custom_rankings (...);
CREATE TABLE nfl_stats (...);
```

## Step 4: Upload Rankings via Production Admin

1. Go to your Vercel deployment's `/admin` page
2. Scroll to "Upload Additional Rankings"
3. Fill in:
   - Source Name: `rp_2026`
   - Display Name: `RP 2026`
   - Description: `RP WR rankings for 2026`
4. Upload your full RP CSV file
5. Verify import results

## Step 5: Test on Production

1. Navigate to any team page
2. Click column picker (gear icon)
3. Check "RP 2026" under "Custom Rankings"
4. Verify rankings appear

## Quick Deploy Script

```bash
#!/bin/bash
cd /Users/ryancontino/Documents/volatile/volatile-fantasy-football

# Commit and push
git add .
git commit -m "Add custom rankings system with RP integration"
git push origin main

echo "✅ Code pushed! Vercel is deploying..."
echo "⏳ Wait for deployment to complete, then run:"
echo "   npx drizzle-kit push"
echo "   (to create tables in production database)"
```

## Notes

- Your local database already has the tables and test data
- Production database needs the schema migration
- Rankings must be uploaded separately to production (they're not in git)
- The CSV files are in `.gitignore` so they won't be deployed
